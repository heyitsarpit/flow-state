# Round 7: the persistence edge, from scratch

Status: **everything here is proposed.** Nothing is decided until the owner accepts it. Written without reading any round's `driver.ts` or `durable.ts`.

Marks: **[ran: model]** ran against the edge below with a small model of turns and a store (edge only, not the real `step`). **[spec]** read in the IndexedDB 3 spec. **[reasoning]** not run. Files for the model: `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-Sy75Xy/b97bafc6-720f-455d-b91c-5aa81d337285/scratchpad/edge/` (`sim.ts`, `trace.ts`, `edge.ts`, `idb-host.ts`). The code in this file is those files; `tsc --strict` passes.

## 1. The invariant

> **Per actor, one batch is out at a time, and it carries everything not known to have landed.**

What follows from that sentence, given only that a batch is atomic and that its answer is true:

> **An actor's records on disk are the actor's whole published state at one moment, and that moment only moves forward.**

Why, in four lines. Take any batch that lands. Every write accepted before it was issued has either landed in an earlier batch, or was put back when its batch failed and so is in this one, or was replaced by something newer that is in this one. Nothing else can be out, so nothing older can land after it. So the disk after the landing equals the published state at the moment of issue.

**The rule needs no ordering from the store.** Requirements 1 to 4 and 7 are the same fact seen from different traces. It is group commit: one flush out, everything arriving meanwhile goes in the next, and a waiter (a ticket) boards the next flush.

**One rule does not cover everything. Plainly:**

- **Requirement 5, an actor's own unencodable memory, needs a second clause.** There is no whole state to write, so the invariant cannot hold for that actor. The clause is: *lane puts go ahead; memory and lane deletes stay.* Section 5 says why it is not arbitrary.
- **Requirement 6 on real IndexedDB has no rule that meets "keeps other actors going".** One object store means one queue [spec]: a hung transaction holds every later one, whoever owns it. The edge can only report. Isolation holds for failures and for encoding, not for a hang.
- **Requirement 10: no rule makes a write at hide finish.** The rule makes the loss safe (an older whole state), not absent.

### The state, in full

```ts
type Out = {
  readonly writes: readonly Bytes[];   // what to put back if it fails
  readonly tickets: readonly Ticket[]; // who hears the answer
  readonly stopSilent: () => void;     // the "no answer yet" report
};
type Slot = {
  readonly dirty: Map<string, Write>;  // newest accepted value per key, not out
  tickets: Ticket[];                   // awaited writes in dirty
  out: Out | undefined;                // the one batch
  due: number;                         // when dirty goes without being pushed. Infinity: not armed
  stopWake: (() => void) | undefined;  // the timer for `due`
  failures: number;                    // backoff, reset by a landing
};
// slots: Map<scope, Slot>. A clean scope has no entry.
```

Six fields per actor with something pending, none for a clean one. **Gone:** `issued`, `plainOut`, `behind`, `waitingAwaited`, `saved`, stamps of any kind, and the `""` case of `World.savedLanes` (section 8). A hidden flag is not kept either: the host is asked.

## 2. The edge

**Where the bytes come from and go.** `step` publishes a record (unencoded memory) or bytes (a lane). `accept` puts them in `dirty`. `issue` encodes off the turn, and hands the batch to the host, which makes one `IDBTransaction`. `oncomplete` or `onabort` becomes the answer.

