# Convergence 6: round 5's review, by root cause

Status: **everything here is proposed.** Written under the owner's delegation, before any round 6 code ran; reasons are reasoning until `round-6/RESULTS.md` says otherwise. It answers `round-5/review.md` (H1-H7, M1-M13, L1-L8) as one design. The review is advice: where I disagree it says so. `D74`.. are new. No keyword is public API unless marked **public**.

**This round evolves round 5.** `round-6/` starts as a copy. **One part is redesigned from requirements: the entity confirm path.** It has now failed review twice in different forms, each time on a branch nobody fed, so another branch would be the third form. **The step, the fence and `Phase` are not implicated:** no High touches them, and persistence below changes the edge (what `persist` carries, how the driver writes), not `Phase` or a lane cell. If building shows otherwise, RESULTS says so at the top.

## Read this in the morning

| #                                    | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Why it might be wrong                                                                                                                                                        | Cost to flip                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **D74 (owner's: D67's replacement)** | **Evidence is placed, then disposed. Two small functions, one table.** `place(rec, ev)` answers `older / same / newer / open` from versions and starts. `dispose` turns that and the evidence's kind into one of four verbs. `unechoed` becomes a **claim**: what a confirmed write established and which fields, not a tick. Every caller obeys, `onRepair` included                                                                                                 | Still per record. Two records have no joint order, and I keep that as a stated limit: this is review's option A plus the numeric rule, not option B                          | Medium: `judge` and its callers, about 150 lines       |
| **D75**                              | **A version is ordered only if it is declared ordered.** Numbers order. A string with no declared order compares for **equality only**; different means "cannot place", so positions decide. `DomainSpec.versionOrder: "lexical" \| (a, b) => number` declares one                                                                                                                                                                                                    | An ISO timestamp author who forgets to declare gets the fallback: repairs where a compare would do. Safe, and `flow check` can say so                                        | Trivial                                                |
| **D76**                              | **Evidence about a record not yet held is kept, not dropped.** A frame on an unheld ref leaves a stub, replayed through `place` over the row when a read that started earlier lands. A success on an unheld ref leaves a claim. Bound 1,024 stubs per store, oldest out, with evidence                                                                                                                                                                                | A stub per unheld ref is memory for records nobody loads, and past the bound the race is back, named by evidence only                                                        | Small                                                  |
| **D77**                              | **`createRuntime` seals. Every closure in `Compiled` runs gated, streams and domains included.** `key`, `backoff`, `reconnectWhile`, `pageRetryWhile`, `subscribe`, `catchUp`, `confirms`, `reads`, `listens`, `version`, `repair` all become `Slot`s at seal. Bare functions stay legal on **input** until the typed front end, next round, can make it a type error                                                                                                 | The type-level half of the review's proposal waits a round. A module can still hand a fresh bare closure to `cx.user`, which is itself gated                                 | Small                                                  |
| **D78**                              | **Restore re-derives every held lane's key from the release that is running.** `canon(op.key(head.input))` against the stored key. Different: the lane moves to its new key, with `LaneRekeyed` evidence. A collision keeps the hold on its old key with an issue                                                                                                                                                                                                     | A release whose `key` throws on old input keeps the old key, so an idle guard can still miss that one. Named by an issue. A schema decode is the real answer                 | Trivial                                                |
| **D79 (owner's table)**              | **T6 becomes runtime code.** `Feed.callback` is a value in `Compiled` that the runtime turns into its own bounded queue (`feed.ts`), signal groups, 1,024, and a pushed `socket` goes through the same queue so nothing is unbounded. **T1 gains two rows:** `failing` reaches `Repairing` out of band as `lose(Overflow)`; a page has a deadline tagged `page` that counts as a stall. **The armed deadline follows T1 literally:** only while a pull is outstanding | Both rows change the owner's table. Without row 1 a stopped pull is a wedge or a false `Silent` loop; the code is one of those today                                         | Small, table rows                                      |
| **D80**                              | **Persistence: capture by reference, write off the turn.** `persist` carries actor _records_, unencoded; the driver coalesces newest-per-key and encodes when it writes. An awaited write flushes what is waiting first, FIFO. A failed plain write stays dirty and retries, with `StorageFailure`. `admit` of persisted memory walks only what it has not yet verified. `load` may be a promise                                                                      | A crash loses up to `captureMs` of plain memory; lanes and Attempts in an awaited write are not affected. Memoised verification trusts values not to be mutated after a turn | Medium, driver only. **Step untouched except `flush`** |
| **D81**                              | **The store seam gets typed.** A module declares `store: true`. `sessions` says `cx.publish({ k: "pushed" \| "gap", ... })`, the core tells whichever store modules exist. `Told` loses `{ k: "module", payload: unknown }`, `input` loses its timer default. A small engine module, cookie and LMID, runs behind this as the check                                                                                                                                   | One more seam word for one consumer today                                                                                                                                    | Small                                                  |
| **D82**                              | **Restored memory may be decoded.** `memory.restore?: Slot<(stored) => object>`, gated, run at restore. No slot: as today, documented. Stands in for Schema decode with defaults                                                                                                                                                                                                                                                                                      | A stand-in; the front end will replace it                                                                                                                                    | Trivial                                                |
| **T9 (owner's)**                     | **Flagged, not decided.** Kept as round 5 built it: a `when` throw keeps the session, one issue                                                                                                                                                                                                                                                                                                                                                                       |                                                                                                                                                                              | Small                                                  |
| **D24 (owner's)**                    | **Flagged, not decided.** Lean: no cut                                                                                                                                                                                                                                                                                                                                                                                                                                |                                                                                                                                                                              | Owner's word                                           |
| **Pay (owner's)**                    | **Memory unchanged, pinned.** `pay.fixed.ts` stays beside it                                                                                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                              | Owner's word                                           |

## Why the confirm path is redone (H1, H2, H3, L7, D74-D76)

Round 3's H1, round 4's H3, round 5's H1 and H2 are one family: a confirmed fact silently undone by evidence that could not be placed. D66 gave one judge, but `judge` mixes two questions: _where does this evidence sit_ and _what do we do about it_. So `order === 0 && placed` returns `apply` before looking at anything, `differs` compares what happens to be carried, `onRepair` keeps a private branch, and `unechoed` is a tick that any partial frame can clear because it holds no record of _what_ is unplaced.

**Requirements, gathered at once.**

| Id                | Requirement                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| 2.8.6             | "With versions, the version decides." Without, a later position wins and a differing older one is contested |
| 2.8.6 success row | Confirmed fields replace; omitted ones `unconfirmed`                                                        |
| Rule 32, E3       | Marks belong to the Attempt; a read never clears one; doubt is separate                                     |
| D59               | A confirmed success is the best evidence held, and applies; doubt marks the rest                            |
| H1                | A frame or a success may arrive before the first row. **Subscribe-then-fetch is the ordinary case**         |
| H2 row 1          | Absence is evidence too, and a row at the tombstone's version is older than the tombstone                   |
| H2 row 2          | A partial frame says nothing about fields it does not carry, so it cannot be an echo of them                |
| H2 row 3          | One judge means every caller obeys it                                                                       |
| H3                | A version order is a declared fact, not a property of JavaScript's `<`                                      |
| L7                | A success that places itself past an older unplaced write settles that write                                |
| H6                | The oracle must be able to see a read older than its landing                                                |
| Seam              | A sync engine sits behind the module's seam, replacing this judge rather than feeding it                    |

**What real engines do, again.** Replicache and Zero order snapshots by a server cookie; a poke is atomic, `lastMutationID` confirms a write in the snapshot that carries its effect (`codebases/mono/packages/zero-client/src/client/zero-poke-handler.ts:301-375`, `replicache/src/sync/pull.ts:221-287`). TanStack DB holds sync data while a persisting transaction settles (`codebases/db/packages/db/src/collection/state.ts:1159`); Electric buffers until `up-to-date`. Both have what Flow's desk does not: one order across records. **So the honest split is by what the server gives.** A per-record `revision` gives a per-record order. An engine gives a snapshot order, and it does not need this judge: it replaces `entities.ts` behind the seam (D81). D74 does not try to be both.

**The shape.** `place` is pure, knows nothing of kinds, and returns one of four words. `dispose` is one table.

```ts
// BEFORE (round 5): one function, two questions, and callers that second-guess it
const judge = (r: Rec, ev: Evidence): Verdict => {
  const order =
    ev.version !== undefined && r.version !== undefined ? older(ev.version, r.version) : undefined; // `<` on strings: H3
  const placed = r.unechoed === undefined; // a tick: holds no idea what is unplaced: H2
  if (order === 0) {
    if (placed) return "apply"; /* ... */
  } // equal and "placed" wins before anything looks: H2
  // ...
};
if (v === "again" && whole) {
  /* onRepair's own branch */
} // H2 row 3

// AFTER
type Claim = {
  // NEW: replaces `unechoed`
  readonly at: number; // when the newest such write's success landed
  readonly fields: readonly string[]; // what those writes established
  readonly removed?: true;
  readonly values?: Readonly<Record<string, unknown>>; // only on a record with no base yet, so a row can be overlaid (H1)
};
type Rec = {
  base?: Fields;
  version?: Ver;
  gone?: true;
  landedAt: number;
  claim?: Claim;
  doubt?: number;
  unconfirmed: string[];
  marks: Mark[];
  queue: string[];
  early?: Early;
}; // RENAMED: changedAt -> landedAt. NEW: gone, claim, early

type Place = "older" | "same" | "newer" | "open"; // NEW
const place = (r: Rec, ev: Evidence, ord: Order): Place => {
  // NEW: all of it
  const cmp = compareVersions(ev.version, r.version, ord); // number, "different", or undefined when either has none
  const pastClaim = !r.claim || (ev.start !== undefined && ev.start > r.claim.at);
  const pastLanding = ev.start !== undefined && ev.start >= r.landedAt;
  if (typeof cmp === "number" && cmp < 0) return "older";
  if (typeof cmp === "number" && cmp > 0) return pastClaim ? "newer" : "open";
  if (cmp === 0) {
    if (r.gone) return pastLanding ? "open" : "older"; // H2 row 1: absent at v, and a row at v is from before
    return pastClaim ? "same" : "open";
  }
  // No order between them. A frame has no start: arrival order is the stated limit, and only with nothing unplaced.
  if (ev.kind === "frame") return r.claim ? "open" : "newer";
  return pastClaim && pastLanding ? "newer" : "open";
};
```

| `place`             | Evidence and record                                                                     | Read, frame                                                                                               | Success                                | Repair                                                             |
| ------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| **older**           |                                                                                         | `Stale`, dropped                                                                                          | `Stale`, dropped                       | Started before something landed: **again**. Else ended, marks stay |
| **same**, **newer** |                                                                                         | **Apply**. Claim goes, doubt goes if it started after                                                     | **Apply**. Claim goes                  | **Replace**. Claim, doubt, `unconfirmed` go                        |
| **open**            | **Echo**: carries _every_ claimed field, all equal                                      | **Apply**. Claim goes                                                                                     | **Apply**. Claim stays as this write's | **Replace**                                                        |
| **open**            | Carries a claimed field that differs, at an equal version: it is from before the write  | **Merge the rest.** Claim stays. No doubt, no repair                                                      | as next row                            | **Again**                                                          |
| **open**            | Carries a claimed field that differs, or (no version, read) any held field that differs | **Doubt, repair, not applied.** With no base: applied under the claim, with doubt, so the row is not lost | **Apply, doubt, repair** (D59)         | **Again**                                                          |
| **open**            | Says nothing against anything held                                                      | **Merge.** Claim stays (H2 row 2)                                                                         | **Apply**                              | **Replace**, claim stays if its fields are absent                  |

```ts
// After any success, in one place. existing: the table's five rows; NEW: `claim` in place of `unechoed`, no `continue` on no base
//   version carried                         -> placed, an older claim goes (L7)
//   fields, no version                      -> applied; claim { at, fields: carried + predicted }
//   nothing, live field prediction          -> predicted fields to `base`, `unconfirmed`; claim { at, fields: predicted }
//   nothing, live field prediction, no base -> claim { at, fields: predicted, values: predicted plain values }   // NEW: H1's second door
//   nothing, live remove prediction         -> gone; claim { at, removed }
//   nothing, no live prediction             -> doubt, repair
```

**Traces, each of the review's.** All on `deskListenFixture`; server `archive` is a 204.

| Trace                                                                            | Round 5                                           | After                                                                                                                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| H1: `hello; Load (v1); frame v2; list answers v1`                                | Frame dropped `NotHeld`, row v1 applied, unmarked | Stub v2. Row v1 lands (`NONE` has no version: newer). Stub replays: v2 > v1: newer. Shows v2                                                    |
| H1: no version, same                                                             | as above                                          | Row lands, stub replays: frames have no order against a read: open, differs: doubt, repair. Marked, then truth                                  |
| H1b: `Load; Archive; ok 204; list answers`                                       | `archived: false`, unmarked                       | Claim `{archived}`, values `{archived: true}`, no base. Row: open, differs, no base: applied under the claim, doubt, repair. Marked, then truth |
| H2-1: `Load v1; Load; Archive lost; repair null; Reconcile; R2 answers v1`       | Deleted record back, unmarked                     | Repair: `gone`, floor v1. R2: equal, gone, started before landing: older. Stale                                                                 |
| H2-2: `Load v1; Load; Archive 204; frame {id, title, revision 1}; R2 answers v1` | `archived: false`, 0 repairs                      | Frame: equal, open, nothing against: merge, claim stays. R2: equal, open, differs on claim: merge the rest, claim stays                         |
| H2-3: `Archive ok; patch no revision; MarkRead ok; repair v1`                    | `readAt: null`, unmarked                          | Repair started before the MarkRead's claim: open, differs: again                                                                                |
| H3: `revision "9"` then `"10"`                                                   | Stale, for good                                   | Different strings: no order; frame, no claim: newer. Applied. With `versionOrder` compared as declared                                          |

**Why "no doubt" at equal version with a differing claimed field.** The review's "better" is doubt. If the server bumps on every write, that row is simply from before the write, and a repair would be asked to say what the next read says anyway. If it does not bump, the claim stands until a read that started after it: slower to heal, not wrong in a way a repair avoids. D67's limit (b) stands: a server that never bumps cannot be defended by a Runtime.

**Against D74, stated.** (a) Per record: `.alsoChanges` and joint order stay undefended; option B, a read's snapshot version, is the owner's call and is additive: `Evidence.at?: snapshot` would add a rung to `place`. (b) A no-version frame out of order with nothing unplaced still applies. **That limit is precise now:** two feeds on one entity, or a server that sends no later frame; a `position` on the feed could order frames, but T1 says Flow compares no positions, so that is the owner's. (c) The stub bound. (d) `gone` with a reset counter below the tombstone stays dropped: D67's (c). (e) A partial list row advancing a version past fields it does not carry: D67's (a).

## H4: closures through the seal (D77)

`seal`'s failure was enumeration moving up a level, the review's right word. The rule becomes: **a `Compiled` table is walked by kind; a function value found outside a known slot name is a seal-time error** (`SealUnknownClosure`, in the tests' build), so the next new closure cannot silently bypass it.

```ts
// BEFORE
const retried =
  spec.reconnect && (FLOW_REASONS.has(why) || !spec.reconnectWhile || spec.reconnectWhile(e)); // a throw: ModuleDefect, every session

// AFTER
const retried =
  spec.reconnect &&
  (FLOW_REASONS.has(why) ||
    !spec.reconnectWhile || // existing
    cx.user(spec.reconnectWhile, [e], () => (cx.note("NotRetried", { op: x.op }), false)) === true); // NEW: a Slot; a throw means not retried, one issue
```

| Closure                            | Fails                          | Effect                                                         |
| ---------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| `key` (stream)                     | throw, not encodable           | no session, an issue. Same as `input`                          |
| `backoff`                          | throw, not finite in range     | `finiteMs` default: the design's capped schedule               |
| `reconnectWhile`, `pageRetryWhile` | throw                          | not retried, an issue                                          |
| `subscribe`, `catchUp`             | throw building it              | `end(Defect)` (M4)                                             |
| `confirms`, `reads`, `listens`     | as today, already `cx.user`    | existing                                                       |
| `version`                          | throw, not a string            | no version, an issue. **existing**, now in the slot            |
| `repair`                           | throw building it              | `RepairFailed`                                                 |
| module timers                      | `cx.arm` with a non-finite due | clamped and named (L5); `idleTime: "Infinity"` becomes unarmed |

`createRuntime({ machines })` takes `Compiled[]` or a table and seals (M12). `seal` is idempotent, so a test's own wrapping stays. M11: `plain` copies inside the gate, so a throwing getter throws there; a Proxy is then a plain copy.

## H5: a key encoding across releases (D78)

```ts
// BEFORE: `validLane` compares the stored id with the stored key, which always agree.
// AFTER, at restore, in a turn-free `cx.user`-shaped read:           // NEW
const fresh = safely(() => canon(op.key.run(h.input))); // the release that is running
if (fresh !== undefined && fresh !== canon(l.key)) rekey(l, JSON.parse(fresh)); // new id, old id deleted, `LaneRekeyed` evidence
```

A hold is a claim about the outside world. Its key is only our name for it, so the name moves, and the hold never does. Applies to held, acked and parked heads; `W` ends `NotSent` anyway. **Abstract consequence:** `subject`, `actor` and activation names have the same shape: `subject` is an array of what the host wrote and is compared by the walk, so a change reads as a release (rule 51), not a miss. Checked by reading, stated.

## H6, T6, H7: fakes and reality (D79)

**The fake gets `{ atStart: true }`:** a read answers what the server held when it started. Search boots gain "no first load". Plain writes can fail, batches can be cut at a crash, and a feed can run two connections for one entity. SEARCH-LISTEN's exclusion narrows: a `frame.was` excuses only a record that shows exactly what that frame said; anything else wrong is a failure.

**T6 in the fake was a finding about me.** `api.pulled`'s bound proved the fake. In `feed.ts`:

```ts
// NEW, in `compiled.ts`: what `Feed.callback` compiles to. A value, so a Runtime owns the queue.
type FeedCallback = {
  readonly _tag: "Feed.callback";
  readonly bound?: number;
  readonly start: (emit: Emit) => void | (() => void);
};
// `subscribe` returns a Stream or this. A plain `Stream.callback` socket stays legal only for pulled sources;
// `api.socket` in the fake now returns a FeedCallback, so a pushed source is bounded, and `emit` is exactly T6's rows.
```

**T1 rows, proposed for the owner.**

| Input                                                                                             | `Repairing`                            | Otherwise                                     |
| ------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------- |
| **NEW** `failing` out of band: T6's `closing` became `failing Overflow` while the pull is stopped | `lose(Overflow)`                       | no effect: the pull drains, then fails, as T6 |
| **NEW** page deadline, tag `page`, default 30 s, restarted per page                               | `lose(PageSilent)`, counted as a stall | not armed                                     |

**The deadline, literally (T1):** armed only while a pull is outstanding. So `Repairing` with a full `buf` has no idle deadline, and the page deadline covers that read. `stalls` counts `Overflow` and `PageSilent`, so T2 row 6's "three repairs, one Lost" is reachable.

**The rest of the review's stream findings, one line each.** M1: `complete` sets `waitingForPull` only if a value holds the source. M2: the claim was wrong and the review is right; `complete` queues `buf` in `Live`, so `end` mid-flush discards with evidence, per item. M3: `afterMember`'s `catchUp` branch stops the in-mail value moving. M4: `exit.t === "defect"` is `end(Defect)`, a throwing `subscribe` too. L2: `healthy` disarmed on `down`. L4: a signal is one of three known `_feed` values. L6: `credits` and `waiting` cleared on a connection's close. M10: stated, one fix only: `dispose` stops rereads; `answers` stays per distinct input until T7's `current(r)` is built.

## M6, M7: persistence (D80)

The write-ahead protocol stands. What moves is **cost and interface**.

```ts
// BEFORE: in `step`, every turn, on every touched persisted actor
writes.push({ key: `actor/${key}`, value: text(record) });   // 7.4 ms at 10,000 messages, inside the turn
admit(viewOf(w.root), origin);                                // and again here, for the gate

// AFTER, in `flush`: a reference. The world is immutable, so this is already a consistent view of a whole publication (O3)
writes.push({ key: `actor/${key}`, record });                 // NEW: unencoded
// and in turn.ts
admitted(viewOf(w.root), origin);                             // NEW: walks what no earlier turn verified. Same refusals as `text`

// in the driver: the only place a record becomes bytes
case "persist":                                               // NEW body
  queue.put(c.writes, c.ticket);                              // newest per key; encoded at write
```

| Rule                                                                                                                           | Where from                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Newest per key, written in one batch, atomic                                                                                   | O3                                                                                             |
| `captureMs`: 0 in the suite, 100 by default on a real host                                                                     | Measured below; a guess until S3 says                                                          |
| An awaited write (ack, re-send's capture) flushes what waits first, FIFO, and is never coalesced                               | O3, O6. It is why a lane and its actor cannot tear: both are in one batch, and the ack follows |
| A failed plain batch: keys stay dirty unless a newer value came; retried by backoff; `StorageFailure` once per run of failures | O5, M7                                                                                         |
| An awaited failure: `stored ok: false`, as today                                                                               | existing                                                                                       |
| An unencodable record: named, last good capture stands                                                                         | O5, D57                                                                                        |
| `load` may return a promise. Inputs before it settle wait in order, `boot` first                                               | O4: the design says `ActorAbsent`; **see below**                                               |
| A second tab: `persistence: false`, every machine runs unpersisted, `SecondTabNoPersistence`                                   | O7, Web Lock in the adapter                                                                    |
| `flushNow()` on `pagehide`, disposal                                                                                           | O3                                                                                             |

**Plan silent or against:** 2.10.17.6 says a send during a held restore is `ActorAbsent`. Queueing means a screen's first click survives a slow disk, at the cost of an unbounded wait if the read hangs, and O5 needs a bound either way. I queue and report it; flip: a line in `input`.

**`saved` belief (M7).** `savedLanes` stays in the world as "what was asked for", and it no longer means "landed": the driver's dirty map owns landing. Nothing in step reads it for correctness: it is only a diff.

**Not here:** whole record against something smaller is what step 5 measures on real IndexedDB, including field chunks and an append log, before anything is chosen. **Chosen in RESULTS, not here.**

## Everything else, one list

| Finding            | Decision                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| H1-H3              | D74-D76                                                                                                           |
| H4                 | D77                                                                                                               |
| H5                 | D78                                                                                                               |
| H6                 | Fakes first, above; every search rerun                                                                            |
| H7, M1-M5          | D79                                                                                                               |
| M6, M7             | D80                                                                                                               |
| M8                 | D82                                                                                                               |
| M9                 | D81. `Told` closed; `input`'s default kind goes                                                                   |
| M10                | Stated; `dispose` stops rereads                                                                                   |
| M11, M12           | D77                                                                                                               |
| M13                | A case each that a real reach allows; `x-denied-keeps-bookmark` first                                             |
| L1                 | Stated: one wall clock, `pump`'s drain. ORDER-03 leans on it; unchanged                                           |
| L2, L4, L5, L6, L7 | Above                                                                                                             |
| L3                 | `validActor` requires `root.frag === null`; `own`-safe table writes at restore; body key compared with record key |
| L8                 | Stated. Narrow, sync window                                                                                       |
| T6 in the fake     | D79. **Not a fixture any more**                                                                                   |

## The sync engine (D81)

**Judged: a sync engine cannot sit behind `judge`, and should not.** It orders by a snapshot; `place` orders by a record. Behind the **module** seam it plausibly can, and the seam's blockers are M9's: `Told`'s untyped door and `sessions` naming `"entities"`. Three things change:

```ts
// BEFORE
cx.tell("entities", { k: "pushed", machine, op, value }); // names a module; `payload: unknown`
// AFTER
cx.publish({ k: "pushed", machine, op, value }); // NEW: every module with `store: true` hears `told { k: "pushed", ... }`
```

And round 6 runs a small engine (`engine-spike.ts`): a server-issued cookie, `lastMutationID`, atomic pokes, `blocks: false`, in about 200 lines, on the same fixture's writes, through the Harness. **Its question: is anything core missing?** Expected gaps from convergence-5 stand: (a) one cut, (b) two outboxes, (c) `blocks: false` drops D3.

## Streams and the typed front end

Round 7 does the typed front end. **Nothing here assumes its result** except D77's "bare function is a type error later". `Compiled` gains `FeedCallback`, `versionOrder`, `memory.restore`, `store`. Reported as what the front end must produce.

```decisions-changed
D67          changed   D74,D75  OWNER'S: the version decides, by a declared order; evidence is placed then disposed; `unechoed` becomes a claim
D66          kept      D74      one judge; now two questions, and every caller obeys
D60          kept      D74      a frame is placed by version; on no version, doubted while a write is unplaced
D65          changed   D77      the seal covers every closure in `Compiled`, and createRuntime applies it
D68          changed   D81      `Told` is closed for pushes too
D71          kept      D79      a session pulls; a pushed source is bounded by the runtime's queue
D26          changed   D80      the write-ahead protocol stands; an actor record is encoded off the turn
```

## What this does not verify

Written before round 6's code. Nothing has run on a real disk, server or browser in this design. `captureMs: 100` is a guess. The stub bound is a guess. Costs above are the review's. Whether a torn write can reach a record on real IndexedDB, and what a real `fetch` does on a kill, is what round 6 is for.

## Corrections after building

Listed in `round-6/RESULTS.md`.

Three corrections to the text above. **`FeedCallback` is not a value `subscribe` returns:** fixtures `.pipe` the source, so `Feed.callback` is a Stream that asks its Runtime for the queue through a service, `FeedQueue`. **`admitted` and the driver's encode replaced `text` in the turn as written, but "a function under an unknown name is an error" throws at seal, not in a test's build only.** **`captureMs: 100` stands, proposed, from measurement; chunks are measured, not built.**
