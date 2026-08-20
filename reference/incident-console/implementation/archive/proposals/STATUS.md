# Historical proposal resolution snapshot

Status: archived historical snapshot. This file records an earlier proposal-resolution state. It does not
amend the normative contract pack and is not the current queue or decision frontier.

The closed integration ledger is [MIGRATION_RECONCILIATION.md](./MIGRATION_RECONCILIATION.md).
The closed decision register is [GRILL_REQUIRED_DECISIONS.md](./GRILL_REQUIRED_DECISIONS.md).

## Status meanings

- **Resolved**: the semantic decision is accepted and may be transferred into the owning contract.
- **Partial**: the direction is accepted, but the proposal contains stale names, over-specified API, or
  claims that still need to be reduced to the accepted surface.
- **Open**: a decision, exact contract shape, or proof obligation remains unsettled.
- **Evidence**: useful source or migration evidence, not contract authority.

## Accepted decisions now reflected

1. `App` owns static composition; `AppPlan` remains private and closed-world.
2. `Module` remains the authored grouping and tooling/artifact boundary.
3. `BehaviorGateway` remains the CLI registration boundary and is not the application compiler or
   Runtime entrypoint.
4. `behavior({ stories })` uses explicit external-ID record keys, retains one App identity, and accepts
   both App Stories and Machine Stories. `ActorRecipe` is not a gateway entry.
5. `--force` is replaced by `--overwrite`.
6. `Implementation` is the primary injectable provider/layer boundary. It can contain multiple service
   providers, but one Runtime resolves one provider per service identity.
7. `RuntimeSetup` replaces the user-facing `RuntimeFactory` term and is the inert recipe shared by live
   hosts and Stories.
8. `Runtime` owns acquired providers, actors, work, evidence, and cleanup through the production path.
9. `ActorRecipe` is an inert run-local actor construction input.
10. `Fixture` primarily supplies or overrides an Implementation for one Story run and may carry the
    existing resource-seed inputs.
11. The mock boundary is the complete function supplied by an Implementation service. The Story does
    not register argument/output pairs or replace resource, transaction, or stream kernels.
12. An Implementation provider supplies the complete service interface for its service identity. Partial
    method patching is not part of the target model; Runtime composition resolves one final provider per
    service identity.
13. The public fixture shape is `fixture({ id, implementation, seeds? })`; `controls` and a control registry
    are removed from the target model. Existing control code is migration evidence only.
14. The Story builder is the sole testing boundary and `.run()` is the sole execution boundary. No separate
    pending-external-work or result-injection command is part of the target Story API.
15. Existing implementation-layer machinery may remain internal; no second testing provider system is
    introduced.
16. A Fixture Implementation overrides the App Implementation for the same service identity in that Story;
    duplicate providers within one Fixture set are rejected rather than resolved by ordering.
17. Every declared App or machine service requirement must be closed by an Implementation, even when a
    resource seed means a particular lookup is skipped.
18. Each service provider is constructed once per Runtime. Stories receive fresh Runtime-scoped provider
    state; cross-Story state requires explicit application-level ownership.
19. Mock functions return ordinary typed Effects or Streams. The production Runtime classifies typed failure,
    defect, interruption, cancellation, and cleanup; no mock-specific outcome helpers are added.
20. The public Fixture API remains `fixture({ id, implementation, seeds? })`; no `Implementation.of`,
    `mock`, or `stub` constructor is added.
21. The first Todo slice uses only whole-function Implementations and does not require seeds. Seeds remain
    optional Fixture data for preloaded Runtime-owned resource state such as hydration, cache, or SSR data.
22. Seeds are not service-function mocks, global mutable state, or arbitrary cache mutation. They remain
    adjacent to the selected Implementation through Fixture without becoming members of Implementation.
23. Resource, transaction, and stream descriptors retain their authored adapter functions; Implementations
    supply the service dependencies those adapters resolve.
24. Operation input `P` contains domain/request data only. Service dependencies belong to the inferred
    requirement `R`, not inside every operation input.
25. Resource lookup results enter canonical resource state through the resource kernel. Transaction and stream
    results require explicit authored mappings before changing machine or resource state.
26. Runtime-owned cancellation/options such as `AbortSignal` remain separate from domain input and are
    supplied through the adapter options boundary.
27. No operation-to-mock registry is introduced. Effect/Stream requirement inference remains the single
    provider-closure source.

## Grill round 1 decisions

