# Conformance suite

The production conformance suite for Flow State v3: it runs the core Specs' guarantees
(`workflow/specs/core/*.spec`) against a runtime through one `Port`. It runs on the prototype runtime
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
bun conformance/runner/main.ts falsify --sweep --parallel 5 --scratch <dir>   # every mutant on every case
bun conformance/runner/main.ts coverage                   # every core Invariant checked or owned (nub run conformance:coverage)
```

Every case runs under world seeds 1 and 2 (store load order, session seeds); a case fails on the
first seed that fails it. `coverage` (Conformance R12, I38) reads every Invariant of the ten core
Specs with `workflow show @spec.<name> --json` and fails unless each is checked (an oracle's
guarantee names it and one of that oracle's mutants expects it) or listed once in `not-yet.ts`
with the Task that owns it; a row that still lists a checked Invariant, and an Invariant no core
Spec has, fail it too. `falsify` checks, in order: the coverage gate; every oracle has a mutant for this runtime; the
null runtime (every case must state a failure); the control (each mutant's cases pass on the
unedited runtime); then each mutant on its own edited copy of the runtime in `--scratch` (default the
OS temp dir; removed after). It ends `VERDICT pass` only when every mutant is caught by its own
guarantee's oracle. `--sweep` runs each mutant on every case and lists the red ones (for verdict
comparisons). `nub run check` lints and type-checks the suite, then runs the Effect language
service (`nub run check:effect`, `@effect/tsgo`), whose warnings fail it too. `--json` and every
mode set a non-zero exit code on a failure.

Every case ends with a judged Runtime disposal (`playCase` in `dsl/case.ts`), as steps every oracle
judges: dispose the Runtime (unless this boot's disposal already started), answer every held store
write, advance past the 5 s disposal bound, answer the writes again, expect the disposal ended
(Actors R22, R23), and reload, so the `disposal` oracle sees which lanes survived.

## Layout

| Path                    | What it is                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `port.ts`               | The contract between the suite and a runtime: `Port` (`boot`), `Boot`, `Runtime`, `Observation`, `Snapshot`, `ActorRef`, `Json`.                                                                                                                                                                                                                                                                         |
| `adapters/prototype.ts` | `prototypePort` over round-14, and `loadPrototype` (its `adapter.ts` and typed fixtures, by path). `prototype-observations.ts` decodes its evidence into observations.                                                                                                                                                                                                                                   |
| `adapters/null.ts`      | `nullPort`: a runtime that does nothing; falsify requires every case to fail on it.                                                                                                                                                                                                                                                                                                                      |
| `world/`                | The fake world, plain owned state: `WorldClock`, `Page` (generation, task queue, Effect `Scheduler`, visibility), `Storage`, `Network`; `makeWorld` owns settle, advance and kill.                                                                                                                                                                                                                       |
| `dsl/case.ts`           | The scenario DSL: `Scenario` (`run: (c: Case) => void`) and `playCase`, which runs one per case and seed and ends it with a judged disposal. Inside, the runtime's life (boot, reboot), the step engine (record, run, settle, note requests, judge; the timeline is its fact array) and the `Case` surface.                                                                                              |
| `dsl/actor.ts`          | The typed actor view `c.actor(fixture, id)` gives, over the `Case`'s own steps.                                                                                                                                                                                                                                                                                                                          |
| `dsl/oracle.ts`         | The timeline (`Fact`); `Judge` (an oracle as a step fold with typed `Violation`s and `InvariantId` guarantees) registered with `oracle`; `Mutant` and `Guarantee`; the failures a case throws, `Violated` and `Mismatch`. `dsl/domain.ts`: `attemptKey`, `LaneId`, `laneAtMint`, `laneAtSend`, `endingOf`.                                                                                               |
| `<area>/`               | One folder per core Spec area (`write-lanes/`, `actors/`, ...). Each check by its behaviour (`<check>.ts`, such as `ending-channels.ts`) with its mutants beside it (`<check>.mutants.ts`), and the cases by behaviour (`<behaviour>.scenarios.ts`, such as `payment-retry.scenarios.ts`); a case keeps its old-suite id (`PAY-nn`, `LANE-nn`, `DLV-nn`) in its `id` field for the old-suite comparison. |
| `fixtures/`             | The suite's fixtures: `fixture.ts` (the `Fixture` type: Schemas of events, memory, input and write keys), `pay.ts`, `one-lane.ts` (one-lane machines per lane policy); `reference.ts`, the expectations of each write written by hand from the fixture's source; `pay-steps.ts`, the Pay cases' shared steps and constants (T40, S4).                                                                    |
| `suite.ts`              | The registry: every guarantee (oracle and its mutants) and every case. `coverage.ts`: the coverage gate's rule; `not-yet.ts`: the Invariants each owning Task still owes.                                                                                                                                                                                                                                |
| `runner/`               | `main.ts` (CLI), `run.ts` (cases in process), `falsify.ts` (mutants on copies), `child.ts` (bounded child processes), `verdict.ts` (the verdict line children print), `specs.ts` (the core Specs' Invariants, read with the workflow CLI).                                                                                                                                                               |

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
5. **Mutants are source edits beside their oracle.** A `Mutant` names its runtime, its edits (each must
   apply exactly once) and its cases; the `Guarantee` that holds it names the oracle that must
   catch it (round 2: one registry entry per oracle, so an oracle with no mutant fails falsify).
   Falsify judges "caught" when that oracle failed a case with a violation naming the Invariant the
   mutant `expects` (T6 review, L2); red for another reason only is `BAD`.
6. **The fake world is plain owned state with synchronous steps; scenarios are plain functions**
   (round 5, the user's call). Round 4 (commit `c7f72a9c`, with `3097ea3c`'s fixes) made the
   `Runtime`, the world's hosts, the `Timeline` and the `Case` Effect services with scoped
   Layers; round 5 reverted that restructure, for the user's reason: the scenarios had to
   `yield*` every step, which was noise that turned simple code into noisy code. Everything else
   from round 4 stays (typed fixtures and actor views, the JSON Port, the review fixes and mutants).
   - A `Port` (`port.ts`) has one operation, `boot(boot) => Runtime`: `prototypePort(loaded)` and
     `nullPort` now, a production one in phase 4. `Boot` carries the boot's parameters and the
     world's `hosts`. A reload kills the page, drops the dead page's Runtime without disposing it
     (a dead page runs nothing) and boots again over the same world.
   - The world (`makeWorld(seed)`) is plain state owned by one case: its hosts `WorldClock`,
     `Page`, `Storage` and `Network` are records of the host's synchronous primitives (as a
     page's `setTimeout` and IndexedDB callbacks are), which the prototype's host takes as
     callbacks; the world owns settle, advance and kill.
   - `playCase` runs a `Case` per case and seed. A scenario's `run` is a plain function
     `(c: Case) => void`; steps throw `Violated`, expectations throw `Mismatch`, and anything else
     thrown is a defect. The runner turns each into a `Fail`.
   - Oracles are step folds (T40, S1): `start(reference)`, then `step(state, step, requests)` returns the next state and that step's violations; the Case keeps each oracle's state, folds only the new facts and keeps every violation.
   - Effect stays at the edges: the runner (process, bounded concurrency for `--parallel`, scoped
     copies, killable child processes with time bounds, Schema for the verdict line), loading the
     prototype by path, and Schema decoding at the adapter boundary. `@effect/platform-node`'s
     runner is pinned to another Effect version and fails at run time, so `main.ts` calls
     `Effect.runFork` itself (suppressed with that reason).
   - What phase 4 must add for a production runtime, none of it built yet: Effect's own `Clock`
     (time and sleeps on `WorldClock`'s timers) and `Scheduler` (fibers on `Page`'s queue) for
     the production runtime, if its host reads time and runs fibers through them; a storage port
     in production's own host contract over `Storage`; and the production Port.
7. **Runs use bun**: the prototype runtime is TypeScript that bun runs directly. Revisit when the
   prototype adapter retires.
8. **Determinism and ids** (round 2): the suite gives each boot a session seed as data
   (`Boot.sessionSeed`, distinct per page and world seed); the runtime mints its Attempt ids from
   it (WriteLanes R5). Prototype limit: round-14 cannot take a seed; it asks its host for every id,
   so the prototype adapter answers `att-<sessionSeed>-<n>` from the suite's seed. The adapter mints
   nothing else. The seed cases (WriteLanes T18: two Runtimes with different seeds never share an
   id; one seed replays the same ids) and their wrong runtime (a mint that ignores the seed, so two
   devices collide) are phase 4 builds: the wrong runtime is a production mutant, written with the
   production mint.
9. **Seeds** (round 2): every case runs under world seeds 1 and 2.
10. **Attribution** (round 2): round-14 reports no actor on a mint, a decline or a delivery; the
    prototype adapter attributes each to the turn that follows it in the same report batch
    (prototype limit; production reports the actor itself).
11. **Typed fixtures, JSON Port** (round 4): the `Runtime` is the same for every fixture,
    so its values (event payloads, inputs, keys, memory) are `Schema.Json`. A fixture
    (`fixtures/fixture.ts`) carries the Schemas of its events, memory, input and write keys;
    `Case.actor(Pay, "shopper-1")` gives a view typed by them, which encodes values with
    `Schema.toCodecJson` on the way in and decodes memory on the way out, so a wrong event name,
    payload, memory field or row key is a type error. The fixtures are imported statically by
    the scenarios; the Schemas are written by hand from the prototype fixture's source, because
    round-14's typed fixtures do not export their definitions' Schemas and its `Fixture` type
    erases them; the prototype adapter still loads the fixture code by path, so an edited copy
    under falsify runs its own. Phase 4's fixtures are written in the public API and give these
    Schemas directly. `unknown` stays only where round-14 returns untyped values (state,
    memory, rows, evidence, a client's request body): each is decoded once at the adapter, with
    a `FLOW_STATE_ALLOW_UNKNOWN:` reason where the lint cannot see the decode. Values compare
    with `Schema.toEquivalence` (`sameActor`, `sameJson`); a case's `eq` uses Effect's structural
    `Equal.equals`.

## The Port

Built (rounds 2 to 4; round 4 made its values JSON; round 5 reverted round 4's services):

```ts
type Port = { boot(boot: Boot): Runtime }; // one per runtime: prototypePort(loaded), nullPort
type Boot = {
  fixtures: string[]; // catalog names
  captureMs: number;
  sessionSeed: number; // the runtime mints Attempt ids from it
  hosts: Hosts; // clock, page, storage, network
  observe: (o: Observation) => void;
};
type Use = "story" | "host" | "component";
type Runtime = {
  ensure(actor, input: Option<Json>, use: Use): void; // one use, creating the identity if needed
  ensureExisting(actor, use: Use): void; // one use of a live or restorable identity
  release(actor, use: Use): void; // ends one use; the grace decides the life
  forget(actor): void; // removes the record; held lanes stay unbound until an adopting ensure
  send(actor, event, payload: Json): void;
  dispose(actor): void;
  disposeRuntime(): void; // starts the Runtime's disposal; RuntimeDisposed reports its end
  snapshot(actor): Snapshot; // Live { state, memory: Json } | Absent
  row(actor, operation, key: Json): Option<Json>; // the public O.x.get row; the fixture decodes it by policy (Reads R14)
  pending(): boolean; // settling only
};
// Observation: Turn, Minted { actor, key }, Sent, Ended { actor (a decline's), failure (StillUnknown's) },
// Delivered { actor }, Parked, Unparked, Recorded { why: ignored | evidence | letGo },
// Unhandled, Denied { reasons }, Evidence { Superseded | Released | InFlight | NothingToResend |
// StorageFailure | StorageSilent }, Issue, RuntimeDisposed.
```

The suite's own timeline facts (round 3 adds the last three): `Stepped`, `Requested`,
`Answered`, `Reported`, `Reloaded`, `Disposed`, `Ensured`, `DisposingRuntime`, `Drove { actor,
event }` (an event the suite sent) and `Unstoppable { operation }` (calls made uninterruptible);
round 4 adds `Released { actor, use }`, so the uses a reload re-attaches are derived from facts.

A reload is: kill the page (timers, tasks, held batches, live calls die; bytes and the server's log
stay; open requests become orphaned), `boot` again over the same world, `ensureExisting` each use
the case holds.

### Planned Port changes (the work list's needs; none exposes internals)

| Change                                      | Needed by                                                            | Shape (proposed)                                                                                                                                                | Status                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Ending a use; the use's owner on attach     | Actors I10, I11 (lifetime), rule 73 cases                            | `release(actor, use)`; `use` on `ensure`                                                                                                                        | **built**                                                                                                    |
| Actor on a mint, a decline, a delivery      | `delivered-once` (who must run it)                                   | `actor: Option<ActorRef>` on `Minted`, `Ended`, `Delivered`                                                                                                     | **built** (prototype: attributed, decision 10)                                                               |
| Incarnation on `Turn`, `Delivered`, `Ended` | Actors I13 to I16 (`incarnations`), WriteLanes I15 "per incarnation" | `incarnation: string` (opaque, fresh per life)                                                                                                                  | planned                                                                                                      |
| A publish feed                              | Turn I1, I7, I9, I29, I30 (`publication`)                            | `observe(Published { actor, snapshot, revision })` per publication; snapshot identity by `revision`                                                             | planned                                                                                                      |
| Boot's result                               | Actors I3 to I6 (readiness)                                          | `boot` returns `Result<Runtime, BootFailed { diagnostics }>`; a `ready` observation                                                                             | planned                                                                                                      |
| A disk reader                               | WriteAhead I15 to I17 (`write-ahead`), Restore I1 to I8 (`restore`)  | `Port.disk: { heads(bytes), parked(bytes), leaves(bytes, actor), scope(key) }`, reading the runtime's own format from the suite's bytes, apart from its restore | planned                                                                                                      |
| Runtime disposal                            | Actors I29, I30; PAY-13, PAY-16 disposal variants                    | `Runtime.disposeRuntime()`; `RuntimeDisposed` when it ends                                                                                                      | **built** (round 3)                                                                                          |
| forget                                      | Actors I32                                                           | `Runtime.forget(actor)`                                                                                                                                         | **built** (T6)                                                                                               |
| The Attempt's key on `Minted`               | `lane-queue` on keyed operations (lanes per key, WriteLanes R6)      | `key: Option<Json>` on `Minted` (a public Attempt field, R5)                                                                                                    | **built** (round 4; round-14 reports `None`: its mint carries no key, so lanes stay per actor and operation) |
| Faults the Specs name                       | Turn I14 to I16 (refusal), Diagnostics                               | slot faults through the fixtures (a throwing guard or mapper is user code), never a runtime hook                                                                | planned                                                                                                      |

## Stated limits

- Fixtures are the prototype's typed fixtures (decision 4); a fixture's reference is hand-written.
- `Ended` and `Delivered` name an operation, not its machine: an operation name two booted
  machines share is not checked by mapping.
- `ending-channels` requires an answered live send to end in the step it was answered.
- `delivered-once` forgets what was owed at a reload; what the disk carries is the `restore`
  oracle's (planned).
- Round-14 does not report the failure inside `unknown StillUnknown`; the check that it keeps its
  tag runs only when a runtime reports it (`Ended.failure`). Making it strict turns PAY-05 and
  PAY-16/restore-keeps-mayHaveApplied red on round-14; the adapter will not fill the failure in
  from the suite's own `Answered` fact, since that would report for the runtime what it did not.
  Production must report it, and the check becomes strict with the production adapter.
- The Port requires `Minted.key` on keyed operations (orchestrator decision, 2026-11-10);
  round-14's mint carries no key, a stated limit, so on round-14 a keyed Attempt is named at its
  first send from the request's input, and is judged by no lane check before it (review M1).
- `lane-queue` accepts a Held head's re-send after any suite-driven turn of its actor since it was
  held (a retry, or the answer that triggers one); a re-send riding on an unrelated driven event
  is not caught. A per-operation map of retrying events in the reference would tighten it.
- Actors are required on `Minted` (a `None` is a violation in `lane-queue` and `delivered-once`);
  round-14 reports none, so its adapter attributes each to the turn that follows (decision 10).
- `delivered-once` counts an ending decided after the Runtime's disposal began as parked at the next
  reload; whether the runtime parked it is the `restore` oracle's (the Port shows no parked
  records). An `InvalidTurn` or `UnmappedEnding` issue settles a delivery only when it is the one
  pending in its step (`Issue` carries no event or actor).
- Round-14 has no idle row: a key with no lane reads `None`, where Reads R14 makes `O.x.get`
  total (the idle row). Cases expect `None` for "lane gone"; production must return the idle row,
  and those expectations change with the production adapter.
- The end-of-case disposal answers every held store write before and after the bound, so it
  judges disposal with a store that answers; a store that hangs through a disposal is judged only by
  cases that drive it.
- `disposal` judges a Held head only when the server received it and the reload attaches its
  actor (the end of every case attaches each actor that minted a write), and a never-sent commit
  by the runtime's own `Minted` and `Ended`; a handler's own cancel is known from the runtime's
  `Released` evidence while the suite holds a use of its actor (lenient: a runtime that claims a
  release it did not make is caught only by the cases that count `Released`, PAY-03, LANE-03 and
  LANE-09). `Delivered` carries no channel, so a parked ending counts whichever it was.
- The order of a lane's endings at a boot after Runtime disposal is judged only for the hold-last
  rule (Actors I31). The prototype suite's `1b.disposal-definite-w-first` (a definite head's
  ending after its queue's NotSent { Disposed }) breaks mint order, which no Invariant states; it
  is not registered (open for the user).
- `disposal` counts the disposal bound per step (Actors I35): an ending in the step whose
  `advance` reaches 5 s passes as at the bound, though the runtime may have decided it earlier in
  that step; and a re-send on the wire at the start is not told apart from a Held head, so the
  bound is judged on first sends.
- `attempt-identity`'s check that a send names the operation its Attempt was minted under has no
  mutant that isolates it: `mutant.sent-under-another-operation` is caught by the same oracle's count
  check.
- Round-14 reports `RuntimeDisposed` when its last call ends, before the final persistence write
  (Actors R23 has disposal wait for it); cases assert disposal's end only after that write is
  answered.
- The fake network ports `Ok`, `Fail`, `Lost`, `LostButLanded`, `FailButLanded`, `Never`, `Die`, late answers,
  late landings, uninterruptible calls and answers at once; storage ports `ack`, `refuse`, `hang`,
  `landNoAck`; the clock and page port timers, tasks, hide and kill. The rest are work items.

## Guarantee map: the phase's work list

Each Spec Invariant, the oracle module that owns it, and the mutant it must catch. "Case" means a
guarantee checked by cases' own expectations or a static check, not a per-step oracle. Prototype
mutants and wrong runtimes named here are in `prototypes/conformance/falsify.ts`, `lie-cases/` and
`prototypes/round-14/mutants-*.ts`; each Spec's `tests` block names its cases. Items marked
**done** run now; the rest are pending, in a suggested order.

### WriteLanes (`workflow/specs/core/WriteLanes.spec`)

| Invariants                                                | Oracle module                                                                                                                                           | Mutants                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I3                                                        | `ending-channels` **done**                                                                                                                              | `mutant.ending-without-id`, `k.failure-as-success`, `mutant.still-unknown-dropped`, `mutant.success-without-answer` **done**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| I6                                                        | `attempt-identity` **done**                                                                                                                             | `mutant.resend-new-id`, `mutant.resend-new-input` **done**; the seed cases and a seed-ignoring mint: phase 4 (decision 8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| I7                                                        | `attempt-identity` (needs the Attempt id on `Row` or `Sent`)                                                                                            | write one: retryCount not counted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| I15, I16                                                  | `delivered-once` **done** (one life per ending; I22, a releasing lane, needs a fragment fixture and has no check yet)                                   | `a2.deliv-fail-samemail`, `d154.moved-fail-released`, `lie.released`, `e8.wa-failure`, `mutant.superseded-claimed`, `mutant.delivered-during-disposal`, `mutant.replaced-delivered`, `d6.disposed-ending-is-evidence`, `1b.r8-refused-ending-not-redelivered` (`DLV-04`), `mutant.success-then-failure` (I16) **done**; `d154.moved-save-released`, `a3.park-*`, `a4.refused-*`, `lost.letgo-silent` with their fixtures                                                                                                                                                                                                                                                                                       |
| I22                                                       | no check yet: a releasing lane needs a fixture that declares a release on leave (`whenAbandoned`)                                                       | open: `d154.moved-save-released`, `lie.released` on a releasing lane                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| I1 (a send while on the wire), I8, I9, I11, I12, I20, I21 | `lane-queue` **done** (keyed lanes named from `Minted.key` or the first request's input; `Released` anchored to a cancel turn or an unretained unknown) | **done**: `lie.serialize-as-latest`, `lane.queue-unbounded`, `lane.latest-as-serialize`, `lane.fresh-mint-on-held`, `lane.unknown-promotes`, `lane.cancel-held-keeps`, `lane.cancel-wire-as-never-sent`, `lane.held-auto-resend`, `1b.cancel-all-queue-reversed`, `1b.cancel-all-promotes-before-emptying`, `1b.cancel-all-wire-held-at-once`, `audit-1.cancel-all-leaves-the-head`, `p1h.cancel-all-idle-declines`, `lie.held-released-unguarded`, `lie.release-on-guarded-read`, `mutant.release-drops-held`, `mutant.boot-resends-held` (I12), `mutant.double-invoke` (I1); pending: `audit-1.cancel-all-release-also-cancels-head` (needs the releasing-lane fixture `p1Rel`); I9 has no mutant of its own |
| I10, I13, I14                                             | `members`                                                                                                                                               | `d123.keyless-idle-heads-only`, `1b.r43-keyless-falls-back-to-key`, `r15b.keyless-success-names-key-lane`; write one applying members to the pre-turn lane                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| I1, I23                                                   | `members-only` (an adapter-side spy counting invocations)                                                                                               | write one replaying a commit on re-entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| I2, I19                                                   | `write-before-ending`                                                                                                                                   | write one queueing the ending first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| I4, I5                                                    | case (front-end)                                                                                                                                        | `ReservedReason`, `UnknownNotUncertain` wrong runtimes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| I17                                                       | `old-version-holds`                                                                                                                                     | `p1m.*`, `audit-1.old-version-declines-under-reject-only`, `1b.old-version-idle-passes`, `d78-no-evidence`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| I18                                                       | case                                                                                                                                                    | `d114.input-not-replaced`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### Turn (`workflow/specs/core/Turn.spec`)

| Invariants           | Oracle module                                                                                           | Mutants                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| I1, I7, I9, I29, I30 | `publication` (one leaf, one publish per turn, snapshots never mutated: the prototype's in-place guard) | `w.patch-in-place`, `w.row-in-place`                             |
| I2, I3, I5, I6, I8   | `selection` (needs the reference model `prototypes/conformance/reference/model.ts`, ported)             | `g.late-unhandled`, rule-14 routing mutants                      |
| I4, I10, I11         | `activations`                                                                                           | write from Turn tests                                            |
| I12, I13, I17, I19   | `turn-purity` (replay: the prototype's S11)                                                             | `lyingReplay`, `constantHash` broken adapters                    |
| I14, I15, I16        | `refusal`                                                                                               | `a4.refused-*`, `a4p.refused-turn`                               |
| I18                  | case                                                                                                    |                                                                  |
| I20 to I23           | `schedules`                                                                                             | timer mutants in `mutants-r15*.ts`                               |
| I24, I25             | `placements`                                                                                            |                                                                  |
| I26, I27             | `late-routing` (rule 14/15)                                                                             | `k.late-as-current`, `1b.r15-lateness-transitive` (re-expressed) |
| I28                  | `context`                                                                                               |                                                                  |
| I31                  | `issues`                                                                                                | `bogusIssue` broken adapter                                      |

### Actors (`workflow/specs/core/Actors.spec`)

| Invariants           | Oracle module                                                                  | Mutants                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1 to I6             | case (setup and readiness)                                                     |                                                                                                                                                                                                                                                                                                                                                                                                                             |
| I7 to I9, I25        | `identity`                                                                     | `q5.send-stolen`, `ref.binding-first-copy`                                                                                                                                                                                                                                                                                                                                                                                  |
| I10, I11, I12, I17   | `lifetime` (rule 73's global invariants: the prototype's `lifetimeViolations`) | `k.ghost-life`, `lie.dispose-start`                                                                                                                                                                                                                                                                                                                                                                                         |
| I13 to I16, I18      | `incarnations`                                                                 | `h.boot-*`, `k.parked-every-boot-silent`, `k.parked-reversed`                                                                                                                                                                                                                                                                                                                                                               |
| I19 to I24           | `mailbox`                                                                      | `k.send-ahead`, the boot-queue bound (U8)                                                                                                                                                                                                                                                                                                                                                                                   |
| I26 to I28           | `cuts-and-context`                                                             |                                                                                                                                                                                                                                                                                                                                                                                                                             |
| I29 to I32, I35, I36 | `disposal` **done**; every case ends with one                                  | `lie.boot-says-disposed`, `lie.boot-drops-held`, `mutant.disposal-skips-never-sent`, `mutant.disposal-dispatches`, `mutant.disposal-rereads`, `id.dispose-drops-lanes`, `mutant.disposal-hold-first`, `1b.forget-marks-held-lane`, `o6.dispose-interrupts-wire`, `o6.no-bound`, `o6.settled-in-bound-stays-held`, `mutant.short-disposal-bound` **done**; `1b.disposal-definite-w-first` open (mint order has no Invariant) |
| I33, I34             | case                                                                           |                                                                                                                                                                                                                                                                                                                                                                                                                             |

### WriteAhead (`workflow/specs/core/WriteAhead.spec`)

| Invariants                          | Oracle module                                                                                                                  | Mutants                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I15, I16, I17                       | `write-ahead` (the prototype's oracle (h), rewritten against the storage host; needs a disk reader on the Port or the adapter) | `mutant.still-unknown-dropped` (red by (h) in the old suite), `e8.wa-*`, `q1.wa-eq-any`, `lane.promote-skips-durable` (moved here from `lane-queue`, spec-log) |
| I5, I7, I10, I11, I14               | `capture` (oracle (g): one write out per key; cuts)                                                                            | `h.boot-copy`, `k.drop-copy`, `k.drop-row`                                                                                                                     |
| I1 to I4, I6, I8, I9, I12, I13, I18 | `persistence` and cases                                                                                                        |                                                                                                                                                                |

### Restore (`workflow/specs/core/Restore.spec`)

| Invariants | Oracle module                                                                      | Mutants                                                                                          |
| ---------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| I1 to I8   | `restore` (anchored to the bytes the suite owns; the prototype's stage K/L anchor) | `h.restore-at-send`, `k.restored-as-success`, `k.restored-from-root`, `k.no-boot-ev+*`           |
| I9 to I17  | `quarantine` and cases                                                             | `lie.m1.quarantine-beside-old-hold`, migration wrong runtimes (`mutants-p1m.ts`, `-am1`, `-am2`) |
| I18        | case                                                                               |                                                                                                  |

### Reads (`workflow/specs/core/Reads.spec`)

| Invariants           | Oracle module | Mutants                        |
| -------------------- | ------------- | ------------------------------ |
| I7, I8, I9, I11, I12 | `lookups`     | `drain.*` search kills         |
| I15, I16, I17        | `optimistic`  | `lie.settled-*`                |
| I1 to I5, I18, I19   | cases         | `lie:a3.like-row-hidden` (I18) |

### Compile, Diagnostics, Codec, StaticCli

Static guarantees: checked by cases over `Compiled` and the CLI, not by per-step oracles. Their
work item is one case module each in its area folder (`compile/`, `diagnostics/`, `codec/`,
`static-cli/`), porting `prototypes/round-14/checks/front-check.ts`, the CLI pins and the graph gate
(StaticCli I2: every edge name equals the turn record's).

### The rest of the rewrite

1. The fake world's remaining behaviours: answers `apply`, `applyLost`, `truth`, `atStart`,
   `inFlight`, `applyFail`, `interrupted`; faults (`forgetKeys`, `microAnswer`, scheduler
   shuffle, timer `lateCancel`); storage `failLate`, plain-write failures, slow and failing loads,
   wipe, tear, corrupt; the clock set back and frozen timers; streams (sockets, EventSource,
   WebSocket).
2. All scenarios ported (about 1,080 cases), area by area with their oracles. Pay: PAY-01 to
   PAY-20 ported where the Port reaches (STATUS.md lists the variants not ported and why). Lane
   cases: `LANE-01` to `LANE-10` (new, from WriteLanes R6-R8, R14, R15).
3. Searches (`prototypes/conformance/search/`) as a runner mode; the old suite's mutants (`mutants-*.ts`)
   as suite mutants; `--parallel` for both.
4. The verdict compare: each ported area's verdicts against the old suite's on the same cases.
5. The four-angle audit and re-audit; the fast gates in `nub run verify`.
6. The round-14 carry list: the table below.
7. **The suite's own Spec** (the user, 2026-11-09): `workflow/specs/conformance/Conformance.spec`, written
   with to-spec, in the workflow folder with the other Specs (the user: "it should just be in the workflow repo",
   2026-11-09). It holds the suite's guarantees: the Port exposes no runtime internals and
   any runtime implementing it gets the same verdicts; expected results come from a cited Spec rule, never from
   running the runtime; every check has a mutant it kills (falsify fails otherwise); the null runtime fails every
   case; runs are deterministic from a seed; the verdict format and the old-suite comparison. This README keeps
   the how-to and the work list. Do it before the rename (8), since it settles the grouping.
8. **Rename to Spec areas and behaviours** (the user, 2026-11-09) **done** (@task.V3.T5, whose comment holds
   the old → new map): one folder per core Spec (`write-lanes/`, `actors/`), checks named by behaviour
   (`three-channels` → `ending-channels`, `one-delivery` → `delivered-once`, `lane-cells` → `lane-queue`),
   `*.lies.ts` → `*.mutants.ts` and "lie" → "mutant" in this README and STATUS, scenario files by behaviour
   (`pay-16.ts` → `payment-retry.scenarios.ts`, ...) with the old `PAY-nn` id kept in the `id` field for the
   old-suite comparison; prototype leftovers (`prototype-reports.ts`, `fixtures/lab.ts`) renamed. The suite's own
   mutant names `lie.*` became `mutant.*`; the old suite's names (`lie.released`, `lie.serialize-as-latest`, `k.*`,
   `lane.*`, ...) are kept, as the case ids are. Proof: suite, null and falsify byte-identical under the map;
   `nub run check` at zero.
9. **Pending from rounds 4-5:** the review of `3097ea3c` and `bc8dffba`. **Done** (@task.V3.T6): judged Runtime
   disposal at every case's end with the `disposal` oracle; `@effect/tsgo` in `nub run check`.

## Round-14 carry list

Every item of `prototypes/round-14/STATUS.md`, "Carried to the phase 3 conformance rewrite", with
its owner here: an oracle or case module above, a runner part, a later phase, or dropped with a
reason. Proposed by the runner; not yet built unless marked.

| Carry item                                                                                                                                                                                                                                                                                                                                                    | Owner                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1, the errno rule (a rewrapped resource errno reads as a case FAIL)                                                                                                                                                                                                                                                                                          | runner: a child's resource error is a `NoVerdict`, never a case verdict (built for children; a case-level errno rule with the runner's verdict work)           |
| C3, plant reasons and preconditions (B12a, B17, the B15 race, B11/B4/B9, B5 119 and K)                                                                                                                                                                                                                                                                        | dropped: plants check the prototype harness against its own history; the new suite's falsify (mutants with named oracles, null runtime, control) replaces them |
| `bare`'s depth-12 search budget; work-peak for search configurations                                                                                                                                                                                                                                                                                          | runner: searches mode (rest item 3)                                                                                                                            |
| Search oracles keeping history outside the state hash (`deliveredOnce`, `keptNames`, `endedAgain`)                                                                                                                                                                                                                                                            | runner: searches mode; a search oracle reads only what the state hash carries                                                                                  |
| OS limits: uninterruptible sleep, `setsid` between polls, a foreign SIGKILL, EMFILE                                                                                                                                                                                                                                                                           | runner `child.ts`: process-group kill and a watchdog (stated limits until built)                                                                               |
| Partly-blind evidence when `ps` fails; `search-budget`/`search-reach` notes                                                                                                                                                                                                                                                                                   | runner: mutants and searches modes report them as notes                                                                                                        |
| Migration against a real storage API shape (IndexedDB structured clone, `localStorage` text)                                                                                                                                                                                                                                                                  | phase 5: host adapters, with the `restore` oracle                                                                                                              |
| `listen.none` at depth 7 inconclusive                                                                                                                                                                                                                                                                                                                         | phase 5: streams                                                                                                                                               |
| Harness excuses per actor, not per lane (M2 item 16, M1 finding 6)                                                                                                                                                                                                                                                                                            | `delivered-once` **done**: a recorded ending's cause is per Attempt (its owner, its superseding), never a whole actor's                                        |
| Weak case: C202 eviction by last write vs creation order                                                                                                                                                                                                                                                                                                      | phase 5: streams                                                                                                                                               |
| Weak case: C168 restore after a crash before the removal ack                                                                                                                                                                                                                                                                                                  | `restore`                                                                                                                                                      |
| Weak case: C166 live-admission throw tested on reload only                                                                                                                                                                                                                                                                                                    | `refusal` (Turn I14)                                                                                                                                           |
| Weak case: C184's message check                                                                                                                                                                                                                                                                                                                               | Diagnostics cases                                                                                                                                              |
| Weak cases: jitter determinism; rule 70's wait per operation                                                                                                                                                                                                                                                                                                  | phase 5: streams                                                                                                                                               |
| Round7/8/9/9b literal lane and actor key templates (about 40 assertions)                                                                                                                                                                                                                                                                                      | dropped: the Port never shows a runtime's keys; those cases assert through the disk reader (planned) by meaning, not spelling                                  |
| `a3b.resend-behind-settled`, `a3b.keyed-from-first-entity`, `a3b.restored-counts-unsent`, `a3b.keyed-cancel-names-the-ending`                                                                                                                                                                                                                                 | phase 5: entities                                                                                                                                              |
| `audit-2.covers-ended-remembers`, `audit-2.rebase-any-base`                                                                                                                                                                                                                                                                                                   | phase 5: entities                                                                                                                                              |
| `1b.r15-lateness-transitive` (re-expressed as a lateness-transitive mutant)                                                                                                                                                                                                                                                                                   | `late-routing` (Turn I26, I27)                                                                                                                                 |
| Streams: T3's 256-entry bound across two operations; rule 70's wait per operation; two writes re-creating an evicted entry                                                                                                                                                                                                                                    | phase 5: streams                                                                                                                                               |
| Design items not built (LIFE-19, 20, 25, 26; J; the ending phase and `NotAdopted`; `ScheduleLeadsToWrite`; `IdentityFieldOptional`; the read-only input pin; `InputIgnored`; `orphaned`; `ConflictingActorRef`'s context half; the quiet mark's `fields`; rule 29's `cancel` check; key-equality adoption; `previous` beyond retry; rule 74's ends by forget) | phase 4 builds each; its case lands with the Spec module that owns it (Compile and StaticCli cases, or the oracle above)                                       |
| `SharedContract`: two placements of one writing fragment; the widened `key: []` warning; rule 13's `byReason` keys                                                                                                                                                                                                                                            | Compile and StaticCli cases (phase 4 builds)                                                                                                                   |
| Migration: a crash between moving a lane and deleting the old name                                                                                                                                                                                                                                                                                            | `restore` (WriteAhead I10)                                                                                                                                     |
| `forget`'s `goneOp` parsing a quarantined lane without `upgraded`                                                                                                                                                                                                                                                                                             | `disposal` (Actors I32)                                                                                                                                        |
| U8: the boot-queue bound at two points; `structure`'s `seen.delete` with no mutant                                                                                                                                                                                                                                                                            | `mailbox` (Actors I22); Codec cases                                                                                                                            |
| Production tags formats from its first release                                                                                                                                                                                                                                                                                                                | `restore` (record formats; phase 4 builds)                                                                                                                     |
