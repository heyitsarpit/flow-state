# React And Views

React helpers live on `@flow-state/react`.

Most UI should read resources and actor snapshots directly. Add views only when
projection pressure is real.

## Imports

```tsx
import * as flowCore from "@flow-state/core";
import { FlowProvider, use as useFlow, useResource, useView } from "@flow-state/react";
```

These examples keep React hooks as named imports from `@flow-state/react` and
shared builders like `flow.can(...)` on `@flow-state/core` so package
ownership stays visible.

## `FlowProvider`

`FlowProvider` installs a runtime for provider-backed hooks.

```tsx
<FlowProvider runtime={runtime}>
  <AppShell />
</FlowProvider>
```

The runtime must be passed explicitly. `FlowProvider` does not own runtime
creation for you.

## `useResource(ref)`

Use `useResource(...)` when a component needs shared data and nothing more.

```tsx
function ProjectBreadcrumb() {
  const project = useResource(projectResource.ref(fixtureProject.id));
  return <span>{project === null ? "Loading" : project.value.name}</span>;
}
```

This is usually the right choice for read-only data display.

## `use(machine, options?)`

Use `use(...)` when the component owns a workflow actor. Import it as
`use as useFlow` when you want the callsite distinct from React's own `use`.

```tsx
function ProjectEditorCommands() {
  const actor = useFlow(projectEditorMachine, { id: "project-editor" });
  const snapshot = actor.getSnapshot();

  return (
    <>
      <button disabled={!coreFlow.can(snapshot, { type: "EDIT_PROJECT" })}>Edit</button>
      <button disabled={!coreFlow.can(snapshot, { type: "SAVE_PROJECT" })}>Save</button>
    </>
  );
}
```

The hook renders a shell actor first, then swaps to the live runtime actor after
mount. That makes restore and first render safe.

## `useView(actor, view, equal?)`

Use a view when several runtime sources need one reusable shape.

```tsx
const overview = useView(actor, workspaceOverviewView);
```

Add an equality function only when it materially reduces rerenders for a stable
projection.

## `selectView(snapshot, view, options?)`

Use `selectView(...)` outside React when you need the same projection in tests,
runtime code, or inspection tools.

```ts
import { selectView } from "@flow-state/core";

const selection = selectView(actor.snapshot(), workspaceOverviewView, {
  issues: actor.issues(),
});
```

## When To Add A View

Good reasons:

- a dashboard joins several resources
- a trace panel joins receipts, issues, streams, and child state
- two or more components or tests need the same projection
- the projection has real domain meaning

Bad reasons:

- a single label
- a one-resource breadcrumb
- a one-actor button row
- a component that can already render from one snapshot

## Restore Pattern

The current runtime supports explicit actor restore:

```tsx
const boot = runtime.hydrateBoot(payload);

const actor = useFlow(workspaceMachine, {
  id: "workspace",
  snapshot: boot.actorSnapshot("workspace"),
});
```

Use this for request boot and route reattach patterns that need a saved actor
snapshot.
