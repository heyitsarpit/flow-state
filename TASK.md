# Flow State Correctness and Consolidation Plan

Status: **Phase 0 is current.** Only baseline, contract, decision, and proof work is
authorized. Do not begin production semantic changes until every Phase 0 closure
item is recorded and the tracker below is updated.

Last plan review: 2026-07-12.

## Current phase

Current phase: [Phase 0 — Baseline, semantic decisions, and proof](./tasks/PHASE_0.md).

The current work is to freeze measurable baselines, close the semantic decision
register, reconcile contracts with executable behavior, and split strong-model
design seams into implementation-sized packets. No Phase 1 production packet is
ready merely because related code already exists.

Completed plan work:

- [x] Initial feasibility and source review.
- [x] Assumption audit against current package and Launch Workspace behavior.
- [x] Positive/negative behavioral test catalog.
- [x] Independent GPT-5.6-sol xhigh architecture review.
- [x] Contradictions resolved into the binding decisions summarized below.
- [x] TanStack Query/XState ideas and anti-patterns mapped to owning packets.
- [x] Second smart-advisor pass covered laws, crash/fairness, hostile JS,
      shutdown, packaging/runtime edge cases, and independent test oracles.
- [x] Thermo-nuclear Effect service/Layer/Scope/primitive blueprint encoded.
- [x] Monolithic task list split into one file per numbered phase.
- [ ] Phase 0 baseline and decision receipts produced.
- [ ] Phase 0 closure approved for Phase 1 implementation.

## Phase tracker

Update this table and the phase file together. A phase is complete only when its
closure checklist and exact verification commands have receipts; checkbox
completion without evidence does not advance the current phase.

| Phase | Status                | Done                                        | Scope and entry                                                                   |
| ----- | --------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| 0     | **Current**           | Plan review complete; execution not started | [Baseline, semantic decisions, and proof](./tasks/PHASE_0.md)                     |
| 1     | Blocked by Phase 0    | Not started                                 | [Canonical identity, runtime ownership, and Effect lifecycle](./tasks/PHASE_1.md) |
| 2     | Blocked by Phase 1    | Not started                                 | [Transactions, concurrency, and atomic publication](./tasks/PHASE_2.md)           |
| 3     | Blocked by Phase 2    | Not started                                 | [Transitions and actor-owned asynchronous work](./tasks/PHASE_3.md)               |
| 4     | Blocked by Phase 3    | Not started                                 | [Testing, React, server, inspection, and CLI adapters](./tasks/PHASE_4.md)        |
| 5     | Blocked by Phases 0–4 | Not started                                 | [Deletion, packed proof, documentation, and closeout](./tasks/PHASE_5.md)         |

## Authorities

Read these before any packet:

1. [API_CONTRACT.md](./API_CONTRACT.md) — compatibility and permitted migration.
2. [TYPE_INFERENCE_CONTRACT.md](./TYPE_INFERENCE_CONTRACT.md) — input-first inference.
3. [ARCHITECTURE_CONTRACT.md](./ARCHITECTURE_CONTRACT.md) — ownership and Effect boundaries.
4. [CLIENT_STRUCTURE_CONTRACT.md](./CLIENT_STRUCTURE_CONTRACT.md) — client organization.
5. This file — current phase, navigation, and binding decisions.
6. The current phase file — detailed packets, tests, commands, and closure.
7. [Launch Workspace API inventory](./examples/launch-workspace/API_INVENTORY.md)
   plus its source and tests — verification client, not canonical architecture.

The pre-reset plan remains historical on branch
`backup/pre-reset-task-plan-2026-07-12` and under
`planning/archive/current-task-list-before-reset-2026-07-12/`.

## Binding decisions resolved by the final advisor pass

