# P1C.1 packet receipt

Packet: P1C.1 Canonical actor owner and explicit ownership domains
Dependencies: P1A.0, P1D.1a.
Base commit: 59c8b4f
Base tree: Clean tracked tree before P1C.1.
Commit proof: derived-from-git-history
Files: `TASK.md`, `packages/flow-state/src/core/api/runtime-types.ts`, `packages/flow-state/src/core/orchestrator/app-ownership.ts`, `packages/flow-state/src/core/orchestrator/orchestrator-helpers.ts`, `packages/flow-state/src/core/orchestrator/orchestrator-registry.ts`, `packages/flow-state/src/core/orchestrator/orchestrator-system.ts`, `packages/flow-state/src/orchestrator-system.test.ts`, `packages/flow-state/src/public-api-types.test.ts`, `packages/flow-state/src/runtime.test.ts`, `packages/flow-state/src/shared/diagnostics.ts`, `packages/flow-state/scripts/build-output-size-baseline.json`, and `tasks/receipts/P1C.1.md`.
Owner after change: Root actor start now resolves through one runtime-owned binding path. App-bound runtimes authorize root actors by the exact registered machine definition from the app ownership map, while focused `createRuntime().createActor(machine)` remains a compatibility path with a synthetic runtime owner domain.
Defects closed: App-bound actor start rejects unregistered, wrong-app, ambiguous, and unsupported-policy descriptors before actor work starts. Keep-alive reuse now requires the same public actor ID, owner domain, and exact machine definition instead of reusing by machine ID alone.
Effect map: Ownership compilation remains inert and does not execute client callbacks. Runtime start validation throws typed `FlowDiagnostic` failures before constructing actor work, while successful starts still use the existing orchestrator registry path.
Identity map: The registry stores public actor ID, owner domain, exact machine-definition token, monotonic incarnation, and actor handle as distinct internal facts. Exact-incarnation disposal deletes only the record it created, so a stale finalizer cannot evict a newer actor with the same public ID.
Ownership modes: App-bound runtime start accepts registered exact definitions, rejects ambiguous or unregistered definitions with `FLOW-ORCH-002`, and focused runtime start keeps synthetic ownership for explicit compatibility. Child actor starts inherit the parent owner domain without requiring child machines to be app-registered in this packet.
Typing map: `FlowActorStartOptions.policy` now accepts only the supported `"keep-alive"` policy at the public type seam, and a foreign runtime-bound cast still fails with the same `FLOW-ORCH-002` diagnostic before actor work starts.
Reused: Existing orchestrator registry start/get/send/stop/snapshot plumbing, app inventory identity, runtime layer composition, actor traces, and diagnostics plumbing were reused instead of adding a public app graph or second bind step.
Removed: The internal app ownership service no longer exposes unused actor-ID lookup helpers. The registry no longer treats same machine IDs as enough evidence for keep-alive reuse.
Compatibility: Public `runtime.createActor(machine)` still succeeds outside app-bound ownership, and same explicit actor IDs in different focused runtimes do not alias. App-bound actor IDs now reflect the registered app/module/actor path, so lifecycle trace assertions use the runtime actor ID while machine events keep the machine ID.
Tests added: Runtime coverage proves registered app-bound root actor start, unregistered and wrong-app rejection, ambiguous ownership rejection, focused compatibility, same explicit ID in separate runtimes, unsupported policy rejection at source and runtime boundaries, and child owner-domain inheritance. Orchestrator-system coverage proves keep-alive reuse requires the exact machine definition rather than only the same machine ID.
Commands:

- Red F `pnpm exec vitest run packages/flow-state/src/orchestrator-system.test.ts packages/flow-state/src/app-inventory.test.ts packages/flow-state/src/runtime.test.ts packages/flow-state/src/diagnostics.test.ts` — exit `1`; the first red pass exposed 15 failures from app-bound tests still starting unregistered ad-hoc machines and a stale keep-alive test that reused by machine ID.
- Red T `pnpm --filter flow-state check:cli-source-types` — exit `2`; the first type pass caught app-ownership union narrowing and a test that still assumed `flow.runtime()` was the focused compatibility constructor.
- Final F `pnpm exec vitest run packages/flow-state/src/orchestrator-system.test.ts packages/flow-state/src/app-inventory.test.ts packages/flow-state/src/runtime.test.ts packages/flow-state/src/diagnostics.test.ts` — exit `0`; 4 files and 74 tests passed.
- T `pnpm --filter flow-state check:cli-source-types` — exit `0`.
- E `pnpm --filter flow-state check:typescript-mode-proofs` — exit `0`.
- P `pnpm --filter flow-state pack` — exit `0`; package tarball generated and removed before staging.
- E `pnpm --filter launch-workspace test` — exit `0`; 13 files and 61 tests passed.
- P `pnpm --filter flow-state build` — exit `0`; build-output hygiene passed after the packet-owned baseline was updated to raw 235,794 bytes / gzip 46,213 bytes with the configured maxGrowthRatio still at 1.05.
- C `pnpm check` — exit `1`; after formatting packet-owned files, the only remaining blockers were the pre-existing formatting disagreements in `examples/launch-workspace/scripts/collect-function-outputs.ts` and `examples/launch-workspace/scripts/generate-inspect-proof.mjs`.
- Final `pnpm fmt` — exit `0`; Launch Workspace script formatter hunks produced by the command were reverted as out-of-scope before staging.
- Final `pnpm lint` — exit `0`; lint completed with existing warnings only.

Review: Thermo-nuclear review found and fixed excess diagnostic surface area and dead app ownership helpers after build-output hygiene exceeded the old baseline. The final design keeps app ownership inert, validates app-bound start before actor work, represents owner domain and exact machine token separately, and uses exact record identity for eviction.
Authority changes: P1C.1 is now done. P1C.2 is ready next.
Still open: P1C.2 owns the preferred actor read alias through the one actor owner, P1C.3a owns stop/finalizer/exact eviction semantics, P1C.3b owns keep-alive leases, and P1A.3b owns actor/transaction canonical identity projections after this actor owner exists.
