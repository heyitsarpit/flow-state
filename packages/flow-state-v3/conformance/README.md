# Conformance suite

The production conformance suite for Flow State v3: it runs the core Specs' guarantees
(`specs/core/*.spec`) against a runtime through one `Port`. It runs on the prototype runtime
(`prototypes/round-14`) now and on the production runtime in phase 4. It replaces the prototype
harness in `prototypes/conformance/`, which stays as prior art.

Round log and sidecar results: [STATUS.md](STATUS.md).

## How to run

From `packages/flow-state-v3/`, every command bounded and with no stdin:

```sh
bun conformance/runner/main.ts suite                      # every case on round-14
bun conformance/runner/main.ts suite --only PAY-04        # some cases (comma list)
bun conformance/runner/main.ts suite --parallel 4         # cases split over 4 child processes
bun conformance/runner/main.ts suite --runtime null       # the null runtime: every case must fail
bun conformance/runner/main.ts suite --runtime <dir>      # another prototype tree (an edited copy)
bun conformance/runner/main.ts falsify --parallel 4 --scratch <dir>
bun conformance/runner/main.ts falsify --sweep --parallel 5 --scratch <dir>   # every lie on every case
```

Every case runs under world seeds 1 and 2 (store load order, session seeds); a case fails on the
first seed that fails it. `falsify` checks, in order: every oracle has a lie for this runtime; the
null runtime (every case must state a failure); the control (each lie's cases pass on the
unedited runtime); then each lie on its own edited copy of the runtime in `--scratch` (default the
OS temp dir; removed after). It ends `VERDICT pass` only when every lie is caught by its own
guarantee's oracle. `--sweep` runs each lie on every case and lists the red ones (for verdict
comparisons). `nub run check` lints and type-checks the suite. `--json` and every mode set a
non-zero exit code on a failure.

## Layout

| Path                    | What it is                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `port.ts`               | The `Port`: the whole contract between the suite and a runtime.                                                                                                                                                           |
| `adapters/prototype.ts` | The Port over round-14: loads its `adapter.ts` and typed fixtures by path.                                                                                                                                                |
| `adapters/null.ts`      | A runtime that does nothing; falsify requires every case to fail on it.                                                                                                                                                   |
| `world/`                | The fake world, one module per host: `clock.ts`, `network.ts`, `storage.ts`, `lifecycle.ts` (the page: generation, task queue, Effect scheduler, visibility); `world.ts` composes them and owns settle, advance and kill. |
| `dsl/case.ts`           | The scenario DSL: `Scenario` and the `Case` driver. Steps settle the world and run every oracle.                                                                                                                          |
| `oracles/`              | One module per guarantee (`<name>.ts`) with its lies beside it (`<name>.lies.ts`); `oracle.ts` holds the timeline (`Fact`), `Oracle`, `Lie` and `Guarantee` (an oracle with its lies).                                    |
| `fixtures/reference.ts` | The suite's own expectations of each fixture, written by hand from the fixture's source.                                                                                                                                  |
| `scenarios/`            | Cases, one file per area.                                                                                                                                                                                                 |
| `suite.ts`              | The registry: every guarantee (oracle and its lies) and every case.                                                                                                                                                       |
| `runner/`               | `main.ts` (CLI), `run.ts` (cases in process), `falsify.ts` (lies on copies), `child.ts` (bounded child processes), `verdict.ts` (the verdict line children print).                                                        |

## Decisions

Round 1's, the runner's (recorded as such; the user may overrule):

1. **Location**: `packages/flow-state-v3/conformance/`, production code outside `prototypes/`,
   covered by `nub run check` (the package `tsconfig.json` includes it and allows `.ts` imports).
2. **The Port is public behaviour only.** A runtime is driven by `ensure`, `ensureExisting`,
   `send`, `dispose` and read by `snapshot` and `row` (the public `O.x.get` shape), plus `pending`
   for settling. Its reports are `Observation`s in the Specs' vocabulary: `Turn`, `Minted`,
   `Sent`, `Ended`, `Delivered`, `Evidence`, `Issue`. No lane cells, mints, frames, waits,
   replays or disk codecs cross it. An adapter translates its runtime's reports into these.
