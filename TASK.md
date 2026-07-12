# Flow State correctness and consolidation plan

Status: **Phase 1 is current. No packet is active. P1A.4a is the next packet.**

Last plan review: 2026-07-12.

## Start here

This file is the sole authority for phase and packet status. Phase files are
static packet manifests: their checkboxes describe acceptance criteria, not
progress. A packet becomes done only when its immutable receipt and matching
status transition are committed together; Git history supplies that commit's
SHA without embedding a self-reference in the receipt.

The highest-priority executable work is:

1. P1A.4a — resource lifecycle, freshness, and scoped invalidation.

P1B.2 closed atomic resource patch, notification, selection, and inactive
selection-source cleanup semantics. P1A.4a is now the next executable packet.

## Authority order

Read only the material linked by the assigned packet, in this order:

1. [API_CONTRACT.md](./API_CONTRACT.md) for currently valid source/runtime compatibility.
2. [TYPE_INFERENCE_CONTRACT.md](./TYPE_INFERENCE_CONTRACT.md) for the currently published type contract.
3. [ARCHITECTURE_CONTRACT.md](./ARCHITECTURE_CONTRACT.md) for currently published ownership boundaries.
4. [CLIENT_STRUCTURE_CONTRACT.md](./CLIENT_STRUCTURE_CONTRACT.md) for client organization.
5. [Semantic decisions](./tasks/SEMANTIC_DECISIONS.md) for selected future design and proof.
6. [Effect and TypeScript architecture](./tasks/EFFECT_ARCHITECTURE.md) for construction rules.
7. The assigned phase packet and its linked ledgers.
8. Dependency receipts.
9. Launch Workspace source/tests and [API inventory](./examples/launch-workspace/API_INVENTORY.md) as a verification client, never canonical architecture.

A selected decision does not silently outrank a conflicting public contract.
DEC-14 is selected, and P0.4 reconciled the active compatibility floor in
API_CONTRACT.md and TYPE_INFERENCE_CONTRACT.md. Richer child input selectors,
outcome routes, independent output/failure generics, and automatic restart
budgets remain future additive work. Apply the same fail-closed rule to any
later contract conflict.

## Single-source ledgers

- [BUGS.md](./tasks/BUGS.md) — sole BUG-1 through BUG-50 ledger and forbidden regressions.
- [BEHAVIOR_TESTS.md](./tasks/BEHAVIOR_TESTS.md) — sole BT-1 through BT-53 ledger.
- [TYPE_GATES.md](./tasks/TYPE_GATES.md) — sole cross-phase type-inference gates.
- [COMPATIBILITY_TASKS.md](./tasks/COMPATIBILITY_TASKS.md) — sole CV-1 through CV-4 ledger.
- [SEMANTIC_DECISIONS.md](./tasks/SEMANTIC_DECISIONS.md) — sole DEC-1 through DEC-22 text.
- [EFFECT_ARCHITECTURE.md](./tasks/EFFECT_ARCHITECTURE.md) — sole cross-cutting Effect blueprint.
- [Packet and receipt contract](./tasks/templates/PACKET.md) — required execution/handoff format.

The pre-reset plan remains historical on branch
backup/pre-reset-task-plan-2026-07-12 and under
planning/archive/current-task-list-before-reset-2026-07-12/.

## Packet status

Allowed states are blocked, ready, active, done, and needs-revalidation.
Exactly zero or one packet may be active. “Done” requires its dependencies,
immutable receipt, exact command exits, review closeout, and one commit
containing the packet artifacts plus the matching receipt and status transition.
Git history identifies that commit. If semantic or behavioral acceptance
criteria change, affected downstream packets move to needs-revalidation.
P0.1a's existing two-commit receipt is a grandfathered historical exception.

