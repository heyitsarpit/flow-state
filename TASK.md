# Flow State correctness roadmap

Status: **The cross-phase audit failed the Phase 1 and Phase 2 review dispositions, and `pnpm verify` is red. Goal 1 is active on P1D.2 / BUG-58; Goal 2 and Goal 3 are paused until the earlier owners and reviews pass. Confirmed blockers: BUG-4, BUG-18T/M/S, BUG-36, BUG-41S, BUG-53 through BUG-56, and BUG-58.**

This file tracks phase state and current blockers. It does not prescribe agent
ceremony. Source code, deterministic tests, and the valid public and semantic
contracts are the evidence for correctness.

## Goals

Run goals from [tasks/GOAL.md](./tasks/GOAL.md). Each implementation goal owns
one phase and may span several fresh turns. The implementer works autonomously
within that phase until its executable exit criteria pass. After implementation,
the user runs the separate code-review goal before the next phase begins.

Both roles must apply
[`skills/thermo-nuclear-code-quality-review/SKILL.md`](./skills/thermo-nuclear-code-quality-review/SKILL.md)
as a code-quality gate. The implementer uses it before design and again against
the final refactored diff, fixes its presumptive blockers, and asserts the Approval
Bar. The independent reviewer uses its finding order and complete Approval Bar as
the review disposition; behavioral correctness alone cannot pass either role.

| Goal     | Phase           | State    | Scope                                                 |
| -------- | --------------- | -------- | ----------------------------------------------------- |
| Goal 0   | Phase 0         | Complete | Baseline and semantic contracts                       |
| Review 0 | Phase 0 review  | Complete | Superseded by the Recovery audit                      |
| Goal R   | Recovery        | Complete | Repair contradicted behavior and ownership proofs     |
| Review R | Recovery review | Complete | Audit Recovery before Phase 1 resumes                 |
| Goal 1   | Phase 1         | Active   | Reopened by the 2026-07-14 cross-phase audit          |
| Review 1 | Phase 1 review  | Waiting  | Re-audit Phase 1 before Phase 2 resumes               |
| Goal 2   | Phase 2         | Waiting  | Reopened defects wait for Phase 1 review              |
| Review 2 | Phase 2 review  | Waiting  | Re-audit Phase 2 before Phase 3 resumes               |
| Goal 3   | Phase 3         | Waiting  | Paused with open Phase 3 audit defects                |
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

- The [2026-07-14 cross-phase audit](./tasks/BUGS.md#2026-07-14-cross-phase-audit)
  reopens Phase 1, Phase 2, and Phase 3 criteria. Work resumes at P1D.2 / BUG-58,
  where the Launch Workspace test runtime must register the resources its proof
  machines invoke; later phases stay paused until their dependencies are
  independently reviewed again.
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
- Phase completion: full affected package/example suite, then the separate review goal.

Passing a static check never substitutes for affected runtime behavior. A
passing broad gate need not be repeated unless relevant code changed.