3. **Oracles anchor reports to suite facts.** A case's timeline records, in order, what the suite
   drove (`Stepped`, `Answered`, `Reloaded`), what its server received (`Requested`) and what the
   runtime reported (`Reported`). An oracle checks a report against a suite fact; a check that
   compares reports only says so in its doc comment.
4. **Fixtures stay the prototype's for now.** Scenarios name fixtures by catalog name; the
   prototype adapter loads the prototype's typed fixtures (`prototypes/conformance/typed/`) and
   wires their services to the suite's fake network. The suite's expectations of a fixture live in
   `fixtures/reference.ts`, written from the fixture's source. When phase 4's compiler and public
   API exist, the fixtures move here, written in that API, and both adapters boot the same ones.
5. **Lies are source edits beside their oracle.** A `Lie` names its runtime, its edits (each must
   apply exactly once) and its cases; the `Guarantee` that holds it names the oracle that must
   catch it (round 2: one registry entry per oracle, so an oracle with no lie fails falsify).
   Falsify judges "caught" when that oracle is among those that failed a case in the failing step;
   red for another reason only is `BAD`.
6. **The runner is an edge and uses Effect**: bounded concurrency for `--parallel`, scoped
   copies, killable child processes with time bounds, Schema for the verdict line. The fake world
   is a synchronous simulator driven step by step, so it is plain owned state with one transition
   per operation, not services. `@effect/platform-node`'s runner is pinned to another Effect
   version and fails at run time, so `main.ts` calls `Effect.runFork` itself (suppressed with that
   reason).
7. **Runs use bun**: the prototype runtime is TypeScript that bun runs directly. Revisit when the
   prototype adapter retires.
8. **Determinism and ids** (round 2): the suite gives each boot a session seed as data
   (`Boot.sessionSeed`, distinct per page and world seed); the runtime mints its Attempt ids from
   it (WriteLanes R5). Prototype limit: round-14 cannot take a seed; it asks its host for every id,
   so the prototype adapter answers `att-<sessionSeed>-<n>` from the suite's seed. The adapter mints
   nothing else. The seed cases (WriteLanes T18: two Runtimes with different seeds never share an
   id; one seed replays the same ids) and their wrong runtime (a mint that ignores the seed, so two
   devices collide) are phase 4 builds: the wrong runtime is a production lie, written with the
   production mint.
9. **Seeds** (round 2): every case runs under world seeds 1 and 2.
10. **Attribution** (round 2): round-14 reports no actor on a mint, a decline or a delivery; the
    prototype adapter attributes each to the turn that follows it in the same report batch
    (prototype limit; production reports the actor itself).

## The Port

Built (round 2):

```ts
type Port = { name: string; boot: (boot: Boot) => Runtime };
type Boot = {
  fixtures: string[];
  captureMs: number;
  sessionSeed: number; // the runtime mints Attempt ids from it
  world: World;
  observe: (o: Observation) => void;
};
type Use = "story" | "host" | "component";
type Runtime = {
  ensure(actor, input: Option<unknown>, use: Use): void; // one use, creating the identity if needed
  ensureExisting(actor, use: Use): void; // one use of a live or restorable identity
  release(actor, use: Use): void; // ends one use; the grace decides the life
  send(actor, event, payload): void;
  dispose(actor): void;
  snapshot(actor): Snapshot; // Live { state, memory } | Absent
  row(actor, operation, key): Option<Row>; // the public O.x.get row
  pending(): boolean; // settling only
};
// Observation: Turn, Minted { actor }, Sent, Ended { actor (a decline's), failure (StillUnknown's) },
// Delivered { actor }, Parked, Unparked, Recorded { why: ignored | evidence | letGo },
// Unhandled, Denied { reasons }, Evidence { Superseded | Released | InFlight | NothingToResend |
// StorageFailure | StorageSilent }, Issue.
```

A reload is: kill the page (timers, tasks, held batches, live calls die; bytes and the server's log
stay; open requests become orphaned), `boot` again over the same world, `ensureExisting` each use
the case holds.

### Planned Port changes (the work list's needs; none exposes internals)

