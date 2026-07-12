# P1A.1 packet receipt

Packet: P1A.1 Pure ref construction and executable definition ownership
Dependencies: P1A.0.
Base commit: 1b32ab209d395fbbc5597d0ccb6be8296dfa7c86
Base tree: Clean tracked tree before P1A.1.
Commit proof: derived-from-git-history
Files: `TASK.md`, `packages/flow-state/src/descriptors/resource.ts`, `packages/flow-state/src/core/api/resource-runtime.ts`, `packages/flow-state/src/core/store/resource-store-memory.ts`, `packages/flow-state/src/core/store/resource-store-lookups.ts`, `packages/flow-state/src/core/store/resource-snapshot.ts`, `packages/flow-state/src/core/store/invalidation.ts`, `packages/flow-state/src/shared/diagnostics.ts`, `packages/flow-state/src/resource-callbacks.test.ts`, and `tasks/receipts/P1A.1.md`.
Owner after change: Resource refs now carry only the public reference identity produced by `resource.ref(...)`: `kind`, descriptor id, params, and key. A private WeakMap-backed resource runtime registry associates issued refs with their definition, and ResourceStore resolves lookup, tag, placeholder, and freshness metadata from that registry when it owns the operation.
Defects closed: BUG-1 is closed for eager lookup/tag/placeholder execution during ref construction. Forged or serialized structural refs still fail explicitly through the existing missing-runtime-details diagnostic, now backed by the registry rather than by a hidden ref property.
Effect map: `resource.ref(...)` may execute only `key` and wraps key throws in the existing callback diagnostic. `ResourceStore.ensure` and `refresh` construct and run lookup Effects under the caller context at the owner. Snapshot creation, invalidation, and freshness derive tags/placeholders/freshness from the registry without executing lookup.
Layer/lifetime: No new public Layer was introduced. The runtime registry is process-local and keyed by issued ref object identity; app-scoped provenance remains for P1A.3b/P1B.1.
Native primitives: `WeakMap` owns internal ref-to-definition registration so structural object copies do not acquire runtime authority.
Failure lanes: Unknown, forged, or serialized refs fail as `FLOW-STORE-001`. Synchronous key, lookup, tag, and placeholder callback throws continue to produce `FLOW-STORE-002`, with lookup/tag/placeholder now thrown from ResourceStore ownership work.
Reused: Existing ResourceStore state/update/subscription controllers, callback diagnostic shape, forged-ref store test, and resource type contracts.
Merged/moved: Resource callback wrapping moved from `descriptors/resource.ts` into internal `core/api/resource-runtime.ts` so descriptor construction and store ownership use one diagnostic helper.
Removed: Hidden `__runtime` metadata is no longer installed on resource refs.
Rejected clones: No second ResourceStore, app-specific side registry, public capability token, alternate ref shape, or eager metadata cache was introduced.
Compatibility: Public `flow.resource(...).ref(...)`, `FlowResourceRef`, and ResourceStore call shapes are unchanged. Existing refs still preserve Params/Value/Error/Requirements through typed store operations.
Tests added: Resource callback tests now prove definition/app construction executes no callbacks, ref construction executes only `key`, refs have no `__runtime`, ResourceStore owns lookup/tag/placeholder execution, and callback diagnostics preserve original causes after the ownership move.
Commands:

- F `pnpm exec vitest run packages/flow-state/src/resource-callbacks.test.ts packages/flow-state/src/resource-store.test.ts packages/flow-state/src/app-inventory.test.ts packages/flow-state/src/behavior-contract.test.ts` — exit `0`; 4 files and 37 tests passed.
- First T `pnpm --filter flow-state check:cli-source-types` — exit `2`; the internal erased registry type and `FlowTag` import needed tightening.
- Final T `pnpm --filter flow-state check:cli-source-types` — exit `0`.
- P `pnpm --filter flow-state build` — exit `0`; package declarations, build output hygiene, and bundle-size baseline passed.
- E `pnpm --filter @flow-state/launch-workspace check:typescript-mode-proofs` — exit `0`.
- C `pnpm check` — exit `1`; after formatting the packet-owned new registry file, the only remaining blockers were the pre-existing formatting disagreements in `examples/launch-workspace/scripts/collect-function-outputs.ts` and `examples/launch-workspace/scripts/generate-inspect-proof.mjs`. Those out-of-scope formatter hunks were not staged.
- Final `pnpm lint` — exit `0`; lint completed with existing warnings only.

Review: Thermo-nuclear review found ref construction no longer captures executable lookup/tag/placeholder state, ResourceStore is the single owner that resolves executable callbacks, key derivation remains deterministic at explicit ref construction, and forged refs fail closed without relying on optional object shape.
Authority changes: P1A.1 is now done. P1A.2 is ready next; P1D.1a remains ready and independent.
Still open: P1A.2 must replace raw `JSON.stringify` identity with the selected collision-free canonical key/provenance encoder. App/runtime-scoped ref provenance and duplicate-package ownership failures remain later P1A.3b/P1B.1 work.
