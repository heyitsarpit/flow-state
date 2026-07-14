# Flow State correctness roadmap

Status: **Phase 2 review passed. Goal 3 is active on P3C.1; same-state serialized submit queue/overflow paths, synchronous state-owned stream done/failure/interrupt/defect routes, synchronous state-owned stream value-route plus done-route parity, synchronous state-owned stream value-route plus failure-route parity, synchronous state-owned stream value-route plus interrupt-route parity, synchronous state-owned stream value-route plus defect-route parity, synchronous state-owned `flow.run` success/failure/interrupt/defect routes, synchronous submit failure routes, synchronous submit interrupt routes, synchronous submit defect routes, guard-defect model discovery, clock-sensitive guard rejection parity between model discovery and clocked harnesses, `always` follow-up plus microstep-limit model parity, accepted transition exit/update/entry action-order parity, nested synchronous submit-success routed-event receipt parity, the first bounded `BT-38` stale stream ready-work/deferred interleaving oracle across `flowTest` and runtime actors, the first bounded flush-backed `BT-38` state-owned transaction stop/reentry stale-publication oracle across `flowTest` and runtime actors, the first explicit `BT-38` proof that a settled state-owned transaction completion stays stale after immediate reentry on `flowTest` and runtime actors, the first explicit `BT-38` proof that a settled state-owned transaction completion stays latent through the raw completion turn and becomes ready only after the next explicit flush on `flowTest` and runtime actors, the first bounded `BT-38` raw completion `SETTLE`/`FLUSH` interleaving oracle across `flowTest` and runtime actors, the first bounded serialized queued-generation raw completion `SETTLE`/`FLUSH` oracle across `flowTest` and runtime actors, one bounded independent `BT-38` preview replacement oracle family that proves settled-predecessor raw-completion replacement dispatch under `reject-while-running` plus preview-backed `allow` and `cancel-previous` late older success/failure/defect completions and newer success/failure/defect wins, one bounded independent `BT-38` multi-ref `cancel-previous` replacement oracle that keeps stale older success/defect completions silent after the newer winner invalidates both refs on `flowTest` and runtime actors, one bounded independent `BT-38` stale `allow`-route silence oracle that proves newer winners keep stale older success/failure/defect completions from publishing routes or extra terminal receipts on `flowTest` and runtime actors, one bounded independent `BT-38` `cancel-previous` stale-route callback silence oracle that proves newer winners keep cancelled older success/failure/defect completions from executing routes or publishing extra terminal receipts on `flowTest` and runtime actors, one bounded independent `BT-38` late `cancel-previous` stale-publication oracle that proves cancelled older success/failure/defect completions stay stale while the newer attempt remains pending and only the newer winner publishes on `flowTest` and runtime actors, one bounded generated `BT-38` replacement interleaving oracle family that proves `allow` plus `cancel-previous` older-first and newer-first success/failure/defect completions never let stale older outcomes publish over the newer winner on `flowTest` and runtime actors now stay proved, one bounded independent `BT-38` allow latest-wins oracle that proves older failure stays stale while the newer pending attempt remains current on `flowTest` and runtime actors now stays proved, one bounded independent `BT-38` stale allow publication oracle that proves newer winners keep late stale success/failure/defect completions from publishing or re-invalidating on `flowTest` and runtime actors now stays proved, one bounded independent `BT-38` overlap policy oracle that proves `reject-while-running`, `serialize`, `cancel-previous`, and `allow` publish their exact pending preview, queue, rollback, reject, and issue surfaces on `flowTest` and runtime actors now stays proved, one bounded independent scoped serialize progression oracle that proves two serialized scopes advance independently while each scope still queues and resumes in order on `flowTest` and runtime actors now stays proved, one bounded independent serialize progression oracle family that proves single-queue serialized successors resume after active success, predecessor failure, and predecessor defect on `flowTest` and runtime actors now stays proved, one bounded independent serialized queue-capacity and stalled-predecessor oracle family that proves a third queued submit rejects before preview/commit work starts and a queued successor stays stalled behind a never-completing predecessor on `flowTest` and runtime actors now stays proved, one bounded independent serialize retry/reset oracle family that proves failed serialized attempts expose retry/reset control honestly on `flowTest` and runtime actors now stays proved, one bounded independent cancel-previous restart oracle family that proves newer attempts win, older completions stay stale, and replaced commit `AbortSignal`s interrupt promptly on `flowTest` and runtime actors now stays proved, one bounded independent queued serialize lifecycle oracle that proves stopped or disposed active serialize attempts abort their queued successor path without late success/failure/defect publication on runtime actors and public rehydrated harnesses now stays proved, one bounded independent active serialize lifecycle oracle that proves stopped or disposed active serialize attempts keep preview rollback, interruption, and stale late success/failure/defect silence aligned on runtime actors and public rehydrated harnesses now stays proved, one bounded independent multi-ref lifecycle cleanup oracle that proves stopped or disposed active multi-ref preview attempts roll back both refs without late success invalidation on runtime actors and public rehydrated harnesses now stays proved, one bounded synchronous state-owned `flow.run` success-route parity proof now keeps the immediate pending turn and flushed completion aligned between `flowTest` and runtime actors, one bounded synchronous state-owned `flow.run` failure-route parity proof now keeps the immediate pending turn and flushed handled-failure completion aligned between `flowTest` and runtime actors, one bounded synchronous state-owned `flow.run` interrupt-route parity proof now keeps the immediate pending turn and flushed handled-interrupt completion aligned between `flowTest` and runtime actors, one bounded synchronous state-owned `flow.run` defect-route parity proof now keeps the immediate pending turn and flushed handled-defect completion aligned between `flowTest` and runtime actors, one bounded synchronous submit failure-route parity proof now keeps the immediate pending turn and flushed handled-failure completion aligned between `flowTest` and runtime actors, one bounded synchronous submit interrupt-route parity proof now keeps the immediate pending turn and flushed handled-interrupt completion aligned between `flowTest` and runtime actors, one bounded synchronous submit defect-route parity proof now keeps the immediate pending turn and flushed handled-defect completion aligned between `flowTest` and runtime actors, one bounded same-state serialized submit queue-path parity proof now keeps the second accepted save queued behind the active preview with identical context, resource, transaction, receipt, issue, and pending-work facts on `flowTest` and runtime actors, one bounded same-state serialized submit overflow-path parity proof now keeps the third accepted save rejected at queue capacity while the active preview stays current with identical context, resource, transaction, receipt, issue, and pending-work facts on `flowTest` and runtime actors, one bounded nested synchronous submit-success routed-event receipt parity proof now keeps the flushed routed `SAVED` machine-event/transition receipts and outer success receipt correlation split aligned between `flowTest` and runtime actors, one bounded `P3A.2` stream callback-family proof now keeps narrower state-owned `params`, `subscribe`, `value`, `failure`, `defect`, and coalesced `pressure.key` callbacks rejected at the public builder seam, one bounded `P3B.1` stream terminal-snapshot proof now keeps success/failure/defect/interrupt states discriminated across runtime actors, `flowTest`, sync model paths, and trace projections, one bounded `BT-48S` synchronous state-owned stream value-plus-done parity proof now keeps the immediate running turn and flushed completion aligned between `flowTest` and runtime actors, one bounded `BT-18` stream finalizer-boundary oracle now keeps state exit restart plus stop/dispose cleanup exact across runtime actors and public rehydrated harnesses, one bounded `BT-19` stream-pressure pending-work oracle now keeps queue-limit and coalesced-latest policies honest about ready work and prevents false-idle `settle()` results on public rehydrated harnesses, one bounded `P3B.2` queue-pressure type/inspection proof now makes bounded queue capacity explicit across source and behavior-contract surfaces, one bounded `P3B.2` stream-pressure diagnostics proof now surfaces queued overflow and coalesced replacement receipts/issues on runtime actors and public rehydrated harnesses, one bounded `P3B.3` impossible-lane stream type proof now keeps `never` output/failure routes rejected across `flow.stream` and exported stream config surfaces, one bounded `P3B.3` carried stream callback and pressure-key definition proof now keeps carried and exported stream definitions exact at the source seam, one bounded `P3B.3` packed declaration portability proof now keeps carried stream value routes and coalesced pressure keys exact across isolated and multi-entry packed consumers, one bounded `P3B.3` testing-surface stream fixture proof now keeps `createControlledStream` value/failure types exact and keeps the current `flowTest` stream read surface honest, one bounded `P3C.1` negative-remaining timer restore proof now rejects impossible restored scheduled timers before runtime actor and rehydrated test-harness registration, one bounded `P3C.1` destination-state timer restore compatibility proof now rejects restored scheduled timers that do not belong to the restored state's `flow.after` inventory before runtime actor and rehydrated test-harness registration, one bounded `P3C.1` timer restore start-receipt proof now rejects restored scheduled timers that lack persisted `timer:start` evidence before runtime actor and rehydrated test-harness registration, one bounded `P3C.1` timer restore parent-state compatibility proof now rejects restored scheduled timers whose persisted owner state does not match the restored state before runtime actor and rehydrated test-harness registration, and the next slice is one bounded `P3C.1` timer restore receipt-identity proof around persisted `timer:start` parent-state/generation compatibility.**

