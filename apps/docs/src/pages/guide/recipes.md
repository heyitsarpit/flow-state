# Recipes

These recipes focus on patterns that are already proved by the current package
and Launch Workspace tests.

## Require Data Before A State Can Proceed

Use `flow.ensure` when the state cannot honestly continue without a resource.

```ts
ready: {
  invoke: flow.ensure(projectResource.ref(projectId)),
  on: {
    PROJECT_READY: "editing",
  },
}
```

Use this for blocking prerequisites such as project records, permissions, or
session state.

## Keep Data Fresh While A State Is Visible

Use `flow.observe` when the actor should stay subscribed to the latest resource
snapshot while the state is active.

```ts
editing: {
  invoke: [
    flow.observe(projectResource.ref(projectId)),
    flow.observe(commentsResource.ref(projectId)),
  ],
}
```

This is a better fit than copying resource data into context.

## Save With Preview And Rollback

Use `flow.transaction` when the user should see a local patch while the write is
running.

```ts
const saveProject = flow.transaction({
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
  routes: flow.outcomes({
    success: ({ value }) => ({ type: "PROJECT_SAVED", project: value }),
    failure: ["PROJECT_SAVE_FAILED", "error"],
  }),
});
```

This gives you routed outcomes, preview patches, rollback, receipts, and
transaction inspection in tests.

## Retry Or Reset A Failed Transaction

Transaction snapshots stay visible until you clear or retry them.

```ts
actor.retryTransaction("project.save");
actor.resetTransaction("project.save");
```

The same helpers exist on `flowTest` harnesses. Use retry when the last params
should run again. Use reset when the UI should forget the old failure state.

## Select A View Outside React

If you need a projection in tests or runtime-only code, use `selectView(...)`.

```ts
import { selectView } from "@flow-state/core";

const summary = selectView(actor.snapshot(), workspaceSummaryView, {
  issues: actor.issues(),
});
```

This is the non-React counterpart to `useView(...)`.

## Supervise A Child Workflow

Use `flow.child` when one flow owns another flow's lifecycle.

```ts
const assistantChild = flow.child({
  id: "Assistant.task",
  machine: assistantTaskMachine,
  supervision: "stop-on-failure",
});
```

The current runtime proves child start, stop, failure, retry, and child-final
success. Automatic restart policies are not part of the supported surface yet.

## Stream Progress Into A Flow

Use `flow.stream` for state-scoped ongoing values such as uploads, progress, or
token streams.

```ts
const tokenStream = flow.stream({
  id: "Chat.tokens",
  params: ({ context }) => context.prompt,
  subscribe: ({ params }) => ChatApi.stream(params),
  routes: {
    value: (token) => ({ type: "TOKEN", token }),
    done: () => ({ type: "DONE" }),
  },
});
```

State exit, actor disposal, and runtime disposal interrupt owned streams.

## Delay A One-Shot Transition

Use `flow.after` for one delayed transition, not a recurring workflow.

```ts
complete: {
  after: flow.after({
    id: "Upload.dismiss",
    delay: "2 seconds",
    target: "idle",
  }),
}
```

In tests, move time with `advance("2 seconds")` or bounded `settle(...)`.

## Restore A Booted Actor

Use serialized actor snapshots for request boot or explicit restore.

```ts
const boot = runtime.hydrateBoot(payload);

const actor = useFlow(workspaceMachine, {
  id: "workspace",
  snapshot: boot.actorSnapshot("workspace"),
});
```

This restores the public JSON-safe actor tree. It does not restore arbitrary
live Effect resources.

## Start A Runtime Actor Manually

React is optional. You can start actors directly from the runtime boundary.

```ts
const runtime = flow.runtime(AppLayer);
const actor = runtime.createActor(workspaceMachine, {
  id: "workspace",
});

actor.send({ type: "OPEN" });
await actor.flush();
```

This is a good fit for runtime-owned integrations, scripts, or host-specific
shells.
