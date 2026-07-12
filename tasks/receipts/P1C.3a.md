# P1C.3a packet receipt

Packet: P1C.3a Stop, finalizer, and exact eviction
Dependencies: P1C.1.
Base commit: 6fe9716
Base tree: Clean tracked tree before P1C.3a; `flow-state-0.0.0.tgz` remained untracked from the prior pack command and was not staged.
Commit proof: derived-from-git-history
Files: `TASK.md`, `packages/flow-state/src/core/orchestrator/orchestrator-actor-lifecycle.ts`, `packages/flow-state/src/core/orchestrator/orchestrator-children.ts`, `packages/flow-state/src/core/orchestrator/orchestrator-system.ts`, `packages/flow-state/src/flush.test.ts`, `packages/flow-state/src/orchestrator-system.test.ts`, `packages/flow-state/src/runtime-lifecycle.test.ts`, and `tasks/receipts/P1C.3a.md`.
Owner after change: Actor lifecycle owns one memoized disposal program per actor. Public `dispose()`, registry `stop`, registry `stopAll`, and child disposal all route through that same `disposeEffect`.
Defects closed: BUG-19 is closed for the actor lifecycle/registry layer. Concurrent and repeated disposal join one completion, terminal `actor:dispose` is published once, new sends/work are rejected after the disposed mark, owned actor finalizers are awaited, and `onDispose` registry eviction runs after those finalizers.
Exact eviction: Registry deletion still checks the exact registered record before removal. The lifecycle now delays `onDispose` until owned finalizers complete, so an old finalizer cannot delete a newer same-ID incarnation through stale closure state.
Finalizer Cause: Owned finalizers are all run through `Effect.exit`; a failing/defective finalizer does not skip later finalizers or `onDispose`. After cleanup, failed child-finalizer Causes are combined and re-failed so the caller still observes the finalizer Cause.
Child cleanup: State-owned child disposal now uses the actor's async disposal path. Fire-and-forget state-exit cleanup is explicit with `void`, while explicit parent/actor disposal awaits the captured owned child actors before completing.
Runtime shutdown: Runtime disposal still releases runtime cleanups, then calls `OrchestratorSystem.stopAll`, and only disposes the ManagedRuntime after that effect completes. Since actor disposal now waits for owned actor finalizers, runtime shutdown waits for those actor finalizers before shared service disposal.
Compatibility: Public `dispose()` remains a `Promise<void>` and `stop(id)` remains idempotent. A finalizer failure can now reject the disposal promise after cleanup rather than being silently swallowed.
Tests added: Runtime lifecycle coverage proves concurrent `dispose()` callers wait on the same child finalizer, publish one terminal receipt, and evict only after release. A second lifecycle test proves a defective owned finalizer does not skip a later finalizer or eviction and re-surfaces the Cause. Orchestrator coverage now awaits the stopped child finalizer turn before asserting nested registry eviction.
Reused: Existing child stop receipts, registry exact-record deletion guard, runtime dispose promise sharing, ready-work rejection on disposed actors, and Effect Cause/Exit primitives were reused.
Removed: The actor lifecycle no longer deletes its registry entry before owned finalizers finish. The orchestrator system no longer uses `Effect.runSync` as a semantic child-disposal island.
Commands:

- Red F `pnpm exec vitest run packages/flow-state/src/runtime-lifecycle.test.ts packages/flow-state/src/orchestrator-system.test.ts packages/flow-state/src/flush.test.ts` — exit `1`; the initial focused gate exposed a stale app-bound `flush.test.ts` runtime actor fixture that started an unregistered machine.
- Final F `pnpm exec vitest run packages/flow-state/src/runtime-lifecycle.test.ts packages/flow-state/src/orchestrator-system.test.ts packages/flow-state/src/flush.test.ts` — exit `0`; 3 files and 34 tests passed.
- T `pnpm --filter flow-state check:cli-source-types` — exit `0`.
- P `pnpm --filter flow-state pack` — exit `0`; package tarball generated but not staged.
- P `pnpm --filter flow-state build` — exit `0`; build-output hygiene passed at raw 236,099 bytes / gzip 46,104 bytes, inside the configured maxGrowthRatio against the P1C.1 baseline.
- E `pnpm --filter launch-workspace test` — exit `1`; the same 8 deferred app-bound Launch Workspace example tests still fail on unregistered `runtime.createActor` callers.
- C `pnpm check` — exit `1`; the only remaining blocker was the pre-existing formatting disagreement in `examples/launch-workspace/scripts/collect-function-outputs.ts`.
- Final `pnpm fmt` — exit `0`; the out-of-scope Launch Workspace collection-script formatter hunk was reverted before staging.
- Final `pnpm lint` — exit `0`; lint completed with existing warnings only after new fire-and-forget child-disposal promises were marked with `void`.

Review: Thermo-nuclear review found the first async disposal patch delayed nested child registry removal relative to existing assertions and introduced no-floating-promises warnings. The final patch makes the finalizer turn explicit in the test, marks intentional fire-and-forget child disposal, waits for owned child finalizers on actor disposal, and re-fails with combined Cause after cleanup.
Authority changes: P1C.3a is now done. P1C.3b is ready next.
Still open: P1C.3b owns long-lived attachment and keep-alive lease accounting; P1C.4a owns registry installation and activation barriers; Launch Workspace example-test actor start migration remains deferred to its owning example/test packet.
