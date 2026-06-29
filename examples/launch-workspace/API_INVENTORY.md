# Launch Workspace API Inventory

Status: review note for the vNext API proving app.

This file is the linked Phase 0 export inventory for
`examples/launch-workspace`. It assigns every public API name from
`reference-next/lib-api.md` to a concrete module, screen, or test and marks
whether it is executable today or still contract-only.

Package-level type coverage for these target names lives in
`packages/flow-state/src/public-api-types.test.ts`; this file remains focused on
Launch Workspace ownership and executable proof surfaces.

## Final API Coverage

| API                       | Example owner                                                                                                                        | Status                                                                                                                                                                                      | Proof                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `flow.module`             | Session, Project, Checklist, Readiness, Assets, Approval, Assistant, Chat, Launch, Trace                                             | Executable module manifests with structured ownership fields, metadata, and inventory output                                                                                                | Module inventory tests                           |
| `flow.resource`           | Project, Permissions, Readiness, Assets, Approval                                                                                    | Seeded app ResourceStore snapshots executable; main function is `lookup`; live lookup partial                                                                                               | App harness tests                                |
| `flow.transaction`        | Project save, Approval submit                                                                                                        | Executable target authoring API with `params`, `commit`, `preview`, invalidation, routed outcomes, and `transaction:*` receipts; queue semantics are intentionally parked for a later phase | Transaction tests                                |
| `flow.machine`            | Editor, checklist, upload, approval, assistant, chat                                                                                 | Executable focused slices                                                                                                                                                                   | Scenario tests                                   |
| `flow.view`               | Checklist, dashboard, overview, trace                                                                                                | Executable projections reserved for joined or reusable read models                                                                                                                          | Scenario tests                                   |
| `flow.app`                | `LaunchWorkspaceApp`                                                                                                                 | Wired descriptor plus module-name, dependency, cycle, and duplicate resource-id validation with flattened app inventory                                                                     | API and module inventory tests                   |
| `App.layer`               | `LaunchWorkspaceAppLayer`, `LaunchWorkspaceTestAppLayer`, `createLaunchWorkspaceRequestBoot`                                         | Wired Layer composition for live, test, and request-scoped boot ownership through `withRequestRuntime(...)`                                                                                 | API coverage test                                |
| `flow.runtime`            | `createLaunchWorkspaceBrowserRuntime`, `createLaunchWorkspaceTestRuntime`, `createLaunchWorkspaceRequestBoot`, background Chat actor | Host bridge plus executable `runtime.resources` ResourceStore handle, `runtime.orchestrators` actor registry, and request-scoped boot payload handoff                                       | API coverage and app-layer tests                 |
| `flow.store.memory`       | `LaunchWorkspaceAppLayer`                                                                                                            | App-layer descriptor now produces a runtime ResourceStore handle with seed/get/patch/subscribe through the current live installer subset; cache/freshness lookup semantics remain partial   | App-layer runtime tests                          |
| `flow.store.test`         | `LaunchWorkspaceTestAppLayer`                                                                                                        | App-layer descriptor now produces a runtime ResourceStore handle with seed/get/patch/subscribe through the current test installer subset; cache/freshness semantics remain partial          | App-layer runtime tests                          |
| `flow.orchestrators.live` | `LaunchWorkspaceAppLayer`                                                                                                            | App-layer descriptor now produces executable `runtime.orchestrators` through the current live HostSignals installer; broader orchestrator policy options stay future                        | App-layer runtime tests                          |
| `flow.orchestrators.test` | `LaunchWorkspaceTestAppLayer`                                                                                                        | App-layer descriptor now produces executable `runtime.orchestrators` through the current test HostSignals installer; deterministic mailbox/time semantics remain partial                    | App-layer runtime tests                          |
| `flow.ensure`             | Project editor loading                                                                                                               | Wired descriptor, runtime contract-only                                                                                                                                                     | API coverage test                                |
| `flow.observe`            | Project editor comments observer                                                                                                     | Wired descriptor, runtime contract-only                                                                                                                                                     | API coverage test                                |
| `flow.refresh`            | Project command contract                                                                                                             | Wired descriptor, runtime contract-only                                                                                                                                                     | API coverage test                                |
| `flow.run`                | Project editor saving                                                                                                                | Executable machine-side transaction invoke descriptor                                                                                                                                       | Transaction tests                                |
| `flow.patch`              | Project preview patch command                                                                                                        | Command descriptor plus transaction patch receipts                                                                                                                                          | Transaction tests                                |
| `flow.invalidate`         | Readiness invalidation command                                                                                                       | Wired descriptor, runtime contract-only                                                                                                                                                     | API coverage test                                |
| `flow.stream`             | Assets upload, Assistant progress, Chat tokens                                                                                       | Wired source descriptors using the `subscribe` field; Chat token stream runs as actor-owned work with interrupt cleanup and generation snapshots                                            | Scenario and chat lifecycle tests                |
| `flow.after`              | Assets complete dismissal                                                                                                            | Wired descriptor, virtual time contract-only                                                                                                                                                | Assets scenario test                             |
| `flow.child`              | Assistant task child flow                                                                                                            | Runs parent-owned child actors with lifecycle snapshots, stop/retry receipts, child failure bubbling, and retry-only-failed-child semantics                                                 | Assistant scenario tests                         |
| `flow.can`                | Command bars and guards                                                                                                              | Executable focused slices                                                                                                                                                                   | Editor, Approval, Chat tests                     |
| `flow.useResource`        | React shell resource breadcrumb                                                                                                      | Executable provider-backed resource snapshot read with optimistic subscribe reconciliation                                                                                                  | `src/launchWorkspaceShell.tsx`                   |
| `flow.use`                | React shell flow subscription                                                                                                        | Executable provider-backed actor hook with render-safe shell creation, optional snapshot restore, live actor swap, and unmount disposal                                                     | `src/launchWorkspaceShell.tsx`                   |
| `flow.useView`            | Explicit overview/trace/chat-style read models                                                                                       | Executable explicit projection hook with selector equality and issue-aware updates; the flagship editor shell now prefers direct actor and resource reads                                   | `packages/flow-state/src/react/use-view.test.ts` |
| `FlowProvider`            | React runtime boundary                                                                                                               | Executable runtime boundary for provider-backed hooks through one App Router `"use client"` boundary                                                                                        | `app/LaunchWorkspaceClient.tsx`                  |
| `flowTest`                | Screen scenarios                                                                                                                     | Executable focused harness on the staged `@flow-state/core/testing` surface                                                                                                                 | `src/launchWorkspace.test.ts`                    |
| `flowTest.app`            | Seeded app ResourceStore harness                                                                                                     | Executable seeded app harness on the staged `@flow-state/core/testing` surface                                                                                                              | App harness tests                                |
| `createControlledEffect`  | Existing legacy deterministic Effect tests                                                                                           | Migration support on the staged `@flow-state/core/testing` surface                                                                                                                          | API coverage test                                |
| `createControlledStream`  | Existing legacy deterministic stream tests                                                                                           | Migration support on the staged `@flow-state/core/testing` surface                                                                                                                          | API coverage test                                |

