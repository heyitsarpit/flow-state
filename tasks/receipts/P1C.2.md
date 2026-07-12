# P1C.2 packet receipt

Packet: P1C.2 One actor read implementation (`CV-2`)
Dependencies: P1C.1.
Base commit: b5a7bcf
Base tree: Clean tracked tree before P1C.2.
Commit proof: derived-from-git-history
Files: `TASK.md`, `examples/launch-workspace/scripts/generate-inspect-proof.mjs`, `packages/flow-state/scripts/inspect-feature-receipts.mjs`, `packages/flow-state/scripts/inspect-local-proof.mjs`, `packages/flow-state/scripts/measure-p0-1c-baseline.mjs`, `packages/flow-state/src/core/orchestrator/orchestrator-actor-lifecycle.ts`, `packages/flow-state/src/core/orchestrator/orchestrator-children.ts`, `packages/flow-state/src/core/orchestrator/orchestrator-helpers.ts`, `packages/flow-state/src/inspection-local-proof.test.ts`, `packages/flow-state/src/inspection-sink.test.ts`, `packages/flow-state/src/package-hygiene.test.ts`, `packages/flow-state/src/public-api-types.test.ts`, `packages/flow-state/src/runtime-lifecycle.test.ts`, `packages/flow-state/src/testing/flow-test.ts`, `packages/flow-state/src/testing/test.ts`, and `tasks/receipts/P1C.2.md`.
Owner after change: `FlowActor.getSnapshot()` is the preferred actor read implementation, and `snapshot()` is the compatibility alias assigned to the same function object. Runtime actor start still flows through the P1C.1 orchestrator registry owner.
Compatibility: `snapshot()` remains present with the same return type, same object identity, same timing, and the same side-effect-free behavior as `getSnapshot()`. No alias removal was made.
Runtime proof: Runtime lifecycle coverage now checks that `actor.snapshot === actor.getSnapshot`, that both names return the same frozen snapshot object before and after send/flush, and that they still match after actor disposal.
Typing proof: Public API type coverage proves `ReturnType<typeof actor.getSnapshot>` and `ReturnType<typeof actor.snapshot>` remain equal, while unsupported actor start policies remain a source-type error without executing the bad runtime call.
Testing proof: Focused `test.rehydrate(machine, ...)` now installs a synthetic module containing the machine before using the orchestrator start owner, so it no longer accidentally creates an empty app-bound runtime that rejects its own machine. App-backed rehydration still requires the supplied app to own the machine.
Caller migration: Core orchestrator child/status helpers, deterministic testing internals, local inspection proof tests, inspection sinks, shipped inspection scripts, P0.1c measurement scripts, and the Launch Workspace JS inspection proof script now use `orchestrators.start` and/or `getSnapshot()` where they own a real actor read. The remaining `activeHarness.snapshot()` hit in `testing/flow-stories.ts` is the test harness read surface, not a `FlowActor` alias.
Deferred inventory: Launch Workspace request boot, remaining Launch Workspace tests, and the TypeScript `collect-function-outputs.ts` script still use `runtime.createActor` and actor `snapshot()` in places where P1C.2 explicitly deferred example/test migration until behavior equivalence is proved. Those callers are inventory for a later example/test packet, not permission to remove `snapshot()`.
Reused: Existing FlowActor public shape, orchestrator registry start/get/stop owner, selection-source contract, runtime inspection logging, and deterministic test harness machinery were reused. No second actor shell or adapter-owned read cache was introduced.
Removed: No public API was removed. The stale empty-app focused rehydrate path was removed because it contradicted P1C.1 ownership rules.
Commands:

- Red F `pnpm exec vitest run packages/flow-state/src/orchestrator-system.test.ts packages/flow-state/src/runtime-lifecycle.test.ts packages/flow-state/src/public-api-types.test.ts` — exit `1`; 3 files ran, 56 tests passed, 6 tests failed, and 2 unhandled async story-run errors exposed stale app-bound unregistered starts after P1C.1.
- Final F `pnpm exec vitest run packages/flow-state/src/orchestrator-system.test.ts packages/flow-state/src/runtime-lifecycle.test.ts packages/flow-state/src/public-api-types.test.ts` — exit `0`; 3 files and 63 tests passed.
- T `pnpm --filter flow-state check:cli-source-types` — exit `0`.
- Extra inspection F `pnpm exec vitest run packages/flow-state/src/inspection-local-proof.test.ts packages/flow-state/src/inspection-sink.test.ts packages/flow-state/src/package-hygiene.test.ts` — exit `0`; 3 files and 14 tests passed after the shipped local inspection proof script was migrated.
- Script checks `node --check packages/flow-state/scripts/inspect-feature-receipts.mjs` and `node --check packages/flow-state/scripts/measure-p0-1c-baseline.mjs` — both exit `0`.
- P `pnpm --filter flow-state pack` — exit `0`; package tarball generated but not staged.
- P `pnpm --filter flow-state build` — exit `0`; build-output hygiene passed at raw 235,475 bytes / gzip 45,971 bytes against the P1C.1 baseline raw 235,794 bytes / gzip 46,213 bytes.
- C `pnpm check` — exit `1`; the only remaining blocker was the pre-existing formatting disagreement in `examples/launch-workspace/scripts/collect-function-outputs.ts`, which was left outside the packet because staging that TypeScript script trips the existing lint-staged Node-globals type-check issue.
- Optional E `pnpm --filter launch-workspace test` — exit `1`; 8 tests still fail on the deferred remaining example-test `runtime.createActor` callers that P1C.2 does not migrate.
- Final `pnpm fmt` — exit `0`; Launch Workspace JS inspection script formatting was accepted because that caller is owned by P1C.2, while `collect-function-outputs.ts` was reverted out of the packet before staging.
- Final `pnpm lint` — exit `0`; lint completed with existing warnings only.

Review: Thermo-nuclear review found the first alias patch still left narrower internal handle types and shipped inspection scripts on the old surface. The final patch assigns the alias to one closure, widens the internal actor handle once, migrates owned core/testing/inspection/script callers, and leaves public harness/example-test compatibility surfaces as explicit inventory.
Authority changes: P1C.2 is now done. P1C.3a is ready next.
Still open: P1C.3a owns stop, finalizer, and exact eviction semantics; P1C.3b owns attachment and keep-alive leases; Launch Workspace request boot and remaining example tests own their deferred actor-start/read migrations after behavior equivalence is proved.
