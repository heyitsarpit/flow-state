# Runtime

The Flow runtime wires ResourceStore, OrchestratorSystem, Effect services, streams, time, receipts, and tests into one app runtime.

## App And Layer

```ts
export const LaunchWorkspaceApp = flow.app({
  modules: [
    LaunchWorkspaceModule,
    Session,
    Project,
    Checklist,
    Readiness,
    Assets,
    Approval,
    Assistant,
    Chat,
    Trace,
  ],
});

export const LaunchWorkspaceAppLayer = LaunchWorkspaceApp.layer({
  store: flow.store.memory(),
  orchestrators: flow.orchestrators.live(),
  services: [LaunchWorkspaceTestServices],
});

export const LaunchWorkspaceTestAppLayer = LaunchWorkspaceApp.layer({
  store: flow.store.test(),
  orchestrators: flow.orchestrators.test(),
  services: [LaunchWorkspaceTestServices],
});

export const launchRuntime = flow.runtime(LaunchWorkspaceTestAppLayer);
```

`App.layer` should remain an Effect Layer composition boundary. Flow helpers make store and orchestrator setup ergonomic, but they should not become a parallel dependency system. The current executable subset is the zero-arg `flow.store.memory/test()` and `flow.orchestrators.live/test()` installers; broader policy knobs stay future until they are runtime-real.

## ResourceStore And OrchestratorSystem

ResourceStore and OrchestratorSystem are sibling services.

| Service            | Owns                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| ResourceStore      | Resource entries, snapshots, seed/get/patch/subscribe, preview patches, invalidation receipts.         |
| OrchestratorSystem | Actors, snapshots, events, legal transitions, state-scoped work, child actors, stream/timer lifetimes. |

They are traced together but keep separate ownership. This is why canonical project data can stay in ResourceStore while the editor flow owns draft and conflict state.

## Runtime Handle

The runtime exposes a host bridge plus app services.

| Handle           | Use for                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `managedRuntime` | Effect `ManagedRuntime` bridge.                                     |
| `resources`      | ResourceStore handle for seed/get/patch/subscribe.                  |
| `orchestrators`  | Actor registry for start/get/stop/snapshot.                         |
| `runPromise`     | Run Effects through the app runtime.                                |
| `runPromiseExit` | Preserve typed failure, defect, and interrupt lanes.                |
| `dispose`        | Close runtime-owned actors, resources, streams, timers, and scopes. |

## Actor Handle

The executable actor handle exposes:

| Field or method       | Use for                                                               |
| --------------------- | --------------------------------------------------------------------- |
| `id`                  | Stable actor identity.                                                |
| `send(event)`         | Drive transitions.                                                    |
| `snapshot()`          | Inspect the current flow snapshot.                                    |
| `subscribe(listener)` | Observe actor snapshots; returned function detaches the subscription. |
| `dispose()`           | Stop the actor and interrupt owned work.                              |
| `retryChild(id)`      | Retry only a failed child actor.                                      |
| `children()`          | Inspect child actor snapshots.                                        |
| `receipts()`          | Inspect actor, child, stream, transaction, and timer facts.           |
| `issues()`            | Inspect typed failures, defects, and interrupts.                      |

## Receipts And Issues

Receipts are diagnostic facts. Product logic should use routed events and snapshots, not parse receipts as command state.

Issues preserve outcome lanes:

| Lane          | Meaning                                    |
| ------------- | ------------------------------------------ |
| Typed failure | Expected domain or infrastructure failure. |
| Defect        | Unexpected bug or invariant break.         |
| Interrupt     | Cancellation or disposal, not failure.     |

## Trace

Runtime-owned machine actors mirror newly produced machine receipts into `TraceLog`, so machine event, guard, transition, update, action, and no-transition facts are available both on snapshots and in runtime trace entries.

Trace should eventually correlate resource, transaction, stream, timer, child, and Effect spans with those machine facts. Launch Workspace currently projects receipts and issues in a trace view; full trace correlation is listed on [Current Status](/reference/status).