Current module limitations: duplicate static resource-tag validation, generated
typed hooks, and module-level schema/error manifests are still target API work.

## Screen Proof Matrix

| Screen    | Old pressure area        | Executable now                                                                                                                                | Still contract-only                                                             |
| --------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Overview  | Cohesive app surface     | View projection from seeded resources, runtime ResourceStore subscriptions, children, receipts, issues                                        | React live subscriptions                                                        |
| Editor    | Project Editor           | Flow transitions, `flow.can`, typed save failure service test, direct actor/resource reads, preview rollback, conflict lane                   | `flow.ensure`, `flow.observe`, and offline queue replay                         |
| Checklist | Todo List                | Pure local flow state and view projection                                                                                                     | None for this slice                                                             |
| Readiness | Cached Dashboard         | Dashboard view over resource snapshot and invalidation receipts                                                                               | Resource freshness, stale-while-visible refresh                                 |
| Assets    | Streaming Upload Manager | Upload product events, `subscribe` source descriptor, pressure policy, complete timer descriptor                                              | Stream fiber ownership, concrete `unsubscribe`, pressure counters, virtual time |
| Approval  | Checkout Approval Flow   | Permission resource gate, persisted descriptor, redaction boundary                                                                            | Runtime persistence storage and migration execution                             |
| Assistant | Agent Workspace          | Parent flow state, child actor supervision, progress `subscribe` descriptor, approval gate, child failure issue bubbling, failed-child retry  | Automatic restart policies and service-level `dispose`                          |
| Chat      | Chat Stream              | Prompt guard, token accumulation, stop interrupt, stream generation snapshots, offscreen actor retention, route detach/reattach, cleanup view | None for this slice                                                             |
| Trace     | Devtools/trace           | View projection over receipts, issues, streams, timers, children                                                                              | Full trace correlation for all descriptors                                      |

## Migration Notes

- `flow.query` and `flow.mutation` are historical names, not live example APIs.
  They survive only as migration vocabulary when older notes need translation.
- `flow.transaction` is the executable target write API and transaction
  execution now records through `transaction:*` receipts.
- Target transaction variables are `params` and the write function is `commit`.
  Launch Workspace source now authors those names directly.
- Rollbackable pending ResourceStore patches use `preview`; no deprecated
  pending-patch alias is used in this example.
- Offline queue, undo, and reconnect replay remain parked behind explicit
  future markers until the transaction runner is intentionally reopened in a
  later phase.
- Stream source functions are named `subscribe`. Concrete subscriptions should
  clean up with `unsubscribe`; broader runtime or service lifetimes should use
  `dispose`.
- Chat stream snapshots expose a generation number. Restarted responses reset
  generation-local counters and stale tokens from an interrupted generation do
  not route into the next response.
- `runtime.orchestrators.start/get/stop/snapshot` is executable for stable
  keep-alive actor ids. `flow.orchestrators.live/test` remain app-layer
  descriptors rather than real Layer installers.
- Current controlled stream helpers still bridge to legacy `AsyncIterable`
  internals. The flagship app authoring surface uses Effect `Stream`.
- The current staged public split imports `FlowProvider` and React hooks from
  `@flow-state/core/react`, testing helpers from `@flow-state/core/testing`,
  and named inspection helpers such as `captureTrace` from
  `@flow-state/core/inspect`.
- The current staged public split imports test helpers from
  `@flow-state/core/testing` and inspection helpers from
  `@flow-state/core/inspect`. Legacy root exports remain migration-shaped, not
  final contract.
- Object-shaped durations such as `{ millis: ... }` are not used in the
  flagship example. New descriptors use string durations such as
  `"30 seconds"` and `"2 seconds"`.