| Packet | Status           | Depends on                           | Primary result                                                                   |
| ------ | ---------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| P0.1a  | Done             | —                                    | Immutable base SHA, tree classification, environment, public/behavioral baseline |
| P0.2   | Done             | —                                    | Launch Workspace executable-truth inventory                                      |
| P0.4   | Done             | —                                    | Child contract reconciled compatibility-first                                    |
| P0.5   | Done             | —                                    | Owner/duplicate/deletion inventory                                               |
| P0.1b  | Done             | P0.1a, P0.2, P0.4, P0.5              | BUG-21 tooling/build-resolution repair                                           |
| P0.3   | Done             | P0.1a, P0.2, P0.4, P0.5              | Compact semantic type sentinels                                                  |
| P0.1c  | Done             | P0.1b                                | Packed/performance fixtures and measurements                                     |
| P0.6   | Done             | P0.1b, P0.1c, P0.2, P0.3, P0.4, P0.5 | Decisions/capacity/compatibility/laws synthesis                                  |
| P1A.0  | Done             | P0.6                                 | Safe definitions and app identity                                                |
| P1D.1a | Done             | P0.6                                 | Host boundary, service contracts, Layer composition, ManagedRuntime boundary     |
| P1A.1  | Done             | P1A.0                                | Inert resource refs and executable-definition ownership                          |
| P1A.2  | Done             | P1A.1                                | Canonical collision-free key/provenance identity                                 |
| P1B.1  | Done             | P1A.2, P1D.1a                        | Canonical ResourceStore and resource identity migration; includes former P1A.3a  |
| P1B.2  | Done             | P1B.1                                | Atomic patch/batch/selection publication                                         |
| P1A.4a | **Ready — next** | P1B.1, P1D.1a                        | Resource lifecycle/freshness/scoped invalidation                                 |
| P1A.4b | Blocked          | P1B.1                                | Registry-owned tag identity                                                      |
| P1A.4c | Blocked          | P1A.4a, P1A.4b                       | Directional resource typing and packed declarations                              |
| P1A.4d | Blocked          | P1A.4a, P1A.4b                       | Prevalidated internal resource restore                                           |
| P1C.1  | Blocked          | P1A.0, P1D.1a                        | Canonical actor owner and ownership domains                                      |
| P1C.2  | Blocked          | P1C.1                                | Preferred actor read alias through one owner                                     |
| P1C.3a | Blocked          | P1C.1                                | Stop/finalizer/exact eviction                                                    |
| P1C.3b | Blocked          | P1C.3a                               | Attachment and keep-alive leases                                                 |
| P1C.4a | Blocked          | P1C.3a                               | Registry installation and activation barrier                                     |
| P1C.4b | Blocked          | P1C.4a                               | Canonical bounded mailbox/scheduler                                              |
| P1C.5  | Blocked          | P1C.4b                               | Canonical transition owner and machine test delegation                           |
| P1A.3b | Blocked          | P1B.1, P1C.1                         | Actor/transaction canonical identity projections                                 |
| P1D.3a | Blocked          | P1B.1, P1C.5                         | Core post-commit fact publication                                                |
| P1D.3b | Blocked          | P1D.3a                               | Bounded evidence and observer isolation                                          |
| P1D.1c | Blocked          | P1A.4a, P1C.3a, P1D.3b               | Cross-owner shutdown, Cause aggregation, no semantic Effect.run islands          |
| P1D.1b | Blocked          | P1D.1c                               | Exact variadic Layer and packed declaration typing                               |
| P2.1a  | Blocked          | P1A.3b, P1C.5, P1D.1c                | Transaction state/generation and synchronous completion                          |
| P2.1b  | Blocked          | P2.1a                                | Allow/cancel semantics                                                           |
| P2.1c  | Blocked          | P2.1b                                | Reject/serialize/admission semantics                                             |
| P2.1d  | Blocked          | P2.1c                                | Model/property interleavings                                                     |
| P2.2a  | Blocked          | P2.1a, P1B.2                         | Atomic preview/rollback/invalidation                                             |
| P2.2b  | Blocked          | P2.2a                                | Internal prevalidated transaction restore                                        |
| P2.3   | Blocked          | P2.1c, P2.2a, P1D.3b                 | Canonical transaction/resource receipts only                                     |
| P2.4   | Blocked          | P2.3                                 | Input-first transaction declarations and packed typing                           |
| P3A.2  | Blocked          | P1C.5                                | Exact machine callback-family typing                                             |
| P3B.1  | Blocked          | P1C.5, P1D.1c                        | Production stream owner and family test delegation                               |
| P3B.2  | Blocked          | P3B.1                                | Bounded stream pressure                                                          |
| P3B.3  | Blocked          | P3B.2                                | Stream inference and packed typing                                               |
| P3C.1  | Blocked          | P1C.5, P1D.1c                        | Internal one-shot timer lifecycle/remaining-duration restore                     |
| P3D.1  | Blocked          | P0.4, P1C.5                          | Current child contract and exact typing                                          |
| P3D.2  | Blocked          | P3D.1, P1D.1c                        | Child supervision/generation/internal restore                                    |
| P3A.1  | Blocked          | P2.1d, P3B.3, P3C.1, P3D.2           | Final post-family transition/model differential                                  |
| P4A.1  | Blocked          | P2.4, P3A.1                          | Public testing/pending-work convergence                                          |
| P4A.2  | Blocked          | P4A.1                                | Story/Scenario compatibility                                                     |
| P4A.3  | Blocked          | P2.3, P1D.3b                         | Launch Workspace canonical business read models                                  |
| P4B.1a | Blocked          | P1B.2, P1C.3b, P1D.3a                | External-store resource/view sources                                             |
| P4B.1b | Blocked          | P4B.1a                               | Actor hook and runtime lease                                                     |
| P4B.1c | Blocked          | P4B.1b, P4C.1b                       | Launch Workspace bootstrap                                                       |
| P4B.1d | Blocked          | P4B.1c                               | SSR/Offscreen/multiple-root/HMR/RSC matrix                                       |
| P4B.2  | Blocked          | P4B.1d                               | useActor/use alias and packed React inference                                    |
| P4C.1a | Blocked          | P0.6, P1D.1a                         | Decoder/version/limits to immutable value                                        |
| P4C.1b | Blocked          | P4C.1a, P1A.4d, P1C.5                | Atomic attachment/conflict handling                                              |
| P4C.1c | Blocked          | P4C.1b, P1D.3a                       | Coherent actor/resource dehydrate barrier                                        |
| P4C.2  | Blocked          | P4C.1b, P1D.1c                       | Request-scoped runtime and finalization                                          |
| P4D.1a | Blocked          | P1D.3b                               | Pure metadata and core committed-fact inspection                                 |
| P4D.1b | Blocked          | P4D.1a, P3A.1                        | Final family evidence integration and duplicate deletion                         |
| P4D.2  | Blocked          | P4D.1b, P4A.2                        | One programmatic/CLI evidence object                                             |
| P5.1   | Blocked          | P4A.1, P4B.2, P4C.2, P4D.2           | Deletion and deprecation closeout                                                |
| P5.2   | Blocked          | P5.1                                 | Packed clients and layout matrix                                                 |
| P5.3   | Blocked          | P5.2                                 | Documentation truth                                                              |
| P5.4   | Blocked          | P5.3                                 | Performance, final review, and plan closure                                      |

