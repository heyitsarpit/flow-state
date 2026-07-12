# P1C.3b packet receipt

Packet: P1C.3b Attachment and keep-alive leases

Base commit: `41693adf933506727361ae85d5163ac84fa9006b`

Base tree: Clean tracked tree before P1C.3b; `flow-state-0.0.0.tgz` remained untracked from the prior pack command and was not staged.

Files: `TASK.md`, `packages/flow-state/src/core/api/runtime-types.ts`, `packages/flow-state/src/core/orchestrator/orchestrator-registry.ts`, `packages/flow-state/src/core/orchestrator/orchestrator-system.ts`, `packages/flow-state/src/runtime/contract-runtime.ts`, `packages/flow-state/src/runtime-lifecycle.test.ts`, `packages/flow-state/src/orchestrator-system.test.ts`, `packages/flow-state/src/react/resource-source.test.ts`, and `tasks/receipts/P1C.3b.md`.

Behavior closed: Runtime-owned actor leases are now acquired through `runtime.orchestrators.attach()`. A lease returns the compatible actor and an idempotent `release()` handle; callers never edit counters directly. Multiple compatible leases share the live keep-alive incarnation, one release does not stop another consumer's actor, the final release disposes the actor once, and incompatible same-ID machine definitions still fail instead of being cast through ID-only reuse.

Registry serialization: The orchestrator registry owns lease count and release state. Final release synchronously marks the record releasing and returns the async cleanup effect; compatible reacquisition waits for that release effect before starting the next incarnation. Explicit `stop` and `stopAll` set the same releasing state and override outstanding leases while still awaiting actor finalization.

Public runtime surface: `FlowActorLease` and `FlowRuntimeOrchestrators.attach()` are added to the public runtime type surface. The runtime wrapper runs acquisition through `ManagedRuntime`, then implements `release()` as a synchronous registry-authority change followed by the returned cleanup promise.

Tests added: Runtime lifecycle coverage proves two attachments/one release, final release, incompatible same-ID lease rejection, explicit stop override, and repeated release idempotence. Orchestrator registry coverage proves delayed final-release cleanup serializes compatible reacquisition and delayed `stopAll` finalization waits despite an outstanding lease.

Red proof: `pnpm exec vitest run packages/flow-state/src/runtime-lifecycle.test.ts packages/flow-state/src/orchestrator-system.test.ts` exited 1 before implementation because `runtime.orchestrators.attach` was not a function; the six new runtime lease tests failed on that missing handle.

Command results:

- F: `pnpm exec vitest run packages/flow-state/src/runtime-lifecycle.test.ts packages/flow-state/src/orchestrator-system.test.ts` exited 0 after implementation; 2 files and 33 tests passed.
- T: `pnpm --filter flow-state check:cli-source-types` exited 0.
- P: `pnpm --filter flow-state pack` exited 0 and wrote `/Users/arpit/Developer/flow-state/flow-state-0.0.0.tgz`.
- P: `pnpm --filter flow-state build` exited 0; bundle-size baseline reported raw 238,445 bytes / gzip 46,519 bytes against baseline raw 235,794 bytes / gzip 46,213 bytes with `maxGrowthRatio 1.05`.
- E: `pnpm --filter launch-workspace test` exited 1 with the existing 8 deferred app-bound unregistered-machine failures in Launch Workspace tests.
- C: `pnpm check` exited 1 only because `examples/launch-workspace/scripts/collect-function-outputs.ts` disagrees with the formatter; that file is outside this packet and was left unstaged.
- Final hygiene: `pnpm fmt` exited 0, the unrelated collect-script formatter hunk was reverted, and `pnpm lint` exited 0 with the existing warnings in `collect-function-outputs.ts` and `packages/flow-state/src/cli/shared.ts`.

Review closeout: A review pass found and removed an impossible synthetic-record fallback after registry actor creation; the final implementation now fails closed if registry authority is missing instead of manufacturing a lease record. Focused behavior and source type gates were rerun after that fix.

Authority changes: P1C.3b is now done. No packet is ready next; P1C.4a and later Phase 1 rows remain blocked until their status rows change.

Still open: React consumes the runtime lease in P4B.1b and does not define lease semantics here. P1C.4a still owns registry installation and activation barriers. Launch Workspace app-bound example-test migration remains deferred to its owning packet. The untracked `flow-state-0.0.0.tgz` pack artifact remains unstaged.

Commit proof: derived-from-git-history