```ts
export type Bytes = { readonly key: string; readonly value: string | undefined };
export type Write = {
  readonly key: string;
  readonly value?: string | undefined;
  readonly record?: unknown;
};
export type Ticket = {
  readonly attempt: string;
  readonly ticket: string;
  readonly purpose: "capture" | "acknowledge";
};
export type Persist = {
  readonly k: "persist";
  readonly scope: string;
  readonly writes: readonly Write[];
  readonly now: boolean;
  readonly ticket?: Ticket;
};
export type Issue = { readonly code: string; readonly origin?: string; readonly input?: unknown };
export type Purpose = "capture" | "acknowledge" | "flush";
export type EdgeHost = {
  now(): number;
  later(f: () => void): void;
  setTimer(at: number, f: () => void): () => void;
  isHidden(): boolean;
  storage: {
    write(
      writes: readonly Bytes[],
      purpose: Purpose,
      answer: (ok: boolean, why?: string) => void,
    ): void;
  };
};
export type EdgeOptions = {
  readonly captureMs: number;
  readonly storageMs: number;
  readonly retryMaxMs: number;
  encode(record: unknown): string;
  stored(ticket: Ticket, ok: boolean): void;
  report(issue: Issue): void;
};

type Out = {
  readonly writes: readonly Bytes[];
  readonly tickets: readonly Ticket[];
  readonly stopSilent: () => void;
};
type Slot = {
  readonly dirty: Map<string, Write>;
  tickets: Ticket[];
  out: Out | undefined;
  due: number;
  stopWake: (() => void) | undefined;
  failures: number;
};

export const makeEdge = (host: EdgeHost, o: EdgeOptions) => {
  const slots = new Map<string, Slot>(); // a clean scope has no entry: no state at all

  // A timer firing means due, whatever the clock says now (clock back). Firing late only delays an older cut's replacement.
  const wakeAt = (scope: string, s: Slot, at: number) => {
    if (at === s.due) return;
    s.stopWake?.();
    s.due = at;
    s.stopWake =
      at === Infinity || at <= host.now()
        ? undefined
        : host.setTimer(at, () => {
            s.due = 0;
            pump(scope);
          });
  };

  const encodeAll = (scope: string, s: Slot): Map<string, string> | undefined => {
    const out = new Map<string, string>();
    try {
      for (const w of s.dirty.values())
        if (w.record !== undefined) out.set(w.key, o.encode(w.record));
      return out;
    } catch (e) {
      o.report({ code: "UnencodableValue", origin: scope, input: String(e) });
      return undefined;
    }
  };

  // THE RULE: everything dirty goes, as one batch. Sole exception: memory that cannot encode stays, and lane deletes stay with it.
  const issue = (scope: string, s: Slot) => {
    const encoded = encodeAll(scope, s);
    const writes: Bytes[] = [];
    for (const w of [...s.dirty.values()]) {
      const bytes = w.record !== undefined ? encoded?.get(w.key) : w.value;
      const goes = encoded !== undefined || (w.record === undefined && w.value !== undefined);
      if (!goes) continue;
      writes.push({ key: w.key, value: bytes });
      s.dirty.delete(w.key);
    }
    wakeAt(scope, s, Infinity);
    if (writes.length === 0) return;
    const tickets = s.tickets;
    s.tickets = [];
    const out: Out = {
      writes,
      tickets,
      stopSilent: host.setTimer(host.now() + o.storageMs, () =>
        o.report({ code: "StorageSilent", origin: scope }),
      ),
    };
    s.out = out;
    const purpose: Purpose = tickets.some((t) => t.purpose === "capture")
      ? "capture"
      : tickets.length > 0
        ? "acknowledge"
        : "flush";
    host.storage.write(writes, purpose, (ok, why) => answered(scope, s, out, ok, why));
  };

  const answered = (scope: string, s: Slot, out: Out, ok: boolean, why?: string) => {
    out.stopSilent();
    s.out = undefined;
    if (ok) {
      s.failures = 0;
    } else {
      // Put it back unless something newer has been accepted. Then the next batch still holds everything not known to have landed.
      for (const w of out.writes) if (!s.dirty.has(w.key)) s.dirty.set(w.key, w);
      s.failures++;
      wakeAt(scope, s, host.now() + Math.min(o.retryMaxMs, 1000 * 2 ** (s.failures - 1)));
      if (s.failures === 1) o.report({ code: "StorageFailed", origin: scope, input: why });
    }
    for (const t of out.tickets) o.stored(t, ok); // runs a turn, whose writes land in dirty, so they beat what was put back
    pump(scope);
    if (!s.out && s.dirty.size === 0 && s.tickets.length === 0 && s.failures === 0) {
      s.stopWake?.();
      slots.delete(scope);
    }
  };

  const pump = (scope: string) => {
    const s = slots.get(scope);
    if (s === undefined || s.out !== undefined || s.dirty.size === 0) return;
    if (s.tickets.length > 0 || host.now() >= s.due) issue(scope, s);
  };

  return {
    // Called for each persist command of a step, on the turn. No encoding, no I/O: map writes, one comparison.
    accept(c: Persist) {
      let s = slots.get(c.scope);
      if (s === undefined) {
        s = {
          dirty: new Map(),
          tickets: [],
          out: undefined,
          due: Infinity,
          stopWake: undefined,
          failures: 0,
        };
        slots.set(c.scope, s);
      }
      for (const w of c.writes) s.dirty.set(w.key, w);
      if (c.ticket) s.tickets.push(c.ticket);
      const inBackoff = s.failures > 0 && s.due !== Infinity;
      const urgent = c.now || c.ticket !== undefined || host.isHidden();
      const at = urgent ? 0 : host.now() + o.captureMs;
      if (!inBackoff && at < s.due) wakeAt(c.scope, s, at);
      if (urgent) host.later(() => pump(c.scope)); // off the turn, and after the whole step's commands
    },
    // In the hide handler's own task: later tasks may never run. A scope with a batch out cannot go: see "costs".
    hide() {
      for (const [scope, s] of slots) if (!s.out && s.dirty.size > 0) issue(scope, s);
    },
    quiet: () => slots.size === 0,
  };
};
```

