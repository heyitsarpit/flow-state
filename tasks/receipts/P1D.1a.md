# P1D.1a packet receipt

Packet: P1D.1a Host boundary, service contracts, and Layer composition
Dependencies: P0.6.
Base commit: 9afe8eb57713eac3ebcf08195be648606f4b8658
Base tree: Clean tracked tree before P1D.1a.
Commit proof: derived-from-git-history
Files: `TASK.md`, `packages/flow-state/src/core/api/app-descriptor-types.ts`, `packages/flow-state/src/core/runtime/services/runtime-contracts.ts`, `packages/flow-state/src/descriptors/app.ts`, `packages/flow-state/src/index.ts`, `packages/flow-state/src/public-api-types.test.ts`, `packages/flow-state/src/runtime/contract-runtime.ts`, and `tasks/receipts/P1D.1a.md`.
Owner after change: Runtime service identity is now named through `FlowRuntimeCoreServices`, `FlowRuntimeHostServices`, `FlowRuntimeDefaultServices`, `FlowRuntimeAdditionalServices`, and `FlowRuntimeServiceLayer`. `contract-runtime.ts` and app layer typing consume those aliases instead of repeating local service unions, so P1B.1 and P1C.1 have a stable service/Layer contract to implement without selecting ResourceStore or actor internals here.
Defects closed: DEC-16 implementation slice for host/service/Layer boundary typing is closed. Runtime operation seams still preserve exact `Effect<A, E, R>` channels, app layer acquisition errors remain typed, missing layer requirements remain visible, and provided requirements disappear before `flow.runtime(...)`.
Effect map: No new Effect execution path was introduced. `ManagedRuntime.make(...)` remains owned by `runtime/contract-runtime.ts`; `runPromise`, `runPromiseExit`, `runSync`, and disposal remain host-runtime bridge methods rather than semantic-owner internals.
Layer/lifetime: Existing host layer kinds are classified in `flowRuntimeLayerContracts`: pure scheduler installation is `succeed`, and host signals, runtime policy, ResourceStore, InspectionLog, TraceLog, and OrchestratorSystem construction are `effect`. No scoped runtime Layer or finalizer-ordering migration was selected here; that remains P1D.1c/P1A.4a/P1C.3a work.
Native primitives: Direct `Context.Service` tags remain the runtime dependency contract. No hidden service bag, alternate DI container, global runtime singleton, or public operation wrapper was added.
Failure lanes: Layer acquisition errors stay in the runtime error channel. The P1D.1a type sentinel proves an app Layer with `"analytics-acquire-failed"` retains that acquisition failure in `runPromiseExit(...)`, and an unprovided `ProjectConfig` requirement is rejected at the host boundary.
Reused: Existing `FlowRuntime`, `RuntimeReadyLayer`, app `layer(...)`, `mergeRuntimeInstallers(...)`, `FlowRuntimePolicy`, and test/live service Layers.
Merged/moved: Local runtime service unions moved from `runtime/contract-runtime.ts` into `core/runtime/services/runtime-contracts.ts`.
Removed: Repeated anonymous runtime service unions in public app layer typing and `contract-runtime.ts`.
Rejected clones: No new runtime container, service registry, request runtime global, source-text test oracle, or ResourceStore/actor migration was introduced.
Compatibility: Public runtime call shapes are unchanged. Root exports now include the runtime service and Layer contract types, while existing runtime/service type exports remain available.
Tests added: Public type tests now prove default runtime service identity through `FlowRuntimeDefaultServices`, split core/host service unions, acquisition error preservation, missing-requirement rejection, provided-requirement disappearance, and host-visible `runPromiseExit(...)` acquisition failure typing.
Commands:

- F `pnpm exec vitest run packages/flow-state/src/runtime.test.ts packages/flow-state/src/public-api-types.test.ts` — exit `0`; 2 files and 60 tests passed.
- T `pnpm --filter flow-state check:cli-source-types` — exit `0`.
- P `pnpm --filter flow-state build` — exit `0`; package declarations, build-output hygiene, and bundle-size baseline passed at raw 226,234 bytes / gzip 44,002 bytes, inside the configured growth ratio.
- E `pnpm --filter @flow-state/launch-workspace check:typescript-mode-proofs` — exit `0`.
- Extra architecture check `pnpm exec vitest run packages/flow-state/src/runtime-architecture.test.ts packages/flow-state/src/public-typing-architecture.test.ts` — exit `0`; 2 files and 35 tests passed.
- C `pnpm check` — exit `1`; after formatting packet-owned files, the only remaining blockers were the pre-existing formatting disagreements in `examples/launch-workspace/scripts/collect-function-outputs.ts` and `examples/launch-workspace/scripts/generate-inspect-proof.mjs`. Those out-of-scope formatter hunks were not staged.
- Final `pnpm fmt` — exit `0`; Launch Workspace script formatter hunks produced by the command were reverted as out-of-scope before staging.
- Final `pnpm lint` — exit `0`; lint completed with existing warnings only.

Review: Thermo-nuclear review found the packet names the runtime service boundary without changing runtime behavior, keeps acquisition errors and missing requirements visible at the type seam, leaves Promise conversion at host-owned runtime methods, and does not migrate ResourceStore, actor, transaction, stream, timer, or child internals ahead of their packets.
Authority changes: P1D.1a is now done. P1B.1 is ready next.
Still open: P1B.1 must consume P1A.2 key identity and P1D.1a runtime contracts in the canonical ResourceStore and resource identity migration. Scoped/finalizer shutdown behavior remains later P1D.1c/P1A.4a/P1C.3a work.
