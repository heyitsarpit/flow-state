# P1A.4b packet receipt

Packet: P1A.4b Registry-owned tag identity
Dependencies: P1B.1.
Base commit: 0b5d47c
Base tree: Clean tracked tree before P1A.4b.
Commit proof: derived-from-git-history
Files: `TASK.md`, `packages/flow-state/src/core/api/keys.ts`, `packages/flow-state/src/core/api/resource-transaction-types.ts`, `packages/flow-state/src/core/api/flow-core.ts`, `packages/flow-state/src/core/api/resource-runtime.ts`, `packages/flow-state/src/descriptors/validation.ts`, `packages/flow-state/src/shared/diagnostics.ts`, `packages/flow-state/src/app-inventory.test.ts`, `packages/flow-state/src/resource-store.test.ts`, and `tasks/receipts/P1A.4b.md`.
Owner after change: App validation owns static schema-bearing tag compatibility. Runtime invalidation still matches tags by semantic tag id, and executable tag callbacks remain owned by ResourceStore/runtime metadata reads rather than app compilation.
Defects closed: BT-08 is covered for same-ID ID-only tag compatibility and same-ID schema incompatibility. Two distinct ID-only tag objects with the same id invalidate all matching ResourceStore records, while static same-ID tags with different schema values fail before app ownership installs.
Effect map: No new Effect service, Layer, host bridge, or runtime owner was introduced. App validation is pure and does not execute tag callbacks; ResourceStore metadata still invokes tag callbacks only when runtime work needs resource metadata.
Tag compatibility: `createTag(id)` remains the ID-only compatible form. `createTag(id, { schema })` is additive and registry-checked at app compilation when tags are declared statically on a resource. Same-ID schema tags are compatible only when they reuse the same schema value; ID-only tags do not conflict with schema-bearing tags.
Runtime metadata: Resource `tags` now accepts either the existing callback form or a static readonly tag array. Static arrays let app validation check schema compatibility without executing callbacks, while callback tags preserve the existing parameterized runtime behavior.
Failure lanes: Incompatible same-ID schema tags throw `FLOW-APP-012` with the tag id and the first/next module ids. Dynamic tag callbacks are not executed during app validation, so callback defects stay behind the ResourceStore metadata owner.
Reused: Existing app module validation, ResourceStore invalidation matching, canonical resource identity, and resource metadata callback diagnostics were reused.
Removed: Nothing was deleted. The packet adds a static tag declaration path and a compatibility diagnostic without removing callback tags.
Compatibility: Existing `createTag(id)` and `tags: (...params) => [...]` code remains valid. Resource config typing is additive: `tags: [tag]` is now accepted for static registry-visible tag declarations.
Tests added: App inventory tests prove incompatible static same-ID tag schemas reject without running a dynamic tag callback, and compatible same-ID schema tags pass when they reuse the same schema value. ResourceStore tests prove two distinct ID-only same-ID tag objects both match one invalidation target.
Commands:

- F `pnpm exec vitest run packages/flow-state/src/app-inventory.test.ts packages/flow-state/src/resource-store.test.ts` — exit `0`; 2 files and 41 tests passed.
- T `pnpm --filter flow-state check:cli-source-types` — exit `0`.
- Public type sentinels `pnpm exec vitest run packages/flow-state/src/public-api-types.test.ts packages/flow-state/src/public-typing-architecture.test.ts` — exit `0`; 2 files and 59 tests passed.
- P `pnpm --filter flow-state build` — exit `0`; package declarations, build-output hygiene, and bundle-size baseline passed at raw 229,550 bytes / gzip 44,858 bytes, inside the configured growth ratio.
- E `pnpm --filter @flow-state/launch-workspace check:typescript-mode-proofs` — exit `0`.
- C `pnpm check` — exit `1`; the only remaining blockers were the pre-existing formatting disagreements in `examples/launch-workspace/scripts/collect-function-outputs.ts` and `examples/launch-workspace/scripts/generate-inspect-proof.mjs`.
- Final `pnpm fmt` — exit `0`; Launch Workspace script formatter hunks produced by the command were reverted as out-of-scope before staging.
- Final `pnpm lint` — exit `0`; lint completed with existing warnings only.

Review: Thermo-nuclear review found tag compatibility is checked from static registry-visible data, app compilation does not execute tag callbacks, runtime invalidation remains ID-based for compatible ID-only tags, and public tag/resource config changes are additive.
Authority changes: P1A.4b is now done. P1A.4c is ready next.
Still open: P1A.4c owns directional resource typing and packed declarations, P1A.4d owns prevalidated internal resource restore, and P1D.1c still owns cross-owner shutdown and Cause aggregation.