- **Q1 — Direct Story identity: A.** Stable `storyId` belongs to the BehaviorGateway record. Direct
  `Story.run()` returns in-process evidence and does not invent a gateway Story ID.
- **Q2 — Empty gateway: A.** `behavior({ stories: {} })` is rejected. App-only artifacts require a
  separate future boundary rather than a second App identity input.
- **Q3 — Machine Story setup: A.** `story.machine(machine, options)` remains the public shape and
  privately creates its focused RuntimeSetup from the machine and fixture Implementations.
- **Q4 — External observation: deleted.** The separate `control` abstraction and result-injection command are
  removed from the target model. Function-level Implementations are the Story mocking boundary, and the Story
  builder plus `.run()` are the complete testing boundary.
- **Q5 — Runtime construction: A.** `RuntimeSetup.construct()` returns the synchronous Runtime shell;
  the existing Runtime readiness/Effect surfaces report acquisition and bootstrap failures.

## Proposal matrix

| Proposal | Resolution | Resolved surface | What is settled | What remains |
| --- | --- | ---: | --- | --- |
| [APP_ENTRY_AND_OWNERSHIP.md](./APP_ENTRY_AND_OWNERSHIP.md) | Partial | High | App/AppPlan ownership, private AppPlan, retained BehaviorGateway, separate CLI/runtime/Story boundaries, one App identity | Exact `behavior({ stories })` contract, direct-run Story identity, empty gateway behavior, final gateway brand/loading proof |
| [ARTIFACT_INSPECTION_MIGRATION.md](./ARTIFACT_INSPECTION_MIGRATION.md) | Partial | Medium-high | One private v2 artifact/codec owner, AppPlan-derived behavior artifact, runtime-evidence trace, bounded inspection projection, legacy v1/Scenario deletion direction | Exact public carriers, projection fields, error mapping, persistence compatibility proofs, implementation ownership details |
| [CLI_EXAMPLES_AND_CROSSCHECK.md](./CLI_EXAMPLES_AND_CROSSCHECK.md) | Partial | High | Named gateway, explicit Story-ID record, inert discovery, App/Machine Story admission, shared executor, artifact-only non-execution, `--overwrite` | Stale app-only and RuntimeFactory wording, exact loader diagnostics/import rules, final proof-package layout, trace identity |
| [CONSISTENCY_AND_DELETION_AUDIT.md](./CONSISTENCY_AND_DELETION_AUDIT.md) | Partial | High | App versus gateway boundary, explicit Story imports, hard deletion/no aliases, one compiler/registry/runtime owner, Story-kind separation | Exact final public signatures, package-loader behavior, direct trace identity, proof ownership and contract clause mapping |
| [CORE_RUNTIME_API.md](./CORE_RUNTIME_API.md) | Partial | Medium | Runtime ownership, service requirements, one provider graph, production ownership, typed P/K/A/E/R direction | Replace RuntimeFactory/runtime/Layer wording with RuntimeSetup/Implementation; settle synchronous Runtime-handle construction versus readiness surface; complete descriptor and error signatures |
| [HOST_PERSISTENCE_INSPECTION.md](./HOST_PERSISTENCE_INSPECTION.md) | Partial | Medium | One Runtime owner for request/Story/host paths, shared codec/evidence ownership, no public artifact model, bounded inspection | Exact host signatures, boot/artifact carriers, inspection sink behavior, failure field rules, persistence proofs |
| [STORY_CLI_MIGRATION.md](./STORY_CLI_MIGRATION.md) | Partial | High | `.story.ts` as authoring convention only, explicit gateway registration, App/Machine Story CLI support, shared direct/CLI executor, deletion of old Scenario/path APIs | Replace stale RuntimeFactory/Layer references, direct trace Story ID, exact CLI result/error/signal rules, loader proof |
| [STORY_TESTING_API.md](./STORY_TESTING_API.md) | Superseded | Medium-high | Production Story runtime, App/Machine/ActorRecipe boundaries, BehaviorGateway record | Replaced by [STORY_IMPLEMENTATION_MOCKS.md](./STORY_IMPLEMENTATION_MOCKS.md); retain only as historical control/simulate evidence |
| [STORY_IMPLEMENTATION_MOCKS.md](./STORY_IMPLEMENTATION_MOCKS.md) | Resolved direction | High | Whole service-function Implementations, complete provider interfaces, fixture implementation shape, resource/transaction/stream boundary, builder-only Story execution | Transfer exact signatures and proof ownership into the normative contract |

## Do not treat as resolved

The following are still proposal notation or implementation work, even where the surrounding direction
is accepted:

