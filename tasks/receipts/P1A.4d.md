# P1A.4d packet receipt

Packet: P1A.4d Prevalidated internal resource restore
Dependencies: P1A.4a, P1A.4b.
Base commit: efed2e4
Base tree: Clean tracked tree before P1A.4d.
Commit proof: derived-from-git-history
Files: `TASK.md`, `packages/flow-state/src/core/api/resource-runtime.ts`, `packages/flow-state/src/core/runtime/services/resource-store.ts`, `packages/flow-state/src/core/store/hydration.ts`, `packages/flow-state/src/core/store/resource-snapshot.ts`, `packages/flow-state/src/core/store/resource-store-memory.ts`, `packages/flow-state/src/core/store/resource-store-state-updates.ts`, `packages/flow-state/src/resource-store.test.ts`, `packages/flow-state/src/runtime.test.ts`, `packages/flow-state/src/shared/diagnostics.ts`, `examples/launch-workspace/src/behavior-coverage-proof.test.ts`, and `tasks/receipts/P1A.4d.md`.
Owner after change: ResourceStore now owns an internal `restorePrevalidated` attachment seam for already-decoded resource records. The public runtime resource facade still exposes only the existing seed/hydrate/dehydrate/read/subscribe/patch surface.
Defects closed: Internal restore validates target ref identity, registered runtime definition, resource schema identity, frozen record shape, frozen tags, and duplicate keys before mutation. A failed entry among valid entries fails with `FLOW-STORE-005` and leaves records, revisions, and notifications unchanged.
Effect map: `restorePrevalidated` is an Effect failure path with `FlowDiagnostic`; it reads time, validates every entry, and then performs one batched source update. It does not decode unknown input, select a wire version, or synthesize runtime boot fields.
Typing map: The internal restore entry carries a typed target ref plus optional schema identity and the complete `InternalResourceRecord`. Present `Value | undefined` remains representable through `Option.some(undefined)`.
Undefined values: Public snapshot projection now derives availability from Option presence instead of JavaScript `undefined`, so a restored present `undefined` value stays `availability: "value"` and does not fall back to placeholder semantics.
Reused: Existing ResourceStore state ownership, canonical resource keys, runtime ref registration, schema-bearing resource config, notification batching, and public hydration remained in place.
Removed: Nothing was deleted.
Compatibility: Public snapshot hydrate remains the lossy snapshot path for existing runtime boot payloads. The new path is internal and requires P4C to pass an already-decoded immutable record; unknown/version/hostile-wire cases remain P4C.1a.
Launch proof hygiene: `examples/launch-workspace/src/behavior-coverage-proof.test.ts` now asserts the compact behavior coverage renderer shape that the renderer tests already document, instead of stale Markdown section headings.
Tests added: ResourceStore tests cover valid internal restore, wrong target/runtime/schema attachments, all-or-nothing failure with no record/revision/notification mutation, present undefined restore, and registered cold `get(ref)` placeholder projection without creating a stored record.
Commands:

- Red F `pnpm exec vitest run packages/flow-state/src/resource-callbacks.test.ts packages/flow-state/src/resource-store.test.ts packages/flow-state/src/runtime-lifecycle.test.ts packages/flow-state/src/public-api-types.test.ts` — exit `1`; the initial cold `get(ref)` path returned `null` for registered refs, so callback ownership tests showed tags/placeholder were not executed.
- Final F `pnpm exec vitest run packages/flow-state/src/resource-callbacks.test.ts packages/flow-state/src/resource-store.test.ts packages/flow-state/src/runtime-lifecycle.test.ts packages/flow-state/src/public-api-types.test.ts` — exit `0`; 4 files and 81 tests passed.
- T `pnpm --filter flow-state check:cli-source-types` — exit `0`.
- E `pnpm --filter flow-state check:typescript-mode-proofs` — exit `0`.
- P `pnpm --filter flow-state pack` — exit `0`; package tarball generated and removed before staging.
- E `pnpm --filter launch-workspace test` — exit `0`; 13 files and 61 tests passed.
- C `pnpm check` — exit `1`; only the pre-existing formatter disagreements in `examples/launch-workspace/scripts/collect-function-outputs.ts` and `examples/launch-workspace/scripts/generate-inspect-proof.mjs` remain.
- Final `pnpm fmt` — exit `0`; Launch Workspace script formatter hunks produced by the command were reverted as out-of-scope before staging.
- Final `pnpm lint` — exit `0`; lint completed with existing warnings only. Build-output hygiene passed at raw 232,956 bytes / gzip 45,523 bytes, inside the configured growth ratio.
- Final C `pnpm check` — exit `1`; still only the same two pre-existing Launch Workspace script formatter disagreements.

Review: Thermo-nuclear review found and fixed a duplicate callback execution risk in cold registered `get(ref)` by using the definition-only ownership check before ephemeral snapshot projection. The restore seam validates before the single batched commit, fails closed with a typed diagnostic, does not route through public snapshot decoding, and preserves present undefined values.
Authority changes: P1A.4d is now done. P1C.1 is ready next.
Still open: P1C.1 owns canonical actor owner and ownership domains, P1C.3a owns exact actor stop/finalizer eviction after that owner exists, and P4C.1a owns runtime boot decoder/version/hostile-wire validation.