This file tracks phase state and the next implementation slice. It does not
prescribe agent ceremony. Source code, deterministic tests, and the valid public
and semantic contracts are the evidence for correctness.

## Goals

Run goals from [tasks/GOAL.md](./tasks/GOAL.md). Each implementation goal owns
one phase and may span several fresh turns. Each turn completes one small code
slice and then ends to protect context. After a phase implementation goal
finishes, the user runs its separate review goal before the next phase begins.

| Goal     | Phase           | State    | Scope                                                 |
| -------- | --------------- | -------- | ----------------------------------------------------- |
| Goal 0   | Phase 0         | Complete | Baseline and semantic contracts                       |
| Review 0 | Phase 0 review  | Complete | Superseded by the Recovery audit                      |
| Goal R   | Recovery        | Complete | Repair contradicted behavior and ownership proofs     |
| Review R | Recovery review | Complete | Audit Recovery before Phase 1 resumes                 |
| Goal 1   | Phase 1         | Complete | Canonical identity, runtime ownership, and lifecycle  |
| Review 1 | Phase 1 review  | Complete | Audit Phase 1 before Phase 2                          |
| Goal 2   | Phase 2         | Complete | Transactions, concurrency, and atomic publication     |
| Review 2 | Phase 2 review  | Complete | Audit Phase 2 before Phase 3                          |
| Goal 3   | Phase 3         | Active   | Transitions, streams, timers, and children            |
| Review 3 | Phase 3 review  | Waiting  | Audit Phase 3 before Phase 4                          |
| Goal 4   | Phase 4         | Waiting  | Testing, React, server, inspection, and CLI adapters  |
| Review 4 | Phase 4 review  | Waiting  | Audit Phase 4 before Phase 5                          |
| Goal 5   | Phase 5         | Waiting  | Deletion, packed cutover, docs, and final correctness |
| Review 5 | Final review    | Waiting  | Independent final audit and plan closure              |

