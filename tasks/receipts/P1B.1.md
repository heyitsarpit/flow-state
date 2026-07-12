# P1B.1 packet receipt

Packet: P1B.1 Canonical ResourceStore owner and host handles
Dependencies: P1A.2, P1D.1a.
Base commit: 582592ac203802cc444962b68e3fd6587e49a987
Base tree: Clean tracked tree before P1B.1.
Commit proof: derived-from-git-history
Files: `TASK.md`, `packages/flow-state/src/core/orchestrator/orchestrator-resources.ts`, `packages/flow-state/src/core/runtime/services/resource-store.ts`, `packages/flow-state/src/core/store/resource-store-lookups.ts`, `packages/flow-state/src/core/store/resource-store-memory.ts`, `packages/flow-state/src/flow-test-scenario-combinators.test.ts`, `packages/flow-state/src/resource-store.test.ts`, `packages/flow-state/src/runtime.test.ts`, `packages/flow-state/src/shared/diagnostics.ts`, `packages/flow-state/src/testing/flow-test.ts`, `packages/flow-state/src/testing/flow-test-transaction-bookkeeping.ts`, and `tasks/receipts/P1B.1.md`.
Owner after change: `ResourceStore` remains the canonical production owner. Runtime resource handles and direct service reads now observe that owner honestly: an unrecorded ref returns `null` and does not manufacture a placeholder or idle authoritative record. Lookup ownership still creates internal records only when `ensure` or `refresh` starts real store work.
Defects closed: BUG-42 is closed for direct service reads and runtime host handles. BUG-20 is closed for flowTest descriptor-ID cache projection: zero instances return `undefined`, one instance returns the unambiguous snapshot, and multiple canonical instances fail closed with `FLOW-STORE-004`.
Effect map: No new host bridge or semantic `Effect.run*` island was introduced. `ResourceStore.get` stays an Effect service operation; runtime host methods still bridge through the one ManagedRuntime from P1D.1a.
Layer/lifetime: The packet does not change ResourceStore Layer acquisition or finalizer ordering. Subscription/lookup lifecycle cleanup, scoped invalidation, and batch publication remain with P1A.4a/P1B.2/P1D.1c.
Native primitives: ResourceStore records, in-flight lookup dedupe, subscriptions, and invalidation continue to key through `resourceKeyOf(ref)`. flowTest resource cache and transaction preview/invalidation bookkeeping now key by the same canonical identity rather than descriptor ID.
Failure lanes: Descriptor-ID compatibility ambiguity throws `FLOW-STORE-004` with descriptor id and instance count. Unknown reads return `null` without diagnostics because absence is a valid read result; forged/unregistered executable work still fails through existing runtime-detail diagnostics.
Reused: Existing ResourceStore owner, canonical key encoder, runtime resource handles, flowTest builder/read surface, and transaction preview/invalidation helpers.
Merged/moved: Former P1A.3a identity migration work is merged into this receipt for ResourceStore records, host handles, and flowTest resource cache identity.
Removed: flowTest's descriptor-ID resource cache overwrite path no longer owns seeded or previewed resource records. Runtime `get` no longer synthesizes an empty or placeholder snapshot for ordinary reads.
Rejected clones: No second ResourceStore, adapter cache owner, descriptor-ID adapter in front of the store, alternate notification model, or transaction policy migration was introduced.
Compatibility: Public `runtime.resources.get(ref)` already returned `snapshot | null`; implementation now matches that contract. `FlowTestCache.query(id)` keeps the descriptor-ID compatibility shape but now fails closed on ambiguity instead of selecting by insertion/order.
Tests added: Direct ResourceStore and runtime reads now prove unknown refs return `null` and leave `inspect()` empty. flowTest scenario coverage seeds two refs for one descriptor and proves descriptor-ID cache lookup throws `FLOW-STORE-004` while snapshot materialization avoids order-picking.
Commands:

- Red F `pnpm exec vitest run packages/flow-state/src/resource-store.test.ts packages/flow-state/src/runtime.test.ts packages/flow-state/src/runtime-lifecycle.test.ts` — exit `1`; BUG-42 red proof showed direct service and runtime reads returned synthesized placeholder/idle snapshots instead of `null`.
- Final F `pnpm exec vitest run packages/flow-state/src/resource-store.test.ts packages/flow-state/src/runtime.test.ts packages/flow-state/src/runtime-lifecycle.test.ts packages/flow-state/src/flow-test-scenario-combinators.test.ts` — exit `0`; 4 files and 59 tests passed.
- T `pnpm --filter flow-state check:cli-source-types` — exit `0`.
- P `pnpm --filter flow-state build` — exit `0`; package declarations, build-output hygiene, and bundle-size baseline passed at raw 227,442 bytes / gzip 44,317 bytes, inside the configured growth ratio.
- E `pnpm --filter @flow-state/launch-workspace check:typescript-mode-proofs` — exit `0`.
- C `pnpm check` — exit `1`; after formatting packet-owned files, the only remaining blockers were the pre-existing formatting disagreements in `examples/launch-workspace/scripts/collect-function-outputs.ts` and `examples/launch-workspace/scripts/generate-inspect-proof.mjs`. Those out-of-scope formatter hunks were not staged.
- Final `pnpm fmt` — exit `0`; Launch Workspace script formatter hunks produced by the command were reverted as out-of-scope before staging.
- Final `pnpm lint` — exit `0`; lint completed with existing warnings only.

Review: Thermo-nuclear review found ordinary reads no longer publish or synthesize ResourceStore state, state-owned `ensure` still derives inert placeholder snapshots without writing a record, flowTest cache identity is canonical-keyed, descriptor-ID projection fails closed on ambiguity, and transaction preview/invalidation bookkeeping no longer writes resource cache entries by descriptor ID.
Authority changes: P1B.1 is now done. P1B.2 is ready next.
Still open: P1B.2 must define atomic patch/batch/selection publication and listener behavior. P1A.4a still owns resource lifecycle/freshness/scoped invalidation, P1A.4b owns tag identity compatibility, and P1A.3b still owns actor/transaction canonical identity projections beyond the flowTest cache key migration landed here.
