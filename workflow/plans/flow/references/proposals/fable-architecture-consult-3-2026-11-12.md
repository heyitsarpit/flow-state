# Architecture consult, round 3: one consolidated core design (2026-11-12)

**Status: proposed, nothing here is decided.** Bottom line: do the consolidation as two Tasks. Task A (before
T18) is the ledger, one `start`, diff-written records and acts; Task B (after T18, before T19) is `Life`, `admit`
and the final write. `Identity` should wait for T9, which will reshape it. Part 2 is one design from all three
rounds; it is simpler than round 1's in two places (an ending is applied to its lane when its call settles, and
owed endings are one list record per identity). Read-only; no gates or tests run. Paths are under
`packages/flow-state-v3/` at fe474ea1. Rounds 1 and 2: `fable-architecture-consult-2026-11-12.md` and `-2-`.

## Part 1

### C1. Order against later slices

| Slice | Overlap                                                          | Verdict                               |
| ----- | ---------------------------------------------------------------- | ------------------------------------- |
| T9    | `Identity`; its brief already moves the host's flags to the core | defer `Identity`; do `Life`, amend T9 |
| T19   | builds the persistence edge and driver; owns scope atomicity     | Task B hands it the final write       |
| T20   | record formats, versions, migration, quarantine                  | fix the record set, not its codec     |
| T21   | shared lookups, one call with many waiters; parked Interrupted   | route read endings only; no slot type |
| T17   | subject paths, fragments, `.each`, activations                   | leave `owner` and `current` untouched |

- **`Identity` against T9: conflict, so defer it** (this reverses round 2's item 4). T9 brings local actors keyed
  by `Equal.equals`, handles that follow the identity, quarantine, more kinds of use and one mailbox per actor
  (Actors R5 to R7, R12). A `Dormant | Live` value written now would be rewritten there. T18 does not need it.
  Hand T9 the finding instead: three maps on one key, `records` copied from the incarnation each turn, and the
  grace scan (`src/core/world.ts:248-255`, `src/core/persist.ts:104-112`, `src/core/incarnations.ts:293-314`).
- **`Life`: overlap, not conflict.** T9's brief says "`host/runtime.ts`'s flags moved into the core's disposal
  state". Same design; do it in Task B and strike that line from T9 (a scope change, the user's call).
- **Owed records against T20: compatible if the consolidation fixes only the set.** Leave open: the canonical
  codec, how an ending's value is encoded (today any value JSON cannot carry becomes `null`,
  `src/core/record.ts:73-88`), creation-order keys, identity-version and key-fingerprint tags, and what a reset or
  quarantine does to a row whose operation is gone. WriteAhead R5 puts parked endings in the lane record and R4
  puts pending outcomes in the actor record; the design below uses neither, for stated reasons (C9), and T20 may
  revisit.
- **Reads against T21: do not introduce a slot type.** Reads R5 shares one in-flight lookup across actors, so a
  call has many waiters; `reads` is one-to-one today. The consolidation only sends read endings through the
  ledger and lets the creator choose the audience, because Actors R8 parks `Interrupted` for the identity.
- **T19:** WriteAhead R9 and R10 save a scope atomically and issue "everything dirty" with a lane's batch; the
  code batches per actor (`Persist { scope: actorKey }`). The consolidation must not harden per-actor batches.
  T19's open red (a re-send raises `retryCount` without a capture) becomes one projection rule under
  diff-written records: a Recapturing head is written with the count its re-send will carry.

**Would prove it wrong:** T18 turning out to need `Identity` (it reads lanes by identity only); or T20 needing
owed endings inside lane records for migration, which would move the list, not the ledger.

### C2. Scope: two Tasks, each step green

**Task A, "Core consolidation: owed endings and records"** (between T52 and T18).