Parent labels P0.1, P1A.3, P1A.4, P1C.3, P1C.4, P1D.1, P1D.2, P1D.3,
P2.1, P2.2, P4B.1, P4C.1, and P4D.1 are preserved as packet families or
redirects; they are not independently executable status rows. P1D.2 is distributed: machine
delegation belongs to P1C.5, resource delegation to P1B.1, each async family
delegates its own test path, and P4A.1 closes the public testing/pending surface.

## Phase navigation

Phases group related packets; they are not blanket prerequisites. Follow the
packet dependencies above.

| Phase | State           | Manifest                                                                          |
| ----- | --------------- | --------------------------------------------------------------------------------- |
| 0     | Done            | [Baseline, semantic decisions, and proof](./tasks/PHASE_0.md)                     |
| 1     | **Current**     | [Canonical identity, runtime ownership, and Effect lifecycle](./tasks/PHASE_1.md) |
| 2     | Blocked packets | [Transactions, concurrency, and atomic publication](./tasks/PHASE_2.md)           |
| 3     | Blocked packets | [Transitions and actor-owned asynchronous work](./tasks/PHASE_3.md)               |
| 4     | Blocked packets | [Testing, React, server, inspection, and CLI adapters](./tasks/PHASE_4.md)        |
| 5     | Blocked packets | [Deletion, packed proof, documentation, and closeout](./tasks/PHASE_5.md)         |