- Type aliases such as `InstalledControls`, `FixtureTupleClosing`, `ObservationShape`, and private gateway
  carriers are not automatically public API.
- Proposal examples using `control` or `RuntimeFactory` are stale target-model names until rewritten as
  `Implementation` and `RuntimeSetup`. `Layer` may remain an internal construction detail of an
  Implementation provider.
- A green proposal example, source scan, or focused test does not prove Runtime ownership, lifecycle,
  artifact, CLI, or packed-declaration compliance.
- The old Everclear `pendingWork.children` assertion is legacy evidence and must follow the normative
  pending-work shape.

## Grill round 3 decisions

1. **Mock boundary: accepted.** Implementations replace complete service functions. Public resource,
   transaction, and stream operations remain production-kernel behavior.
2. **Provider completeness: accepted.** A provider supplies the complete service interface for its service
   identity. Partial method patching is rejected.
3. **Fixture shape: accepted.** Fixtures carry `implementation` and optional resource `seeds`; they do not
   declare controls or install a second testing provider system.
4. **Pending work: accepted.** Whole-function Implementations return typed Effects or Streams. There is no
   separate Story result-injection command; pending behavior is modeled by the supplied Implementation.

The remaining work is mechanical contract transfer and proof assignment, not another decision about the
mock boundary. Beads remain deferred until the contract pack is closed.

## Grill round 4 decisions

1. **Override precedence: accepted.** A Fixture Implementation overrides the App Implementation for the
   same service identity. Duplicate providers within one Fixture set fail rather than depend on ordering.
2. **Requirement closure: accepted.** Seeds do not satisfy or remove declared service requirements; every
   App or machine requirement must be closed by an Implementation.
3. **Provider lifetime: accepted.** Providers are constructed once per Runtime. Story runs receive fresh
   Runtime-scoped state unless application-level ownership explicitly makes state shared.
4. **Effect and Stream semantics: accepted.** Mock functions return ordinary typed Effects or Streams and
   the production Runtime owns outcome classification, cancellation, and cleanup.
5. **Public fixture shape: accepted.** `fixture({ id, implementation, seeds? })` is the only Fixture
   construction surface; no mock-specific or second Implementation constructor is added.

## Grill round 5 decisions

1. **Todo seed scope: accepted.** Todo uses only whole-function Implementations in its first slice; seeds
   are not required for external lookup or transaction mocking.
2. **Seed ownership: accepted.** Seeds are optional Fixture data for preloaded Runtime-owned resource state,
   including hydration, cache, or SSR data. They remain adjacent to the selected Implementation through the
   Fixture but do not become Implementation members.
3. **Seed boundary: accepted.** Seeds are not service-function mocks, global mutable state, or arbitrary
   cache mutation.

## Grill round 6 decisions

1. **Adapter ownership: accepted.** Operation descriptors retain authored adapter functions; Implementations
   supply the service dependencies those adapters resolve.
2. **Operation input purity: accepted.** `P` contains domain/request data only. Service dependencies are
   supplied through inferred `R` and are not embedded in operation inputs.
3. **Output ownership: accepted.** Resource results enter canonical state through the resource kernel;
   transaction and stream results require explicit authored mappings before changing state.
4. **Runtime options: accepted.** Runtime-owned cancellation and options remain separate from domain input
   and are supplied through the adapter options boundary.
5. **Provider closure: accepted.** No operation-to-mock registry is added; Effect/Stream requirements remain
   the single provider-closure source.

## Grill round 7 decisions

1. **Story builder boundary: accepted.** Story methods build immutable plans; `.run()` is the sole execution
   boundary and creates the scoped production Runtime.
2. **Result injection: deleted.** The separate pending-external-work/result-injection command is removed from
   the target Story API. Complete service Implementations supply typed Effects or Streams, while production
   operation kernels retain admission, completion, writes, projections, and evidence ownership.

## Grill round 8 decisions

1. **Operation grammar: accepted.** Use the narrow family-specific resource, transaction, and stream
   descriptors with domain-only `P`, canonical `K`, service requirements through `R`, complete service
   Implementations, typed Fixture seeds, and deterministic duplicate-seed rejection.
2. **Diagnostics: accepted.** Use stable package-owned diagnostic codes and typed details; omit absent fields,
   keep raw `Cause` only on disposal and Story execution envelopes, and preserve the original execution or
   cancellation failure as primary when cleanup also fails.

Answers should be recorded here first, then transferred into the owning contract files. Beads remain
deferred until the contract pack is closed.