### The host's half: real IndexedDB

```ts
import type { Bytes, Purpose } from "./edge.ts";

export const idbWrite =
  (db: IDBDatabase) =>
  (writes: readonly Bytes[], purpose: Purpose, answer: (ok: boolean, why?: string) => void) => {
    let tx: IDBTransaction | undefined;
    try {
      tx = db.transaction("kv", "readwrite", {
        durability: purpose === "flush" ? "relaxed" : "strict",
      });
      const started = tx;
      started.oncomplete = () => answer(true);
      started.onabort = () => answer(false, started.error?.name ?? "aborted");
      const store = started.objectStore("kv");
      for (const w of writes) {
        if (w.value === undefined) store.delete(w.key);
        else store.put(w.value, w.key);
      }
      started.commit();
    } catch (e) {
      // A throw before commit() must not autocommit half a batch.
      if (tx !== undefined) tx.abort();
      else setTimeout(() => answer(false, String(e)), 0);
    }
  };
```

What this rests on [spec]:

- **`commit()`** throws `InvalidStateError` unless the transaction is active, so it is called in the task that created it. Pending requests finish; no new ones are accepted. It is called on **every** batch, so hide has no special path.
- **`complete` is fired after the write**, "considering" the durability hint. **Requests can all succeed and the commit still abort** (for instance `QuotaExceededError`), reported only by `abort`, late. So the edge never treats a request's success as a landing.
- **Same store, overlapping scope:** a read/write transaction starts only when no earlier overlapping one is unfinished, so they run in creation order. The rule does not need this. It is why a hang is store-wide.
- **`abort()` throws once committing**, so a hung commit cannot be cancelled. **A forced close** aborts the connection's transactions, and `abort` fires, so the edge hears it.
- **Durability:** `strict` asks for an OS flush before `complete`; `relaxed` fires once the change is in the OS buffer. Chrome's default became relaxed in 121 ([Chrome](https://developer.chrome.com/blog/indexeddb-durability-mode-now-defaults-to-relaxed/)). It reports 3 to 30 times faster. A batch with a ticket is `strict`. A plain one is `relaxed`.

### The host contract, all of it

| Clause | Why |
| --- | --- |
| A batch is atomic | The cut. `tearLast` in the fake is what breaks it, and the rule does not survive that |
| `true`: all of it landed. `false`: none did, and none ever will | Truthful answer. A false that later lands would break the proof |
| No answer is allowed, for ever. It may have landed | Hang and kill |
| An answer comes in a later task, never inside `write` | `stored` runs a turn |
| At most one writer | Web Lock, section 6 |

**Not in the contract: any order between batches.** A host needs atomic batches and truthful answers. Nothing else.

## 3. Requirements, walked

Traces marked [ran: model] are in `trace.ts`. Turns there are hand-written to match the review's scripts; the real `step` was not run.

| # | Result | Evidence |
| --- | --- | --- |
| 1. Later write wins | A failed batch goes back only under `!dirty.has(key)`, and no second batch can be racing it | [ran: model] plant `oldWins` caught |
| 2. Failed plain, success, kill | The removal stays in `dirty`, so the "success" contains it. See below | [ran: model] |
| 3. Memory ahead of lane | Memory waits for the older batch's answer, then goes with the lane. See below | [ran: model] |
| 4. Released hold comes back | The delete replaces the parked capture in `dirty`. The capture never goes. See below | [ran: model] |
| 5. One actor stops another | Slots share nothing. `b` lands and `a` is reported. See below | [ran: model] |
| 6. Late failure, hang, backoff | Failure: `StorageFailed` at the first, retry at 1 s, doubling, capped at 30 s, reset by a landing. Hang: `StorageSilent` at `storageMs`, the slot stays shut. See "Hang" | [ran: model] for the first retry and the report. The 30 s cap: not run |
| 7. Restored actor | The invariant. Mismatches below | [ran: model] |
| 8. Capture and ack | **Two transactions, always.** Below | [spec] |
| 9. Timers | Below | [reasoning] |
| 10. Hide, kill, tabs | `commit()` always. Kill table and section 6 | [spec], [reasoning] |
| 11. Cost | `accept` is 11 ns per call on the steady path, this machine, no encoding; a timer only when `due` moves | [ran: microbench, edge only]. Real p99 is the builder's to measure |

