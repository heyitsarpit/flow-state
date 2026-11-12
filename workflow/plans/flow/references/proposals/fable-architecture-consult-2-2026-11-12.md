# Architecture consult, round 2: lifecycle, driver, reports, batches, policies, suite (2026-11-12)

**Status: proposed, nothing here is decided.** Bottom line: the same fix as round 1 applies three more times. The
Runtime's life, the persistence window and the reports each have their state split between the core and the host
or between hand-written copies; each becomes one explicit core value that the host only runs. Blocking starts
with Kept rows only, as the orchestrator ruled. Read-only; no gates run. Paths are under
`packages/flow-state-v3/` at fe474ea1. Round 1 is `fable-architecture-consult-2026-11-12.md`.

**Two corrections to round 1.**

- Round 1 gave the Port a new read, `owed()`. That breaks the suite's decision 2 (the Port is public behaviour
  only). Withdrawn: conservation is judged from the report stream (one `Owed` report, one close report per row).
- Round 1 said only `Waiting` and `Kept` rows have a record. Simpler and safer: every row alive at the end of a
  step has one (B4). Between steps that is `Waiting` and `Kept` anyway, except past the 10,000 drain cap.

## Part 1

### B1. Runtime lifecycle: yes, an implicit state machine; make it one core state

**Evidence.** Six values encode one life: `started` and `open` (`src/host/runtime.ts:167-168`), the `booted`
Deferred (`:166`), `World.disposal` (`src/core/world.ts:220`), the driver's `disposed` Deferred
(`src/host/driver.ts:86`) and `closed()` (`runtime.ts:188`). Four guards read them: `ready` (`:224-226`), the
check before `Boot` (`:213`), `admitting` (`:241`), `!open` (`:253`). The core repeats the guard nine times as
`open ? … : undefined` (`src/core/step.ts:69-90`). `World.disposal` says `Open` before any boot, so "inert" and
"booting" exist only in the host.

**Recommendation (proposed).**

```ts
// NEW: Life (replaces Disposal), Input.Start, Input.BootFailed, Verdict, admit     existing: Input, FlowError
export type Life = Data.TaggedEnum<{
  Inert: {}; //     constructed, nothing started
  Booting: {}; //   the host loads storage and acquires services
  Open: {};
  Failed: {}; //    the bootstrap failed; the host keeps its Exit and Cause
  Disposing: {}; // nothing new is invoked; calls on the wire and the final write wait for the bound
  Disposed: {};
}>;

export type Verdict = Data.TaggedEnum<{
  Run: {};
  Drop: {}; //      a late host answer or timer
  Reject: { code: "RuntimeDisposed" | "RuntimeNotReady" };
}>;

export const admit: (life: Life, input: Input) => Verdict; // one total table, as cells.ts is for lanes
```

- The host keeps only what needs Effect: the Scope, the Layer build, and one Deferred that shares the bootstrap's
  Exit. `started` is `Life` not `Inert`; `open` is `Life` is `Open`; the three host guards call `admit` and turn
  a `Reject` into the `FlowError`.
- Dispose while `Inert` or `Booting` goes straight to `Disposed`; the later `Boot` is rejected, so `ready` fails
  and the closed Scope releases what was acquired (Actors R4). `ready` after dispose is a row, which also settles
  Actors I3 against R22.

**Would prove it wrong:** a host fact the table needs but the core cannot hold as data (the bootstrap's Cause is
not one: the core needs only that it failed); or a public call that must answer before any step can run.

### B2. Logic in the driver: the final write and the capture window belong in the core as data

**What sits in the host today.**

- The disposal bound, twice: `driver.ts:196` computes `now + DISPOSAL_BOUND_MS`, and the core arms `Timer.Bound`
  for the same deadline (`src/core/disposal.ts:42`).
- "Disposal ended" has two meanings: the core's `Disposed` (no call on the wire), then the host's flush with its
  own timeout and its own `Issue` (`driver.ts:199-211`, `src/host/edge.ts:156-165`).
- The capture window: when a plain batch is due, hidden pages, and a flushing mode (`edge.ts:11-23`, `:58-66`,
  `:121-127`, `:130-145`, `:174-179`), held as `out`, `due` with infinity sentinels, and the `flushes` array.

**Recommendation (proposed).** The core already has the deadline effect it needs: `Command.Arm { at }` with
`Input.Fired`, where `at` is computed from `env.now`. No new mechanism, and no clock in the core.

