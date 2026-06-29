# Getting Started

This page builds a small Launch Workspace slice with one service, one resource, one transaction, one flow, React usage, and a test.

## Service

Keep side effects behind Effect services. Launch Workspace uses `Context.Service` and service methods that return `Effect` or `Stream`.

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
        version: params.baseVersion + 1,
        updatedAt: now,
      };
    }),
  }),
);
```

## Resource

Resources are shared app data. They have stable identity, an Effect `lookup`, tags, and freshness metadata.

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

## Transaction

Transactions describe writes. Use `params`, `commit`, `preview`, and `invalidates` when a product flow needs a typed write with visible runtime facts.

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
});
```

## Machine

Machines own process state. Keep canonical API data out of context unless the flow owns a real local draft.

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

`flow.can(snapshot, event)` and `harness.can(event)` use the same guards that the runtime uses for legal transitions.

## React

Most components should read one resource or one actor snapshot directly. Reach for `flow.view` only when a screen needs a reusable projection across several resources, actors, receipts, streams, or child flows.

```tsx
import { FlowProvider, flow } from "@flow-state/core/react";
import { launchRuntime } from "./runtime";

function LaunchWorkspaceShell() {
  const editor = flow.use(Project.editor);
  const project = flow.useResource(Project.byId(fixtureProject.id));
  const snapshot = editor.getSnapshot();

  return (
    <>
      <button disabled={!flow.can(editor.getSnapshot(), { type: "SAVE" })}>Save</button>
      <span>{snapshot.value}</span>
      <span>{project === null ? "loading" : "ready"}</span>
    </>
  );
}

export function LaunchWorkspaceApp() {
  return (
    <FlowProvider runtime={launchRuntime}>
      <LaunchWorkspaceShell />
    </FlowProvider>
  );
}
```

React hooks are executable when mounted under `FlowProvider` with a runtime. See [Current Status](/reference/status) for the remaining React adapter gaps.

## Test

Flow exposes facts and controls. Vitest or `@effect/vitest` owns assertions.

```ts
import { expect, it } from "vite-plus/test";
import { flow } from "@flow-state/core";
import { flowTest } from "@flow-state/core/testing";

it("saves a launch project through the app harness", async () => {
  const harness = flowTest
    .app(LaunchWorkspaceApp)
    .seedResources(launchWorkspaceSeed)
    .start(launchWorkspaceMachine)
    .provide(LaunchWorkspaceTestServices)
    .clock(() => 42_000)
    .start();

  expect(harness.state()).toBe("ready");
  expect(flow.can(harness.snapshot(), { type: "SAVE_PROJECT" })).toBe(true);

  harness
    .send({ type: "EDIT_PROJECT", draft: { ...harness.context().draft, name: "Atlas v2 launch" } })
    .send({ type: "SAVE_PROJECT" });

  await harness.flush();

  expect(harness.state()).toBe("ready");
  expect(harness.context().draft.name).toBe("Atlas v2 launch");
});
```

## TypeScript Modes

The exported descriptor style on this page is now proven in the smaller Phase 18 fixture under:

- `strict`
- `strict + isolatedModules`

`isolatedDeclarations` is stricter. In that mode, exported values need explicit annotations, and helper values that appear in exported annotations also need explicit types.

The full Launch Workspace example is proven under its shipped package config by `pnpm --filter @flow-state/launch-workspace check:typescript-mode-proofs`, which matches the real `strict + isolatedModules` example setup. Whole-package `isolatedDeclarations` is not the current target for UI-heavy example code.

Prefer:

- individual exports with library-owned types such as `FlowResourceDefinition`, `FlowTransactionDefinition`, `FlowViewDefinition`, `FlowRefreshDefinition`, `FlowPatchDefinition`, `FlowInvalidateDefinition`, and `FlowRunDefinition`
- keeping heavyweight app/runtime assembly local unless you need to export it with a named app-layer type

Avoid:

- exported wrapper inventories like `Readonly<{ readonly refreshProject: ReturnType<typeof flow.refresh>; ... }>`
- turning ordinary app code into a wall of library-shaped wrapper types just to satisfy declaration emit
