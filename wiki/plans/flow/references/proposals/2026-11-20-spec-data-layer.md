---
proposal spec-data-layer
status superseded 2026-11-23 [@proposal.algo-records]
    proposed 2026-11-20
---
# The data layer: streams, the entity store, server data and lazy features

Serves @task.V3.T25, @task.V3.T24, @task.V3.T48 and @task.V3.T115. Nothing here is decided until the user accepts
section 8.

**Bottom line.** Build the data layer on two doors and nothing else. Confirmed data enters through one **judge**
(a read's answer, a write's success, a stream frame, a restored record and a hydrated payload are all one `Source`
judged per field). Definitions and their saved state enter through one **admission** cut (boot, lazy adoption and
the hydrate commit are the same function over different entry sets). The merge table of T115 then adds no rule of
its own: each row names the owner whose comparator decides. Split T24 in two by state (confirmed records, then
claims); build admission first because it changes reviewed boot code.

**Riskiest open item.** Production has no resource entry store: a read is a one-shot lookup, and `staleTime` and
`gcTime` are stored and never read. Answers, repair and the hydrate resource row all rest on entries with an age.
That state belongs to the reads-and-operations concept; this document names the seam (section 2.5) and cannot be
built before it exists.

## 1. What exists

Nothing of the data layer is in `src/`. A keyword sweep finds no stream, entity, hydrate, dormant, bookmark or feed
code. What exists is the seams.

| Seam         | Where                                                                                                                             | What holds                                                                                      | What is wrong or missing for this concept                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A read       | `core/world.ts` `Read` (`{call, actor, incarnation, operation, owner}`), `core/answers.ts` `settledRead`, `core/lanes.ts` lookup  | a stale answer is dropped by incarnation id; a new lookup interrupts the old one                | no entry, no cache, no age, no `asked` position; `contract.ts` `resource` keeps `staleTime`/`gcTime` unread                                               |
| A write lane | `core/cells.ts` (`Cue` x `LaneState` to `Move`), `core/lane-moves.ts` `perform`, `core/lanes.ts` `makeLanes`                      | one table, one owner; stale answers dropped by call id                                          | no gate for "first in every record queue"; no place for predicted keys or `basedOn` in `encodeLane`                                                       |
| Delivery     | `core/ledger.ts` owed rows, `core/serve.ts` `serveEnding`, `Mail.Ending`                                                          | one FIFO; an ending becomes an event in a turn                                                  | no mail kind for a feed value; "one value per turn" has no carrier                                                                                        |
| Records      | `core/record.ts` (`actor/`, `lane/`, `owed/` keys, `decodeRecords`), `core/record-format.ts` `FORMAT = 5`, `core/actor-record.ts` | canonical text, one codec, undecodable records quarantined with bytes kept                      | a record whose machine is absent is quarantined (`readFailed("machine")`): dormant and orphan are not told apart; no entity, stream or entry record kinds |
| The Store    | `host/store.ts` `Store { load, write(batch) }`, `StoreScope`                                                                      | whole-scope load at boot, atomic ordered batches, contract tests                                | holds; entity records must ride the turn's one batch                                                                                                      |
| The boot     | `host/runtime.ts` `boot`, `ready`, `core/incarnations.ts` wake, `World.records`                                                   | storage read and validated before any actor starts; restored records stay records until reached | the machine set is fixed at construction; no entry state; `SendDrop "NotAdopted"` (`core/evidence.ts`) is declared and never produced                     |
| The step     | `core/step.ts`, `core/tx.ts` `makeTx`, `host/driver.ts`                                                                           | pure step, work as data, ids from the mint                                                      | no `Input` for a frame, a hydrate payload or an adoption                                                                                                  |

Prior work that holds and is carried: `prototypes/s5-session/RESULTS.md` (a session's state belongs in the world
step, 2,400 interleavings; a fiber that writes the bookmark as a separate input diverged in 576 of them) and
`prototypes/round-9/entity-proposal-2.md` (the judge, one shape of doubt, every mark has an exit, a refresh cannot
feed itself). The Plans (`EntityDomains`, `ServerRendering`, `LazyFeatures`, `Operations.O4`, `Persistence.O4`,
`O6`) are the user's wanted behaviour and are kept; section 8 lists the only changes.

## 2. State inventory

Every state below is new. "Writers" are the inputs that change it in one step.

### 2.1 Streams (T25)

| State      | Key                                                                 | Values                                                                                                           | Writers                                                                                                                                                                                          | Owner                                                  |
| ---------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Session    | (incarnation, placement path, operation, key)                       | `Waiting`, `Connecting(n)`, `Live(n)`, `Repairing(n, buffer)`, `Releasing`; plus `flaps`, `owedNotice`, `dropAt` | placement reconcile at a turn's commit; frames `live`, `value`, `ping`, `down`, `fail`, `end`; timers idle, healthy, backoff; a catch-up page; the connection-restored signal; disposal; restore | `core/sessions.ts`                                     |
| Feed queue | session                                                             | pulled, undelivered values in arrival order                                                                      | a value frame (append); the value's turn admitted (remove); repair flush; release (discard with evidence)                                                                                        | `core/sessions.ts` (part of Session)                   |
| Bookmark   | (identity, operation, key), a partition of the actor's saved record | every: `{at, filled}`; latest: `{last, heard, baseline}`                                                         | section 3.2 table                                                                                                                                                                                | `core/bookmarks.ts`, written only inside the turn step |

