# Getting Started

This page walks through the smallest realistic Flow State slice:

- one Effect service
- one resource
- one transaction
- one machine
- one runtime
- one React boundary
- one scenario test

## Imports

This page uses the smallest package set needed for the first slice:

```ts
import { createKey, createTag, flow } from "@flow-state/core";
import { FlowProvider, flow as reactFlow } from "@flow-state/react";
import { test } from "@flow-state/testing";
```

For the canonical package ownership table, use
[API Reference: Import Paths](/reference/api#import-paths). This guide only
pulls in the routes that the first resource -> transaction -> machine -> React
-> test ladder actually needs.

## 1. Define A Service

Keep I/O behind Effect services and Layers.

```ts
import { Clock, Context, Effect, Layer } from "effect";

export class ProjectApi extends Context.Service<
  ProjectApi,
  {
    readonly getProject: (id: LaunchProjectId) => Effect.Effect<LaunchProject>;
    readonly saveProject: (
      params: SaveProjectParams,
    ) => Effect.Effect<LaunchProject, ProjectSaveError>;
  }
>()("launch-workspace/ProjectApi") {}

export const ProjectTestLayer = Layer.succeed(
  ProjectApi,
  ProjectApi.of({
    getProject: Effect.fn("ProjectApi.getProject")(function* (id) {
      const now = yield* Clock.currentTimeMillis;
      return { ...fixtureProject, id, updatedAt: now };
    }),
    saveProject: Effect.fn("ProjectApi.saveProject")(function* (params) {
      const now = yield* Clock.currentTimeMillis;
      return {
        ...fixtureProject,
        ...params.draft,
        id: params.id,
        version: params.baseVersion + 1,
        updatedAt: now,
      };
    }),
  }),
);
```

## 2. Define A Resource

Resources own canonical shared data.

```ts
import { Effect, Option } from "effect";
import { createKey, createTag, flow } from "@flow-state/core";

const projectTag = createTag("launch:project");

export const projectResource = flow.resource({
  id: "launch.project",
  key: (id: LaunchProjectId) => createKey("launch", "project", id),
  lookup: (id) =>
    Effect.gen(function* () {
      const api = yield* ProjectApi;
      return yield* api.getProject(id);
    }),
  tags: () => [projectTag],
  placeholder: () => Option.some(fixtureProject),
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});
```

## 3. Define A Transaction

Transactions own writes, preview patches, rollback, and invalidation.

```ts
export const saveProjectTransaction = flow.transaction({
  id: "launch.save-project",
  params: ({ context }) => ({
    id: context.activeProjectId,
    draft: context.draft,
    baseVersion: fixtureProject.version,
  }),
  commit: (params) =>
    Effect.gen(function* () {
      const api = yield* ProjectApi;
      return yield* api.saveProject(params);
    }),
  preview: {
    apply: ({ params }) => [
      {
        ref: projectResource.ref(params.id),
        replace: { ...fixtureProject, ...params.draft, id: params.id },
      },
    ],
  },
  invalidates: [projectTag],
  routes: flow.outcomes({
    success: ({ value }) => ({ type: "PROJECT_SAVED", project: value }),
    failure: ["PROJECT_SAVE_FAILED", "error"],
  }),
});
```

## 4. Define A Machine

Machines own process state, not canonical app data.

```ts
export const launchWorkspaceMachine = flow.machine({
  id: "launch-workspace",
  initial: "ready",
  context: createInitialContext,
  states: {
    ready: {
      invoke: [flow.ensure(projectResource.ref(fixtureProjectId))],
      on: {
        EDIT_PROJECT: { update: editLaunchProject },
        SAVE_PROJECT: {
          target: "saving",
          guard: canSaveProject,
        },
      },
    },
    saving: {
      invoke: flow.run(saveProjectTransaction),
      on: {
        PROJECT_SAVED: { target: "ready", update: applySavedProject },
        PROJECT_SAVE_FAILED: { target: "saveConflict", update: recordSaveFailure },
      },
    },
    saveConflict: {
      on: {
        EDIT_PROJECT: { target: "ready", update: editLaunchProject },
      },
    },
  },
});
```

Use `flow.can(snapshot, event)` anywhere you need the same legal-command check
the runtime uses.

## 4A. Use `submit` For Event-Owned Writes

If a transition should both change state and start a transaction immediately,
use the transition `submit` field.

```ts
editing: {
  on: {
    SAVE_PROJECT: {
      target: "saving",
      guard: canSaveProject,
      submit: saveProjectTransaction,
    },
  },
}
```

Use `submit` when the write belongs to the event itself. Use
`invoke: flow.run(...)` when the write belongs to the entered state.

## 5. Move To App-Level Assembly When You Need It

Add `flow.module`, `flow.app`, and `App.layer` when you want app-level
composition, fixture-backed tests, duplicate-id validation, or one runtime
assembly boundary.

```ts
export const ProjectModule = flow.module("Project", {
  resources: { byId: projectResource },
  transactions: { save: saveProjectTransaction },
  machines: { editor: launchWorkspaceMachine },
});

export const App = flow.app({ modules: [ProjectModule] });

export const AppLayer = App.layer({
  store: flow.store.test(),
  orchestrators: flow.orchestrators.test(),
  services: [ProjectTestLayer],
});

export const runtime = flow.runtime(AppLayer);
```

At that point, `flow.module` and `flow.app` are buying something real:

- module and app inventory
- fixture registration and `seedModuleFixtures(...)`
- duplicate-id validation across modules
- one place to assemble the runtime layer

## 6. Mount React

Use `FlowProvider` plus the React hooks entrypoint. Keep shared builders on
`@flow-state/core`.

```tsx
import { flow } from "@flow-state/core";
import { FlowProvider, flow as reactFlow } from "@flow-state/react";

function LaunchWorkspaceShell() {
  const actor = reactFlow.use(launchWorkspaceMachine, {
    id: "launch.workspace",
  });
  const snapshot = actor.getSnapshot();
  const project = reactFlow.useResource(projectResource.ref(snapshot.context.activeProjectId));

  return (
    <>
      <button disabled={!flow.can(snapshot, { type: "SAVE_PROJECT" })}>Save</button>
      <span>{snapshot.value}</span>
      <span>{project === null ? "loading" : project.value.name}</span>
    </>
  );
}

export function LaunchWorkspaceApp() {
  return (
    <FlowProvider runtime={runtime}>
      <LaunchWorkspaceShell />
    </FlowProvider>
  );
}
```

Most components should read resources and actor snapshots directly. Use
`flow.useView(...)` only when several runtime sources need one reusable
projection.

## 8. Write A Scenario Test

Use `test(machine).with(...).run()` when shared data is not part of the
behavior. Use `test.app(App).scenario(machine)` when resource ownership,
fixtures, or module inventory matter.

```ts
import { expect, it } from "vite-plus/test";
import { flow } from "@flow-state/core";
import { test } from "@flow-state/testing";

it("saves a project through the app harness", async () => {
  const harness = test
    .app(App)
    .scenario(launchWorkspaceMachine)
    .with({
      resources: launchWorkspaceSeed,
      provide: ProjectTestLayer,
      clock: () => 42_000,
    })
    .run();

  harness
    .send({ type: "EDIT_PROJECT", draft: { ...harness.context().draft, name: "Atlas v2 launch" } })
    .send({ type: "SAVE_PROJECT" });

  await harness.flush();

  expect(flow.can(harness.snapshot(), { type: "SAVE_PROJECT" })).toBe(true);
  expect(harness.state()).toBe("ready");
  expect(harness.context().draft.name).toBe("Atlas v2 launch");
});
```

## What To Learn Next

- [Concepts](/concepts) for ownership rules.
- [App Structure](/guide/app-structure) for recommended project layout.
- [Recipes](/guide/recipes) for common patterns.
- [Testing](/guide/testing) for `flush`, `advance`, `settle`, and
  `pendingWork()`.
- [Current Status](/reference/status) for intentionally narrow or partial
  surfaces.
