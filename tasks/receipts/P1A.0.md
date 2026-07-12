# P1A.0 packet receipt

Packet: P1A.0 Safe definition normalization and app identity
Dependencies: P0.6.
Base commit: 0b071305e6e3b080198b63f5e8d7278a27ff36ed
Base tree: Clean tracked tree before P1A.0.
Commit proof: derived-from-git-history
Files: `TASK.md`, `packages/flow-state/src/descriptors/app.ts`, `packages/flow-state/src/descriptors/module.ts`, `packages/flow-state/src/descriptors/validation.ts`, `packages/flow-state/src/shared/diagnostics.ts`, `packages/flow-state/src/app-inventory.test.ts`, `packages/flow-state/src/runtime-lifecycle.test.ts`, `examples/launch-workspace/src/launchWorkspaceAssembly.ts`, `examples/launch-workspace/src/launchWorkspaceTypingArchitecture.test.ts`, `examples/launch-workspace/src/app/behavior.ts`, `examples/launch-workspace/src/launchWorkspaceApproval.ts`, `examples/launch-workspace/src/launchWorkspaceSupport.ts`, `examples/launch-workspace/src/launchWorkspaceViews.ts`, and `tasks/receipts/P1A.0.md`.
Owner after change: App/module definition construction now owns safe identity, shallow library-container copying, null-prototype keyed registries, and validation before ownership installation. Launch Workspace owns an exact named module tuple rather than the former broad app annotation.
Defects closed: BUG-27, BUG-28, and BUG-29 are closed for module/app identity and mutable definition containers. BUG-38 is closed for the Launch Workspace app annotation by preserving the exact module tuple through a named tuple contract.
Effect map: No new Effect owner was introduced. Normalization remains synchronous and does not run resource, machine, view, transaction, stream, or fixture callbacks.
Layer/lifetime: App layers now receive a frozen module array and null-prototype module map from construction. Invalid modules fail before layer construction can install ownership.
Native primitives: Null-prototype records are used for user-keyed module maps and copied module registries. No `Map` migration was required for this packet.
Failure lanes: Unsafe module ids, unsafe descriptor ids, and reserved inventory fields now fail as `FlowDiagnostic` values before app/runtime ownership is created. Duplicate modules and duplicate app-global resources continue to fail through the existing diagnostics.
Reused: Existing descriptor validation, app inventory summaries, diagnostics, Launch Workspace type architecture tests, and P0.3 exact module tuple proof style.
Merged/moved: None.
Removed: The broad Launch Workspace `FlowAppDefinition` app contract alias was removed. Public constructor call shapes were not changed.
Rejected clones: No parallel app identity registry, generated descriptor DSL, deep-freeze helper, callback-normalization path, or alternate Launch Workspace app wrapper was introduced.
Compatibility: `flow.app({ modules })` and `flow.module(id, inventory, meta)` call shapes are unchanged. App ids are now canonical sorted length-delimited ids, so order-only app id differences are intentionally removed.
Tests added: App inventory tests now cover order-independent length-delimited app identity, unsafe module/descriptor ids, reserved inventory fields, caller mutation after construction, frozen library-owned containers, and non-deep-frozen domain values. Launch Workspace typing architecture tests now prove the app keeps the exact module tuple through the named tuple contract.
Commands:

- Focused P1A.0 `pnpm exec vitest run packages/flow-state/src/app-inventory.test.ts examples/launch-workspace/src/launchWorkspaceTypingArchitecture.test.ts` — exit `0`; 2 files and 16 tests passed.
- F `pnpm exec vitest run packages/flow-state/src/app-inventory.test.ts packages/flow-state/src/diagnostics.test.ts packages/flow-state/src/public-api-types.test.ts` — exit `0`; 3 files and 63 tests passed.
- Canonical app id ripple `pnpm exec vitest run packages/flow-state/src/runtime-lifecycle.test.ts packages/flow-state/src/app-inventory.test.ts packages/flow-state/src/diagnostics.test.ts packages/flow-state/src/public-api-types.test.ts examples/launch-workspace/src/launchWorkspaceTypingArchitecture.test.ts` — exit `0`; 5 files and 74 tests passed.
- First T `pnpm --filter flow-state check:cli-source-types` — exit `2`; test fixture typing, descriptor narrowing, and diagnostic document correlation needed tightening.
- Final T `pnpm --filter flow-state check:cli-source-types` — exit `0`.
- P `pnpm --filter flow-state build` — exit `0`; package declarations, build output hygiene, and bundle-size baseline passed.
- E `pnpm --filter @flow-state/launch-workspace check:typescript-mode-proofs` — exit `0`.
- C `pnpm check` — exit `1`; blocked only by pre-existing formatting disagreements in `examples/launch-workspace/scripts/collect-function-outputs.ts` and `examples/launch-workspace/scripts/generate-inspect-proof.mjs`. Those out-of-scope formatter hunks were not staged.
- Final `pnpm --filter flow-state check:cli-source-types && pnpm lint` — exit `0`; lint completed with existing warnings only.

Review: Thermo-nuclear review found the packet keeps validation at construction time, does not execute client callbacks while normalizing, copies and freezes only library-owned containers, keeps domain values caller-owned, and preserves Launch Workspace exact module typing without broad app erasure.
Authority changes: P1A.0 is now done. P1A.1 is ready next; P1D.1a remains ready and independent.
Still open: P1A.1 must move resource refs to inert construction and executable-definition ownership. The known Launch Workspace script formatter drift remains outside P1A.0 and continues to block a clean `pnpm check` unless that separate drift is accepted or fixed.