- **Final write:** at `DisposeRuntime` the core emits its last writes with a ticket (`Due.Awaited`, purpose
  `final`) and stays `Disposing` until the ticket is answered or `Timer.Bound` fires; then it reports
  `StorageFailure` itself and goes `Disposed`. `driver.dispose` becomes "send the input, await `Disposed`".
  `step.ts:86-87` must admit `Stored` and `Refused` while `Disposing`.
- **Capture window:** the core holds the dirty keys per scope and one `Timer.Capture` per scope; `Input.Hidden`
  flushes. The edge keeps only "one batch out per scope, in order, put a refused batch back". Records are encoded
  when a batch is issued, not on every turn.
- **Stays in the host:** classifying a fiber's Exit (`resultOf`, it needs Effect's Cause), decoding a sent event
  at the boundary, the inbox trampoline, sleeping until `at`.

**Would prove it wrong:** a store whose last write must outlive the core's `Disposed`; or encoding at issue time
showing a different value than the turn's (it cannot while the world is immutable, but an awaited acknowledgement
must still carry the turn that committed it, WriteAhead R13).

### B3. One stream: yes, from one function over acts, not over a bare world diff

**Recommendation (proposed).** A step returns `{ world, commands, acts }`, and `evidenceOf` is the only code that
builds an `Evidence`. A world diff alone is not enough: some reports describe a decision that changes nothing.

| Kind of report                                                                | Determined by                   |
| ----------------------------------------------------------------------------- | ------------------------------- |
| Minted, Sent, Lane kinds, Incarnated, Finished, Published, RuntimeDisposed    | before, after, commands         |
| Owed, Parked, Unparked, Delivered, Recorded (round 1's row transitions)       | the ledger row before and after |
| Turn, Unhandled, Denied, the Issue of a refused turn, a call's Defect         | the turn's verdict (an act)     |
| NothingToResend, InFlight, StorageSilent                                      | the cue and the state before    |

**Still emitted by hand** (all under `src/`): `core/disposal.ts:49`; `core/answers.ts:40`, `:71`;
`core/serve.ts:78`, `:80`, `:82`, `:177`, `:194`, `:204`; `core/lane-moves.ts:239`; `core/incarnations.ts:71`,
`:94`, `:148`, `:244`, `:264`, `:283`; `core/persist.ts:179`; and `host/driver.ts:209`, which reports from the
host, outside any step. `serve.ts:135` splices the Turn report in before its children (`insertEvidence`,
`core/tx.ts:105`): an order fixed up after the fact, which a Turn act carrying its members removes.

Consequences: the suite, Stories and the CLI read `Out` and nothing else; with no sink attached no report is
built; after B2 the host emits none.

**Would prove it wrong:** report order changing in a way an oracle depends on (order must be act order, checked
by the verdict compare); or a measured cost of acts on a turn with no sink.

### B4. Capture window and batches: no conflict; "heard" has two commit points

**Why no conflict.** The removal of an owed record and the hearing turn's actor record are queued in one step
for one scope (`actorKey`), and the edge sends a scope's whole dirty set as one batch (`edge.ts:79-87`), merging
anything still waiting. Coalescing delays the pair; it never splits it.

**The commit points (proposed wording).**

- **In memory:** the end of the step whose turn accepted the ending. A step is the atomic unit: all its writes
  for a scope are one batch or join the pending one.
- **Durably:** the landing of the first batch that holds that turn's actor record, up to 5 s later, or sooner on
  hide, a flush or an awaited acknowledgement. A crash before it restores the old state together with the owed
  record, so the ending is heard again by the state that had not heard it.
- **No remote write depends on an undurable "heard":** a commit made in the hearing turn is acknowledged by a
  batch that carries the same scope's dirty set, the removal included, before its adapter runs.

**What must stay true.** The edge never splits a scope's dirty set (the 4,096-record and 16 MiB bounds must
reject a batch whole); the store's batch is atomic; every row alive at a step's end is in that step's writes.

**Known limit, not new.** Scopes are per actor. If A hears an ending and sends to B, and B's batch lands before
A's, a crash makes A hear again and send again. Any uncaptured turn has this today.

**Would prove it wrong:** a store with no atomic batch (plain key-value stores), or a split batch.

### B5. Incarnations: one path; adoption is not a concept in code

**Recommendation (proposed).** Reload, return, adoption and a fresh start are `start(actor, from)` with `from` a
record or none; the code already has no adoption branch, since lanes are found by identity. Define adoption in
the Spec as "a start that finds lanes or owed rows", and delete the rest:

- `boot`'s own parking of `Restored` (`core/incarnations.ts:333-350`); `start` derives it. `boot` keeps decoding
  and choosing whom to wake.
- `deliverRestored`'s three loops (`:80-126`), replaced by the ledger's `start` (round 1).
- `end` and `dispose` repeating one teardown (`:233-245`, `:256-265`): one `finish(actor, how)`.
- `Ensure { use, existing }` plus `Send`'s hidden ensure (`core/input.ts:30`, `core/step.ts:76`): two flags for
  three intents; a tagged `Create | Attach | Wake`.

One rule then covers I6: a new incarnation hears each Held head it has no owed row for.

**Would prove it wrong:** a case where a return within one Runtime must differ from a reload beyond what `from`
carries. One to watch: a Kept row gets a try on every start, so a poison ending costs one refused turn per
incarnation of a frequently mounted actor.

### B6. Failure taxonomy: four audiences, not one list; collapse the encoding, not the names

The twelve names belong to four channels that should never share a type:

| Audience                   | Names                                                                    |
| -------------------------- | ------------------------------------------------------------------------ |
| A handler (an ending)      | NotSent { why }, StillUnknown, unknown Restored, Cancelled, Disposed      |
| A caller (a thrown error)  | RuntimeDisposed, RuntimeNotReady, InvalidEvent                            |
| `flow check` (compile)     | ReservedReason, KeyRequired                                               |
| Reports                    | StorageFailure, StorageSilent, Superseded, Released, NothingToResend      |

**Recommendation (proposed).**

- **User-facing: no change.** `NotSent { why }` is already one tag with a cause; a handler's real decision is the
  channel (failure: safe to commit again; unknown: retry the same Attempt or reconcile).
- **Internal: one cause list, channel derived from history.** Cancelled, Restored, Disposed and StorageRefused
  each exist twice, as a decline and as an unknown; the only difference is whether the Attempt was ever sent
  (I3, I20). Store `cause` and derive the channel from the head's history.
- **Make the origin structural.** Today `reason` is a string and `isDecline(reason)` infers Flow's declines
  (`core/cells.ts:131`, `core/serve.ts:35`), so an author's failure tagged `Cancelled` is read as NotSent.

```ts
// NEW: Result (replaces Ending's channel + reason + value)     existing: Decline, Channel
export type Result = Data.TaggedEnum<{
  Success: { value: unknown };
  Failure: { tag: string; error: unknown }; //                  the commit's own
  Unknown: { tag: string; error: unknown }; //                  the commit's own
  Flow: { cause: FlowCause; sent: boolean; failure: Option.Option<string> }; // NotSent when not sent
}>;
```

- `ReservedReason` stays a compile check (map keys share a namespace) but stops being load-bearing at run time.
  `KeyRequired` is decidable from `Compiled`, so it is a compile diagnostic, never a runtime reason.
- The lane report `StorageFailure` (`core/evidence-of.ts:97`) names what the ending calls `StorageRefused`; use
  one name for the refused batch and keep `StorageFailure` for the final write still pending.

**Would prove it wrong:** a handler that must map two Flow causes of one channel to different events and cannot
branch on the payload's `why`.

### B7. Lane policies: three axes; four names stay; reads are not lanes

- **Admission policy** (one per operation) is a point in a small space: how many commits wait behind a sent
  head, what a full queue does, and whether the sent head is preempted.

| Policy    | Waiting | When full        | Preempts the sent head |
| --------- | ------- | ---------------- | ---------------------- |
| reject    | 0       | decline          | no                     |
| latest    | 1       | replace          | no                     |
| serialize | 64      | decline          | no                     |
| cancel    | 0       | not applicable   | yes                    |

  A never-sent head is the front of the queue, which is why `latest` supersedes it. Keep the four names (the
  standard contract: RxJS `exhaustMap`, `switchMap`, `concatMap`; `allow` was `mergeMap`). Internally: one
  `Commit` cue carrying the policy as a tagged value, not one cue per policy (`core/cells.ts:17-18`, `:181-204`).
- **Members** are orthogonal to policy. `cancelAll` is `cancel` plus emptying the queue and promoting nothing; with
  no queue (reject, cancel) they are the same. One cue, `Cancel { reach: "head" | "lane" }`.
- **Guards** (`idle`, `retryable`) only read the lane's view. **Keys** only pick the lane.
- **Reads need no lane.** A read has no Attempt, no acknowledgement, no hold, no retry and no record; it needs
  "at most one current call per life and operation, a newer one supersedes". The `reads` map already is that
  (`core/world.ts:253`). Call it a slot in the Spec so lane rules (kept, parked, retry) stop leaking into reads;
  its ending is a life row in the ledger.

