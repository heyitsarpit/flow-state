# Runtime

The runtime is the app boundary where Flow State installs ResourceStore,
OrchestratorSystem, inspection, and your Effect services.

For the canonical package ownership table, use
[API Reference: Import Paths](/reference/api#import-paths). For the receipt-
backed rationale behind `flow.module`, `flow.app`, and `App.layer`, read
[Ownership And Runtime Facts](/guide/ownership-and-runtime-facts).

## App And Layer

```ts
import { flow } from "@flow-state/core";

export const App = flow.app({ modules: [Session, Project, Approval, Chat] });

export const AppLayer = App.layer({
  store: flow.store.memory(),
  orchestrators: flow.orchestrators.live(),
  services: [SessionLive, ProjectLive, ApprovalLive, ChatLive],
});

export const AppTestLayer = App.layer({
  store: flow.store.test(),
  orchestrators: flow.orchestrators.test(),
  services: [SessionTest, ProjectTest, ApprovalTest, ChatTest],
});

export const runtime = flow.runtime(AppLayer);
```

The current executable installer subset is intentionally small and explicit:

- `flow.store.memory()`
- `flow.store.test()`
- `flow.orchestrators.live()`
- `flow.orchestrators.test()`

## Runtime Handle

The runtime exposes:

| Handle           | Use for                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| `managedRuntime` | Underlying Effect `ManagedRuntime`.                                         |
| `resources`      | Shared resource handle for seed, get, patch, subscribe, hydrate, dehydrate. |
| `inspection`     | Live inspection log entries and subscriptions.                              |
| `orchestrators`  | Actor registry for start, get, and stop.                                    |
| `runPromise`     | Run an Effect through the app runtime.                                      |
| `runPromiseExit` | Preserve typed failure, defect, and interrupt lanes.                        |
| `createActor`    | Start a machine actor from the runtime boundary.                            |
| `dehydrateBoot`  | Create a versioned resource-plus-actor boot payload.                        |
| `hydrateBoot`    | Restore the supported public boot payload subset.                           |
| `dispose`        | Dispose runtime-owned actors, streams, timers, subscriptions, and scopes.   |

Use `flow.runtime(AppLayer)` for runtime creation so store, orchestrators, and
service requirements stay tied to the app layer.

## Resource And Actor Boundaries

ResourceStore and OrchestratorSystem are sibling services with separate
ownership:

- ResourceStore owns canonical shared data.
- OrchestratorSystem owns workflows and their lifecycles.

That is why an editor flow can own a draft and conflict state while the project
record stays in a resource.

## Request-Scoped Server Boot

Use `withRequestRuntime(...)` from `@flow-state/server` for server work.

```ts
import { withRequestRuntime } from "@flow-state/server";

const payload = await withRequestRuntime(AppLayer, async (runtime) => {
  runtime.resources.seedResources(seed);
  const actor = runtime.createActor(workspaceMachine, { id: "workspace" });
  await actor.flush();
  return runtime.dehydrateBoot({ actors: [actor] });
});
```

The current supported boot payload contains:

- public resource hydration entries
- selected actor snapshot trees
- version tag `"flow-state/runtime-boot.v1"`

It fails closed on unsupported versions.

## Actor Handle

Actors expose:

| Method or field                | Use for                                            |
| ------------------------------ | -------------------------------------------------- |
| `id`                           | Stable actor identity.                             |
| `send(event)`                  | Drive transitions.                                 |
| `snapshot()` / `getSnapshot()` | Read the current workflow snapshot.                |
| `flush()`                      | Drain ready actor-owned work.                      |
| `children()`                   | Inspect child actor snapshots.                     |
| `receipts()`                   | Inspect runtime facts.                             |
| `issues()`                     | Inspect typed failures, defects, and interrupts.   |
| `serialize()`                  | Produce a JSON-safe snapshot tree.                 |
| `retryChild(id)`               | Retry a failed child.                              |
| `retryTransaction(id)`         | Retry the last params for a failed transaction.    |
| `resetTransaction(id)`         | Clear a transaction snapshot without rerunning it. |
| `dispose()`                    | Stop the actor and interrupt owned work.           |

## Inspection

Runtime inspection is part of the core story:

```ts
const entries = runtime.inspection.entries();
const unsubscribe = runtime.inspection.subscribe((event) => {
  console.log(event);
});
```

Use this for debug panels, logging, and tooling.

If you want the concrete receipts that show why module/app ownership matters in
practice, read [Ownership And Runtime Facts](/guide/ownership-and-runtime-facts).

## Current Limits

The runtime is real, but still intentionally narrow in a few areas:

- broader App.layer policy variants
- generalized recurring schedule policy
- generic RSC runtime ownership
- full trace correlation across all runtime surfaces

Use [Current Status](/reference/status) when you need the exact proof boundary.
