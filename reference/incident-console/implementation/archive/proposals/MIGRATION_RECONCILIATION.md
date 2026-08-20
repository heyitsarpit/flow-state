# Migration proposal reconciliation

Status: closed integration ledger; archived after contract transfer.

This ledger reconciles the proposal directory against the accepted grill decisions and the normative
contract pack. It does not amend normative contracts or create Beads. The user-input frontier is isolated in
[GRILL_REQUIRED_DECISIONS.md](./GRILL_REQUIRED_DECISIONS.md).

All design decisions in this ledger are closed or explicitly retained as active accepted revision
authority. The remaining implementation planning and proof inventory is a future Beads input, not an open
proposal decision.

## Closed direction

These decisions are settled and must not be reopened while transferring the contract:

- `App` owns static composition; `AppPlan` is private and closed-world.
- `BehaviorGateway` is CLI registration only. `behavior({ app, stories })` uses explicit record keys as external
  Story IDs and accepts App and Machine Stories, not ActorRecipes.
- `RuntimeSetup` is the inert construction recipe; `Runtime` is the production ownership boundary.
- `Implementation` is the only provider boundary. Fixtures override providers by service identity, duplicate
  Fixture providers fail, and every declared `R` requirement remains closed even when a seed skips a lookup.
- Whole service functions are replaced through Implementations. Resource, transaction, and stream kernels stay
  real; no control registry, mock registry, or argument/output matcher exists.
- `fixture({ id, implementation, seeds? })` is the Story environment shape. Seeds are optional preloaded
  Runtime-owned resource state, not service mocks or global mutable state.
- `P` contains domain input; service dependencies remain in inferred `R`; Runtime options/cancellation stay
  outside `P`.
- Story testing uses complete Implementations only. The builder is the testing boundary and `.run()` is the
  execution boundary; no separate pending-work result-injection command exists.
- `--force` is replaced by `--overwrite`; old Scenario, control, v1 artifact, and compatibility surfaces are
  hard-delete candidates, not aliases.

## Remaining work before Beads

The contract-transfer work is complete. No proposal remains an active semantic owner. The remaining work is
implementation planning and proof inventory, and can become Beads only after each item has an explicit owner,
source file boundary, acceptance behavior, and executable proof.

1. Build the `KEEP / REPLACE / DELETE` matrix across rewrite exports, deep imports, declarations, examples,
   docs, tests, CLI leaves/flags, artifacts, and scripts.
2. Split the contract families into dependency-ordered implementation slices under
   `packages/flow-state-rewrite/`, using the crosswalk in `../../contracts/PROOF_MATRIX.md`.
3. Assign each slice exact proof files, commands, reviewer ownership, and high-impact test obligations using
   `../../contracts/IMPLEMENTATION_WORKFLOW.md` and the crosswalk in `../../contracts/PROOF_MATRIX.md`.
4. Add the late proving apps and cutover/absence gates without treating the frozen package or deleted phase
   records as vNext proof.

## Proposal and decision-record disposition

This section is the authoritative disposition list for the proposal directory. Proposal text never overrides
the contracts. Accepted decisions are transferred selectively; stale examples, superseded APIs, and historical
reasoning are not carried into implementation.

### Archive after preserving history

These files are no longer active design inputs:

| File | Reason |
| --- | --- |
| `./STATUS.md` | Historical grill ledger. It contradicts the latest `behavior({ app, stories })`, `Runtime.ready()`, and diagnostic decisions. Preserved for history, but not status authority. |
| `./STORY_TESTING_API.md` | Superseded by whole-function `Implementation`/`Fixture` semantics. Its `control`, per-occurrence `simulate`, and result-injection model is rejected. |
| `../adr/0002-bound-gateway-story-catalog.md` | Superseded by ADR-0003 and later explicit `behavior({ app, stories })` acceptance. |
| `../adr/0006-control-remains-a-narrow-story-adapter.md` | Superseded by ADR-0008; control is not the target mock boundary. |
| `../adr/0007-simulate-is-the-sole-external-observation-boundary.md` | Superseded by whole-function Implementations; `simulate` is deferred and not part of the first slice. |
| `../audits/PRESERVATION_AUDIT-2026-08-19.md` | Superseded contract-sufficiency audit; its former gaps are closed by the current contracts and this ledger. |
| `../research/CANONICAL_OPTIMIZED_VNEXT_SPEC-2026-08-18.md` | Pre-contract research snapshot; its stale recommendations are not implementation authority. |

These are already retired in the current worktree and must not be recreated as active planning:

| Path | Disposition |
| --- | --- |
| `../../tasks/` | Old phased task plan; replaced by the future Beads graph. |
| `../../receipts/` | Old implementation receipts; historical proof only. |
| `../../phase-0/` | Old baseline/proof inventory; historical evidence only. |