### 2.2 Entity store (T24)

| State        | Key                               | Values                                                                                                  | Writers                                                                                                           | Owner                                        |
| ------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Record       | (entity, key)                     | `Absent`, `Held(fields: field -> {value, version?, position})`, `Tombstone({version?, position})`       | the judge only (section 3.3); gc                                                                                  | `core/entities/judge.ts`                     |
| Placement    | active answer (read entry, input) | `refs` (the shape of keys it holds), `frontier`, `staleCauses`                                          | an accepted answer; a base change matched against it; hydrate; restore; invalidate; a stream gap                  | `core/entities/answers.ts`                   |
| Claim        | (Attempt, entity, key)            | `Predicted`, `Unconfirmed(fields)`, `Held`, `GivenUp`, `Quiet(fields)`; the patch list in written order | section 3.4 table                                                                                                 | `core/entities/claims.ts`                    |
| Record queue | (entity, key)                     | ordered Attempt ids, head first                                                                         | an Attempt heads its lane (join); settlement (leave); a forced repair settles (release); yield; cancel; supersede | `core/entities/claims.ts`                    |
| Cover        | listen session                    | `Proven`, `Unproven(since position)`                                                                    | the session's `live` signal with or without proof; a read or repair asked after it                                | `core/entities/answers.ts`, from T25's value |

Derived, never stored: the visible record (base plus live claims replayed in written order), `predicted`,
`uncertain`, `unconfirmed` flags, the count of repairs in flight (the number of running refreshes whose cause is a
repair, against `repairSlots`), and "the client has accepted a change since readiness" (any source position past
the ready position, or any live claim or queued write).

### 2.3 Lazy features (T48)

| State        | Key                 | Values                                                            | Writers                                                                                                              | Owner                          |
| ------------ | ------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Entry        | entry id            | `Inactive`, `Adopted(machine object)`                             | admission (boot, first `ensureActor`/`createActor`, a finished load at attach); a failed admission leaves `Inactive` | `core/entries.ts`              |
| Dormant data | entry id            | saved record texts, undecoded, plus the transferred payload piece | boot classify; hydrate commit (add); adoption (consume); capture (preserve verbatim); forget                         | `core/entries.ts`              |
| Load         | entry id, host only | `Idle`, `Loading`, `Loaded(machine)`, `Failed(cause)`             | the post-ready hydrate loader; an attach retry; `inspect`; the per-load bound                                        | `host/entries.ts`, with Effect |

### 2.4 Server data (T115)

| State        | Key                | Values                                                                     | Writers                                                                                           | Owner             |
| ------------ | ------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------- |
| Request gate | Runtime            | `Open`, `Bound(token)`, `Readied`                                          | the first applied payload (bind); `ready` (lift); a second token before ready (refuse, no change) | `core/hydrate.ts` |
| Payload      | a value, not state | `{app, shape, scope, token, actors, entries, records, bookmarks, omitted}` | `capture(world)` on the server; consumed once by `Input.Hydrate`                                  | `core/hydrate.ts` |

### 2.5 Seams (typed values crossing, with direction)

| Value                                                                                                       | From                           | To                      | Use                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------- | -------------------------------------------------------------------------------------- |
| `Entry<A>` `{data, updatedAt, fetching, writePending, stale}` and `younger(a, b)`                           | reads and operations           | T24, T115               | an answer is a resource entry plus `staleCauses`; the hydrate resource row             |
| `Position` (`asked` on the in-flight `Read`, `landed` at settle), from the runtime's mint                   | reads and operations, the step | T24                     | the judge's order by position                                                          |
| `Refresh { entry, cause }` (work as data)                                                                   | T24                            | reads and operations    | repair asks a refetch; the entry owns "one in flight, one trailing"                    |
| `Sendable` gate cue (`RecordsFree`)                                                                         | T24                            | lanes (`core/cells.ts`) | "the record queue decides when it is sent"                                             |
| `Ending` of an Attempt with its predicted keys                                                              | lanes                          | T24                     | settlement applies to the store and releases queues before the ending is queued        |
| `SessionSignal` (`Live{proof?}`, `Gap`, `Released`) and frames                                              | T25                            | T24                     | `listen(stream)`                                                                       |
| `fieldOrder(a, b): "greater" | "lower" | "equal" | "unordered"`                                             | T24                            | T115                    | the entity-field row                                                                   |
| `EntryState` and `Dormant`                                                                                  | T48                            | T115                    | the lazy-entry row                                                                     |
| `admit(entries, dormant)`                                                                                   | T48                            | boot, T115              | one cut for structure plus restored state                                              |
| record kinds `entity/`, `entry/`, the bookmark partition, lane-record fields `basedOn`, `predicted`, `sent` | this concept                   | saved records           | the saved-records concept owns format, key grammar and restore after a definition edit |
| `Mail.Delivery` (a feed value as one turn)                                                                  | T25                            | the ledger and `serve`  | one value per turn in the one FIFO                                                     |
| `ready`                                                                                                     | T28                            | T115                    | merge before installing actors                                                         |

## 3. The design

### 3.1 Sessions are data in the step; connections are Effect in the host