| Change                                      | Needed by                                                            | Shape (proposed)                                                                                                                                                | Status                                         |
| ------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Ending a use; the use's owner on attach     | Actors I10, I11 (lifetime), rule 73 cases                            | `release(actor, use)`; `use` on `ensure`                                                                                                                        | **built**                                      |
| Actor on a mint, a decline, a delivery      | `one-delivery` (who must run it)                                     | `actor: Option<ActorRef>` on `Minted`, `Ended`, `Delivered`                                                                                                     | **built** (prototype: attributed, decision 10) |
| Incarnation on `Turn`, `Delivered`, `Ended` | Actors I13 to I16 (`incarnations`), WriteLanes I15 "per incarnation" | `incarnation: string` (opaque, fresh per life)                                                                                                                  | planned                                        |
| A publish feed                              | Turn I1, I7, I9, I29, I30 (`publication`)                            | `observe(Published { actor, snapshot, revision })` per publication; snapshot identity by `revision`                                                             | planned                                        |
| Boot's result                               | Actors I3 to I6 (readiness)                                          | `boot` returns `Result<Runtime, BootFailed { diagnostics }>`; a `ready` observation                                                                             | planned                                        |
| A disk reader                               | WriteAhead I15 to I17 (`write-ahead`), Restore I1 to I8 (`restore`)  | `Port.disk: { heads(bytes), parked(bytes), leaves(bytes, actor), scope(key) }`, reading the runtime's own format from the suite's bytes, apart from its restore | planned                                        |
| Runtime disposal                            | Actors I29, I30; PAY-13, PAY-16 disposal variants                    | `Runtime.disposeRuntime()`                                                                                                                                      | planned                                        |
| Faults the Specs name                       | Turn I14 to I16 (refusal), Diagnostics                               | slot faults through the fixtures (a throwing guard or mapper is user code), never a runtime hook                                                                | planned                                        |

## Stated limits

- Fixtures are the prototype's typed fixtures (decision 4); a fixture's reference is hand-written.
- `Ended` and `Delivered` name an operation, not its machine: an operation name two booted
  machines share is not checked by mapping.
- `three-channels` requires an answered live send to end in the step it was answered.
- `one-delivery` forgets what was owed at a reload; what the disk carries is the `restore`
  oracle's (planned).
- Round-14 does not report the failure inside `unknown StillUnknown`; the check that it keeps its
  tag runs only when a runtime reports it (`Ended.failure`).
- The fake network ports `Ok`, `Fail`, `Lost`, `LostButLanded`, `Never`, `Die`, late answers,
  late landings, uninterruptible calls and answers at once; storage ports `ack`, `refuse`, `hang`,
  `landNoAck`; the clock and page port timers, tasks, hide and kill. The rest are work items.

## Guarantee map: the phase's work list

Each Spec Invariant, the oracle module that owns it, and the lie it must catch. "Case" means a
guarantee checked by cases' own expectations or a static check, not a per-step oracle. Prototype
lies and wrong runtimes named here are in `prototypes/conformance/falsify.ts`, `lie-cases/` and
`prototypes/round-14/mutants-*.ts`; each Spec's `tests` block names its cases. Items marked
**done** run now; the rest are pending, in a suggested order.

### WriteLanes (`specs/core/WriteLanes.spec`)

