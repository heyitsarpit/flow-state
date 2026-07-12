# P1A.4a packet receipt

Packet: P1A.4a Lifecycle, freshness, and scoped invalidation
Dependencies: P1B.1, P1D.1a.
Base commit: ab0d950
Base tree: Clean tracked tree before P1A.4a.
Commit proof: derived-from-git-history
Files: `TASK.md`, `packages/flow-state/src/core/runtime/services/resource-store.ts`, `packages/flow-state/src/core/store/resource-store-memory.ts`, `packages/flow-state/src/resource-store.test.ts`, and `tasks/receipts/P1A.4a.md`.
Owner after change: ResourceStore now owns a background refresh scope for active invalidation refreshes. The scope is allocated with the ResourceStore Layer, passed into the memory store, and closed in the ResourceStore finalizer before host-signal unsubscription completes.
Defects closed: BUG-46 is closed for active invalidation refresh. Refresh work started by `invalidate` no longer uses detached fibers, so it cannot outlive ResourceStore/runtime ownership and cannot publish a late success after the owning scope closes.
Effect map: No new runtime, scheduler, or host bridge was introduced. Invalidation refresh still uses the existing ResourceStore `refresh` path and caller context, but it forks into the ResourceStore-owned `Scope` with `Effect.forkIn` instead of `Effect.forkDetach`.
Lifecycle/freshness map: Existing deterministic `Clock`/`TestClock` freshness behavior remains unchanged. Existing tests continue to cover fresh/stale/invalidated/paused transitions, ensure/refresh/observe differences, lookup success/failure, post-fetch invalidation, hydration freshness, and no wall-clock fallback in ResourceStore freshness calculation.
Failure lanes: Closing the ResourceStore scope interrupts the active invalidation refresh and runs the lookup finalizer exactly once. A late callback after closure does not produce a successful idle snapshot.
Reused: Existing ResourceStore state machine, lookup controller, `NotificationScheduler`, freshness derivation, and runtime Layer composition were reused. The only ownership change is the explicit scope used for background invalidation refresh fibers.
Removed: `invalidate` no longer starts active refreshes with `Effect.forkDetach`.
Compatibility: Public resource APIs and snapshot shapes are unchanged. The ResourceStore service still exposes the same operations; only the lifetime of background refresh work changed.
Tests added: A scoped ResourceStore regression proves an active invalidation refresh starts, publishes the fetching/stale snapshot, is interrupted when the ResourceStore scope closes, runs its finalizer exactly once, and ignores a late lookup callback.
Commands:

- Red F `pnpm exec vitest run packages/flow-state/src/resource-store.test.ts -t "interrupts an active invalidation refresh"` — exit `1`; the detached refresh left the lookup finalizer count at `0` after the ResourceStore scope closed.
- Final F `pnpm exec vitest run packages/flow-state/src/resource-store.test.ts packages/flow-state/src/runtime-lifecycle.test.ts packages/flow-state/src/runtime.test.ts` — exit `0`; 3 files and 58 tests passed.
- T `pnpm --filter flow-state check:cli-source-types` — exit `0`.
- P `pnpm --filter flow-state build` — exit `0`; package declarations, build-output hygiene, and bundle-size baseline passed at raw 227,679 bytes / gzip 44,397 bytes, inside the configured growth ratio.
- E `pnpm --filter @flow-state/launch-workspace check:typescript-mode-proofs` — exit `0`.
- C `pnpm check` — exit `1`; the only remaining blockers were the pre-existing formatting disagreements in `examples/launch-workspace/scripts/collect-function-outputs.ts` and `examples/launch-workspace/scripts/generate-inspect-proof.mjs`.
- Final `pnpm fmt` — exit `0`; Launch Workspace script formatter hunks produced by the command were reverted as out-of-scope before staging.
- Final `pnpm lint` — exit `1`; package build inside lint passed, then type-aware lint reported an out-of-scope Launch Workspace devDependency resolution blocker for `examples/launch-workspace/src/launchWorkspaceServices.effect.test.ts` importing `@effect/vitest`, plus existing warnings. The file was not changed by this packet.

Review: Thermo-nuclear review found active invalidation refresh no longer escapes ResourceStore ownership, scoped close interrupts the lookup and runs cleanup exactly once, deterministic freshness remains Clock-owned, and public runtime/resource contracts were not widened.
Authority changes: P1A.4a is now done. P1A.4b is ready next.
Still open: P1A.4b owns registry-owned tag identity, P1A.4c/P1A.4d own directional resource typing and prevalidated restore, and cross-owner shutdown/Cause aggregation remains with P1D.1c.
