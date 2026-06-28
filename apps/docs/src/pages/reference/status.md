# Current Status

Launch Workspace is the API usage proof for these docs. It is not a production app, and this documentation pass does not implement runtime behavior. The matrix below separates executable behavior from compatibility-backed, descriptor-only, contract-only, and migration surfaces.

## API Matrix

| API                       | Docs status             | Example proof                                                                            | Executable status                                      | Caveat                                                                                                                  |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `flow.module`             | Final authoring docs    | Session, Project, Checklist, Readiness, Assets, Approval, Assistant, Chat, Launch, Trace | executable                                             | Static resource-tag validation remains contract-only.                                                                   |
| `flow.resource`           | Final authoring docs    | Project, Permissions, Readiness, Assets, Approval                                        | executable through seeded ResourceStore                | Live app-level lookup, freshness, cache, and active refresh are partial.                                                |
| `flow.transaction`        | Final authoring docs    | Project save, Approval request                                                           | executable through compatibility                       | Internal receipts still use `mutation:*` labels.                                                                        |
| `flow.mutation`           | Compatibility docs      | Older examples                                                                           | legacy/migration                                       | Not the primary write authoring API.                                                                                    |
| `flow.machine`            | Final authoring docs    | Editor, checklist, upload, approval, assistant, chat, workspace                          | executable                                             | Advanced statechart features are outside the current docs path.                                                         |
| `flow.view`               | Advanced authoring docs | Overview, trace, dashboards, multi-source summaries                                      | executable                                             | Use sparingly for real projection work; simple UI can read resources or actor snapshots directly.                       |
| `flow.app`                | Final authoring docs    | `LaunchWorkspaceApp`                                                                     | executable                                             | App inventory and dependency validation exist; broader manifests are still evolving.                                    |
| `App.layer`               | Final authoring docs    | `LaunchWorkspaceAppLayer`, `LaunchWorkspaceTestAppLayer`                                 | executable                                             | Real Layer installers for every descriptor option remain partial.                                                       |
| `flow.runtime`            | Final authoring docs    | `launchRuntime`                                                                          | executable                                             | Runtime exposes concrete resources/orchestrators; full trace and scheduler semantics are partial.                       |
| `flow.store.memory`       | Runtime docs            | App layer descriptor                                                                     | executable                                             | Seed/get/patch/subscribe exist; cache/freshness semantics are partial.                                                  |
| `flow.store.test`         | Runtime docs            | Test app layer descriptor                                                                | executable                                             | Deterministic freshness/time semantics are partial.                                                                     |
| `flow.orchestrators.live` | Runtime docs            | App layer descriptor                                                                     | executable registry                                    | Descriptor config options are not fully semantic.                                                                       |
| `flow.orchestrators.test` | Runtime docs            | Test app layer descriptor                                                                | executable registry                                    | Deterministic mailboxes are partial; actor-owned delayed transitions run under injected clocks.                         |
| `flow.ensure`             | Machine docs            | Project loading                                                                          | descriptor-only                                        | Live resource dependency execution remains contract-only.                                                               |
| `flow.observe`            | Machine docs            | Project comments, readiness/assets/approval observers                                    | descriptor-only                                        | Live observer lifecycle remains contract-only.                                                                          |
| `flow.refresh`            | Machine docs            | Refresh command descriptor                                                               | descriptor-only                                        | Runtime refresh behavior remains contract-only.                                                                         |
| `flow.run`                | Transaction docs        | Project save                                                                             | executable through compatibility                       | Runs through current transaction/mutation runner.                                                                       |
| `flow.patch`              | Transaction docs        | Project preview patch command                                                            | executable through transaction path                    | Standalone live command behavior remains partial.                                                                       |
| `flow.invalidate`         | Transaction docs        | Readiness invalidation command                                                           | descriptor-only                                        | Full invalidation runtime behavior remains contract-only.                                                               |
| `flow.stream`             | Streams docs            | Assets upload, assistant progress, chat tokens                                           | executable for actor-owned chat stream and descriptors | Broader runtime-owned stream disposal and pressure counters are partial.                                                |
| `flow.after`              | Streams docs            | Assets completion dismissal                                                              | executable for actor-owned delayed transitions         | Timer snapshots remain partial.                                                                                         |
| `flow.child`              | Machine docs            | Assistant task child flow                                                                | executable                                             | Automatic restart policies remain contract-only.                                                                        |
| `flow.can`                | Machine and React docs  | Command bars, guards, permission gates                                                   | executable                                             | Depends on resource snapshots supplied to the guard.                                                                    |
| `FlowProvider`            | React docs              | Launch Workspace shell                                                                   | contract-only                                          | Generated typed hooks and live subscriptions are not implemented.                                                       |
| `flow.useResource`        | React docs              | Resource breadcrumb                                                                      | contract-only                                          | Hook shape is shown by the shell, not live runtime proof.                                                               |
| `flow.use`                | React docs              | Editor actor shell                                                                       | contract-only                                          | Hook shape is shown by the shell, not live runtime proof.                                                               |
| `flow.useView`            | React docs              | Overview and trace projections                                                           | contract-only                                          | Hook shape is shown for explicit projections, not as the default component read path.                                   |
| `flowTest`                | Testing docs            | Screen scenarios                                                                         | executable                                             | Host test runner owns assertions.                                                                                       |
| `flowTest.app`            | Testing docs            | Seeded resources, module fixtures, transactions                                          | executable                                             | `flush` drains only ready queued work; `advance` moves virtual time; `settle` runs bounded quiescence with diagnostics. |
| `createControlledEffect`  | Testing docs            | Controlled helper coverage                                                               | legacy/migration support                               | Useful for tests; not a product runtime concept.                                                                        |
| `createControlledStream`  | Testing docs            | Chat token tests                                                                         | legacy/migration support                               | Current helper bridges legacy internals while app descriptors use Effect `Stream`.                                      |

## Runtime Facts

| Fact                     | Example proof                                        | Status                                           |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------ |
| Resource snapshots       | Seeded ResourceStore and app harness tests           | executable for seed/get/patch/subscribe          |
| Transaction snapshots    | Preview, rollback, route, and receipt tests          | executable through compatibility                 |
| Stream snapshots         | Chat generation and stop tests                       | executable for actor-owned stream slice          |
| Timer snapshots          | Assets descriptor                                    | contract-only                                    |
| Child actor snapshots    | Assistant child lifecycle tests                      | executable                                       |
| Receipts                 | Transaction, stream, actor, child tests              | executable with compatibility labels where noted |
| Issues                   | Typed failure, child failure, stream interrupt tests | executable                                       |
| Trace/timeline facts     | Trace view projection                                | partial                                          |
| App and module inventory | API and module inventory tests                       | executable                                       |

## Known Partial Surfaces

- Live app-level resource lookup, freshness, cache semantics, active refresh, and broad invalidation.
- `flow.ensure`, `flow.observe`, `flow.refresh`, `flow.patch`, and `flow.invalidate` live behavior outside proved slices.
- Final transaction receipt labels.
- Stream pressure counters and broader runtime-owned stream disposal.
- Timer snapshots.
- Deterministic mailboxes.
- Real Layer installers for every orchestrator descriptor option.
- Automatic child restart policies.
- Generated typed hooks and live React subscriptions.
- Full trace correlation.
