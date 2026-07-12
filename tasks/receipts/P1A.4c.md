# P1A.4c packet receipt

Packet: P1A.4c Directional resource typing
Dependencies: P1A.4a, P1A.4b.
Base commit: 8f8193a
Base tree: Clean tracked tree before P1A.4c.
Commit proof: derived-from-git-history
Files: `TASK.md`, `packages/flow-state/src/core/api/flow-core.ts`, `packages/flow-state/src/public-api-types.test.ts`, `packages/flow-state/typecheck/isolated-declarations.ts`, `packages/flow-state/typecheck/multi-entry-declarations.ts`, and `tasks/receipts/P1A.4c.md`.
Owner after change: The public resource builder now has an inferred overload that fixes Params from the resource callbacks first and derives Value, Error, and Requirements from the lookup Effect after those Params are known. The existing explicit generic order remains available for compatibility.
Defects closed: Directional resource typing is now proved at the source and packed declaration surfaces. Wrong lookup/tag/placeholder params fail locally, declared lookup value/schema mismatches fail locally, and Schema-free authoring still works without requiring a boundary schema.
Effect map: No runtime lifecycle, store, Layer, or host bridge behavior changed. This packet changes only public TypeScript overloads and type fixtures.
Typing map: `flow.resource({...})` without type arguments now infers lookup success, typed failure, and requirements from the actual lookup return instead of defaulting `Value` to `unknown` and `Error` to `never` too early. Explicit declarations still constrain lookup return types against the declared Value/Error/Requirements.
Packed declarations: Isolated and multi-entry declaration fixtures now prove directional resource ref params survive generated package declarations. The isolated fixture uses explicit exported annotations because `isolatedDeclarations` requires them.
Undefined values: Public type sentinels prove `ProjectRecord | undefined` remains a legal declared resource value and can be seeded as a present value.
Reused: Existing resource descriptor construction, runtime metadata, ResourceStore behavior, source type checks, and packed declaration proof scripts were reused.
Removed: Nothing was deleted.
Compatibility: Existing `flow.resource<Params, Value, ...>(...)` calls keep their generic order. Existing Schema-free local authoring remains valid.
Tests added: Public type tests cover exact Params in key/lookup/tags/placeholder/ref, wrong params, wrong value, wrong schema, exact lookup A/E/R, present undefined, and packed declaration agreement.
Commands:

- Red T `pnpm --filter flow-state check:cli-source-types` — exit `2`; the new inferred resource sentinel failed because unannotated lookup A/E/R defaulted to `Effect<unknown, never, unknown>` before lookup return inference.
- Red packed proof `pnpm --filter flow-state check:typescript-mode-proofs` — exit `1`; the new isolated declaration fixture needed an explicit exported variable annotation under `isolatedDeclarations`.
- Final F `pnpm exec vitest run packages/flow-state/src/public-api-types.test.ts packages/flow-state/src/public-typing-architecture.test.ts` — exit `0`; 2 files and 60 tests passed.
- T `pnpm --filter flow-state check:cli-source-types` — exit `0`.
- E `pnpm --filter flow-state check:typescript-mode-proofs` — exit `0`.
- P `pnpm --filter flow-state build` — exit `0`; package declarations, build-output hygiene, and bundle-size baseline passed at raw 229,550 bytes / gzip 44,858 bytes, inside the configured growth ratio.
- C `pnpm check` — exit `1`; before final formatting it reported the two pre-existing Launch Workspace formatter disagreements plus packet-owned `packages/flow-state/src/core/api/flow-core.ts` formatting.
- Final `pnpm fmt` — exit `0`; Launch Workspace script formatter hunks produced by the command were reverted as out-of-scope before staging.
- Final C `pnpm check` — exit `1`; after formatting packet-owned files, the only remaining blockers were the pre-existing formatting disagreements in `examples/launch-workspace/scripts/collect-function-outputs.ts` and `examples/launch-workspace/scripts/generate-inspect-proof.mjs`.
- Final `pnpm lint` — exit `0`; lint completed with existing warnings only.

Review: Thermo-nuclear review found the overload fixes no-type-argument inference without disturbing explicit generic call sites, public and packed type fixtures agree, present undefined remains type-representable, and no runtime lifecycle path changed.
Authority changes: P1A.4c is now done. P1A.4d is ready next.
Still open: P1A.4d owns prevalidated internal resource restore, P1C.1 owns canonical actor ownership domains, and P1D.1c owns cross-owner shutdown and Cause aggregation.
