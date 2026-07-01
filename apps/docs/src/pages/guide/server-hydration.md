# Server And Hydration

Flow State supports a narrow but real server-to-client handoff today:

1. Create one request-scoped runtime on the server.
2. Seed resources and optionally start selected root actors.
3. Serialize a versioned boot payload.
4. Dispose the request runtime.
5. Hydrate the payload into one client runtime.
6. Restore only the actors you explicitly booted.

That path is executable. Broader RSC ownership, generic Suspense reads, and
Server Action orchestration are still future work.

## Server Pattern

Import `withRequestRuntime` from `@flow-state/core/server`.

```ts
import { flow, withRequestRuntime } from "@flow-state/core/server";

export const App = flow.app(Session, Project, Chat);

export const AppLayer = App.layer({
  store: flow.store.memory(),
  orchestrators: flow.orchestrators.live(),
  services: [ProjectLive, ChatLive],
});

export async function createRequestBoot() {
  return withRequestRuntime(AppLayer, async (runtime) => {
    runtime.resources.seedResources(seed);

    const actor = runtime.createActor(workspaceMachine, {
      id: "workspace",
    });

    await actor.flush();

    return runtime.dehydrateBoot({
      actors: [actor],
    });
  });
}
```

`withRequestRuntime(...)` always disposes the runtime after the handler
finishes, even if the handler throws.

## Client Pattern

Hydrate the boot payload into a browser runtime, then restore the actor snapshot
explicitly.

```tsx
import { FlowProvider, flow } from "@flow-state/core/react";

const runtime = flow.runtime(AppLayer);
const boot = runtime.hydrateBoot(payload);

function WorkspaceScreen() {
  const actor = flow.use(workspaceMachine, {
    id: "workspace",
    snapshot: boot.actorSnapshot("workspace"),
  });

  return <div>{actor.getSnapshot().value}</div>;
}

export function WorkspaceClient() {
  return (
    <FlowProvider runtime={runtime}>
      <WorkspaceScreen />
    </FlowProvider>
  );
}
```

`flow.use(...)` renders a shell actor first and swaps to the live runtime actor
after mount. That keeps the initial render safe while still letting you restore
the serialized snapshot.

## What Gets Serialized

The boot payload currently contains:

- Public resource hydration entries.
- Selected actor snapshot trees.
- A version tag: `"flow-state/runtime-boot.v1"`.

It does not persist:

- Live fibers.
- Active streams or subscriptions.
- Timers as live handles.
- Service instances.
- Runtime callbacks.

The runtime replays only the supported serializable subset.

## Supported Boundary

The current server story is intentionally narrow:

- Preload Flow-owned resources on the server.
- Start selected root actors on the server.
- Dehydrate one boot payload per request.
- Hydrate that payload into one client runtime.
- Restore explicitly booted actors.

Do not treat this as a general-purpose RSC runtime yet.

## Warnings

- Create one runtime per request on the server. Do not cache a process-global
  mutable runtime for request work.
- Keep the boot payload small. Serialize only resources and actors the first
  client screen actually needs.
- Fail closed on version drift. `runtime.hydrateBoot(payload)` rejects
  unsupported payload versions.
- Keep React on the client side of `FlowProvider`. The current App Router proof
  uses one `"use client"` boundary around the Flow runtime.

## Good Use Cases

Use the current server boundary for:

- Preloaded editor screens.
- Dashboard resources that should be visible on first paint.
- Restoring a root actor after navigation or request boot.

Wait for more runtime proof before using it as a generic data-loading or
server-action abstraction.