**Req 2.** Lane `acked` on disk. Removal plus `Paid` fails; a note follows; retry lands:
```text
REQ2  disk: x|m = {"s":"Paid","note":1}, no x|L.   issues: StorageFailed(x)
```

**Req 3, E2.** N (`W` + lane) will abort, `W` moves on, 6 s pass, then the answer:
```text
kill before the answer -> disk empty: older whole state, no request was sent
after the answer       -> disk empty, StorageFailed(x)
after the retry        -> x|L = lane, x|m = {"s":"W","v":2}
```

**Req 4, M2.** `Go, ack, lost, failHeld, Note, Retry, Forget, failLate, ack, reload`:
```text
Go          batch 1 {W, cap1, t1} out
ack         lands; t1 ok; the request goes
lost        the turn writes U + held. batch 2 out. The store has failed it, silently
Note        dirty {memory}
Retry       dirty {memory, cap2, t2}. Cannot go: batch 2 unanswered. The re-send does not leave
Forget      dirty {memory, delete lane}: the delete replaces cap2
failLate    batch 2 answers false. Its keys are all newer in dirty, so nothing goes back
            batch 3 {memory, delete lane, t2} goes
ack         lands. t2 answers ok; its Attempt is gone, so step ignores it
reload      x|m = {"s":"A","note":1}, no lane. Not U. No zombie
```
[ran: model] for the disk after the last line. This is why a re-send's capture waits for an unanswered plain batch. If it went first, the older batch's failure would leave a capture on disk with its memory and lane change missing.

**Req 5, H1.** `a: NoteBad(1n)`, `b: Note, hide, Go, ack, ok`:
```text
disk: b|m = {"s":"Paid"}, no lane for b.   issues: UnencodableValue(a).   b's ticket: ok
```

**Hang.** `x` never answered, `y` writes, 10 s pass, on a store with per-key order:
```text
disk: y|m.   issues: StorageSilent(x)
```
On one real store `y` also sits behind `x`, `y` also reports, and no capture leaves anywhere: `invoke` waits for a ticket, and `step`'s own `storage` timer declines it with `NotSent`. Safe, stuck, and loud.

### Req 7: every permitted mismatch

| Disk | When | Restores as |
| --- | --- | --- |
| Whole state, older than live | Always possible: what had not landed | That state. Lost up to the window, or more behind a slow batch |
| Lanes ahead of memory, **by puts only** | Only while that actor's memory cannot encode, and reported | Older state plus a hold: the existing `U` path. The hold is true or pessimistic, never missing |
| Lane present for an op that was declined | Capture landed, `stored` went to false or the timer fired, kill before the delete landed | A hold on an op never sent. Pessimistic, and what any write-ahead log gives |
| Two actors at different moments | Always possible | Each is whole on its own. Given up, section 7 |

**Never:** memory ahead of a lane. A lane delete ahead of memory. A state older than a batch that landed, unless a power loss takes a `relaxed` landing (section 7).

### Req 8: first send

They cannot be one transaction. The capture must be on disk before the request; the ack is what the answer brings. A transaction cannot stay open across a network call: it autocommits once its requests are done and control has returned [spec]. Anything that kept it alive would be rolled back by the kill the capture exists for.

So: capture batch lands, ticket, `invoke`, answer, ack batch lands, ticket, reported. The two can never meet in `dirty` for one first send, since the request has not left. They can coalesce across different Attempts, or a re-send, and share one batch. That is fine: a ticket means "a batch at least this new landed".

The ack could be `relaxed` without harm (lost, it restores as a hold; the capture is what stops the second key). Kept `strict` here for one reading of "awaited".

### Req 9: every timer