The deletions above are already represented in the worktree. No second archive or replacement task list is
needed for them.

### Closed registers archived after contract transfer

| File | Role |
| --- | --- |
| `./GRILL_REQUIRED_DECISIONS.md` | Closed user-decision register; preserved for provenance. |
| `./MIGRATION_RECONCILIATION.md` | Closed transfer and disposition ledger; remaining implementation work is not a design decision. |

### Archived source proposals after contract transfer

| Proposal | Disposition |
| --- | --- |
| `./APP_ENTRY_AND_OWNERSHIP.md` | Transferred into App/AppPlan, RuntimeSetup/Runtime, gateway, and Story contracts; archived after cross-reference review. |
| `./ARTIFACT_INSPECTION_MIGRATION.md` | Transferred into `PERSISTENCE_AND_ARTIFACTS.md`, `PUBLIC_API.md`, `CLI.md`, and proof/deletion ownership; archived after cross-reference review. |
| `./CLI_EXAMPLES_AND_CROSSCHECK.md` | Transferred into CLI gateway, direct/CLI parity, loader, signal, and `--overwrite` clauses; archived after cross-reference review. |
| `./CONSISTENCY_AND_DELETION_AUDIT.md` | Transferred into `COMPATIBILITY_AND_DELETIONS.md`, `PROOF_MATRIX.md`, and the Beads crosswalk; archived after cross-reference review. |
| `./CORE_RUNTIME_API.md` | Transferred into RuntimeSetup/Runtime.ready, operation grammar, provider closure, and diagnostic clauses; archived after cross-reference review. |
| `./HOST_PERSISTENCE_INSPECTION.md` | Transferred into persistence, inspection, host, private-carrier, and failure clauses; archived after cross-reference review. |
| `./STORY_CLI_MIGRATION.md` | Transferred into CLI, TESTING, and proof sequencing clauses; archived after cross-reference review. |
| `./STORY_IMPLEMENTATION_MOCKS.md` | Transferred into Implementation/Fixture/seed typing, precedence, lifetime, operation binding, and proofs; archived after cross-reference review. |

The transfer list contains both semantic overrides and implementation/proof obligations. Only the former may
change normative behavior; the latter become Beads tasks after the contract pack is closed.

### Contract override status

No user-owned grill decision remains open. The accepted semantics are already represented in the active
contracts: explicit `behavior({ app, stories })`, `RuntimeSetup` plus `Runtime.ready()`, whole-function
`Implementation`/`Fixture` mocks with optional seeds, declaration-owned persistence, private artifact/boot
internals, public diagnostic boundaries, and `--overwrite`.

The following contract-text overrides are complete in the current worktree:

| Contract file | Completed override |
| --- | --- |
| `../../contracts/GLOSSARY_AND_IDENTITY.md` | Runtime ownership now uses `RuntimeSetup` for inert construction and `Runtime` for lifecycle/admission. |
| `../../contracts/TESTING.md` | Story execution now names `Runtime`, `.run()`, and complete `Implementation` semantics. |
| `../../contracts/TYPE_SYSTEM.md` | Runtime overload notation now uses the public `App` type and `RuntimeSetup`/`Runtime` boundary. |
| `../../contracts/REACT_AND_HOSTS.md` | Host sharing now names `RuntimeSetup`, constructed `Runtime`, and AppPlan. |
| `../../contracts/ARCHITECTURE.md` | Runtime ownership and completion-fence wording are aligned; no public `simulate` API is implied. |
| `../../contracts/SEMANTICS.md` | Occurrence fencing now uses neutral completion wording. |
| `../../contracts/PROOF_MATRIX.md` | Story proof ownership now names `RuntimeSetup`/`Runtime` and includes the contract-family Beads crosswalk. |

Additional completed closure work is recorded in `PUBLIC_API.md` (the normative behavior gateway),
`CLI.md`/`TESTING.md` (focused Machine Story AppPlan provenance), and
`PERSISTENCE_AND_ARTIFACTS.md` (Runtime-owned persistence lifecycle and closed operation trace facts).

`PUBLIC_API.md`, `CLI.md`, `PERSISTENCE_AND_ARTIFACTS.md`, and the core Story clauses in `TESTING.md` and
`TYPE_SYSTEM.md` already carry the accepted API direction. Their remaining work is consistency review and
executable proof, not another semantic override.

## Accepted revision disposition

The subagent audit compared each accepted revision against the live contract headings and exact rules:

| Revision | Disposition | Closure reason or remaining authority |
| --- | --- | --- |
| `01` Composition and App Plans | Archived | Complete rules are represented in `SEMANTICS.md`, `ARCHITECTURE.md`, and `REACT_AND_HOSTS.md`; the source chapter is provenance at `../revision-spec/accepted/01-composition-and-app-plans.md`. |
| `02` Machine Authoring | Archived | Complete grammar and reentry rules are represented in `SEMANTICS.md`, `TYPE_SYSTEM.md`, and `ARCHITECTURE.md`; the source chapter is provenance at `../revision-spec/accepted/02-machine-authoring.md`. |
| `03` Operations | Archived | Exact public operation-state unions, canonical key rules, and the 256-target invalidation bound are integrated into `PUBLIC_API.md`, `SEMANTICS.md`, `ARCHITECTURE.md`, `SNAPSHOTS.md`, and `TYPE_SYSTEM.md`. |
| `04` React and Hosts | Archived | Complete host lifecycle and passive-read rules are represented in `REACT_AND_HOSTS.md`; the source chapter is provenance at `../revision-spec/accepted/04-react-and-hosts.md`. |
| `05` Stories and Testing | Archived | Story processing, complete Implementations, no-`simulate` behavior, hydration rules, and proof obligations are integrated into `TESTING.md`, `PUBLIC_API.md`, `TYPE_SYSTEM.md`, and `PROOF_MATRIX.md`. |
| `06` Migration and Proofs | Archived | The no-`simulate`/no-control-registry rule and migration/proof obligations are integrated into `TESTING.md`, `COMPATIBILITY_AND_DELETIONS.md`, and `PROOF_MATRIX.md`. |
| `07` Deletions and Cutover | Archived | The exhaustive `DEL-*`/`RET-*` ledger and no-residue rule are integrated into `COMPATIBILITY_AND_DELETIONS.md`; that contract is now the active deletion owner. |

Therefore all accepted chapters are now safe to archive. The active contract pack owns the normative
semantics; the archived chapters remain available for provenance and audit comparison only.

## Phase-by-phase contract review

This review covers contract closure only; it does not claim that the greenfield implementation or its runtime
proofs exist yet.

| Phase | Review result | Handoff status |
| --- | --- | --- |
| Static foundation | `App` is the public authored type; `AppPlan` is private/closed-world; accepted machine and composition revisions remain the authority; no extra authored-app type remains. | Ready for dependency-ordered Beads decomposition. |
| Runtime ownership | `RuntimeSetup` is synchronous and inert; `Runtime` owns readiness, admission, implementations, persistence lifecycle, actors, and cleanup; `Runtime.ready()` is the sole public readiness boundary. | Ready; implementation must prove ordering and rollback through the production owner. |
| Operation kernels | Resource, transaction, and stream state unions remain owned by `REV-OPS-017`; trace facts now use closed family-specific discriminants, typed retention/value fields, and `InvalidTraceRecord` rejection without changing the public unions. | Ready; implementation must add the named race, fencing, hydration, and lifecycle proofs. |
| Persistence and evidence | Declaration-owned opt-in persistence, one provider on `RuntimeSetup`, provider-owned storage/codec/filter, Runtime-owned restore/observe/write/cleanup, private boot/artifact carriers, and public Cause boundaries are aligned. | Ready; implementation must prove restore, capture, bounded decoding, and failure truth. |
| Hosts, Stories, and CLI | `behavior({ app, stories })` is the inert one-App gateway; App and admitted Machine Stories share the production path; complete Implementations/Fixtures/seeds replace control/simulate/result injection; CLI uses `--overwrite`. | Ready; implementation must prove direct/CLI parity and exact gateway/CLI absence rules. |
| Cutover and absence | Old task/receipt/Phase 0 planning records are retired; superseded proposals/ADRs/audits are archived; frozen package remains reference-only; deletion and packed/browser/full gates remain future Beads work. | Ready for task inventory, not ready to claim implementation completion. |

### Non-normative records to retain, not merge

The former root implementation documents were removed after their contract-worthy content was integrated
into `../../contracts/IMPLEMENTATION_WORKFLOW.md` or the owning contract. They are not retained as active
research inputs or guardrails.

These non-normative records remain useful provenance and must not override the contracts:

- `../../revision-spec/NON_GOALS.md` and `../../revision-spec/UNRESOLVED_BEHAVIOR.md` — historical rejection and closure provenance.
- `../../revision-spec/recommendations/FOLDER_STRUCTURE.md` — optional repository organization guidance.

The pre-2026-08-18 canonical research snapshot is archived at
`../research/CANONICAL_OPTIMIZED_VNEXT_SPEC-2026-08-18.md`; it is not an input to implementation
decisions.

### ADR disposition after alignment

`docs/adr/0001`, `0003`, `0004`, `0005`, and `0008` through `0011` were reviewed against the contracts,
their decisions were transferred, and the records are now archived under `../adr/` as provenance.
They are not active authority and must not reintroduce control or per-call matching.

## Beads gate

Do not create Beads until the mechanical queue is reconciled, the user-input ledger is answered, the
normative contract pack is amended, and the proof/deletion inventory has named owners and fresh gates.