## Planning consistency gate

Keep the plan in Markdown. Do not create a YAML/JSON task DSL or generate
contract/decision/packet prose. A lightweight architecture test may validate:

- unique DEC, BUG, BT, TI, CV, and executable packet IDs;
- every primary owner and dependency names a status-table packet;
- one primary owner per bug/test row;
- at most one active packet and only dependency-complete packets marked ready;
- every done packet has an existing immutable receipt with its base commit and
  exact command results, introduced in the same Git commit as its matching
  status transition, except the grandfathered P0.1a two-commit receipt;
- linked local files/test paths and known command tiers exist;
- a change to semantic or behavioral acceptance criteria moves affected
  done/ready packets to needs-revalidation; a process-only closeout amendment
  does not.

Generate only navigation indexes or validation reports. Do not infer bug closure
from a passing test, generate receipts, or use checkboxes as status.

## Execution rules

- Give a worker exactly one executable packet, its permitted files, dependencies,
  linked DEC/BUG/BT/TI/CV rows, commands, and stop conditions.
- Definitions describe; runtime owners execute. Adapters and test layers never
  become semantic owners.
- Implement each family in this order: public source/packed sentinel; runtime
  owner with exact Effect/Service/Layer/Scope/publication contract; stabilize
  runtime shape; family callbacks/inference; declarations/packed consumer;
  adapters; delete displaced engine.
- Every unknown boundary validates to a complete immutable value before mutation.
- Every asynchronous owner names Scope, generation, interruption, finalizer,
  Cause, admission, capacity, and publication point.
- Preserve typed failure, defect, interruption, cleanup, stale, observer,
  unsupported, conflict, and invalid-input lanes.
- Do not use casts, source-text assertions, real sleeps, double flushes, copied
  adapter engines, or production helpers as independent test oracles.
- Reference TanStack Query/XState only through packet-named files and only for
  invariants/test shapes. Flow State authorities always win.
- Preserve unrelated work and keep evaluations/ read-only.
- After review and affected verification, write the immutable receipt, update
  the matching packet row and necessary top-status line, and run
  `pnpm fmt && pnpm lint`. Stage only the packet's allowed files, receipt, and
  `TASK.md`; inspect the staged allowlist and diff, then create one commit.
- Receipts record the exact Base commit and the literal
  `Commit proof: derived-from-git-history`. They never embed the SHA of the
  commit containing them; derive it with Git from the commit that introduces
  the receipt and matching status transition. P0.1a's existing two-commit
  receipt remains valid historical evidence and is not rewritten.
- Phase closure runs the broader named gates.

## Smaller-model navigation

A smaller implementation model must:

1. Open this file and select only a ready/active packet.
2. Read only that packet section plus linked contracts, DEC/BUG/BT/TI/CV rows,
   dependency receipts, and relevant OWNER_MAP rows.
3. Record the base commit/tree and pre-existing failures before changing files.
4. Produce the focused red proof first.
5. Edit only the named semantic owner/type surface; stop on a listed condition.
6. Use the exact Effect/TypeScript construction order above.
7. Run literal packet commands; do not substitute weaker checks.
8. Inspect/refactor, run the thermo-nuclear review, fix all blocking findings,
   and rerun affected verification.
9. Write the immutable receipt and update only the matching packet row plus the
   necessary top-level status line; checkbox prose remains acceptance criteria.
10. Run `pnpm fmt && pnpm lint`, stage the exact allowed packet files plus the
    receipt and `TASK.md`, inspect the staged diff, and create one commit.

## Final outcome

The plan closes only when P5.4 has a receipt; all BUG, BT, TI, and CV ledgers
have primary-owner evidence; one owner remains per capability; source and packed
type matrices pass; compatible public contracts and executable behavior agree;
and documentation reports executable truth.
