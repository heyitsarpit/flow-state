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

export const boot = await withRequestRuntime(LaunchWorkspaceAppLayer, async (runtime) => {
  runtime.resources.seedResources(launchWorkspaceSeed);
  const actor = runtime.createActor(launchWorkspaceMachine, {
    id: "launch.workspace",
  });
  await actor.flush();
  return runtime.dehydrateBoot({ actors: [actor] });
});
```

`App.layer` should remain an Effect Layer composition boundary. Flow helpers make store and orchestrator setup ergonomic, but they should not become a parallel dependency system. The current executable subset is the zero-arg `flow.store.memory/test()` and `flow.orchestrators.live/test()` installers. For request-scoped server work, keep using the same `App.layer`, but create one runtime per request through `withRequestRuntime(...)` instead of caching a process-global runtime. In a Node request, the live host-signal installer resolves to a static `focused: true` / `online: true` snapshot with no `window` subscriptions, so request runtimes stay disposable and isolated.

## ResourceStore And OrchestratorSystem

ResourceStore and OrchestratorSystem are sibling services.

| Service            | Owns                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| ResourceStore      | Resource entries, snapshots, seed/get/patch/subscribe, preview patches, invalidation receipts.         |
| OrchestratorSystem | Actors, snapshots, events, legal transitions, state-scoped work, child actors, stream/timer lifetimes. |

They are traced together but keep separate ownership. This is why canonical project data can stay in ResourceStore while the editor flow owns draft and conflict state.

## Runtime Handle

The runtime exposes a host bridge plus app services.

| Handle           | Use for                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `managedRuntime` | Effect `ManagedRuntime` bridge.                                                                                      |
| `resources`      | ResourceStore handle for seed/get/patch/subscribe plus dehydrate/hydrate.                                            |
| `orchestrators`  | Actor registry for start/get/stop/snapshot.                                                                          |
| `runPromise`     | Run Effects through the app runtime.                                                                                 |
| `runPromiseExit` | Preserve typed failure, defect, and interrupt lanes.                                                                 |
| `dehydrateBoot`  | Build one versioned boot payload from public resources and selected actors.                                          |
| `hydrateBoot`    | Hydrate public resource cache, expose actor snapshots for explicit restore, and reject unsupported payload versions. |
| `dispose`        | Close runtime-owned actors, resources, streams, timers, and scopes.                                                  |

## Actor Handle

The executable actor handle exposes:

| Field or method       | Use for                                                               |
| --------------------- | --------------------------------------------------------------------- |
| `id`                  | Stable actor identity.                                                |
| `send(event)`         | Drive transitions.                                                    |
| `snapshot()`          | Inspect the current flow snapshot.                                    |
| `serialize()`         | Export a JSON-safe actor snapshot tree for later restore.             |
| `subscribe(listener)` | Observe actor snapshots; returned function detaches the subscription. |
| `dispose()`           | Stop the actor and interrupt owned work.                              |
| `retryChild(id)`      | Retry only a failed child actor.                                      |
| `children()`          | Inspect child actor snapshots.                                        |
| `receipts()`          | Inspect actor, child, stream, transaction, and timer facts.           |
| `issues()`            | Inspect typed failures, defects, and interrupts.                      |

Restore the serializable subset by passing a saved tree back through
`runtime.createActor(machine, { id, snapshot })`. Resource caches can likewise
round-trip through `runtime.resources.dehydrate()` and
`runtime.resources.hydrate(entries)`. React-owned actors can restore the same
subset through `flow.use(machine, { id, snapshot })`, which renders the saved
snapshot first and then swaps in the live actor after mount without replaying
the restored entry work.

For server-to-client handoff, use `withRequestRuntime(layer, async (runtime) => ...)`
to construct one runtime per request, then call
`runtime.dehydrateBoot({ actors: [...] })`.
The current payload is versioned as `"flow-state/runtime-boot.v1"` and contains
only public resource hydration entries plus selected actor snapshot trees. It
does not persist live fibers, streams, timers, subscriptions, service handles,
or runtime callbacks. `runtime.hydrateBoot(payload)` fails closed with
`FLOW-RUNTIME-001` when the version tag does not match the supported payload
format, then restores the supported subset when it does match. Hydrate that
payload with `runtime.hydrateBoot(payload)`, and restore any booted root actor
on the client with either `runtime.createActor(machine, { id, snapshot })` at a
host boundary or `flow.use(machine, { id, snapshot })` inside React.

The supported SSR boundary is intentionally narrow:

- server pages and loaders may preload Flow-owned resources, start selected root actors, serialize one boot payload, and dispose the request runtime
- one client runtime may hydrate that payload and restore explicitly booted root actors
- generic RSC data loading, Server Actions ownership, Suspense reads, and automatic restore of arbitrary actors remain future work

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