| Timer | Late or never means | Safety affected? |
| --- | --- | --- |
| `due`, the 5 s | The older whole state stays on disk longer. Hide and any urgent write do not use it | No. And hidden pages arm no wait: `isHidden()` at `accept` is urgent |
| Backoff retry | A later retry | No |
| `stopSilent` | A later report | No. Liveness of a report only |
| `step`'s `storage` | An Attempt waits longer. No request goes without its ticket | No |

If the tab is frozen nothing runs at all, and everything above resumes on thaw. Firing sets `due = 0` rather than comparing clocks, so a clock set back does not strand a flush.

### Req 10: a kill at each instant

| Kill | Disk | Restores as |
| --- | --- | --- |
| Between turn and `later` | Older whole state | No request went, if the turn had a ticket |
| Batch out, unanswered | That batch whole, or not at all | Either whole state |
| Landed, answer not heard | Newer than the process knew | Fine: nothing was waiting on the answer yet. A capture with no send is the pessimistic row above |
| Ticket told, before `invoke` | Same | Same |
| Ack landed, not reported | Lane acked | Parked ending redelivered |
| At hide | Whatever got through | An older whole state |

### The review's assumptions

| # | After this |
| --- | --- |
| 1 (frozen owner, second tab) | Tab has no edge, commit declines. **Closed** at the cost of a dead Pay button in that tab |
| 2, 3 (record loss, key lifetime) | **Unchanged.** Section 7 |
| 4 | **Closed.** Per actor |
| 5 (Schema) | `encode` is one injection point; passing the Schema encoder closes it there. A `bigint` under Schema simply encodes |
| 6, 7 | **Closed**, by the rule |
| 8 | **Closed** for safety, and hidden pages no longer wait |
| 9, 15 (hide, one browser) | **Unchanged.** Limits |
| 10, 16 | **Host's**: bound `open` under `bootMs`; no lock API means no persistence |
| 12 | The edge is fine (above). `dueAt` in `durable` is untouched |
| 14 | Fake gains `holdPlain` |
| 18 | Unchanged. Encoding later still reads a value an author may mutate |
| 20 | `now` is now the one place this policy lives. Owner's call, section 9 |

## 4. Prior art

