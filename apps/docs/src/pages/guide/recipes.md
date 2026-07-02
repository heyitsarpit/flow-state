# Recipes

These recipes are decision guides, not a second API reference.

Start with the choice you need to make, then follow the linked owner pages for
the full API surface.
Each bucket stays inside patterns already proved by the current package and
Launch Workspace tests.

## Prerequisites And Freshness

Use this when a state has to choose between blocking on canonical data before
it can proceed and staying subscribed while the state remains visible.

Use `ensure(ref)` when the state cannot honestly continue without the resource.

```ts
ready: {
  invoke: ensure(projectResource.ref(projectId)),
  on: {
    PROJECT_READY: "editing",
  },
}
```

Use `observe(ref)` when the actor should stay subscribed to the latest
snapshot while the state is active.

```ts
editing: {
  invoke: [
    observe(projectResource.ref(projectId)),
    observe(commentsResource.ref(projectId)),
  ],
}
```

Read next: [Resources](/reference/resources),
[Machines](/reference/machines), and
[Server And Hydration](/guide/server-hydration).

## Previewable Writes And Retry

Use this when a write should patch local state immediately, route its outcome
through the machine, and remain visible enough to retry or reset after a
failure.

Use `transaction(...)` plus `outcomes(...)` for previewable writes.

```ts
const saveProject = transaction({
  id: "project.save",
  params: ({ context }) => ({
    id: context.projectId,
    draft: context.draft,
  }),
  commit: ProjectApi.save,
  preview: {
    apply: ({ params }) => [{ ref: projectResource.ref(params.id), replace: params.draft }],
  },
  invalidates: [projectTag],
  routes: outcomes({
    success: ({ value }) => ({ type: "PROJECT_SAVED", project: value }),
    failure: ["PROJECT_SAVE_FAILED", "error"],
  }),
});
```

When the failed write should run again with the last params, retry it.
When the UI should forget the old failure state, reset it.

```ts
actor.retryTransaction("project.save");
actor.resetTransaction("project.save");
```

Read next: [Transactions](/reference/transactions) and
[Testing](/reference/testing).

## Child And Stream Work

Use this when one state owns another workflow, an ongoing value stream, or a
small local time edge.

Use `child(...)` when a parent flow owns a child flow's lifecycle.

```ts
const assistantChild = child({
  id: "Assistant.task",
  machine: assistantTaskMachine,
  supervision: "stop-on-failure",
});
```

Use `stream(...)` for state-scoped ongoing values such as uploads, progress, or
token streams.

```ts
const tokenStream = stream({
  id: "Chat.tokens",
  params: ({ context }) => context.prompt,
  subscribe: ({ params }) => ChatApi.stream(params),
  routes: {
    value: (token) => ({ type: "TOKEN", token }),
    done: () => ({ type: "DONE" }),
  },
});
```

Use `after(...)` only for one delayed transition, not a recurring workflow.

```ts
complete: {
  after: after({
    id: "Upload.dismiss",
    delay: "2 seconds",
    target: "idle",
  }),
}
```

Read next: [Machines](/reference/machines),
[Streams And Time](/reference/streams-time), and
[Testing](/guide/testing).

## Boot And Restore

Use this when the first client screen should start from a request-scoped boot
payload instead of waiting to recreate everything after mount.

Create the boot payload on the server, hydrate it into one client runtime, then
restore only the actors you explicitly booted.

```ts
const boot = clientRuntime.hydrateBoot(payload);

const actor = useFlow(workspaceMachine, {
  id: "workspace",
  snapshot: boot.actorSnapshot("workspace"),
});
```

This is a narrow server-to-client handoff, not a generic RSC read path and not
a way to restore arbitrary live Effect resources.

Read next: [Server And Hydration](/guide/server-hydration) and
[Runtime](/reference/runtime).

## Runtime Escape Hatches

Use this when React is optional and you need runtime-owned integrations,
scripts, shell code, or non-React projections.

Start actors directly from the runtime boundary when no React provider owns the
lifecycle.

```ts
const appRuntime = runtime(AppLayer);
const actor = appRuntime.createActor(workspaceMachine, {
  id: "workspace",
});

actor.send({ type: "OPEN" });
await actor.flush();
```

Use `selectView(...)` when you need the same read model in tests or runtime-only
code without rendering React.

```ts
const summary = selectView(actor.snapshot(), workspaceSummaryView, {
  issues: actor.issues(),
});
```

Read next: [Runtime](/reference/runtime),
[React And Views](/reference/views-react), and
[Testing](/guide/testing).
