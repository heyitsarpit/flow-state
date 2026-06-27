# Launch Workspace API Inventory

Status: review note for the vNext API proving app.

This file is the linked Phase 0 export inventory for
`examples/launch-workspace`. It assigns every public API name from
`reference-next/lib-api.md` to a concrete module, screen, or test and marks
whether it is executable today or still contract-only.

## Final API Coverage

| API                       | Example owner                                                                            | Status                                                                                                   | Proof                                       |
| ------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `flow.module`             | Session, Project, Checklist, Readiness, Assets, Approval, Assistant, Chat, Launch, Trace | Wired descriptor                                                                                         | `src/launchWorkspace.ts`, API coverage test |
| `flow.resource`           | Project, Permissions, Readiness, Assets, Approval                                        | Seeded app ResourceStore snapshots executable; main function is `lookup`; live lookup partial            | App harness tests                           |
| `flow.transaction`        | Project save, Approval submit                                                            | Target name for writes with `params`, `commit`, and `preview`; implemented through `flow.mutation` today | Transaction tests                           |
| `flow.mutation`           | Project save, Approval submit                                                            | Runtime compatibility descriptor for transaction targets                                                 | Transaction tests                           |
| `flow.machine`            | Editor, checklist, upload, approval, assistant, chat                                     | Executable focused slices                                                                                | Scenario tests                              |
| `flow.view`               | Editor, checklist, dashboard, overview, trace                                            | Executable projections                                                                                   | Scenario tests                              |
| `flow.app`                | `LaunchWorkspaceApp`                                                                     | Wired descriptor                                                                                         | API coverage test                           |
| `App.layer`               | `LaunchWorkspaceAppLayer`, `LaunchWorkspaceTestAppLayer`                                 | Wired Layer composition                                                                                  | API coverage test                           |
| `flow.runtime`            | `launchRuntime`                                                                          | Wired host bridge                                                                                        | API coverage test                           |
| `flow.store.memory`       | `LaunchWorkspaceAppLayer`                                                                | Wired descriptor, store runtime contract-only                                                            | API coverage test                           |
| `flow.store.test`         | `LaunchWorkspaceTestAppLayer`                                                            | Wired descriptor, app harness contract-only                                                              | API coverage test                           |
| `flow.orchestrators.live` | `LaunchWorkspaceAppLayer`                                                                | Wired descriptor, orchestrator runtime contract-only                                                     | API coverage test                           |
| `flow.orchestrators.test` | `LaunchWorkspaceTestAppLayer`                                                            | Wired descriptor, app harness contract-only                                                              | API coverage test                           |
| `flow.ensure`             | Project editor loading                                                                   | Wired descriptor, runtime contract-only                                                                  | API coverage test                           |
| `flow.observe`            | Project editor comments observer                                                         | Wired descriptor, runtime contract-only                                                                  | API coverage test                           |
| `flow.refresh`            | Project command contract                                                                 | Wired descriptor, runtime contract-only                                                                  | API coverage test                           |
| `flow.run`                | Project editor saving                                                                    | Runtime compatibility descriptor for transaction commit execution                                        | Transaction tests                           |
| `flow.patch`              | Project preview patch command                                                            | Command descriptor plus transaction patch receipts                                                       | Transaction tests                           |
| `flow.invalidate`         | Readiness invalidation command                                                           | Wired descriptor, runtime contract-only                                                                  | API coverage test                           |
| `flow.stream`             | Assets upload, Assistant progress, Chat tokens                                           | Wired source descriptors using `subscribe` adapters; runtime key remains `stream`                        | Scenario tests inspect descriptors          |
| `flow.after`              | Assets complete dismissal                                                                | Wired descriptor, virtual time contract-only                                                             | Assets scenario test                        |
| `flow.child`              | Assistant task child flow                                                                | Wired descriptor, runtime contract-only                                                                  | Assistant scenario test                     |
| `flow.can`                | Command bars and guards                                                                  | Executable focused slices                                                                                | Editor, Approval, Chat tests                |
| `flow.useResource`        | React shell resource breadcrumb                                                          | Contract-only hook shape                                                                                 | `src/main.tsx`                              |
| `flow.use`                | React shell flow subscription                                                            | Contract-only hook shape                                                                                 | `src/main.tsx`                              |
| `flow.useView`            | React shell read model                                                                   | Contract-only hook shape                                                                                 | `src/main.tsx`                              |
| `FlowProvider`            | React runtime boundary                                                                   | Contract-only provider boundary                                                                          | `src/main.tsx`                              |
| `flowTest`                | Screen scenarios                                                                         | Executable focused harness                                                                               | `src/launchWorkspace.test.ts`               |
| `flowTest.app`            | Seeded app ResourceStore harness                                                         | Executable seeded resource harness                                                                       | App harness tests                           |
| `createControlledEffect`  | Existing legacy deterministic Effect tests                                               | Migration support                                                                                        | API coverage test                           |
| `createControlledStream`  | Existing legacy deterministic stream tests                                               | Migration support                                                                                        | API coverage test                           |

## Screen Proof Matrix

| Screen    | Old pressure area        | Executable now                                                                                   | Still contract-only                                                             |
| --------- | ------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Overview  | Cohesive app surface     | View projection from seeded resources, children, receipts, issues                                | Live subscriptions                                                              |
| Editor    | Project Editor           | Flow transitions, `flow.can`, typed save failure service test, editor view, preview rollback     | `flow.ensure` and `flow.observe` live lookup execution                          |
| Checklist | Todo List                | Pure local flow state and view projection                                                        | None for this slice                                                             |
| Readiness | Cached Dashboard         | Dashboard view over resource snapshot and invalidation receipts                                  | Resource freshness, stale-while-visible refresh                                 |
| Assets    | Streaming Upload Manager | Upload product events, `subscribe` source descriptor, pressure policy, complete timer descriptor | Stream fiber ownership, concrete `unsubscribe`, pressure counters, virtual time |
| Approval  | Checkout Approval Flow   | Permission resource gate, persisted descriptor, redaction boundary                               | Runtime persistence storage and migration execution                             |
| Assistant | Agent Workspace          | Parent flow state, child-flow descriptor, progress `subscribe` descriptor, approval gate         | Child actor supervision and service-level `dispose`                             |
| Chat      | Chat Stream              | Prompt guard, token accumulation, stop event                                                     | Offscreen subscription policy, `unsubscribe` cleanup receipts                   |
| Trace     | Devtools/trace           | View projection over receipts, issues, streams, timers, children                                 | Runtime receipt generation for contract-only descriptors                        |

## Migration Notes

- `flow.query` and old submit-style mutation execution are not final example
  APIs. They remain in older examples as legacy implementation snapshots.
- `flow.transaction` is the target write API. This example exports
  transaction-named descriptors, but keeps `flow.mutation` and `flow.run` in
  executable code until the runtime surface adds transaction aliases.
- Target transaction variables are `params` and the write function is `commit`.
  Current runtime configs still require `input` and `effect`, so source uses
  small adapter names such as `saveLaunchProjectParams` and
  `commitLaunchProject`.
- Rollbackable pending ResourceStore patches use `preview`; no deprecated
  pending-patch alias is used in this example.
- Stream source functions are named `subscribe`. Concrete subscriptions should
  clean up with `unsubscribe`; broader runtime or service lifetimes should use
  `dispose`.
- Current controlled stream helpers still bridge to legacy `AsyncIterable`
  internals. The flagship app authoring surface uses Effect `Stream`.
- Object-shaped durations such as `{ millis: ... }` are not used in the
  flagship example. New descriptors use string durations such as
  `"30 seconds"` and `"2 seconds"`.
