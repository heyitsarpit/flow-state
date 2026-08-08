# Implementation task index

Status: phase 0 ready

Only one phase may be active. A phase becomes complete only when its receipt exists and
every acceptance, deletion, and gate in its manifest is satisfied.

Working findings live in [`../SCRATCHPAD.md`](../SCRATCHPAD.md). Review it before starting or
closing a phase; unresolved blockers prevent phase completion unless a contract explicitly
assigns them to a later phase.

| Phase | Manifest                                                                           | Initial status |
| ----- | ---------------------------------------------------------------------------------- | -------------- |
| 0     | [Baseline and contract cutover](./PHASE_0_BASELINE_AND_CONTRACT_CUTOVER.md)        | Ready          |
| 1     | [Definitions, identity, types, and AppPlan](./PHASE_1_DEFINITIONS_AND_APP_PLAN.md) | Waiting        |
| 2     | [Managed runtime and actor engine](./PHASE_2_RUNTIME_AND_ACTOR_ENGINE.md)          | Waiting        |
| 3     | [Resource kernel](./PHASE_3_RESOURCE_KERNEL.md)                                    | Waiting        |
| 4     | [Transactions and activities](./PHASE_4_TRANSACTIONS_AND_ACTIVITIES.md)            | Waiting        |
| 5     | [React and hosts](./PHASE_5_REACT_AND_HOSTS.md)                                    | Waiting        |
| 6     | [Stories and model](./PHASE_6_STORIES_AND_MODEL.md)                                | Waiting        |
| 7     | [Artifacts, inspection, and CLI](./PHASE_7_ARTIFACTS_INSPECTION_CLI.md)            | Waiting        |
| 8     | [Migration and deletion](./PHASE_8_MIGRATION_AND_DELETION.md)                      | Waiting        |

## Confirmed-issue ownership

The confirmed issues in `../../IMPLEMENTATION_BLOCKERS.md` close in exactly one phase. A
phase receipt must name its owned issue IDs and the executable proofs that closed them.

| Issue | Owning phase | Required proof                        |
| ----- | ------------ | ------------------------------------- |
| `I1`  | 6            | `PROOF-002`, `PROOF-011`              |
| `I2`  | 5            | `PROOF-003`, `PROOF-012`              |
| `I3`  | 3            | `PROOF-005`, `PROOF-006`              |
| `I4`  | 3            | `PROOF-006`                           |
| `I5`  | 5            | `PROOF-006`, `PROOF-012`              |
| `I6`  | 3            | `PROOF-006`                           |
| `I7`  | 3            | `PROOF-006`                           |
| `I8`  | 1            | `PROOF-002`, `PROOF-005`              |
| `I9`  | 1            | `PROOF-002`                           |
| `I10` | 6            | `PROOF-001`, `PROOF-005`, `PROOF-011` |
| `I11` | 6            | `PROOF-004`, `PROOF-008`, `PROOF-009` |
| `I12` | 4            | `PROOF-007`                           |
| `I13` | 2            | `PROOF-001`, `PROOF-004`              |
| `I14` | 5            | `PROOF-004`, `PROOF-012`              |
| `I15` | 7            | `PROOF-014`                           |
| `I16` | 7            | `PROOF-002`, `PROOF-005`, `PROOF-014` |
| `I17` | 5            | `PROOF-004`, `PROOF-012`              |
| `I18` | 8            | `PROOF-016`, `PROOF-017`              |

Phase 0 verifies this mapping against the live files and records exact initial test owners;
it does not reopen ownership unless the contract pack itself is corrected first.

## Phase discipline

- Read only the active manifest and the contracts it names.
- Preserve unrelated worktree changes and record pre-existing overlap in the receipt.
- Add confirmed newly discovered defects to the active receipt; change a contract only
  when the defect exposes an actual contract error.
- Record new blockers, notes, and proposed decisions in `../SCRATCHPAD.md`; promote semantic
  changes into the contracts, proof matrix, and affected phase before implementing them.
- Production, story, model, React, server, inspect, and CLI surfaces must consume the same
  owners. A phase may not land a temporary second engine.
- Delete replaced owners, exports, fixtures, source-text tests, and examples only after the
  replacement's executable proofs pass in the same phase.
- A phase receipt lives at `../receipts/PHASE_<N>.md` and records contract IDs, changed
  files, deleted files, exact commands and exits, proof results, remaining failures, and
  the next phase status.