- **Group commit (write-ahead logs).** The same shape: one flush, a queue of waiters, and waiters leave when a flush covering them finishes. A log needs append order because it holds deltas. This edge writes a newest-value image per key, so it needs no replay and no compaction.
- **TanStack DB offline transactions.** Persist to an outbox first, then send; [a repeated idempotency key must be honoured by the server](https://tanstack.com/db/latest/docs/guides/offline-transactions); one tab leads, by Web Locks or `BroadcastChannel`. It agrees on tabs and on where double-charge safety finally lives. Read from docs only, not source.
- **Replicache.** Memory first, then a periodic persist that moves whole commits to IndexedDB, run through a scheduler ([summary](https://deepwiki.com/rocicorp/mono/3.2-replicache-storage-and-persistence)). [Its v10 release notes say](https://github.com/rocicorp/replicache/releases) offline tabs can be closed before data is saved: the same trade as D80. Read from a summary, not checked in code.
- **Redux Persist.** Not read in this pass. From memory only, so treat as unverified: per-key throttled writes with no cross-key cut, which is the failure mode of requirement 3.

## 5. Rejected

| Shape | Why not |
| --- | --- |
| Per-key stamps, ignoring older answers | Meets 1, not 3. Order per key says nothing across keys. It is the pile |
| **One batch out, globally** | Smallest state. Fails 5: one oversized actor's abort takes everyone's batch, and the only cure is splitting, which is this design |
| **Cumulative batches, several out**: each carries all unconfirmed | Real rival. A slow store blocks nothing and hide can always write. But safety now rests on store order, there is a stale-answer rule, and the queue needs a cap. **The fallback if the hide window measures badly**: at hide only, issue `out ∪ dirty`, relying on the spec's creation order |
| Review's "take the newest value from the world at issue" | Same result as `dirty` without the edge reading `World`. It does not need to |
| One record per actor (memory and lanes in one value) | Atomic on any key-value store, so attractive. But every capture rewrites the memory, an unencodable memory blocks captures, and D88's per-lane quarantine is lost |
| Lane first, memory second, two transactions | Memory never ahead, but deletes are then ahead of memory, and there are two cuts to reason about |
| Append-only log | Needs replay, compaction, and the same answer to an aborted hole |
| On unencodable memory, decline the capture | A money path stops for a note field; and an ack already owed has nowhere to go |
| On unencodable memory, send deletes too | **Double charge.** Lane gone, memory older: restores before the payment, button live, new key. [ran: model] plant `poisonDeletes` |
| `tx.abort()` on a hang | Throws once committing [spec] |

**Why the poison clause is not arbitrary.** A lane on disk claims "something may be outstanding". A claim too many gives a hold; a claim too few gives a second charge. So with no whole state to write: puts may go (more claims), deletes may not (fewer claims, with no memory to absorb them).

## 6. Tabs, boot

- **Owner only.** The edge exists only in the tab that took the Web Lock and read the disk. The host makes one after `load`.
- **No edge means persistence is off:** no lock, no lock API, or a read past `bootMs`. `boot` says so and `step` declines in the same turn: `NotSent { NoPersistence }`, with no async path through a ticket. A late read is ignored. Plain memory stays in memory.
- **Open:** `indexedDB.open` goes under `bootMs` too (assumption 10).
- **`disposeRuntime`:** `hide()`, then wait for `quiet()`, bounded by `disposeMs`.

## 7. Gives up, costs, does not solve

**Gives up**

1. **Two actors are not one cut.** Actor `a`'s send and `b`'s receipt can restore from different moments. An entity table or module store written in its own scope is not atomic with an actor's lane either: an optimistic write and its lane can part. Partitions inside an actor's record are safe. A flow that needs two actors whole does not get it from this edge.
2. **Lanes travel alone.** A lane turn takes any dirty memory with it, so a capture waits for encoding a large record, and a store write carries it.

**Costs**

3. **A slow store delays that actor's writes, captures included.** A plain batch taking 200 ms delays the next capture 200 ms. A hung plain batch means every later capture for that actor declines at `storageMs`. D94 cost the same.
4. **The hide window widens by one batch.** With a batch out at hide, newer dirty writes cannot go, and if the page dies they are lost. It is safe (older whole state), but it may take an ack: the charge then restores as a hold. Size: one write's latency overlapping the hide. **Not measured.**
5. **An unencodable memory can hold that actor's completed charge as a hold across a reload**, until the value goes. Reported on each try: at most once per turn, not deduplicated, to keep state out.
6. **Pessimistic holds:** a declined capture can restore as a hold (kill in a small window).
7. **Encoding sits in one task** per scope. Many large actors at hide are encoded synchronously in the hide handler. No slicing proposed: at hide there is no later.
8. **`strict` on captures** adds a real flush per payment. Fine at that rate.

**Does not solve**

9. **H3-style loss** (3/240 charged with nothing on disk, cause unknown). This design makes captures `strict` and rules out the edge's own part. If H3 survives it, the store is the suspect, and only a key the server can recognise closes it.
10. **Records vanishing** (eviction, Safari's cap, a cleared site) and server key expiry. The key is still the Attempt. The review's root for 1, 2, 3, 17 stands: *the client's record reduces duplicates; only a key the server can recognise prevents them.*
11. **Chrome durability.** `strict` is a hint, and `fsync` on macOS is not a full flush [reasoning, from the review]. After a power loss a `relaxed` landing can go. A relaxed batch lost under a later strict one would break the cut if a backend reordered; I assumed logs flush in order [reasoning, not checked for any browser].
12. **A hung store**, beyond reporting. The app's only recovery is a reload.
13. **Pay's bugs** (M7, H4), the typed casts, and `flow check`.

## 8. What changes

### `round-7/world.ts`

```ts
// BEFORE
| { k: "persist"; writes: readonly Write[]; purpose: "acknowledge" | "capture" | "flush";
    ticket?: { attempt: string; ticket: string; actor: string } }

// AFTER                                   NEW: scope, now         RENAMED: ticket.actor -> scope, moved up
| { k: "persist";                          // existing: persist, writes
    scope: string;                         // NEW: the actor's key. Non-actor records name their own, e.g. "meta"
    writes: readonly Write[];              // existing, unchanged, including { record } and { value }
    now: boolean;                          // NEW: don't wait for 5 s. Replaces purpose "flush" + D84 + D93 tests
    ticket?: { attempt: string; ticket: string; purpose: "capture" | "acknowledge" } } // MOVED: purpose
```

| Thing | Change |
| --- | --- |
| `Input.boot` | NEW: `persistence: boolean` |
| `World` | NEW: `persistence: boolean`, read by commit. CHANGED: `savedLanes` is "last value emitted", and the `""` case goes, since the edge loses nothing it accepted |
| `Bounds` | NEW: `retryMaxMs: 30_000`. `storageMs` also times `StorageSilent` |
| `Input.stored`, `Phase.durable`, `Timer` `"storage"` | Unchanged |

**Added:** `scope`, `now`, `persistence`, `retryMaxMs`, `isHidden`, `StorageFailed`. **Dropped:** `purpose` on the command, `then` / `failed` / `landed`, `ticket.actor`.

### What `step` must already do, or start to

I have not read `step`. Each is a question for the builder, and the invariant depends on 1 and 5:

1. Every record has one scope: a lane its `actor`, memory its actor. Is any write shared?
2. A write with a ticket is a non-empty put. If a dedupe could drop it, the ticket never answers.
3. `stored { ok: false }` on a capture emits a lane write that supersedes it. Otherwise the retry lands a capture for a declined op.
4. A `stored` for a gone or replaced Attempt is ignored.
5. **A step's commands describe a state worth restoring.** `pump` runs in `later`, after the step, not after the drain. If a turn publishes `PLACING` and creates its lane in a *following* step, the cut between them waits for nothing, with this design as with any. Oracle (f) finds it. If it happens, batches go after the drain.
6. `meta`: can it land apart from actors? `savedMeta` and the marker I have not seen.

### Host: `conformance/fake-world.ts` and `reality/`

```ts
// BEFORE
write(writes, purpose, then?, failed?, landed?): void;
onHidden?(f): void;
// AFTER
write(writes, purpose, answer: (ok: boolean, why?: string) => void): void;  // RENAMED + merged: then, failed, landed -> answer
onHidden?(f): void;                                                         // existing
isHidden(): boolean;                                                        // NEW
```

Fake:

```ts
write: (writes, purpose, answer) => {
  this.oneOutPerKey(writes);                       // NEW: throws if a key is already out. Oracle (g)
  const plain = purpose === "flush";
  if (plain && this.plainFails > 0) {              // existing knob. CHANGED: answers later, never inside write
    this.plainFails--;
    this.laters.push(() => answer(false, "a plain write failed"));
  } else if (plain && this.plainFailsLate > 0) {   // existing
    this.plainFailsLate--;
    this.laterFailing++;
    this.laters.push(() => {
      this.laterFailing--;
      answer(false, "a plain write failed, said later");
    });
  } else if (plain && this.plainFailsHeld > 0) {   // existing
    this.plainFailsHeld--;
    this.lateReports.push(() => answer(false, "a plain write failed, said much later"));
  } else if (!plain || this.holdPlain) {           // NEW: holdPlain, a plain success in flight (assumption 14)
    this.held.push({ writes, purpose, answer });
  } else {
    this.landWrites(writes);
    this.laters.push(() => answer(true));
  }
};
```

- **Remove:** `blocked`, `behindHung`, `flushUnblocked`. Keys of one scope cannot overlap in flight.
- **Add knobs:** `holdPlain`; `storeWide` (the oldest held batch only is answerable, so a hang holds everyone, as one IndexedDB store does); `hidden` with `show()`; `freezeTimers`; a clock that can go back while timers keep a monotonic base.
- **Keep:** `failLate`, `landNoAck`, `tearLast`, `corrupt`. `purpose` stays on the batch so `storage` steps can match it; a batch's purpose is its strongest ticket's.
- **`reality/`:** `idb-host.ts` above; `isHidden` is `document.visibilityState === "hidden"`; bound `open`.

### Callers

- **Replaces** the driver's persist path. For each `persist`, `edge.accept(c)`. `onHidden` calls `edge.hide()`. `stored` becomes `Input.stored`. `report` goes to the issue sink.
- **`encode`:** route by the record's machine to its memory Schema (closes H2). Until then, `JSON` plus the `flow check` refusal the review proposes.
- **Rest of the system.** Pure core, single graph and static analysis are untouched: `step` keeps emitting data. Stories never touch the edge. `flow trace` sees only commands. Entities and modules: see "gives up" 1. A store for other hosts is smaller: no order is required.
- **Retire if accepted:** D94's parking, D89's scope (replaced by section 5), D83's mechanics (its sentence becomes true). D80, D84 and D93 stay as policy: `captureMs`, `now`.
- **Suite:** `expected-changes.log` will move. A capture now waits behind an unanswered plain batch, batches merge, and fake failures answer later. Each change should be justified, not bulk-accepted. Mutants `drv-d94-*`, `drv-d83-*`, `drv-carried-*` go with their code.

## 9. Proof obligations

### Oracles

| | Oracle | How it reads |
| --- | --- | --- |
| e | **A restore is whole and not old.** For each scope, the disk's memory and lanes equal one published cut, at or after the newest landed batch's cut | From `StepOut.frame`, one list per scope. Poisoned scope: memory may lag, lanes may not have lost anything |
| f | **A waiting state has something to end it** | Review's (f), with `Peek` in tight |
| g | **One out per scope** | Fake throws (`oneOutPerKey`) |
| h | **Write-ahead.** When a keyed request starts, its Attempt's bytes are in `kv` | Fake, at `call` |
| i | **Ack before report.** When an ending is reported, the ack's bytes are in `kv`, or the lane's delete is | Fake plus evidence |
| j | **Another actor changes nothing.** `b`'s restored cut is the same with or without `a`'s fault | Differential, two runs |
| k | **Loud.** A batch unanswered past `storageMs` gives `StorageSilent`; a failure gives `StorageFailed`; a poison gives `UnencodableValue` | With timers running |
| l | **Timers don't matter for safety.** (e) to (i) hold with `freezeTimers` | Same search |
| m | **Bound.** With timers running and a steady stream of turns, visible memory lands within `captureMs` of first dirty | `drv-timer-reset-debounce`'s hole |

### Search actions

Two actors in every flush search. Alphabet: `Go`, `Note`, `Retry`, `Forget`, `NoteBad`, `NoteGood` on each actor; `ack`, `refuse`, `hang`, `landNoAck`, `failPlain`, `failLate`, `failHeld`; `holdPlain`; `hide`, `show`; `freeze`, `thaw`; `clockBack`; `storeWide`; `KILL`; `Peek`. Put `flush.*.tight` in `mutate-one`, run the suite a second time at the default `captureMs`.

### Plants

| Plant, in `edge.ts` | Expect | Model |
| --- | --- | --- |
| `twoOut`: drop the `s.out` guard | (g), (e) | **[ran: model] caught** |
| `oldWins`: put back unguarded | (e) | **[ran: model] caught** |
| `noMerge`: failure drops the batch | (e) | **[ran: model] caught** |
| `partial`: lanes sometimes stay behind the memory | (e), (f) | **[ran: model] caught** |
| `poisonDeletes`: deletes go under poison | (e), and two keys on Pay | **[ran: model] caught** |
| Poison skips every scope | (j) | Not run |
| `due` reset on each `accept` (debounce) | (m) | Not run |
| `accept` ignores `now` | (i)'s timing, (m) | Not run |
| No `stopSilent` | (k) | Not run |
| `stored` before a batch lands | (h), (i) | Not run |
| Ticket boards no batch | (k), Attempt stalls | Not run |
| Encode in `accept` | Encoder counts on the turn must be 0, plus the bench | Not run |
| Hidden not urgent | Bound after `hide` | Not run |
| No `commit()` | Spy in `reality/`, then a kill-at-hide count | Fake cannot see it |
| Plain `strict`, capture `relaxed` | Spy in `reality/` | Fake cannot see it |

**Model result [ran: model]:** 4,000 runs, about 16,000 landings, 12,000 kills, two scopes, hang and fail injected: **0 violations of (e), (g)**. With poison: 0 lane losses. All five plants above caught. It says nothing about the real `step`: its turns are mine and it has no server.

### Reality runs to repeat

E2 (1/72 before), H1 (2 and 3 of 240), hide at 10,000 messages (0/6 reload), kill before hide (0/96), with the throttling flags **off**, and a hide-with-batch-out count for cost 4.

## 10. Questions for the owner, proposed answers only

1. **Cost 4, hide window.** Accept it, or add the `out ∪ dirty` issue at hide? Recommendation: accept, measure first.
2. **`now` for what?** Lanes and retired identities today. FRAG-10's armed deadline, a leaf change and a first record are lost in the window (review assumption 20). Recommendation: an armed deadline is `now: true`; it is more than plain memory. Leaf change stays plain.
3. **Ack durability.** `strict` as written, or `relaxed` since a lost ack is only a hold? Recommendation: leave `strict` until H3 is rerun.
4. **Business keys** (review): unchanged, still the only full answer to loss.