| Step | Change                                          | Must stay true                                |
| ---- | ----------------------------------------------- | --------------------------------------------- |
| A0   | The checks of C3; baselines recorded            | every gate at its start count                 |
| A1   | Ledger in memory; old record keys still written | reports and disk equal to baseline, bar fixes |
| A2   | One `start`; `boot` parks nothing               | post-boot reports equal per identity          |
| A3   | Diff-written records; the new record set        | reload behaviour equal at every crash point   |
| A4   | Acts into `evidenceOf`; `tx.emit` removed       | report stream byte-equal to A3's              |

A1 also merges `Settled` and `Ended` into one cue, removes `Keep`, the Kept row, `Tries` and `Settled.route`, and
gives Attempts their own counter. A4 is last because a byte-equal stream is the strongest check of a refactor.

**Task B, "Core consolidation: Runtime life and the final write"** (after T18, before T19; may fold into T19).

| Step | Change                                                      | Must stay true                                  |
| ---- | ----------------------------------------------------------- | ----------------------------------------------- |
| B1   | `Life` replaces `Disposal`; `admit`; host guards call it    | reports equal; every `admit` cell tested        |
| B2   | Final write and its bound in the core; `dispose` simplified | Actors R22, R23: 5 s from the call to `dispose` |

Why two: A is what T18 builds on and carries the risk; B touches the host that T19 rebuilds, and nothing in T18
needs it. One Task would hold T18 behind host work.

**Would prove it wrong:** A1 unable to keep the old record keys without a throwaway adapter larger than the step
(then merge A1 and A3 and rely on the crash-point check alone).

### C3. Requirements first

Beyond B4 (one batch per step and scope) and B8 (ids, load order):