States progress from `Waiting` to `Ready`, `Active`, `Awaiting review`, and
`Complete` as applicable. The running goal may update its own state, its matching
review state, and the immediate successor shown in the Goals table; it may not
promote anything later. A later phase cannot start until the preceding review
goal makes it `Ready`.

## Active blockers

- None currently. The `effect@4.0.0-beta.86` partial-acquisition cause-masking
  limit is now an explicit `P1D.1c` / `DEC-21` / `BT-52` contract constraint
  rather than an unresolved blocker: Flow proves acquired-resource cleanup and
  honest failure reporting there, and does not claim unavailable acquisition
  Cause completeness through the current public `Layer` / `ManagedRuntime` APIs.

## Current Recovery phase

Recovery repairs live regressions discovered after the earlier Phase 1 work.
The slices are deliberately small; their order is navigation, not an excuse to
touch later-phase design.

- [x] `R0.1` Remove stale planning enforcement and record the live recovery scope.
- [x] `R0.2` Restore human-facing app presentation without weakening canonical app identity.
- [x] `R0.3` Repair transaction callers under app-bound actor ownership.
- [x] `R0.4` Repair stream callers under app-bound actor ownership.
- [x] `R0.5` Repair rehydration and child callers while preserving generations.
- [x] `R0.6` Repair inspection and Flow Test callers without a second actor engine.
- [x] `R0.7` Prove one runtime actor registry and one ResourceStore owner.
- [x] `R0.8` Restore Launch Workspace through registered app definitions.
- [x] `R0.9a` Prove actor stop and transaction/mailbox finalization.
- [x] `R0.9b` Prove stream, timer, and child finalization.
- [x] `R0.9c` Prove attachment leases, repeated disposal, and exact eviction.

Recovery is complete when the affected runtime and Launch Workspace tests pass
without accepted failures, ownership bypasses, casts at public seams, duplicate
engines, or weakened assertions. Then mark Goal R `Awaiting review` and run
Review R from `tasks/GOAL.md` in a fresh goal session.

## Phase manifests

Read only the active phase manifest. Completed phases are dependencies, not
work queues; future phases are out of scope.

- [Phase 0 — established contracts](./tasks/PHASE_0.md)
- [Phase 1 — identity, runtime ownership, lifecycle](./tasks/PHASE_1.md)
- [Phase 2 — transactions](./tasks/PHASE_2.md)
- [Phase 3 — transitions and actor-owned asynchronous work](./tasks/PHASE_3.md)
- [Phase 4 — adapters](./tasks/PHASE_4.md)
- [Phase 5 — deletion and final correctness](./tasks/PHASE_5.md)