**Would prove it wrong:** a policy that needs a waiting count and preemption together; reads gaining an unknown
channel or a retry.

### B8. Determinism: exact, under three conditions

- **Attempt ids must not shift when an internal id kind is added.** Every kind draws on one counter
  (`core/tx.ts:109-118`), so ledger ids renumber Attempts, which servers see as idempotency keys and frozen
  scripts quote. Give Attempts their own counter (or one per kind).
- **A boot must not depend on the store's load order.** `decodeRecords` builds lanes in the order the store
  returned them (`core/record.ts:255-262`), and delivery follows that order. Sort by key, and give lane and owed
  records an order key for Restore R3's "creation order".
- **Diff by identity, not by bytes.** The world is replaced immutably, so `before.lanes.get(id) !==
  after.lanes.get(id)` is the diff; comparing encoded text would need a canonical codec first (T20).

With B2's capture timer in the core, batch boundaries replay too, so the crash gate's points are step boundaries.

**Would prove it wrong:** a regression script that pins ids across the change (re-baseline once); a replay that
asserts batch contents while the edge still owns timing.

### B9. The suite's sources of truth: one of each role

Not read: the liar gate's and `parts/belief.ts`'s code; this rests on the README and the phase-out proposal,
whose order I agree with.

**Smallest set that keeps every guarantee (proposed):**

1. **Expected:** the Spec model (tables and search), the only hand-written behaviour; `referenceOf` over real
   fixtures' `Compiled` for everything a machine determines.
2. **Observed:** production through the Port, one report stream (B3), plus the fake world's own facts.
3. **Judges:** the model compare, and the boundary oracles that read world facts. Run the oracles on the model's
   own output as well, so the model has a judge once round-14 is gone.
4. **Is the judge awake:** one mutation gate with three sources: model cell mutation, production mutants
   (generated per table cell, operator flips, a few hand ones for what is not a cell), and the null runtime. The
   liar gate becomes a mode of that gate, not a gate with its own baseline.
5. **Regression scripts:** shrunk runs with a unique catch or a ruling; frozen hand cases join them or go.
6. **Owed:** one list (round 1's A3, or T47's matrix if its rows can name Invariants), pending cases included.
7. **The crash gate**, and `gates.json` as the only record of numbers.

**Can go after T47 and T52:** hand Pay and Cells descriptors, traces the search reaches, `not-yet.ts`, the hand
step-mutant list (all T52's). Also, proposed here: `catch-sweep.*.tsv` as a checked-in baseline (the sweep is a
tool for thinning cases, run on demand); `coverage-standings.txt` (printed by the gate); limits rows for
production's owed reds (they are pending cases).

**Must wait for T53:** round-14 and everything keyed to it. It hosts 154 mutants against production's 18, so for
most Invariants it is the only proof the judge is awake.

**Would prove it wrong:** a mutant only round-14 can express; a lost catch the sweep baseline would have shown
(run the sweep once after deleting it).

## Part 2: simplifications, ranked by what they remove against their risk

| #  | What goes                                             | Removes | Risk       |
| -- | ----------------------------------------------------- | ------- | ---------- |
| 1  | Parked, kept, Tries, Keep, the Kept row (ledger)      | most    | medium     |
| 2  | Hand persist calls and their flags (diff-written)     | large   | medium     |
| 3  | Host lifecycle flags and nine `open ?` guards         | large   | low-medium |
| 4  | records + incarnations + uses + the grace scan        | large   | medium     |
| 5  | Hand-emitted reports and `insertEvidence`             | medium  | low-medium |
| 6  | The host's flush, bound and Issue                     | medium  | medium     |
| 7  | `mayHaveApplied` as a stored field                    | small   | low        |
| 8  | String reasons and `isDecline` inference              | medium  | medium     |
| 9  | `current` + `owner` + `ROOT_ACTIVATION`               | small   | low        |
| 10 | `end` and `dispose` twins; `Ensure`'s flags           | small   | low        |
| 11 | The edge's `out`, `due` sentinels and `flushes`       | small   | low        |
| 12 | Checked-in derived baselines; three owed lists        | medium  | low        |

Detail, with what must stay true:

1. **Ledger** (round 1). `core/world.ts:160`, `:238-256`; `core/cells.ts:25-27` (`Settled.route`, `Keep`),
   `:289-300`, `:330`; `core/persist.ts:126-185`; `core/lane-moves.ts:116-123`, `:279-300`;
   `core/disposal.ts:21-27`; `core/record.ts:40-57`, `:263-274` (kept is stated by the key prefix and by the
   payload). `route: "queue" | "park"` and `notSent`'s disposal branch pass the Runtime's life down as a flag.
   Stay true: WriteLanes I15, I16, I27; Actors I24, I31; order per identity.
2. **Diff-written records.** `core/lane-moves.ts:184-189` (`write: boolean`), `:303`; `core/persist.ts:83-90`
   (`removed: boolean`), `:119-124`; `setLane` writes nothing and each move must remember to. Stay true: the
   acknowledgement batch carries the committing turn (WriteAhead R13); a step's writes are one batch (B4).
3. **`Life` and `admit`** (B1). `host/runtime.ts:166-168`, `:188`, `:213`, `:224-227`, `:241-245`, `:253`;
   `host/driver.ts:86`, `:147`, `:164`; `core/step.ts:65-91`. Stay true: Actors R4, R22, I3.
4. **One identity value.** `World.records`, `incarnations` and `uses` are three maps on one key
   (`core/world.ts:249-254`); `records` is rewritten from the incarnation on every turn (`core/persist.ts:104-112`),
   a stored copy; `graces` scans every incarnation against every timer and the mail on every step
   (`core/incarnations.ts:293-314`). Replace with `Identity = Dormant { record } | Live { incarnation, uses, grace }`.
   Stay true: a send to a dormant identity with a record wakes it (`core/step.ts:76`); Actors I10, I14, I37.
5. **Acts** (B3). Lines listed there. Stay true: report order.
6. **Final write in the core** (B2). `host/driver.ts:17`, `:195-214`; `host/edge.ts:58-66`, `:110`, `:125`,
   `:156-165`. Stay true: Actors R23's 5 s from the call to `dispose()`.
7. **`mayHaveApplied`.** Stored on the head (`core/world.ts:112`), set in `lane-moves.ts:185`, `:202`, read at
   `cells.ts:131`, written to the record (`core/record.ts:36`, `:139`) and read back (`:240`), then overwritten
   `true` at every boot (`core/incarnations.ts:326`), so the record's field is dead. It equals `retryCount > 0`
   or a phase of Held, Recapturing or Resending. Derive it; keep it on the public Attempt (WriteLanes R5).
8. **Tagged result** (B6). `core/cells.ts:131`, `core/serve.ts:35`; `value: { why }` beside `reason: why`
   (`core/lane-moves.ts:109-110`, `:213-214`). Stay true: WriteLanes I3, I4, I25.
9. **Lateness.** `current: true`, `owner === ROOT_ACTIVATION` and `owner === activation` are three ways to say
   "not late" (`core/world.ts:149-150`, the `alive` test in `core/serve.ts`); `core/record.ts:211` writes a bare
   `0`. One field: `route: Always | Activation`.
10. **Twins and flags.** B5's lines.
11. **The edge's scope.** `host/edge.ts:11-23`: `out` plus `due` at plus or minus infinity plus `flushes` encode
    Clean, Waiting, Ready, Out and Flushing. A tagged state, or gone with B2.
12. **Suite top level.** `catch-sweep.*.tsv`, `coverage-standings.txt`, `liar-*.txt`, `core-mutants.tsv` are
    outputs kept beside `gates.json`; `not-yet.ts`, the `remainders.ts` files and `parts/features.ts`'s `owed`
    state one fact three times.

**Leaks of internal wiring.**

- `buildRuntime` returns the driver, and the host reads `driver.world().disposal` (`host/runtime.ts:188`, `:287`):
  the whole World crosses the boundary. After B1 the host needs only `admit`'s verdict.
- `host/inspect.ts:24` exports `Evidence` with its constructors; after B3 only `evidenceOf` builds one, so the
  public entry can export the type alone.
- Lane ids are strings built from the actor key (`core/world.ts:20`), and `lanesOf` filters every lane by
  comparing key strings on each turn (`core/tx.ts:152`). A map per identity removes the scan and the parsing.
  Structure, not a cache; still, measure first.
- The host imports `DISPOSAL_BOUND_MS` from `core/tx.ts` (`host/driver.ts:17`); gone with item 6.

## Least sure

Moving the capture window into the core (B2, second bullet). It makes batch boundaries deterministic and removes
the edge's hidden states, but the World then carries a dirty set per scope and records are encoded at issue time
rather than per turn, which changes what the crash gate enumerates. The final-write half of B2 stands without it.
