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
```

`falsify` runs, in order: the null runtime (every case must state a failure), the control (each
lie's cases pass on the unedited runtime), then each lie on its own edited copy of the runtime in
`--scratch` (default the OS temp dir; removed after). It ends `VERDICT pass` only when every lie is
caught by the oracle named beside it. `nub run check` lints and type-checks the suite.

## Layout

| Path                    | What it is                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `port.ts`               | The `Port`: the whole contract between the suite and a runtime.                                                                                                                                                           |
| `adapters/prototype.ts` | The Port over round-14: loads its `adapter.ts` and typed fixtures by path.                                                                                                                                                |
| `adapters/null.ts`      | A runtime that does nothing; falsify requires every case to fail on it.                                                                                                                                                   |
| `world/`                | The fake world, one module per host: `clock.ts`, `network.ts`, `storage.ts`, `lifecycle.ts` (the page: generation, task queue, Effect scheduler, visibility); `world.ts` composes them and owns settle, advance and kill. |
| `dsl/case.ts`           | The scenario DSL: `Scenario` and the `Case` driver. Steps settle the world and run every oracle.                                                                                                                          |
| `oracles/`              | One module per guarantee (`<name>.ts`) with its lies beside it (`<name>.lies.ts`); `oracle.ts` holds the timeline (`Fact`), `Oracle` and `Lie`.                                                                           |
| `fixtures/reference.ts` | The suite's own expectations of each fixture, written by hand from the fixture's source.                                                                                                                                  |
| `scenarios/`            | Cases, one file per area.                                                                                                                                                                                                 |
| `suite.ts`              | The registry: every oracle, lie and case.                                                                                                                                                                                 |
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
   apply exactly once), its cases and the oracle that must catch it. Falsify judges "caught" only
   by that oracle; red for another reason is `BAD`.
6. **The runner is an edge and uses Effect**: bounded concurrency for `--parallel`, scoped
   copies, killable child processes with time bounds, Schema for the verdict line. The fake world
   is a synchronous simulator driven step by step, so it is plain owned state with one transition
   per operation, not services. `@effect/platform-node`'s runner is pinned to another Effect
   version and fails at run time, so `main.ts` calls `Effect.runFork` itself (suppressed with that
   reason).
7. **Runs use bun**: the prototype runtime is TypeScript that bun runs directly. Revisit when the
   prototype adapter retires.
8. **Determinism**: a world's seed is fixed per case; ids come from the host as
   `att-<sessionSeed>-<n>` with a session seed per page.

## The Port

```ts
type Port = { name: string; boot: (boot: Boot) => Runtime };
type Boot = {
  fixtures: string[];
  captureMs: number;
  world: World;
  observe: (o: Observation) => void;
};
type Runtime = {
  ensure(actor, input: Option<unknown>): void; // one use, creating the identity if needed
  ensureExisting(actor): void; // one use of a live or restorable identity
  send(actor, event, payload): void;
  dispose(actor): void;
  snapshot(actor): Snapshot; // Live { state, memory } | Absent
  row(actor, operation, key): Option<Row>; // the public O.x.get row
  pending(): boolean; // settling only
};
```

A reload is: kill the page (timers, tasks, held batches, live calls die; bytes and the server's log
stay), `boot` again over the same world, `ensureExisting` each use the case holds.

## Stated limits (round 1)

- Fixtures are the prototype's typed fixtures (decision 4); a fixture's reference is hand-written.
- `Ended` and `Delivered` name an operation, not its machine: an operation name two booted
  machines share is not checked by mapping.
- `three-channels` judges an ending against the server's answer only in the step that answered.
- The fake network ports `Ok`, `Fail`, `Lost`, `LostButLanded`, `Never`, `Die`; storage ports
  `ack` and `refuse`; the clock and page port timers, tasks, hide and kill. The rest of the
  prototype fake's behaviours are work items below.

## Guarantee map: the phase's work list

Each Spec Invariant, the oracle module that owns it, and the lie it must catch. "Case" means a
guarantee checked by cases' own expectations or a static check, not a per-step oracle. Prototype
lies and wrong runtimes named here are in `prototypes/conformance/falsify.ts`, `lie-cases/` and
`prototypes/round-14/mutants-*.ts`; each Spec's `tests` block names its cases. Items marked
**done** run now; the rest are pending, in a suggested order.

### WriteLanes (`specs/core/WriteLanes.spec`)

| Invariants                 | Oracle module                                                             | Lies                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I3                         | `three-channels` **done**                                                 | `k.failure-as-success`, `lie.still-unknown-dropped` **done**; port `e8.wa-failure`                                                                                                                 |
| I6                         | `attempt-identity` **done**                                               | `lie.resend-new-id`, `lie.resend-new-input` **done**; Q4's colliding counter (T18, two Runtimes)                                                                                                   |
| I7                         | `attempt-identity` (needs the Attempt id on `Row` or `Sent`)              | write one: retryCount not counted                                                                                                                                                                  |
| I15, I16, I22              | `one-delivery` (the ending ledger: the prototype's oracle (j), rewritten) | `a2.deliv-fail-samemail`, `d154.moved-fail-released`, `lie.released`, `d154.moved-save-released`                                                                                                   |
| I8, I9, I11, I12, I20, I21 | `lane-cells`                                                              | `lie.serialize-as-latest`, `lane.queue-unbounded`, `lane.promote-skips-durable`, `lost.letgo-silent`, the `1b.cancel-all-*` and `audit-1.cancel-all-*` wrong runtimes, a fresh mint on a Held lane |
| I10, I13, I14              | `members`                                                                 | `d123.keyless-idle-heads-only`, `1b.r43-keyless-falls-back-to-key`, `r15b.keyless-success-names-key-lane`; write one applying members to the pre-turn lane                                         |
| I1, I23                    | `members-only` (an adapter-side spy counting invocations)                 | write one replaying a commit on re-entry                                                                                                                                                           |
| I2, I19                    | `write-before-ending`                                                     | write one queueing the ending first                                                                                                                                                                |
| I4, I5                     | case (front-end)                                                          | `ReservedReason`, `UnknownNotUncertain` wrong runtimes                                                                                                                                             |
| I17                        | `old-version-holds`                                                       | `p1m.*`, `audit-1.old-version-declines-under-reject-only`, `1b.old-version-idle-passes`, `d78-no-evidence`                                                                                         |
| I18                        | case                                                                      | `d114.input-not-replaced`                                                                                                                                                                          |

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

| Invariants           | Oracle module | Lies                                                   |
| -------------------- | ------------- | ------------------------------------------------------ |
| I7, I8, I9, I11, I12 | `lookups`     | `lie:a3.like-row-hidden` (I18), `drain.*` search kills |
| I15, I16, I17        | `optimistic`  | `lie.settled-*`                                        |
| I1 to I5, I18, I19   | cases         |                                                        |

### Compile, Diagnostics, Codec, StaticCli

Static guarantees: checked by cases over `Compiled` and the CLI, not by per-step oracles. Their
work item is one case module each (`scenarios/compile.ts`, `diagnostics.ts`, `codec.ts`,
`cli.ts`), porting `prototypes/round-14/checks/front-check.ts`, the CLI pins and the graph gate
(StaticCli I2: every edge name equals the turn record's).

### The rest of the rewrite

1. The fake world's remaining behaviours: answers `apply`, `applyLost`, `truth`, `atStart`,
   `inFlight`, `applyFail`, `interrupted`; faults (`lateAnswer`, `landLate`, `forgetKeys`,
   `uninterruptibleHang`, `syncAnswer`, `microAnswer`, scheduler shuffle, timer `lateCancel`);
   storage `hang`, `landNoAck`, `failLate`, plain-write failures, slow and failing loads, wipe,
   tear, corrupt; the clock set back and frozen timers; streams (sockets, EventSource, WebSocket).
2. All scenarios ported (about 1,080 cases), area by area with their oracles.
3. Searches (`prototypes/conformance/search/`) as a runner mode; mutants (`mutants-*.ts`) as
   lies; `--parallel` for both.
4. The verdict compare: each ported area's verdicts against the old suite's on the same cases.
5. The four-angle audit and re-audit; the fast gates in `nub run verify`.
6. The round-14 carry list (`prototypes/round-14/STATUS.md`, "Carried to the phase 3 conformance
   rewrite"): every item lands with the oracle or case that owns it, or is named dropped with a
   reason in STATUS.md.