The following are semantic inventories, not execution workflows:

- [Defect and regression inventory](./tasks/BUGS.md)
- [Behavioral invariants](./tasks/BEHAVIOR_TESTS.md)
- [Type invariants](./tasks/TYPE_GATES.md)
- [Cutover vocabulary](./tasks/COMPATIBILITY_TASKS.md)
- [Semantic decisions](./tasks/SEMANTIC_DECISIONS.md)
- [Effect architecture](./tasks/EFFECT_ARCHITECTURE.md)
- [Capacity policy](./CAPACITY_POLICY.md)
- [Cutover corpus](./COMPATIBILITY_CORPUS.md)
- [Laws and independent oracles](./LAWS_AND_ORACLES.md)

## Authority and conflict handling

For the active slice, consult only the authorities it actually touches:

1. [API_CONTRACT.md](./API_CONTRACT.md) for supported calls and runtime behavior.
2. [TYPE_INFERENCE_CONTRACT.md](./TYPE_INFERENCE_CONTRACT.md) for public types.
3. [ARCHITECTURE_CONTRACT.md](./ARCHITECTURE_CONTRACT.md) for ownership and lifecycle.
4. [CLIENT_STRUCTURE_CONTRACT.md](./CLIENT_STRUCTURE_CONTRACT.md) only for client layout changes.
5. The active phase manifest and the directly relevant inventory rows.
6. Production code and deterministic tests.

Contracts protect the supported public cutover surface, type safety, ownership,
and lifecycle. They do not dictate paperwork or arbitrary implementation mechanics.
If two semantic authorities conflict, stop the code slice and make the conflict
explicit; do not guess. A review goal may correct or delete bad planning text,
but an implementation goal does not redesign future phases.

## Correctness rules

- Preserve the supported public calls, exports, wire vocabulary, and executable
  behavior named by the cutover contract. Legacy aliases are removed or rejected
  unless a named exception keeps them.
- Preserve exact `Effect<A, E, R>`, Stream channels, Layer requirements, Scope,
  interruption, Cause, finalizers, and typed failure lanes.
- Keep one semantic owner for each capability. Adapters and test helpers consume
  production semantics rather than implementing a second engine.
- Install ownership and generation authority before synchronous work can publish.
  Stale work may finalize but cannot publish current facts.
- Decode and validate unknown input completely before mutating an owner. Publish
  logical batches atomically and isolate observer failures from committed state.
- Use deterministic tests, TestClock, Deferred, controlled streams, and explicit
  progress controls. Avoid real sleeps, timing luck, and source-text substitutes
  for behavior.
- A localized internal assertion is allowed only after validation where
  TypeScript cannot express an erased registry invariant. Public or semantic
  seams may not erase types with casts.
- Capacity requirements prove bounded ownership, typed overflow, cleanup, and no
  corruption. They do not create performance or package-size work.

## One-slice implementation loop

1. Re-read this file and the active phase manifest; choose the next listed slice
   or a smaller coherent invariant inside it.
2. Reproduce the observable failure with an existing focused test. Add a
   regression only when coverage is missing; do not manufacture a red step.
3. Implement the smallest production correction and directly affected tests.
4. Run focused behavior tests, then only the type, packed, example, build, or
   documentation checks warranted by the changed surface.
5. Review the changed diff once for the cutover contract, ownership, exact
   `A/E/R`, lifecycle, generations, finalizers, atomicity, and unintended duplication.
6. Fix blocking findings, rerun only affected checks, and format/lint changed code.
7. Update only the completed checkbox and next-slice status above, commit the
   verified code/tests plus that minimal marker, then end the turn. Keep the
   phase goal active until its executable exit criteria pass.

Do not create planning receipts, command transcripts, history proofs, generated
status reports, model-routing documents, or prose-presence tests. Do not accept a
red test as baseline truth. Do not read or modify another phase merely because a
nearby cleanup is attractive. Do not run package, declaration, or example builds
concurrently when they share generated output.

## Surface-based verification

- Runtime behavior change: affected deterministic runtime tests.
- Public type change: focused positive/negative type tests and source typecheck.
- Export or packed declaration change: package build and affected packed consumer.
- Launch Workspace behavior change: affected example tests after rebuilding the package.
- Documentation-only change: docs build; no package behavior gate unless code changed.
- Phase completion: full affected package/example suite, then the separate review goal.

Passing a static check never substitutes for affected runtime behavior. A
passing broad gate need not be repeated unless relevant code changed.