The [Phase 0 semantic decision register](./tasks/PHASE_0.md#semantic-decision-register)
is the single source of truth for these outcomes and their required proof. This
entry point tracks only their state so the rules are not duplicated and allowed
to drift.

| Decisions | State                              | Subjects                                                                                          |
| --------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| DEC-1–5   | Resolved; awaiting Phase 0 receipt | Resource identity, durable/local keys, safe app identity, definition immutability, ref provenance |
| DEC-6–8   | Resolved; awaiting Phase 0 receipt | Actor incarnation/leases, pure React initial snapshot, post-commit notifications                  |
| DEC-9–11  | Resolved; awaiting Phase 0 receipt | Failure/receipt lanes, library-owned atomicity, capacity/retention policy                         |
| DEC-12–13 | Resolved; awaiting Phase 0 receipt | Effect Clock, pure guards, timer restore, immutable boot v1 and v2 trigger                        |
| DEC-14–16 | Resolved; awaiting Phase 0 receipt | Child compatibility, package behavior, and the binding Effect architecture blueprint              |
| DEC-17–19 | Resolved; awaiting Phase 0 receipt | Algebraic laws, crash-consistency boundary, scheduler fairness/admission/cancellation             |
| DEC-20–22 | Resolved; awaiting Phase 0 receipt | Hostile JS/wire policy, graceful shutdown, and React runtime bootstrap/Offscreen/HMR              |

## Newly confirmed findings

These findings are added to the detailed defect ledger in Phase 0 and assigned
to one implementation packet each:

| ID          | Finding                                                                                                      | Owner            |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ---------------- |
| BUG-27      | App identity depends on module order and delimiter concatenation                                             | P1A.0            |
| BUG-28      | App/module registries permit reserved/prototype keys and inventory-field overwrite                           | P1A.0            |
| BUG-29      | Frozen definition wrappers retain caller-mutable configuration containers                                    | P1A.0            |
| BUG-30      | Structurally forged or foreign resource refs can cross runtime seams                                         | P1A.3            |
| BUG-31      | Open string-indexed receipts cannot prove vocabulary, lanes, or serializability                              | P2.3             |
| BUG-32      | Guard defects are swallowed as a false guard                                                                 | P3A.1            |
| BUG-33      | Trace/inspection callbacks can run before semantic snapshot commit                                           | P1D.3            |
| BUG-34      | Trace, actor-receipt, and default inspection histories are unbounded                                         | P1D.3            |
| BUG-35      | Resource selection sources remain cached after the final subscriber leaves                                   | P1B.2            |
| BUG-36      | Stream queues/coalescing can be unbounded or silently drop overflow                                          | P3B.2            |
| BUG-37      | Portable timer restore relies on absolute `dueAt` without a clock-skew rule                                  | P3C.1            |
| BUG-38      | Broad Launch Workspace app annotation erases the exact type under proof                                      | P1A.0            |
| BUG-39      | Launch Workspace derives product/debug state from unbounded receipt history                                  | P4A.3            |
| BUG-40      | `flow.can` and dispatch can disagree when guards inspect synthetic/runtime time                              | P3A.1            |
| BUG-41R/T/S | Optional snapshot fields make contradictory resource, transaction, and stream lifecycle states representable | P1A.4/P2.1/P3B.1 |
| BUG-42      | `runtime.resources.get` can manufacture an empty snapshot where unknown refs should return `null`            | P1B.1            |
| BUG-43      | Throwing selector/equality advances cached selection state before comparison succeeds                        | P1B.2            |
| BUG-44      | Actor-owned work can start before its incarnation is installed in the registry                               | P1C.4            |
| BUG-45      | Launch Workspace creates/hydrates a runtime during React render                                              | P4B.1            |
| BUG-46      | Invalidation refresh forks detached work that can outlive ResourceStore/runtime Scope                        | P1A.4            |
| BUG-47      | One cleanup/stop failure can skip later cleanup and ManagedRuntime Scope disposal                            | P1D.1            |
| BUG-48      | Ready-work drains synchronously with `Array.shift`, causing superlinear work and starvation                  | P1C.4            |
| BUG-49      | Dehydration has no cross-owner barrier for one coherent actor/resource cut                                   | P4C.1            |
| BUG-50T/S   | Synchronous transaction/stream completion can precede publication of running state                           | P2.1/P3B.1       |

## Global execution rules

- Preserve the recognizable API and all valid imports unless a separately
  approved migration says otherwise.
- Give a worker exactly one packet, its allowed files, tests, commands,
  dependencies, and non-goals.
- Definitions describe; runtime owners execute. Adapters never become semantic
  owners.
- Every defect closes with positive and negative behavioral proof.
- Every `unknown` boundary validates before mutation.
- Every asynchronous owner names its Scope, generation, interruption, finalizer,
  and publication point.
- Every packet follows the Phase 0 Effect blueprint: name the service contract,
  Layer construction/lifetime, Effect operations, native concurrency/state
  primitives, failure lanes, and host bridge before implementation.
- Every retained collection has an explicit ownership/bound policy.
- Keep typed failure, defect, interruption, cleanup, stale, and invalid-input
  lanes distinct.
- Do not use source-text assertions, casts, sleeps, double flushes, or copied
  adapter engines as semantic proof.
- Local TanStack Query and XState checkouts are optional idea/test references,
  never authorities. Read only the phase-named files, extract the stated
  invariant, and obey the explicit "do not copy" notes in Phase 0.
- Preserve unrelated work and keep `evaluations/` read-only.
- Before a packet commit, run its exact focused/affected commands and
  `pnpm fmt && pnpm lint`. Phase closure runs the broader gates named in the
  phase file.
- Update this tracker only after evidence exists. Never mark a future phase
  current because its code is partially present.

## Final outcome

The plan is complete only when all six phase files are closed, every BUG-1
through BUG-50 entry, including family variants, has evidence, the final owner
map names exactly one owner per capability, source and packed type matrices
pass, all public adjustments are
compatible or explicitly approved, and documentation describes executable truth.
