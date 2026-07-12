# Flow State correctness roadmap

Status: **Recovery is active. R0.2 is the next code slice.**

This file tracks phase state and the next implementation slice. It does not
prescribe agent ceremony. Source code, deterministic tests, and the valid public
and semantic contracts are the evidence for correctness.

## Goals

Run goals from [tasks/GOAL.md](./tasks/GOAL.md). Each implementation goal owns
one phase and may span several fresh turns. Each turn completes one small code
slice and then ends to protect context. After a phase implementation goal
finishes, the user runs its separate review goal before the next phase begins.

| Goal     | Phase           | State      | Scope                                                       |
| -------- | --------------- | ---------- | ----------------------------------------------------------- |
| Goal 0   | Phase 0         | Complete   | Baseline and semantic contracts                             |
| Review 0 | Phase 0 review  | Complete   | Superseded by the Recovery audit                            |
| Goal R   | Recovery        | **Active** | Repair contradicted behavior and ownership proofs           |
| Review R | Recovery review | Waiting    | Audit Recovery before Phase 1 resumes                       |
| Goal 1   | Phase 1         | Waiting    | Canonical identity, runtime ownership, and lifecycle        |
| Review 1 | Phase 1 review  | Waiting    | Audit Phase 1 before Phase 2                                |
| Goal 2   | Phase 2         | Waiting    | Transactions, concurrency, and atomic publication           |
| Review 2 | Phase 2 review  | Waiting    | Audit Phase 2 before Phase 3                                |
| Goal 3   | Phase 3         | Waiting    | Transitions, streams, timers, and children                  |
| Review 3 | Phase 3 review  | Waiting    | Audit Phase 3 before Phase 4                                |
| Goal 4   | Phase 4         | Waiting    | Testing, React, server, inspection, and CLI adapters        |
| Review 4 | Phase 4 review  | Waiting    | Audit Phase 4 before Phase 5                                |
| Goal 5   | Phase 5         | Waiting    | Deletion, packed compatibility, docs, and final correctness |
| Review 5 | Final review    | Waiting    | Independent final audit and plan closure                    |

Only the active implementation or review goal may change state. A later phase
cannot start until the preceding review goal marks it ready.

## Current Recovery phase

Recovery repairs live regressions discovered after the earlier Phase 1 work.
The slices are deliberately small; their order is navigation, not an excuse to
touch later-phase design.

- [x] `R0.1` Remove stale planning enforcement and record the live recovery scope.
- [ ] `R0.2` Restore human-facing app presentation without weakening canonical app identity.
- [ ] `R0.3` Repair transaction callers under app-bound actor ownership.
- [ ] `R0.4` Repair stream callers under app-bound actor ownership.
- [ ] `R0.5` Repair rehydration and child callers while preserving generations.
- [ ] `R0.6` Repair inspection and Flow Test callers without a second actor engine.
- [ ] `R0.7` Prove one runtime actor registry and one ResourceStore owner.
- [ ] `R0.8` Restore Launch Workspace through registered app definitions.
- [ ] `R0.9a` Prove actor stop and transaction/mailbox finalization.
- [ ] `R0.9b` Prove stream, timer, and child finalization.
- [ ] `R0.9c` Prove attachment leases, repeated disposal, and exact eviction.

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
- [Compatibility vocabulary](./tasks/COMPATIBILITY_TASKS.md)
- [Semantic decisions](./tasks/SEMANTIC_DECISIONS.md)
- [Effect architecture](./tasks/EFFECT_ARCHITECTURE.md)
- [Capacity policy](./CAPACITY_POLICY.md)
- [Compatibility corpus](./COMPATIBILITY_CORPUS.md)
- [Laws and independent oracles](./LAWS_AND_ORACLES.md)

## Authority and conflict handling

For the active slice, consult only the authorities it actually touches:

1. [API_CONTRACT.md](./API_CONTRACT.md) for supported calls and runtime behavior.
2. [TYPE_INFERENCE_CONTRACT.md](./TYPE_INFERENCE_CONTRACT.md) for public types.
3. [ARCHITECTURE_CONTRACT.md](./ARCHITECTURE_CONTRACT.md) for ownership and lifecycle.
4. [CLIENT_STRUCTURE_CONTRACT.md](./CLIENT_STRUCTURE_CONTRACT.md) only for client layout changes.
5. The active phase manifest and the directly relevant inventory rows.
6. Production code and deterministic tests.

Contracts protect observable compatibility, type safety, ownership, and
lifecycle. They do not dictate paperwork or arbitrary implementation mechanics.
If two semantic authorities conflict, stop the code slice and make the conflict
explicit; do not guess. A review goal may correct or delete bad planning text,
but an implementation goal does not redesign future phases.

## Correctness rules

- Preserve supported public calls, aliases, exports, wire vocabulary, and
  executable behavior unless an approved migration explicitly changes them.
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
5. Review the changed diff once for compatibility, ownership, exact `A/E/R`,
   lifecycle, generations, finalizers, atomicity, and unintended duplication.
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