1. **Pending cases for the known bugs**, each red at the start: a second kept ending on one lane; a lane-less
   ending queued at disposal; a Recapturing head held at disposal waking its identity at boot; a never-sent
   head's lane at disposal by the ruled reading; one try per start for a kept ending, with the jam left on across
   the start (the re-check's weak case b).
2. **A differential baseline.** At the start revision, record per step the reports, the commands and the store's
   contents, over every production case and generated part, both world seeds. Each step compares against it. A
   difference is allowed only by a named entry that cites the pending case it flips.
3. **Reload equivalence**, for the step that changes records: at every crash point, boot and compare the reports
   and snapshots after the boot with the baseline's. Bytes may differ; behaviour may not.
4. **Conservation, including endings with no Attempt.** Commits admitted equals Attempts minted plus declines,
   and each ends once (WriteLanes I27's remainder, brought forward from T18). `delivered-once` counts per Attempt
   today, so declines are unjudged.
5. **Torn batch.** Drop each batch whole, boot, and check conservation; a mutant that splits a batch must go red.
6. **Mutants for the new code**, written from this design before it is built: `close` with no report; a stale
   mail reference delivering again; `suspend` skipping rows with no lane; `start` skipping kept rows; a keep that
   replaces. Plus one mutant per table cell.
7. **A cost baseline:** turn cost, `ready()` with 64 queued, 500 keyed lanes (S08, S16), before and after.

**Would prove it wrong:** an allowed-difference list that grows past the pending cases (the refactor is then
changing behaviour, and should stop).

### C4. Types that enforce the invariants

**Worth it (proposed):**

- **No API, no mistake.** `persist`, `park`, `keep` and `tx.emit` stop existing; moves cannot forget a write or a
  report because they cannot issue one. This is stronger than any type.
- **Opaque `Ledger` and `Life`.** Their constructors are private to `ledger.ts` and `life.ts`; the World holds
  them, and only the five functions and `admit` return new ones. A spread of the World cannot invent one.
- **Evidence constructors private to `evidence-of.ts`**; everything else imports the type only.
- **Branded ids:** `OwedId`, `AttemptId`, `LaneId` beside the existing `CallId`, `TicketId`, `TimerId`.
- **Total projections:** `encodeLane` matches every `Phase`, so a new phase forces a decision on what is saved.
- **Rows by state:** `RowAt<"Waiting" | "Kept">` for `start`, as `HeadAt<P>` is for cells.

**Costs more than it gives:** a linear `OwedId` (TypeScript cannot stop a second `close`; a missing row is a no-op
by rule); typestate on the World; impossible cells at the type level (the `Impossible` move with a table test is
enough); branded numbers for counters and activations.

**Would prove it wrong:** the opaque types forcing casts in tests or the suite's adapter.

### C5. Performance

- **Diffing:** never diff maps or bytes. The step's setters note touched keys; at the step's end each touched key
  is projected once if its entry changed by identity. Cost follows what the step touched.
- **Ledger read per commit:** with Kept-only blocking it is "does this identity's list hold a Kept row on this
  lane". Lists hold zero to a few rows. No index.
- **What actually threatens the budget, and is there today:** `withEntry` copies a whole map on each write
  (`src/core/tx.ts:51-52`), so 500 keyed lanes cost 500 entries per lane write; `lanesOf` filters every lane by
  key string on each turn (`tx.ts:152`); the actor record is encoded on every turn that changes memory
  (`persist.ts:92-112`).

**Measure first, in this order:** actor-record encoding as a share of a turn; map copies at 500 lanes; the ledger
and the touched-set (expected to be noise). Change structure only where the first two show.

**Would prove it wrong:** acts adding measurable allocation to a turn with no ending.

### C6. Concurrency across actors

- **The ledger changes no cross-actor guarantee.** A row is owed to one identity; sends between actors are events
  and never enter it. Disposal calls `suspend` per identity in R22's order (consumers before providers).
- **`Life` is Runtime-wide** and replaces a Runtime-wide state; nothing per actor moves.
- **Two actors' rows in one batch: no case found.** A shared lookup gives each waiter its own unpersisted row.
- **The real cross-actor question is the batch, and it is T19's.** If A hears an ending and sends to B, B's record
  can land without A's under per-actor batches, and a crash repeats the send. WriteAhead R7 and R9 read as one
  atomic capture per scope, which would close it. Round 2 called this a known limit; it may be a code gap.

**Would prove it wrong:** an entity write (T24) whose store effect and ending must commit with two actors' records.

### C7. The Port and the public surface

- **The host sees:** `step`'s output (commands, reports), `admit`'s verdict, and `Out.life` as a tag. It stops
  reading `driver.world()` (`src/host/runtime.ts:188`); the World becomes an opaque type outside the core.
- **Adapters and the Port see:** reports only, in today's vocabulary. The design adds **no report kind**: a row's
  birth is `Ended`, waiting is `Parked`, resuming is `Unparked`, closing is `Delivered` or `Recorded`. Rounds 1
  and 2 proposed an `Owed` report; withdrawn.
- **Never crosses:** `OwedId`, lane ids, tickets, timers, record keys, `Delivery`. A report names an ending by
  its Attempt id, which is public by design (WriteLanes R5), or by actor, operation and order when it has none.
- **User code and Stories see:** events, snapshots and `O.x.get` rows, as now. Whether a row shows that a kept
  ending blocks its key is a small public call for T18.

**Would prove it wrong:** an oracle that cannot identify an Attempt-less ending from actor, operation and order.

### C8. Static analysis and inspection

- **Nothing breaks.** `Compiled`, `flow check`, `explain` and `graph` are static and read no runtime state; the
  ending-to-event mapping is unchanged. Round 1 said `explain` could print the ledger: wrong, it is static.
- **`trace`** reads the report stream, so it can show one line per ending (ended, refused, kept, delivered) by
  folding the same five report kinds. That is the only place the ledger should be visible, and it needs no id.
- **`Life`** shows as today's `RuntimeDisposed` report; add reports for other transitions only when a consumer
  asks.
- **Stories** are unaffected; replay stays exact under B8's conditions.

**Would prove it wrong:** a Story that must assert "an ending is kept" before its redelivery (then a matcher over
the stream, not a World read).

### C9. Records before the first release

- **Tag from the start: yes, and it is already there.** Every record carries `format` (`record.ts:17`). Keep one
  number for all kinds; write no migration until a release exists; T20 owns the steps.
- **Minimal set (proposed):**
  - `actor/<identity>`: as now;
  - `lane/<lane>`: `format`, `machine`, `name`, `operation`, `attempt`, `input`, `retryCount`, `inFlight`
    (`mayHaveApplied` goes: every boot overwrites it, `incarnations.ts:326`);
  - `owed/<identity>`: `format`, `machine`, `name`, and the identity's unheard endings in order, each with
    `operation`, `attempt`, `lane`, `channel`, `reason`, `value`, `kept`.
- **Why one list per identity, not a record per ending** (round 1): order is the list's order, so no order key;
  one write per change; fewer records against the 4,096 bound. **Why not inside the actor record:** `disposeActor`
  removes that record while the endings stay. **Why not inside the lane record:** an ending can outlive its lane
  (a definite ending drops the head) or never have one (a decline).

**Would prove it wrong:** an identity with enough unheard endings that rewriting the list costs more than records
per ending (64 queued declines at disposal is the case to measure).

### C10. Self-critique

**Wrong or contradicted:**

1. Round 1 gave the Port `owed()` and had `explain` print the ledger; both break stated rules (withdrawn; C8).
2. Round 1 said read endings are never persisted. Actors R8 and Reads R6 park `Interrupted` for the identity.
   The audience is the creator's choice, not a property of reads.
3. Round 1 said only Waiting and Kept rows have records; round 2 said every row alive at a step's end. The second
   is right, and round 1 did not notice why: mail is drained inside every step (`src/core/step.ts:93-95`), so
   queued rows almost never cross a step.
4. Round 2 treated per-actor batches as the design (B4's "known limit"). The Spec says scope (C6).
5. Round 2's `Identity` and its lateness field (`route`) pre-empt T9 and T17 (C1). Both leave the consolidation.
6. Round 2 said no report is built without a sink; acts still are. The saving is small.
7. Rounds 1 and 2 added an `Owed` report with no need (C7).
8. Round 1 overstated the first-refusal window: a requeued ending goes behind mail that exists only within the
   same step's cascade. That supports the orchestrator's Kept-only ruling.

**A simpler design I did not consider, now adopted in Part 2:** apply an ending to its lane when its call
settles, not when its turn is admitted. Round 1 kept a `Settled` state to hold the lane's view still until the
machine hears. But production invented that split (`Cue.Settled` then `Cue.Ended`, `Tries.First`, `admit`); the
Spec's model has one input per answer ("success or failure: OnWire delivers it and promotes"). Since a settled
call's ending is served in the same step unless mail is backed up, the split buys almost nothing and costs a
state, a cue, a row of cells and two rulings. It is also more honest: today a cancel that lands between
settlement and admission turns a known success into `unknown Cancelled`.

**Weakest recommendation:** that same change. Under backlog (the drain cap, or T9's mailbox rotation) the lane's
view moves before the machine hears, so a guard can pass on a lane whose ending is still queued. The orchestrator
accepted the same exposure for the first-refusal window, on the same ground (nothing is lost). Fallback: keep
`Settled` as a fourth `Delivery` state and the `Ended` cue; nothing else in Part 2 changes.

**Not verified by running anything:** all three rounds are from reading. The claim that `unpark` is safe only
because one step drains, and the `mayHaveApplied` equivalence, each deserve a failing-first check in A0.

## Part 2: the consolidated design (proposed)

### State

```ts
// ── ids.   NEW: OwedId, AttemptId, LaneId     existing: CallId, TicketId, TimerId
export type OwedId = string & Brand.Brand<"flow-state/OwedId">;
export type AttemptId = string & Brand.Brand<"flow-state/AttemptId">;
export type LaneId = string & Brand.Brand<"flow-state/LaneId">;

// ── the Runtime's life.   NEW: Life (replaces Disposal), Verdict, admit   (Task B)
export type Life = Data.TaggedEnum<{
  Inert: {};
  Booting: {};
  Open: {};
  Failed: {};
  Disposing: { final: Option.Option<TicketId> }; // the final write's ticket, once issued
  Disposed: {};
}>;

export type Verdict = Data.TaggedEnum<{
  Run: {};
  Drop: {};
  Reject: { code: "RuntimeDisposed" | "RuntimeNotReady" };
}>;

export declare const admit: (life: Life, input: Input) => Verdict;

// ── lanes.   existing: Phase, Lane     CHANGED: Head loses mayHaveApplied
export type Head = {
  readonly id: AttemptId;
  readonly input: Values;
  readonly retryCount: number;
  readonly owner: number;
  readonly phase: Phase;
};

// NEW: sentBefore (replaces the stored mayHaveApplied)
export declare const sentBefore: (head: Head) => boolean; // retryCount > 0, or Held, Recapturing or Resending

// CHANGED: LaneState loses Kept
export type LaneState = Data.TaggedEnum<{ Idle: {}; Head: { head: Head } }>;

// CHANGED: Cue.   NEW: Answered (was Settled then Ended)   DROPPED: Settled, Ended, Keep
// CommitReject and CommitCancel stay until T18 replaces them with one Commit cue.
export type Cue = Data.TaggedEnum<{
  CommitReject: { input: Values; owner: number };
  CommitCancel: { input: Values; owner: number };
  Retry: { owner: number };
  Cancel: {};
  TurnEnded: {};
  Stored: {};
  Refused: {};
  Answered: { channel: Channel; reason: string; value: unknown };
  DisposalStarts: {};
  BoundPassed: {};
}>;

// ── the ledger.   NEW: Audience, Delivery, Owed, Closed, Ledger
export type Audience = Data.TaggedEnum<{
  Identity: {}; //                 any incarnation of the identity; saved when the identity persists
  Life: { incarnation: string }; // one incarnation; closed as evidence when it ends
}>;

export type Delivery = Data.TaggedEnum<{
  Queued: {}; //   a try is in the mailbox
  Retrying: {}; // refused once; its second try is in the mailbox
  Waiting: {}; //  nothing can hear it now
  Kept: {}; //     refused twice; one try at the next start; blocks its lane's key
}>;

export type Owed = {
  readonly id: OwedId;
  readonly actor: ActorId;
  readonly to: Audience;
  readonly operation: string;
  readonly attempt: Option.Option<AttemptId>;
  readonly lane: Option.Option<LaneId>;
  readonly channel: Channel; //     existing; T18 may replace channel, reason and value with one tagged result
  readonly reason: string;
  readonly value: unknown;
  readonly owner: number; //        existing; T17 replaces owner and current with the subject path
  readonly current: boolean;
  readonly delivery: Delivery;
};

export type Closed = Data.TaggedEnum<{
  Delivered: { event: string };
  Recorded: { why: "evidence" | "letGo" };
}>;

// Opaque outside ledger.ts: an identity's rows in the order they were owed.
export type Ledger = ReadonlyMap<string, ReadonlyArray<Owed>> & Brand.Brand<"flow-state/Ledger">;

// ── mail.   CHANGED: Ending carries a reference
export type Mail = Data.TaggedEnum<{
  Event: { actor: ActorId; tag: string; payload: Values };
  Ending: { actor: ActorId; id: OwedId };
  Firing: { actor: ActorId; incarnation: string; schedule: string; arming: number };
}>;

// ── the World.   CHANGED: life (was disposal), owed (was parked and kept), attempts (new counter)
export type World = {
  readonly life: Life;
  readonly incarnations: ReadonlyMap<string, Incarnation>; // existing; T9 folds these three into Identity
  readonly records: ReadonlyMap<string, ActorRecord>;
  readonly uses: ReadonlyMap<string, ReadonlyArray<Use>>;
  readonly lanes: ReadonlyMap<LaneId, Lane>;
  readonly owed: Ledger;
  readonly reads: ReadonlyMap<CallId, Read>; //              existing; T21 reshapes it
  readonly mail: ReadonlyArray<Mail>;
  readonly timers: ReadonlyMap<TimerId, Timer>;
  readonly counter: number;
  readonly attempts: number; //                              Attempt ids only, so no other id renumbers them
  readonly persistence: boolean;
};
```

### The five ledger functions

```ts
// NEW, all in ledger.ts; nothing else builds, moves or removes a row.
export declare const owe: (tx: Tx, ending: Omit<Owed, "id" | "delivery">) => OwedId;
export declare const tryOne: (tx: Tx, id: OwedId) => void;
export declare const suspend: (tx: Tx, actor: ActorId) => void;
export declare const start: (tx: Tx, actor: ActorId) => void;
export declare const close: (tx: Tx, id: OwedId, how: Closed) => void;
export declare const keptOn: (ledger: Ledger, actor: ActorId, lane: LaneId) => boolean; // the only blocking read
```

- **`owe`**: the row is born already applied to its lane (the `Answered` cell ran first and fixed its channel and
  reason). `Queued` with a mail reference when the Runtime is `Open` and its audience is live; else `Waiting`; a
  `Life` row whose incarnation is gone is closed `Recorded` at once.
- **`tryOne`**: a reference to a missing row does nothing. No mapping: `close(Recorded)`. Accepted turn:
  `close(Delivered)`. Refused: `Queued` becomes `Retrying` with a new reference behind queued mail; `Retrying`
  becomes `Kept`.
- **`suspend`**: an incarnation's end, `disposeActor`, and each identity at Runtime disposal. `Queued` and
  `Retrying` rows become `Waiting`; `Life` rows close `Recorded`. Forget then closes every row of the identity.
- **`start`**: the one delivery point for reload, return and adoption. `Waiting` becomes `Queued`, `Kept` becomes
  `Retrying`, in list order; then each Held head with no row for its Attempt is owed `unknown Restored`.
- **`close`**: the only removal.

**Blocking:** `commit` declines `Rejected` before the table when `keptOn` is true; `cancel` on such a lane closes
its kept rows `Recorded { letGo }`. The cancel-policy rule (Q5) is T18's.

### What is persisted

- Three record kinds (C9). The step's setters note touched lanes and identities; at the step's end each is
  projected (`encodeActor`, `encodeLane`, `encodeOwed`) if its entry changed by identity, and the writes go out
  as that step's `Persist` commands. `Due` is derived: `Awaited` when a touched head entered Acknowledging or
  Recapturing, `Now` when an actor record is removed or an incarnation ended, else `Later`.
- A Recapturing head is projected with the `retryCount` its re-send will carry (T19's red).
- A boot decodes, sorts by record key, and wakes each identity with an owed record or a lane record `inFlight`.

### Where reports come from

```ts
// CHANGED: Act gains Row, Turn, Call, Incarnation and Life; Out returns acts.   existing: Lane, ReadReplaced, Silent
export type TurnVerdict = Data.TaggedEnum<{
  Accepted: { from: string; to: string; parts: ReadonlyArray<string>; members: ReadonlyArray<Member> };
  Unhandled: {};
  Denied: { reasons: ReadonlyArray<string> };
  Refused: { code: RefusedCode };
}>;

export type Act = Data.TaggedEnum<{
  Lane: {
    actor: ActorId;
    operation: string;
    key: Values;
    before: LaneState;
    cue: Cue;
    after: LaneState;
    commands: ReadonlyArray<Command>;
  };
  ReadReplaced: { operation: string };
  Silent: { operation: string; attempt: AttemptId };
  Row: { before: Option.Option<Owed>; after: Option.Option<Owed>; how: Option.Option<Closed> };
  Turn: { actor: ActorId; event: string; ending: Option.Option<Owed>; verdict: TurnVerdict };
  Call: { operation: string; defect: boolean };
  Incarnation: { actor: ActorId; before: Option.Option<Incarnation>; after: Option.Option<Incarnation> };
  Life: { before: Life; after: Life; finalPending: boolean };
}>;

export type Out = {
  readonly world: World;
  readonly life: Life["_tag"];
  readonly commands: ReadonlyArray<Command>;
  readonly acts: ReadonlyArray<Act>;
};

export declare const evidenceOf: (act: Act) => ReadonlyArray<Evidence>; // the only builder of an Evidence
```

`Row` gives `Ended` (birth), `Parked` (to Waiting), `Unparked` (from Waiting) and `Delivered` or `Recorded`
(close). `Turn` gives `Turn`, `Unhandled`, `Denied` and the refusal's `Issue`, in act order, so `insertEvidence`
goes. `Life` gives `RuntimeDisposed` and the final write's `StorageFailure`.

### What the host does

- Runs commands: calls and timers as fibers, writes through the edge; turns a fiber's Exit into a `CallResult`.
- Decodes a sent event at the boundary; calls `admit` and throws the `FlowError` a `Reject` names.
- Owns the Scope, the services Layer and one Deferred sharing the bootstrap's Exit.
- `dispose`: sends `DisposeRuntime`, waits for `Out.life` to read `Disposed`, closes the Scope.
- Keeps the capture window (deferred): when a `Later` batch is issued, and the flush on hide.
- Reads no World field and builds no report.

### Added and dropped

**Added:** `Life`, `Verdict`, `admit`; `Ledger`, `Owed`, `Audience`, `Delivery`, `Closed`, the five functions and
`keptOn`; `Cue.Answered`; `sentBefore`; `World.attempts`; `Out.acts`, `Out.life`; acts `Row`, `Turn`, `Call`,
`Incarnation`, `Life`; `encodeOwed` and the `owed/<identity>` record; brands `OwedId`, `AttemptId`, `LaneId`.

**Dropped:** `Disposal`; `World.parked`, `World.kept`, `Parked`, `Tries`; `Ending` (its fields live on `Owed`);
`Cue.Settled`, `Cue.Ended`, `Cue.Keep`; `Move.Queue`, `Move.Park`, `Move.Keep`, `Move.LetGo`; `LaneState.Kept`
and the table's Kept row; `Head.mayHaveApplied` and the record's field; `persist`, `park`, `unpark`, `keep`,
`unkeep`, `saveActor`'s write, `laneWrite`'s `removed` flag, `hold`'s `write` flag; `tx.emit`, `insertEvidence`;
`parked/<lane>` and `kept/<lane>` records and the minted `kept-…` lane id; `boot`'s parking and
`deliverRestored`; the host's `started`, `open`, `closed()`, `admitting`, the driver's flush, bound and `Issue`.

**Not in this design (decided elsewhere):** `Identity` (T9); the tagged result and one `Commit` cue (T18); slots
for reads (T21); the lateness field (T17); the capture window in the core (deferred); record codec (T20).

### Task split and handoffs

**Task A** (before T18): steps A0 to A4 of C2, checks of C3. Each step ends with the suite, falsify, liar, crash
and core-mutant gates no worse, `nub run check` at zero, and the differential baseline equal but for named
entries.

**Task B** (after T18, before T19): steps B1 and B2. Checks: a table test over every `(Life, Input)` cell; the
lifecycle cases in `src/host/lanes.test.ts`; a new case answering a call at 3 s and expecting `StorageFailure`
at 5 s (the completion check's open gap); the suite's judged disposal at the end of every case.

| To  | Handed over                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------- |
| T18 | a table over `Idle` and head phases only; one `Answered` cue; `owe` and `keptOn`; no persist or emit API; |
|     | Q5 as "close the lane's kept rows, then mint"; pending cases already in the suite                         |
| T19 | writes as a flat per-step list with `Due` derived; the final write as a ticket; the batch-scope question  |
|     | (C6); the Recapturing projection rule; the capture window still in the edge                               |
| T20 | three record kinds with `format`; a boot that sorts and derives `Restored`; open: codec, value encoding,  |
|     | creation-order keys, version tags, rows whose operation is gone                                           |
| T9  | `Life` done (strike it from the brief); the `Identity` finding; the ledger's mail reference, which a      |
|     | per-actor mailbox must keep; "an ending owed at ready" is a non-empty row list                            |
| T21 | read endings as rows with a chosen audience; `reads` untouched                                            |
| T17 | `owner` and `current` untouched on `Owed`; the `Turn` act carries parts and members                       |
