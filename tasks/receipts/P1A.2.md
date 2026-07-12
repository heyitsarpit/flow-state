# P1A.2 packet receipt

Packet: P1A.2 Collision-free canonical key encoder
Dependencies: P1A.1.
Base commit: 1f89d5dabae8cb114527490e40253f04cdbccfee
Base tree: Clean tracked tree before P1A.2.
Commit proof: derived-from-git-history
Files: `TASK.md`, `packages/flow-state/src/core/api/canonical-key.ts`, `packages/flow-state/src/core/store/invalidation.ts`, `packages/flow-state/src/core/store/resource-store-memory.ts`, `packages/flow-state/src/core/transactions/transaction-invalidation.ts`, `packages/flow-state/src/descriptors/resource.ts`, `packages/flow-state/src/shared/diagnostics.ts`, `packages/flow-state/src/diagnostics.snapshots.json`, `packages/flow-state/src/resource-store.test.ts`, and `tasks/receipts/P1A.2.md`.
Owner after change: Canonical key encoding now owns ResourceStore runtime identity. Resource refs cache descriptor id plus canonical key identity at construction, so later mutation of caller-owned nested key objects cannot move a record. Durable export validates keys separately and rejects runtime-local or unsupported shapes before returning a payload.
Defects closed: DEC-1/DEC-2 implementation slice for raw `JSON.stringify` store identity is closed. Zero-, one-, and many-parameter refs, JSON-collapse values, object-order-invariant records, and same-key/different-descriptor refs no longer alias through stringification.
Effect map: Pure encoding only. No Effect execution, callback execution, lookup execution, or host bridge was introduced.
Layer/lifetime: Runtime-local object/function/symbol key tokens are process-local. Durable dehydrate rejects them through `FLOW-STORE-003` rather than serializing unstable identities.
Native primitives: A WeakMap caches issued resource-ref identities; a WeakMap/Map pair owns runtime-local object/function/symbol tokens.
Failure lanes: Invalid durable keys fail as `FLOW-STORE-003` with a bounded reason and without exposing raw caller key material. Existing missing-ref and callback diagnostics remain unchanged except for the P1A.1 callback wording snapshot.
Reused: Existing `createKey(...)` call shape, ResourceStore state maps, invalidation matching, transaction invalidation receipt projection, and diagnostic rendering.
Merged/moved: None.
Removed: Raw `JSON.stringify` no longer owns ResourceStore record keys, invalidation key equality, or transaction invalidation key receipt ids.
Rejected clones: No custom public key class, external hash dependency, durable wire-version change, app-specific key registry, or production-test oracle coupling was introduced.
Compatibility: `createKey(...)` remains a frozen array call. Runtime-local object/function/symbol values remain accepted for in-memory identity, but dehydrate rejects non-durable keys instead of pretending they are portable.
Tests added: ResourceStore tests now cover `[]`, `[undefined]`, `[null]`, many-parameter keys, `0`, `-0`, `NaN`, infinities, bigint, object property order, different descriptors with the same key, mutation stability after ref construction, durable rejection of cycles, sparse arrays, accessors, symbol keys, class/Date/Map instances, and `toJSON` without invoking conversion hooks.
Commands:

- F `pnpm exec vitest run packages/flow-state/src/resource-store.test.ts packages/flow-state/src/public-api-types.test.ts packages/flow-state/src/diagnostics.test.ts` — exit `0`; 3 files and 74 tests passed.
- First T `pnpm --filter flow-state check:cli-source-types` — exit `2`; the encoder needed an initial depth argument and test-only lookups needed non-failing `never` effects.
- Final T `pnpm --filter flow-state check:cli-source-types` — exit `0`.
- P `pnpm --filter flow-state build` — exit `0`; package declarations, build-output hygiene, and bundle-size baseline passed at raw 226,234 bytes / gzip 44,002 bytes, inside the configured growth ratio.
- C `pnpm check` — exit `1`; after formatting packet-owned files, the only remaining blockers were the pre-existing formatting disagreements in `examples/launch-workspace/scripts/collect-function-outputs.ts` and `examples/launch-workspace/scripts/generate-inspect-proof.mjs`. Those out-of-scope formatter hunks were not staged.
- Final `pnpm fmt && pnpm lint` — exit `0`; lint completed with existing warnings only. Launch Workspace script formatter hunks produced by `pnpm fmt` were reverted as out-of-scope before staging.

Review: Thermo-nuclear review found ResourceStore no longer depends on raw JSON key equality, canonical identity is cached at ref construction, descriptor id remains part of record identity, durable export fails closed for non-portable values, and raw key material is not added to diagnostics.
Authority changes: P1A.2 is now done. P1D.1a is ready next; P1B.1 remains blocked until P1D.1a closes.
Still open: P1D.1a must establish the host boundary and runtime Layer contracts. P1B.1 must consume P1A.2 identity in the canonical ResourceStore migration once P1D.1a is done.
