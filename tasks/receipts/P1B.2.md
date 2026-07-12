# P1B.2 packet receipt

Packet: P1B.2 Patch, notification, and batch semantics
Dependencies: P1B.1.
Base commit: af30c35e5caf3fde41ebf2bba9294348f07cf975
Base tree: Clean tracked tree before P1B.2.
Commit proof: derived-from-git-history
Files: `TASK.md`, `packages/flow-state/src/core/api/runtime-types.ts`, `packages/flow-state/src/core/store/resource-store-subscriptions.ts`, `packages/flow-state/src/core/store/selection-source.ts`, `packages/flow-state/src/core/store/selection-source.test.ts`, `packages/flow-state/src/performance-regression.test.ts`, `packages/flow-state/src/resource-store.test.ts`, `packages/flow-state/src/runtime.test.ts`, `packages/flow-state/src/runtime/contract-runtime.ts`, and `tasks/receipts/P1B.2.md`.
Owner after change: ResourceStore remains the single production owner for resource snapshots and subscriptions. Runtime host patching now forwards the ref-typed value directly to ResourceStore instead of coercing absent values through an object-shaped public seam.
Defects closed: BUG-43 is closed for selected and derived sources: selector/equality candidates are computed before cached source state advances, so a throwing selector or equality leaves the previous snapshot authoritative, publishes no partial state, and permits later recovery. BUG-35 is closed for inactive subscription selections: the final unsubscribe removes the retained per-ref selection source without evicting active records.
Effect map: No new host bridge, `Effect.run*` island, or duplicate notification owner was introduced. ResourceStore operations still run through the existing Effect service boundary, and runtime host methods still bridge through the ManagedRuntime established by P1D.1a.
Notification semantics: The existing `NotificationScheduler` remains the one batching service. Store and runtime tests continue to cover seed, lookup, patch, invalidate, and hydrate publication through that scheduler; this packet tightens the selection-source failure path so candidate computation and equality cannot publish an incoherent intermediate snapshot.
Patch semantics: Public runtime patch callbacks now receive `InferResourceRefValue<Ref> | undefined` and must return `InferResourceRefValue<Ref>`. Primitive resources, absent values, and object resources are therefore typed at the ref seam instead of being widened to `Record<string, unknown>`.
Failure lanes: Throwing selector/equality remains a defect lane, not a state transition. The failed read can throw repeatedly while the previous cached snapshot remains authoritative, and a later valid source update recovers normally.
Reused: Existing ResourceStore state updates, selection sources, `resourceKeyOf` identity, `NotificationScheduler`, runtime resource handles, and batch tests were reused rather than introducing a second scheduler or adapter cache.
Removed: Runtime resource patching no longer supplies `{}` for absent values. Inactive subscription selection sources no longer remain retained after the final unsubscribe.
Compatibility: Existing object-resource patch sites were updated to preserve required fields explicitly under the stricter runtime patch type. Public read and subscription shapes are unchanged.
Tests added: Selection-source coverage proves selected and derived equality throws do not advance cached source state and recover on later valid updates. ResourceStore coverage proves repeated subscribe/unsubscribe churn releases inactive per-ref selection sources. Runtime coverage proves absent primitive patching does not coerce through object values.
Commands:

- Red F `pnpm exec vitest run packages/flow-state/src/core/store/selection-source.test.ts` — exit `1`; BUG-43 red proof showed the second selected/derived read no longer threw because cached source state advanced before equality succeeded.
- Final F `pnpm exec vitest run packages/flow-state/src/resource-store.test.ts packages/flow-state/src/core/store/selection-source.test.ts packages/flow-state/src/runtime.test.ts` — exit `0`; 3 files and 59 tests passed.
- T `pnpm --filter flow-state check:cli-source-types` — exit `0`.
- P `pnpm --filter flow-state build` — exit `0`; package declarations, build-output hygiene, and bundle-size baseline passed at raw 227,535 bytes / gzip 44,344 bytes, inside the configured growth ratio.
- C `pnpm check` — exit `1`; after formatting packet-owned files, the only remaining blockers were the pre-existing formatting disagreements in `examples/launch-workspace/scripts/collect-function-outputs.ts` and `examples/launch-workspace/scripts/generate-inspect-proof.mjs`. Those out-of-scope formatter hunks were not staged.
- Final `pnpm fmt` — exit `0`; Launch Workspace script formatter hunks produced by the command were reverted as out-of-scope before staging.
- Final `pnpm lint` — exit `0`; lint completed with existing warnings only.

Review: Thermo-nuclear review found the patch seam now preserves ref value types across absent, primitive, and object resources; selection-source reads do not update source cursors before equality succeeds; listener publication still flows through the existing scheduler; and inactive subscription churn no longer accumulates unused selection sources.
Authority changes: P1B.2 is now done. P1A.4a is ready next.
Still open: P1A.4a owns lifecycle/freshness/scoped invalidation, P1A.4b owns registry-owned tag identity, P1A.4c/P1A.4d own directional resource typing and prevalidated restore, and P2.2a remains blocked on the later transaction state packets even though the resource publication dependency is now closed.
