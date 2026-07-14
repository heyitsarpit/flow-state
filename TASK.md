# Flow State correctness roadmap

Status: **Phases 1 through 3, P4A, and P4B are complete. Goal 4 is active on P4C.1a durable decode and versioning.**

This file tracks phase state and current blockers. It does not prescribe agent
ceremony. Source code, deterministic tests, and the valid public and semantic
contracts are the evidence for correctness.

## Goals

Run goals from [tasks/GOAL.md](./tasks/GOAL.md). Each implementation goal owns
one phase and may span several fresh turns. The implementer works autonomously
within that phase until its executable exit criteria pass, then advances the next
implementation goal when its dependencies are satisfied.

Both roles must apply
[`skills/thermo-nuclear-code-quality-review/SKILL.md`](./skills/thermo-nuclear-code-quality-review/SKILL.md)
as a code-quality gate. The implementer uses it before design and again against
the final refactored diff, fixes its presumptive blockers, and asserts the Approval
Bar. One recurring independent review may audit any current phase range at any
time; it records defects against their owning criteria but is never a readiness
prerequisite.

| Goal   | Phase           | State     | Scope                                                                       |
| ------ | --------------- | --------- | --------------------------------------------------------------------------- |
| Goal 0 | Phase 0         | Complete  | Baseline and semantic contracts                                             |
| Goal R | Recovery        | Complete  | Repair contradicted behavior and ownership proofs                           |
| Goal 1 | Phase 1         | Complete  | Identity, runtime ownership, and lifecycle                                  |
| Goal 2 | Phase 2         | Complete  | Transactions, concurrency, and atomic publication                           |
| Goal 3 | Phase 3         | Complete  | Transitions and actor-owned asynchronous work                               |
| Goal 4 | Phase 4         | Active    | P4.0 corrections, then testing, React, server, inspection, and CLI adapters |
| Goal 5 | Phase 5         | Waiting   | Deletion, packed cutover, docs, and final correctness                       |
| Review | Recurring audit | Available | Audit any current phase range without gating readiness                      |

Implementation states progress from `Waiting` to `Ready`, `Active`, and
`Complete`. A running implementation goal may update its own state and the
immediate successor shown in the table; it may not promote anything later. The
recurring review has no completion state and is not part of this progression.

## Active blockers

- The `effect@4.0.0-beta.86` partial-acquisition cause-masking limit remains an
  explicit `P1D.1c` / `DEC-21` / `BT-52` contract constraint rather than an
  unresolved blocker: Flow proves acquired-resource cleanup and
  honest failure reporting there, and does not claim unavailable acquisition
  Cause completeness through the current public `Layer` / `ManagedRuntime` APIs.

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

For active implementation, consult the authorities the changed behavior touches:

1. [API_CONTRACT.md](./API_CONTRACT.md) for supported calls and runtime behavior.
2. [TYPE_INFERENCE_CONTRACT.md](./TYPE_INFERENCE_CONTRACT.md) for public types.
3. [ARCHITECTURE_CONTRACT.md](./ARCHITECTURE_CONTRACT.md) for ownership and lifecycle.
4. [CLIENT_STRUCTURE_CONTRACT.md](./CLIENT_STRUCTURE_CONTRACT.md) only for client layout changes.
5. The active phase manifest and the directly relevant inventory rows.
6. Production code and deterministic tests.

Contracts protect the supported public cutover surface, type safety, ownership,
and lifecycle. They do not dictate paperwork or arbitrary implementation mechanics.
If two semantic authorities conflict, stop and make the conflict explicit; do not
guess. A review goal may correct or delete bad planning text, but an implementation
goal does not redesign future phases.

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

## Surface-based verification

- Runtime behavior change: affected deterministic runtime tests.
- Public type change: focused positive/negative type tests and source typecheck.
- Export or packed declaration change: package build and affected packed consumer.
- Launch Workspace behavior change: affected example tests after rebuilding the package.
- Documentation-only change: docs build; no package behavior gate unless code changed.
- Phase completion: full affected package/example suite; unrelated failures remain
  assigned to their owning phase and must be reported truthfully.

Passing a static check never substitutes for affected runtime behavior. A
passing broad gate need not be repeated unless relevant code changed.