Kept from S5. The core holds the session table and returns `open`, `close`, `arm`, `disarm`, `read` and `abort` as
commands. The host runs one scoped Effect per connection (`Feed.callback` shaped as `Stream.callback`,
`Stream.runForEach` into the driver's input queue, the reconnect delay from `Schedule.exponential` and
`Schedule.jittered`). Every frame carries its connection number `n`; a frame whose `n` is not the session's is
dropped, the same shape as `settledRead` dropping by incarnation id.

Session transitions (owner `core/sessions.ts`; rows from Operations O4):

| State                 | Input                                                  | Next                                          | Emits                                                                         |
| --------------------- | ------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------- |
| none                  | placed, no releasing predecessor                       | `Connecting(1)`                               | `open(from = bookmark.at)`, arm idle                                          |
| none                  | placed, predecessor `Releasing`                        | none (waits)                                  | -                                                                             |
| `Connecting(n)`       | `live{proof}`                                          | `Live(n)`                                     | -                                                                             |
| `Connecting(n)`       | `live` without proof, with catchUp                     | `Repairing(n, [])`                            | `read(from)`                                                                  |
| `Connecting(n)`       | `live` without proof, no catchUp                       | `Live(n)`, `owedNotice = Unproven`            | one `missed` delivery                                                         |
| `Live(n)`             | `value`                                                | `Live(n)`, queue append                       | `Mail.Delivery` when pulled                                                   |
| `Repairing(n, b)`     | `value`                                                | `Repairing(n, b + value)`                     | -                                                                             |
| `Repairing(n, b)`     | page `done`                                            | `Live(n)`, flush b                            | `settle(through)` as a delivery                                               |
| `Live`/`Repairing(n)` | `down`, `fail`, `end`, idle timer                      | `Waiting`, `flaps + 1`, `dropAt` set if unset | `close(n)`, arm backoff, or `Flapping` failure at the count                   |
| `Waiting`             | backoff timer, or the restored signal after `Flapping` | `Connecting(n + 1)`                           | `open(from)`                                                                  |
| any                   | released, disposal                                     | `Releasing`                                   | `close(n)`, discard queue with evidence, bound timer (T21's `ReleaseOverdue`) |
| any                   | frame with stale `n`                                   | unchanged                                     | -                                                                             |

### 3.2 The bookmark has one writer: the turn step

S5's result 3 is the rule: the bookmark moves in the same step that admits the value's turn, never as a separate
input. `core/bookmarks.ts` exports one function, called by the turn commit.

| Input                                                  | `at`                                                                 | `filled`                   |
| ------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------- |
| a value's turn admitted (handled, Unhandled or Denied) | the value's position                                                 | end-of-turn rule below     |
| catch-up `settle(through)` delivered                   | `through`                                                            | unchanged                  |
| `O.x.refetch(k)`                                       | cleared                                                              | unchanged                  |
| `O.x.bookmark(select)`                                 | the stated position                                                  | unchanged                  |
| end of turn, session placed                            | unchanged                                                            | set from the `fills` field |
| end of turn that released the session                  | unchanged                                                            | may rise, never fall       |
| end of turn, unplaced                                  | unchanged                                                            | unchanged                  |
| connect with `fills` emptied while unplaced            | cleared (wipe)                                                       | cleared                    |
| restore, hydrate                                       | from the actor's record (it travels with the actor row, section 3.6) | same                       |

**Not yet designed here (owed by T25's Spec before code):** `delivers: "latest"` (its partition is
`{last, heard, baseline}`, newest wins, current only while this connection confirmed it, and it owes no `missed`
notice); a contract with no `reconnect` (a drop ends the session with its failure instead of `Waiting`); and
`Feed.live({ head })` and `({ restartAt })`. Tables 3.1 and 3.2 cover `every` with `reconnect` only.

### 3.3 The judge: one way in for confirmed data

```ts
// core/entities/judge.ts (new). Pure; the only writer of Record.
type Source =
  | { kind: "Read"; position: Position; version: Option<Version> }      // a lookup's answer
  | { kind: "Write"; position: Position; version: Option<Version> }     // an Attempt's success, at its first send
  | { kind: "Frame"; position: Position; version: Option<Version> }     // listen(stream)
  | { kind: "Repair"; position: Position; version: Option<Version> }    // marks, never asks
  | { kind: "Restore"; version: Option<Version> }                       // a saved record; no local position
  | { kind: "Hydrate"; version: Option<Version> };                      // no local position

type Verdict = "Fill" | "Take" | "Keep" | "Stale" | "Contested";

const judgeField: (held: Option<HeldField>, incoming: Value, source: Source, eq: Equivalence) => Verdict;
const judge: (store: Records, entity: EntityId, key: Key, change: Row | Delta | Delete, source: Source)
  => { store: Records; changes: ReadonlyArray<BaseChange>; evidence: ReadonlyArray<Evidence> };
```

`judgeField` is one table (rows from EntityDomains O1 "The judge" and ServerRendering O5):

Rows are tried in order; the first match decides. "Unordered by version" means either side has no version or the
versions are equal.

| #   | Held                                          | Incoming                                                         | Verdict                                                        |
| --- | --------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | absent                                        | any source                                                       | `Fill`                                                         |
| 2   | any live field                                | `Restore`                                                        | `Keep` (restored data never overrides live truth)              |
| 3   | any                                           | equal value by the field's equivalence                           | `Keep`                                                         |
| 4   | version v                                     | version above v                                                  | `Take` (T24b adds: doubted while a version-less claim is open) |
| 5   | version v                                     | version below v                                                  | `Stale`                                                        |
| 6   | restored, never confirmed since (no position) | `Hydrate`, unordered by version                                  | `Take` (hydrated beats saved)                                  |
| 7   | confirmed live                                | `Hydrate`, unordered by version                                  | `Keep` and `Contested`                                         |
| 8   | unordered by version                          | positioned source asked after held landed                        | `Take`                                                         |
| 9   | unordered by version                          | positioned source asked before held landed                       | `Stale`                                                        |
| 10  | unordered by version                          | overlapping positions                                            | `Contested`                                                    |
| 11  | tombstone                                     | higher version, or unversioned and asked after the delete landed | `Take` (the record returns)                                    |
| 12  | tombstone                                     | anything else                                                    | `Stale`                                                        |

What a verdict asks is outside the table and depends on the source alone: `Stale` and `Contested` from a `Read`
put its answer out of date and emit a `Refresh`; from a `Repair` they only mark answers stale, so repair cannot
cascade; from `Hydrate`, `Contested` asks the contested-field repair. A restored field holds no position (positions
are never saved and the mint restarts at 0 each boot), which is what row 6 reads. `fieldOrder`, the value T115
reads, is rows 4 and 5 plus "unordered".

Before and after for a read's answer reaching state:

```ts
// before (core/answers.ts settledRead): the answer is owed to the life as an ending.
owe(Audience.Life, ending(read, result));

// after: a domain read is judged first, in the same tx, then the ending is owed as today.
const placed = entities.accept(read.entry, result, Source.Read({ position, version }));  // NEW
owe(Audience.Life, ending(read, result));                                                // existing
// placed.changes feed answers.match(...) which returns Refresh requests in canonical order (NEW)
```

### 3.4 Claims: prediction and doubt are one life

A claim is created when a predicting Attempt heads its lane, and it is the only thing that changes visibility.

| State         | Input                                                                               | Next                     | Store effect                                |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------- |
| none          | Attempt heads its lane (predicts)                                                   | `Predicted`              | join each record queue; visible changes     |
| `Predicted`   | success, response carries the whole value                                           | gone                     | judge installs, claim ends, one publication |
| `Predicted`   | success, response lacks a predicted slot                                            | `Unconfirmed(fields)`    | schedule one confirming read                |
| `Unconfirmed` | an accepted read carrying the field                                                 | gone                     | -                                           |
| `Unconfirmed` | no active answer carries the field                                                  | gone, field dropped      | next reader fetches                         |
| `Predicted`   | definite failure, any `NotSent`, `Superseded`                                       | gone                     | no repair                                   |
| `Predicted`   | unknown ending, retained                                                            | `Held`                   | record queue held, forced repair asked      |
| `Held`        | forced repair settles                                                               | `Held`, prediction ended | queue released                              |
| `Held`        | own Attempt's re-send succeeds                                                      | gone                     | -                                           |
| `Held`        | release, ignored unknown, yield                                                     | `GivenUp`                | asks one read                               |
| `GivenUp`     | a read or repair asked at or after give-up, or a later success carrying every field | `Quiet(fields)`          | reads `unconfirmed`                         |
| `Quiet`       | `guarded` proof (a version strictly past `basedOn`)                                 | gone                     | -                                           |
| any           | time, a later write's success alone, a frame                                        | unchanged                | -                                           |

Persisted with the lane record (or, under PD7, in the Attempt's own entity row): the claim's keys, touched fields,
`basedOn` and `sent`; never a value (Persistence O6). At restore a `Held` claim is rebuilt from the lane record and forces its repair.

### 3.5 Admission: one cut for structure and saved state

```ts
// core/entries.ts (new). Pure. Boot, lazy adoption and the hydrate commit all call it.
const admit: (tx: Tx, entries: ReadonlyArray<AdoptedEntry>, source: Dormant)
  => Result<Admitted, AdmissionFailure>;   // on failure the tx is discarded: nothing is exposed
```

Record classification, the table that replaces "machine absent means quarantined" in `decodeRecords`:

| Record's machine or owner                             | At boot                                                                                                                                          | At that entry's adoption                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| adopted                                               | decode; undecodable is quarantined as today                                                                                                      | -                                                                                                                 |
| declared lazy, inactive                               | kept as text, undecoded, never invoked; captures write it back unchanged                                                                         | decode with format, version and shape checks; undecodable quarantines that record only and the ensure opens fresh |
| declared by no entry                                  | orphan: actor record discarded, lane records quarantined                                                                                         | -                                                                                                                 |
| an operation or entity record no adopted owner claims | kept as text until its owner is adopted                                                                                                          | decode and judge as `Restore`                                                                                     |
| a saved uncertain write of a dormant actor            | **open (PD7):** the lane record stays undecoded, so the claim's keys must be in a record the entity store owns, read when the entity is readable | the actor receives `unknown { Restored }`                                                                         |

Before and after for the boot:

```ts
// before (host/runtime.ts boot): decode everything against the fixed machine map.
const restored = decodeRecords(machines, stored);

// after: classify first, then admit the eager set; lazy text waits in World.dormant.
const sorted = classify(declared, stored);                    // NEW: adopted | dormant | orphan
const admitted = admit(tx, eagerEntries, sorted.adopted);     // NEW: boot is the first adoption
```

### 3.6 The merge table (T115) delegates every row

`Input.Hydrate(payload)` runs in one tx: gate checks (scope, token, app, shape digest) first, then the rows.

| Kind                                                         | Client has nothing                                                                                                                                      | Client has a saved copy                                                  | Client has live work                                                                                           | Decided by                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Shared actor and its providers                               | installed as restored: new incarnation, silent baselines, no `onContext`, no initial value event                                                        | the saved actor wins; the hydrated copy is discarded before it activates | the client actor wins                                                                                          | admission (T48)                                           |
| Bookmark, latest row, schedule delays (`left`)               | with their actor                                                                                                                                        | with their actor                                                         | with their actor                                                                                               | no row of their own: they are parts of the actor's record |
| Resource entry                                               | inserted with the server's age, grown by `max(0, clientNow - capturedAt)`                                                                               | hydrated beats saved                                                     | the younger wins; equal age keeps the client; never replaced while a write is pending or a lookup is in flight | `younger` (reads and operations)                          |
| Entity field                                                 | `Fill` (row 1)                                                                                                                                          | rows 4 to 6: versions decide, else hydrated beats saved                  | rows 4, 5 and 7; claims stay applied over the result                                                           | the judge (T24)                                           |
| Answer                                                       | fresh, or stale with cause `hydrate` when the client accepted an entity change, prediction, mark or queued write since readiness (derived, section 2.2) | -                                                                        | the client answer wins; stale with cause `hydrate` when its refs differ                                        | answers (T24)                                             |
| Lazy entry                                                   | `Inactive`: the piece joins `Dormant`, the server view stays readable                                                                                   | saved and transferred pieces both wait; at adoption the saved actor wins | adopted: the rows above apply now                                                                              | entries (T48)                                             |
| Write lane, prediction, queue, tombstone, mark, queued event | never in a payload                                                                                                                                      | -                                                                        | -                                                                                                              | `capture` omits; `DehydrateCommitInFlight` is evidence    |

### 3.7 The public API, from where the data comes

Names are the Plans'; none is added here. `// existing` is built today, `// Plan` is in a Plan and unbuilt.

```ts
// A stream from a real EventSource (Operations O4).
export const ticketEvents = stream({                       // Plan: stream
  id: "Tickets/events",
  input: { desk: Schema.String },                          // existing: input, key
  key: ["desk"],
  output: TicketEvent,                                     // user-defined: TicketEvent
  delivers: "every",                                       // Plan
  position: "seq",                                         // Plan: a field of output
  reconnect: {}, idleTime: "30 seconds",                   // Plan
  connect: ({ desk }, from) =>                             // from: the bookmark, never an input field
    Feed.callback((emit) => Effect.acquireRelease(         // Plan: Feed.callback, shaped as Stream.callback
      Effect.sync(() => {
        const source = new EventSource(`/desks/${desk}/events?after=${from ?? ""}`);
        source.onopen = () => emit.live();                                  // no proof: Flow owes one missed notice
        source.onmessage = (m) => emit.value(JSON.parse(m.data));           // decoded once by output's Schema
        source.onerror = () => emit.down("error");
        return source;
      }),
      (source) => Effect.sync(() => source.close()),
    )),
});

// An entity and its domain (EntityDomains O1). fetch is in the resource's lookup, as today.
export const Ticket = entity({ id: "Ticket", fields: TicketFields, primaryKey: ["id"], version: "rev" });  // Plan

export const Tickets = domain("Tickets", {                                  // Plan
  byId: read(ticket).one(Ticket).byKey(),                                   // existing: resource `ticket`
  queue: read(queue).list(Ticket, "items"),
  rename: write(renameTicket).predicts(({ input }) => Ticket.patch(input, { title: input.title })),
  live: listen(ticketEvents).as([Ticket], (e) => Ticket.delta(e.ticket, e.fields)),
});

// A lazy entry (LazyFeatures O1) and server data (ServerRendering O1, O4).
export const App = app({ id: "Desk", machines: [Shell, { id: "Billing", load: () => import("./billing.ts").then((m) => m.Billing) }] });
const payload = await dehydrate(setup, (runtime) => { runtime.ensureActor(queueRef); }, { within: "2 seconds" });
// client: <FlowProvider><Hydrate payload={payload}><Queue /></Hydrate></FlowProvider>
```

## 4. Requirements and Invariants

Each is a check that fails on a wrong build. Source in brackets.

Streams
- R-S1 A frame from a superseded connection changes nothing. [Operations O4; S5] Table 3.1 last row.
- R-S2 The bookmark moves only in the step that admits the value's turn; Denied and Unhandled move it too.
  [Operations O4; S5 result 3] Table 3.2 row 1.
- R-S3 An interruption owes exactly one `missed` notice. [Operations O4] Table 3.1 rows 3 to 5.
- R-S4 A new session for the same (actor, operation, key) waits for a releasing predecessor, and release ends
  within T21's bound. [Runtime O6] Table 3.1 rows 2 and 11.
- R-S5 After a restore the session reopens from the saved bookmark and no old value is delivered again as new.
  [Persistence O4]
- I-S1 `fills` emptied while placed stays cleared; emptied while unplaced is wiped. [Operations O4] Table 3.2.

Entity store
- R-E1 Only the judge writes a record; every source passes through it. [code style: one owner; EntityDomains O1]
- R-E2 No accepted field's version ever regresses. [EntityDomains C2]
- R-E3 A repair's response never starts a lookup. [EntityDomains O1; proposal 2 section 2.6]
- R-E4 Predictions change visibility only: no claim input writes a record. [EntityDomains O1]
- R-E5 Settlement applies to the store and releases queues in one publication, before the ending is queued.
  [EntityDomains O1]
- R-E6 A multi-record write is sent only when first in every queue it joined. [EntityDomains O1]
- R-E7 Every claim state has an exit that is not time. [proposal 2 section 2.5] Table 3.4.
- R-E8 No prediction value is persisted or transferred. [EntityDomains C2; Persistence O6]
- I-E1 The visible record equals base plus live claims replayed in written order, at every publication. [O1]
- I-E2 Copies of a field agree across every active answer. [EntityDomains O4]

Lazy features
- R-L1 `ready`, render, `getSnapshot`, inspection of a live Runtime and capture never call `load` and never decode
  a dormant record. [LazyFeatures O2, O3; Persistence O4]
- R-L2 A capture writes a dormant record back byte for byte. [LazyFeatures O3]
- R-L3 A failed admission exposes nothing and leaves the entry `Inactive`; a retry can succeed. [LazyFeatures O2]
- R-L4 A send to an inactive entry is dropped `NotAdopted`. [LazyFeatures O2; `core/evidence.ts`]
- R-L5 The first accepted machine object binds the id; another object fails `EntryMismatch`. [LazyFeatures O2]
- I-L1 Adopting the same entries in another order gives the same world, apart from restored data. [O2]

Server data
- R-H1 Each merge-table cell holds, with the client in each of its three columns. [ServerRendering O5] Table 3.6.
- R-H2 A payload with another scope, a second request token before ready, another app or another shape digest
  applies nothing. [ServerRendering O4, O6] Section 2.4.
- R-H3 Hydration fires no `onContext`, no initial value event and reissues no commit. [Runtime O5; O3]
- R-H4 Equal runs give equal payload bytes; the payload round-trips the one codec. [ServerRendering O3; Inspection O2]
- R-H5 `dehydrate` resolves within `within` plus cleanup and returns no payload when cleanup fails. [O1, O2]
- R-H6 A paused timer's `left` is the same after transfer. [T115 acceptance]

## 5. Development strategy

Order, and why each step is first:

1. **Spike admission under green** (half a day, before any feature). Route today's boot through `classify` and
   `admit` with only eager entries, with every restore test unchanged and green. This is the one change to reviewed
   code; if it cannot be done without touching `incarnations.ts` wake rules, stop and report.
2. **T25 streams.** Sessions, the feed queue and the bookmark are one Task: S5 shows splitting the bookmark from the
   turn breaks it.
3. **T24a confirmed records** (proposed split): the judge, placement, the repair classifier, `listen`, entity
   records saved and restored. Needs the reads concept's `Entry` and `Position`.
4. **T48 lazy features**: entry state, dormant data, the host loader. Independent of T24; may run before step 3.
5. **T115 server data**: `capture`, the payload codec, the gate, the merge table. Needs T24a and T48 only, since
   claims never transfer.
6. **T24b claims** (proposed split): claims, record queues, forced repair, the lane gate.

Risk, highest first: the missing resource entry store (a neighbour's state); positions without a clock (spike:
use the runtime's mint for `asked` at the lookup command and `landed` at settle, and run proposal 2's traces on
it); the lane gate for record queues (a new cue in `core/cells.ts`, the lanes owner's table); bookmark as a
partition of the actor record (the saved-records concept's format).

## 6. Testing strategy

Tests are Stories on fixtures, expected results derived from the tables above, each citing its rule.

- **Table tests.** Tables 3.1 to 3.6 are each one typed table in the test tree with a row id; a generator walks
  every (state, input) pair, and a missing cell is a failing test, not a default.
- **Generated sequences against a fixture server** that keeps its own state, not the judge's rules. A step is one
  of: a read asked, a read landed (reordered, duplicated, empty, failed), a write and its ending (success, definite
  failure, unknown), a frame, a gap, a reconnect, a restore, a hydrate, an adoption. Checks at every publication are
  EntityDomains O4's list.
- **The dimensions earlier reviews missed**, each a required axis of the generator, not a hand case:
  several keys and two entities at once (two records, two sessions on one contract, two Attempts on one record);
  non-default starts (a store already filled by restore or hydrate, a session already `Waiting` with flaps, an
  entry already adopted); sequences over time (a second gap, a re-send, a second hydrate from a later navigation,
  adopt after dispose); restore after a definition edit (an entity gains or loses a field or its version, a lazy
  entry becomes eager and the reverse, a stream's position Schema changes); hostile fakes (a `Fake.stream` that
  replays, skips, reorders or speaks after close, a Store that refuses the batch holding a claim, a loader that
  returns another id, hangs or resolves twice).
- **Planted faults** (`nub run faults`), one per rule: the judge ignores position; `Take` on an equal version;
  `Restore` overwrites a live field; hydrate replaces a client actor; hydrate applied over an in-flight lookup;
  the bookmark moved at frame arrival; a stale-`n` frame applied; a repair response emits `Refresh`; a claim value
  written to a lane record; a dormant record decoded at `ready`; a partly admitted closure visible; the second
  request token accepted.
- **The guard that keeps a freedom away.** One writer per state, enforced by structure: `Records`, `Bookmarks`
  and `Entries` are opaque types whose only constructors live in their owner module, and a lint-bomb scope rule
  stops any other core module importing those constructors. `load` is reachable only from `host/entries.ts`.
- **Bench.** Feed delivery per item; catch-up with N items; latest partition writes; repair cost against records
  times active answers; record queue depth as a series; visible-record derivation with K live claims (decides
  whether a cache is earned); hydrate merge of N records over a filled store; a turn that adopts an entry.

## 7. Handoff for the Opus leads

| Task | Read first                                                                                                             | Decided (if section 8 is accepted)                                                                       | Open, settle before code                                                                                                                                                                                                                                                                                                                                       | First commit                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| T25  | Operations O4; `prototypes/s5-session/RESULTS.md`; `core/cells.ts` as the table style; sections 3.1, 3.2               | session state in the step; the turn step alone writes the bookmark; connection number drops stale frames | the `Mail.Delivery` shape with the ledger owner; where the partition sits in the actor record; pull versus push for "bounded by what Flow has pulled"                                                                                                                                                                                                          | tables 3.1 and 3.2 as typed tables, R-S1 to R-S5 as red Stories on `sync`, `Fake.stream` hostile modes |
| T24a | EntityDomains O1 "The judge" and repair rules; `prototypes/round-9/entity-proposal-2.md` sections 2 and 4; section 3.3 | one judge, `Source` union, `Repair` never asks                                                           | the reads concept's `Entry`, `Position` and `Refresh`; the entity record key and what "confirmed data persists" saves                                                                                                                                                                                                                                          | `judgeField` table test, R-E1 to R-E3 red on `kanban`, the fixture server                              |
| T24b | EntityDomains O1 marks and queues; Persistence O6; section 3.4                                                         | one claim life; values never saved                                                                       | the `RecordsFree` cue with the lanes owner; forced-repair ask bound (D25)                                                                                                                                                                                                                                                                                      | table 3.4 as a typed table, R-E4 to R-E8 red on `transfers`                                            |
| T48  | LazyFeatures O1 to O4; `core/record.ts` `decodeRecords`; `host/runtime.ts` `boot`; section 3.5                         | boot is the first adoption; three-way classification                                                     | discarding an admission needs the World retained first (`core/tx.ts` `retain`: a handed World is written in place and spent), so admission must retain, step, and drop the result on failure; how an inactive entry's ids are known without its code (the entry declares the machine id; operation and entity ids of dormant records come from the record key) | the admission spike, then R-L1 to R-L5 red on `session` with `Billing`                                 |
| T115 | ServerRendering O1 to O6; sections 2.4, 3.6                                                                            | the table delegates; bookmark and schedules travel with the actor                                        | `ready` from T28; the shape digest's inputs; `Hydrate`'s render-phase overlay is T30's                                                                                                                                                                                                                                                                         | table 3.6 with nine cells, each a red Story that hydrates over client work on `shop`                   |

## 8. Proposed decisions for the user

Each is proposed; two traces each.

**PD1. Split T24 into confirmed records (T24a) and claims (T24b).** [answered: user 2026-11-21; yes: @proposal.spec-handover#task-changes] The states have different owners and T115
needs only the first.
- Trace 1: the server renders ticket 7 at `rev 4`; the client holds `rev 5` with a predicted title. Hydrate calls
  the judge: `Stale`. No claim code runs; the prediction still shows. T24a alone decides it.
- Trace 2: a rename is unknown, the machine gives up, a later read lands. Only table 3.4 moves (`Held` to
  `GivenUp` to `Quiet`); no record is written. T24b alone decides it.

**PD2. One admission function for boot, lazy adoption and the hydrate commit.** [dropped: agent cleanup 2026-11-23] It changes reviewed boot code.
- Trace 1: boot with a saved `Billing` actor and `Billing` lazy: classify keeps its text; later
  `ensureActor(billingRef)` admits the entry and restores the actor in one cut; a context cycle found then exposes
  nothing and the text stays.
- Trace 2: first load with a saved draft and a payload holding the same actor: admission sees both, the saved one
  wins, the hydrated copy never activates.

**PD3. Hydrate and restore are sources to the judge, and bookmarks and schedule delays have no merge row.** [dropped: agent cleanup 2026-11-23]
- Trace 1: payload field `title` unversioned, differing from the client's confirmed value: row 7, `Keep` and
  `Contested`, the loader refetches; the verdict an overlapping read reaches by row 10.
- Trace 2: the client actor wins over its hydrated copy; its bookmark stays at 42 although the payload said 40,
  so no value is delivered twice.

**PD4. Session state lives in the core step (S5's form A).** [dropped: agent cleanup 2026-11-23] The S5 result is still marked proposed.
- Trace 1: a value's turn and a `settle(through)` race: in the step, the bookmark ends at the last delivered
  value. As a fiber writing through the queue it ended at `through` in 512 of 2,400 runs.
- Trace 2: a reload cut between a frame and its turn: the saved record holds both or neither.

**PD5. A record whose machine is declared lazy is dormant, not quarantined; one declared nowhere is an orphan.** [dropped: agent cleanup 2026-11-23]
This replaces `decodeRecords`' single "machine" failure.
- Trace 1: today a `Billing` record at boot is quarantined and a send drops `RecordUndecodable`; proposed, the
  send drops `NotAdopted` and the record restores at adoption.
- Trace 2: a record of a machine removed from the app: discarded, its lane records quarantined, as LazyFeatures O3.

**PD6. Positions come from the runtime's mint, not a clock.** [dropped: agent cleanup 2026-11-23]
- Trace 1: read A asked at 12, landed at 20; read B asked at 15, landed at 17 with another value: overlapping,
  `Contested`. Replays identically.
- Trace 2: after a reload the mint restarts at 0 (`core/world.ts` `counter: 0`). No position is ever saved
  (EntityDomains C2), so a restored field holds none and an unversioned read asked after boot takes over it by
  row 8 with nothing saved to compare against.

**PD7.** [dropped: agent cleanup 2026-11-23] A claim's keys are saved in a record the entity store owns, one row per Attempt, written in the batch that
captures its first send. Persistence O6 puts them on the lane record; LazyFeatures O3 keeps a lazy machine's lane
records undecoded yet wants its uncertain write to mark entities before adoption. Both hold only if the keys are
readable without the machine (proposal 2, section 4.1).
- Trace 1: `Billing` is lazy and inactive; its saved rename of `Plan 3` was unknown. At boot the entity store reads
  the Attempt's row, marks `Plan 3` uncertain and forces a repair; the lane record is never decoded.
- Trace 2: a non-persisted like button sends a write and the tab reloads: with the row saved, a late answer is
  still placed against the claim; with keys on the lane record there is no record at all.

**Needs routing, not a decision:** who builds the resource entry store (age, `staleTime`, `gcTime`, one in flight
plus one trailing). T24a and T115 are blocked on it.

## Sidecar log

Seven sidecars were sent; four were refused by the harness's concurrent-agent limit and were not retried. I did
their reading myself in part (records, the Store, the boot, P5, the Plans); P3 and P4 review findings and the Zero
and TanStack Query hydrate prior art were **not read**. One adversary ran after the draft; its findings are the last
rows. Treat section 6's "dimensions earlier
reviews missed" as taken from the brief, not from the Task records.

| Sidecar         | Finding                                                                                                                                                                                        | Result                            | Why                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------- |
| reads and lanes | no data-layer code; `Read` shape; answers dropped by incarnation or call id                                                                                                                    | accepted                          | matches my reads of `store.ts`, `record.ts`, `evidence.ts` and my own keyword sweep            |
| reads and lanes | `staleTime`/`gcTime` stored, never read; reads never persisted                                                                                                                                 | accepted, re-check before relying | I confirmed the fields exist; I did not trace every reader                                     |
| reads and lanes | `FORMAT = 5` at `record-format.ts:8`                                                                                                                                                           | changed                           | it is line 10                                                                                  |
| reads and lanes | `NotAdopted` declared, never produced                                                                                                                                                          | accepted                          | `core/evidence.ts:45` and `incarnations.ts:386` read                                           |
| TanStack DB     | the visible view is derived from synced data plus optimistic maps rebuilt from the transaction list; no versions; an optimistic row can vanish between handler return and sync                 | accepted as prior art only        | supports "derive visible, never store it" and the confirming-read rule; file lines not re-read |
| TanStack DB     | acceptance and visibility are separate events; holding a truncate behind an optimistic transaction can deadlock                                                                                | accepted as a risk note           | maps to "a held claim blocks no other actor's write"; not verified                             |
| streams         | Effect v4 has `Stream.callback`, `runForEach`, `Schedule.exponential`, `jittered`, and no reconnect helper; `Stream.retry` reruns from the start                                               | accepted                          | fits the bookmark-owned resume; signatures to re-check at T25's first commit                   |
| streams         | the AI SDK guards stale frames by connection and request identity; tus advances its offset only after the ack                                                                                  | accepted as prior art             | same shape as R-S1 and R-S2                                                                    |
| streams         | a workflow transport may re-append parts on a 0-start replay                                                                                                                                   | rejected                          | the sidecar read it and did not run it; not used                                               |
| adversary       | judge table had no row for equal version with a differing value, for a tombstone met by a higher version, or for an unversioned held field meeting a versioned hydrate; `Restore` could `Take` | accepted                          | table 3.3 rewritten as twelve ordered rows; `Restore` gained a version and row 2               |
| adversary       | `Stale` was silent for every source; the Plan refetches on a machine's read                                                                                                                    | accepted                          | the paragraph under table 3.3                                                                  |
| adversary       | "hydrated beats saved" was lost for unversioned entity fields                                                                                                                                  | accepted                          | row 6, read off the missing position                                                           |
| adversary       | hydrate age grows by `max(0, clientNow - capturedAt)`                                                                                                                                          | accepted                          | read at `ServerRendering.plan` O5; table 3.6                                                   |
| adversary       | reading a dormant actor's lane record at boot contradicts "undecoded" and R-L1                                                                                                                 | accepted                          | now open as PD7; the unclaimed-record row added                                                |
| adversary       | no `latest`, no-reconnect or `head`/`restartAt` rows                                                                                                                                           | accepted, not fixed               | stated as owed under table 3.2                                                                 |
| adversary       | the mint is not restored, so PD6's second trace was wrong                                                                                                                                      | accepted                          | `counter: 0` confirmed; trace rewritten                                                        |
| adversary       | a `Tx` cannot be discarded unless the World was retained first                                                                                                                                 | accepted, see T48's open column   | confirmed at `core/tx.ts` (`retain`, `spent`)                                                  |
| adversary       | version-less claim exception missing from `Take`                                                                                                                                               | changed                           | it is T24b's row; noted in row 4                                                               |
