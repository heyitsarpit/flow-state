# Getting Started

This page teaches one ladder on purpose:

- one Effect service
- one resource
- one transaction
- one machine
- one focused harness proof

Stop once that path is real. App assembly, React mount, request boot, and
broader testing lanes are easier to learn after the core workflow contract
already exists.

## Imports

This page uses the smallest package set needed for that first slice:

```ts
import {
  can,
  createKey,
  createTag,
  ensure,
  machine,
  outcomes,
  resource,
  run,
  transaction,
} from "flow-state";
import { test } from "flow-state/testing";
```

For the canonical package ownership table, use
[API Reference: Import Paths](/reference/api#import-paths).

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
import { createKey, createTag, resource } from "flow-state";

const projectTag = createTag("launch:project");

export const projectResource = resource({
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
export const saveProjectTransaction = transaction({
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
  routes: outcomes({
    success: ({ value }) => ({ type: "PROJECT_SAVED", project: value }),
    failure: ["PROJECT_SAVE_FAILED", "error"],
  }),
});
```

## 4. Define A Machine

Machines own process state, not canonical app data.

```ts
export const launchWorkspaceMachine = machine({
  id: "launch-workspace",
  initial: "ready",
  context: createInitialContext,
  states: {
    ready: {
      invoke: [ensure(projectResource.ref(fixtureProjectId))],
      on: {
        EDIT_PROJECT: { update: editLaunchProject },
        SAVE_PROJECT: {
          target: "saving",
          guard: canSaveProject,
        },
      },
    },
    saving: {
      invoke: run(saveProjectTransaction),
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

Use `can(snapshot, event)` anywhere you need the same legal-command check the
runtime uses.

## 5. Prove The Workflow With One Focused Harness

Use `test(machine).with(...).run()` for the first executable proof when the
behavior does not need app inventory or fixture-name resolution yet.

```ts
import { expect, it } from "vite-plus/test";
import { test } from "flow-state/testing";

it("loads and saves a project", async () => {
  const harness = test(launchWorkspaceMachine)
    .with({
      provide: ProjectTestLayer,
    })
    .run();

  await harness.flush();

  harness.send({
    type: "EDIT_PROJECT",
    draft: { ...harness.context().draft, name: "Atlas v2 launch" },
  });
  harness.send({ type: "SAVE_PROJECT" });

  expect(harness.state()).toBe("saving");

  await harness.flush();

  expect(can(harness.snapshot(), { type: "SAVE_PROJECT" })).toBe(true);
  expect(harness.state()).toBe("ready");
  expect(harness.context()).toMatchObject({
    draft: { name: "Atlas v2 launch" },
  });
});
```

This keeps the first proof small: one service Layer, one resource owner, one
transaction route, and one machine.

## What To Learn Next

- [Concepts](/concepts) for ownership rules.
- [App Structure](/guide/app-structure) when you want `flow.module(...)`,
  `flow.app(...)`, and `App.layer(...)`.
- [Transactions Reference](/reference/transactions#submit-vs-run) when a write
  belongs to the event itself instead of the entered state.
- [Views And React](/reference/views-react) when you are ready to mount
  `FlowProvider`, `useResource(...)`, and `useActor(...)`.
- [Testing](/guide/testing) for app-aware harnesses, timers, streams, browser
  proofs, and rehydration.
- [Server And Hydration](/guide/server-hydration) for request-scoped boot.
- [Current Status](/reference/status) for intentionally narrow or partial
  surfaces.