| Invariants                 | Oracle module                                                                              | Lies                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I3                         | `three-channels` **done**                                                                  | `lie.ending-without-id`, `k.failure-as-success`, `lie.still-unknown-dropped` **done**                                                                                                              |
| I6                         | `attempt-identity` **done**                                                                | `lie.resend-new-id`, `lie.resend-new-input` **done**; the seed cases and a seed-ignoring mint: phase 4 (decision 8)                                                                                |
| I7                         | `attempt-identity` (needs the Attempt id on `Row` or `Sent`)                               | write one: retryCount not counted                                                                                                                                                                  |
| I15, I16, I22              | `one-delivery` **done** (the ending ledger; I22's releasing lane needs a fragment fixture) | `a2.deliv-fail-samemail`, `d154.moved-fail-released`, `lie.released`, `e8.wa-failure` **done**; `d154.moved-save-released`, `a3.park-*`, `a4.refused-*` with their fixtures                        |
| I8, I9, I11, I12, I20, I21 | `lane-cells`                                                                               | `lie.serialize-as-latest`, `lane.queue-unbounded`, `lane.promote-skips-durable`, `lost.letgo-silent`, the `1b.cancel-all-*` and `audit-1.cancel-all-*` wrong runtimes, a fresh mint on a Held lane |
| I10, I13, I14              | `members`                                                                                  | `d123.keyless-idle-heads-only`, `1b.r43-keyless-falls-back-to-key`, `r15b.keyless-success-names-key-lane`; write one applying members to the pre-turn lane                                         |
| I1, I23                    | `members-only` (an adapter-side spy counting invocations)                                  | write one replaying a commit on re-entry                                                                                                                                                           |
| I2, I19                    | `write-before-ending`                                                                      | write one queueing the ending first                                                                                                                                                                |
| I4, I5                     | case (front-end)                                                                           | `ReservedReason`, `UnknownNotUncertain` wrong runtimes                                                                                                                                             |
| I17                        | `old-version-holds`                                                                        | `p1m.*`, `audit-1.old-version-declines-under-reject-only`, `1b.old-version-idle-passes`, `d78-no-evidence`                                                                                         |
| I18                        | case                                                                                       | `d114.input-not-replaced`                                                                                                                                                                          |

### Turn (`specs/core/Turn.spec`)

| Invariants           | Oracle module                                                                                           | Lies                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| I1, I7, I9, I29, I30 | `publication` (one leaf, one publish per turn, snapshots never mutated: the prototype's in-place guard) | `w.patch-in-place`, `w.row-in-place`                             |
| I2, I3, I5, I6, I8   | `selection` (needs the reference model `prototypes/conformance/reference/model.ts`, ported)             | `g.late-unhandled`, rule-14 routing lies                         |
| I4, I10, I11         | `activations`                                                                                           | write from Turn tests                                            |
| I12, I13, I17, I19   | `turn-purity` (replay: the prototype's S11)                                                             | `lyingReplay`, `constantHash` broken adapters                    |
| I14, I15, I16        | `refusal`                                                                                               | `a4.refused-*`, `a4p.refused-turn`                               |
| I18                  | case                                                                                                    |                                                                  |
| I20 to I23           | `schedules`                                                                                             | timer lies in `mutants-r15*.ts`                                  |
| I24, I25             | `placements`                                                                                            |                                                                  |
| I26, I27             | `late-routing` (rule 14/15)                                                                             | `k.late-as-current`, `1b.r15-lateness-transitive` (re-expressed) |
| I28                  | `context`                                                                                               |                                                                  |
| I31                  | `issues`                                                                                                | `bogusIssue` broken adapter                                      |

### Actors (`specs/core/Actors.spec`)

| Invariants         | Oracle module                                                                  | Lies                                                          |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| I1 to I6           | case (setup and readiness)                                                     |                                                               |
| I7 to I9, I25      | `identity`                                                                     | `q5.send-stolen`, `ref.binding-first-copy`                    |
| I10, I11, I12, I17 | `lifetime` (rule 73's global invariants: the prototype's `lifetimeViolations`) | `k.ghost-life`, `lie.dispose-start`                           |
| I13 to I16, I18    | `incarnations`                                                                 | `h.boot-*`, `k.parked-every-boot-silent`, `k.parked-reversed` |
| I19 to I24         | `mailbox`                                                                      | `k.send-ahead`, the boot-queue bound (U8)                     |
| I26 to I28         | `cuts-and-context`                                                             |                                                               |
| I29 to I32         | `disposal`                                                                     | `lie.boot-says-disposed`, `lie.boot-drops-held`               |
| I33, I34           | case                                                                           |                                                               |

### WriteAhead (`specs/core/WriteAhead.spec`)

| Invariants                          | Oracle module                                                                                                                  | Lies                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| I15, I16, I17                       | `write-ahead` (the prototype's oracle (h), rewritten against the storage host; needs a disk reader on the Port or the adapter) | `lie.still-unknown-dropped` (red by (h) in the old suite), `e8.wa-*`, `q1.wa-eq-any` |
| I5, I7, I10, I11, I14               | `capture` (oracle (g): one write out per key; cuts)                                                                            | `h.boot-copy`, `k.drop-copy`, `k.drop-row`                                           |
| I1 to I4, I6, I8, I9, I12, I13, I18 | `persistence` and cases                                                                                                        |                                                                                      |

### Restore (`specs/core/Restore.spec`)

| Invariants | Oracle module                                                                      | Lies                                                                                             |
| ---------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| I1 to I8   | `restore` (anchored to the bytes the suite owns; the prototype's stage K/L anchor) | `h.restore-at-send`, `k.restored-as-success`, `k.restored-from-root`, `k.no-boot-ev+*`           |
| I9 to I17  | `quarantine` and cases                                                             | `lie.m1.quarantine-beside-old-hold`, migration wrong runtimes (`mutants-p1m.ts`, `-am1`, `-am2`) |
| I18        | case                                                                               |                                                                                                  |

### Reads (`specs/core/Reads.spec`)

| Invariants           | Oracle module | Lies                           |
| -------------------- | ------------- | ------------------------------ |
| I7, I8, I9, I11, I12 | `lookups`     | `drain.*` search kills         |
| I15, I16, I17        | `optimistic`  | `lie.settled-*`                |
| I1 to I5, I18, I19   | cases         | `lie:a3.like-row-hidden` (I18) |

### Compile, Diagnostics, Codec, StaticCli

Static guarantees: checked by cases over `Compiled` and the CLI, not by per-step oracles. Their
work item is one case module each (`scenarios/compile.ts`, `diagnostics.ts`, `codec.ts`,
`cli.ts`), porting `prototypes/round-14/checks/front-check.ts`, the CLI pins and the graph gate
(StaticCli I2: every edge name equals the turn record's).

### The rest of the rewrite

1. The fake world's remaining behaviours: answers `apply`, `applyLost`, `truth`, `atStart`,
   `inFlight`, `applyFail`, `interrupted`; faults (`forgetKeys`, `microAnswer`, scheduler
   shuffle, timer `lateCancel`); storage `failLate`, plain-write failures, slow and failing loads,
   wipe, tear, corrupt; the clock set back and frozen timers; streams (sockets, EventSource,
   WebSocket).
2. All scenarios ported (about 1,080 cases), area by area with their oracles. Pay: PAY-01 to
   PAY-16 ported where the Port reaches (STATUS.md lists the 17 variants not yet ported and why);
   PAY-17 to PAY-20 pending.
3. Searches (`prototypes/conformance/search/`) as a runner mode; mutants (`mutants-*.ts`) as
   lies; `--parallel` for both.
4. The verdict compare: each ported area's verdicts against the old suite's on the same cases.
5. The four-angle audit and re-audit; the fast gates in `nub run verify`.
6. The round-14 carry list: the table below.

## Round-14 carry list

Every item of `prototypes/round-14/STATUS.md`, "Carried to the phase 3 conformance rewrite", with
its owner here: an oracle or case module above, a runner part, a later phase, or dropped with a
reason. Proposed by the runner; not yet built unless marked.

| Carry item                                                                                                                                                                                                                                                                                                                                                    | Owner                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1, the errno rule (a rewrapped resource errno reads as a case FAIL)                                                                                                                                                                                                                                                                                          | runner: a child's resource error is a `NoVerdict`, never a case verdict (built for children; a case-level errno rule with the runner's verdict work)        |
| C3, plant reasons and preconditions (B12a, B17, the B15 race, B11/B4/B9, B5 119 and K)                                                                                                                                                                                                                                                                        | dropped: plants check the prototype harness against its own history; the new suite's falsify (lies with named oracles, null runtime, control) replaces them |
| `bare`'s depth-12 search budget; work-peak for search configurations                                                                                                                                                                                                                                                                                          | runner: searches mode (rest item 3)                                                                                                                         |
| Search oracles keeping history outside the state hash (`deliveredOnce`, `keptNames`, `endedAgain`)                                                                                                                                                                                                                                                            | runner: searches mode; a search oracle reads only what the state hash carries                                                                               |
| OS limits: uninterruptible sleep, `setsid` between polls, a foreign SIGKILL, EMFILE                                                                                                                                                                                                                                                                           | runner `child.ts`: process-group kill and a watchdog (stated limits until built)                                                                            |
| Partly-blind evidence when `ps` fails; `search-budget`/`search-reach` notes                                                                                                                                                                                                                                                                                   | runner: mutants and searches modes report them as notes                                                                                                     |
| Migration against a real storage API shape (IndexedDB structured clone, `localStorage` text)                                                                                                                                                                                                                                                                  | phase 5: host adapters, with the `restore` oracle                                                                                                           |
| `listen.none` at depth 7 inconclusive                                                                                                                                                                                                                                                                                                                         | phase 5: streams                                                                                                                                            |
| Harness excuses per actor, not per lane (M2 item 16, M1 finding 6)                                                                                                                                                                                                                                                                                            | `one-delivery` **done**: a recorded ending's cause is per Attempt (its owner, its superseding), never a whole actor's                                       |
| Weak case: C202 eviction by last write vs creation order                                                                                                                                                                                                                                                                                                      | phase 5: streams                                                                                                                                            |
| Weak case: C168 restore after a crash before the removal ack                                                                                                                                                                                                                                                                                                  | `restore`                                                                                                                                                   |
| Weak case: C166 live-admission throw tested on reload only                                                                                                                                                                                                                                                                                                    | `refusal` (Turn I14)                                                                                                                                        |
| Weak case: C184's message check                                                                                                                                                                                                                                                                                                                               | Diagnostics cases                                                                                                                                           |
| Weak cases: jitter determinism; rule 70's wait per operation                                                                                                                                                                                                                                                                                                  | phase 5: streams                                                                                                                                            |
| Round7/8/9/9b literal lane and actor key templates (about 40 assertions)                                                                                                                                                                                                                                                                                      | dropped: the Port never shows a runtime's keys; those cases assert through the disk reader (planned) by meaning, not spelling                               |
| `a3b.resend-behind-settled`, `a3b.keyed-from-first-entity`, `a3b.restored-counts-unsent`, `a3b.keyed-cancel-names-the-ending`                                                                                                                                                                                                                                 | phase 5: entities                                                                                                                                           |
| `audit-2.covers-ended-remembers`, `audit-2.rebase-any-base`                                                                                                                                                                                                                                                                                                   | phase 5: entities                                                                                                                                           |
| `1b.r15-lateness-transitive` (re-expressed as a lateness-transitive lie)                                                                                                                                                                                                                                                                                      | `late-routing` (Turn I26, I27)                                                                                                                              |
| Streams: T3's 256-entry bound across two operations; rule 70's wait per operation; two writes re-creating an evicted entry                                                                                                                                                                                                                                    | phase 5: streams                                                                                                                                            |
| Design items not built (LIFE-19, 20, 25, 26; J; the ending phase and `NotAdopted`; `ScheduleLeadsToWrite`; `IdentityFieldOptional`; the read-only input pin; `InputIgnored`; `orphaned`; `ConflictingActorRef`'s context half; the quiet mark's `fields`; rule 29's `cancel` check; key-equality adoption; `previous` beyond retry; rule 74's ends by forget) | phase 4 builds each; its case lands with the Spec module that owns it (Compile and StaticCli cases, or the oracle above)                                    |
| `SharedContract`: two placements of one writing fragment; the widened `key: []` warning; rule 13's `byReason` keys                                                                                                                                                                                                                                            | Compile and StaticCli cases (phase 4 builds)                                                                                                                |
| Migration: a crash between moving a lane and deleting the old name                                                                                                                                                                                                                                                                                            | `restore` (WriteAhead I10)                                                                                                                                  |
| `forget`'s `goneOp` parsing a quarantined lane without `upgraded`                                                                                                                                                                                                                                                                                             | `disposal` (Actors I32)                                                                                                                                     |
| U8: the boot-queue bound at two points; `structure`'s `seen.delete` with no mutant                                                                                                                                                                                                                                                                            | `mailbox` (Actors I22); Codec cases                                                                                                                         |
| Production tags formats from its first release                                                                                                                                                                                                                                                                                                                | `restore` (record formats; phase 4 builds)                                                                                                                  |
