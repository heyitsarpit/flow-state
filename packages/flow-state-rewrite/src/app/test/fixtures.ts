import { assert } from "@effect/vitest";
import { Context, Effect, Option, Result } from "effect";

import { definition } from "../../definition/definition.js";
import type * as Diagnostic from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import { app, appPlan, module, type AnyModule } from "../app.js";
import { resource } from "../../operation/resource.js";

const resultSuccess = <Value>(result: Result.Result<Value, Diagnostic.PublicDiagnostic>) => {
  if (Result.isFailure(result)) throw result.failure;

  return result.success;
};

const required = <Value>(value: Option.Option<Value>) => {
  if (Option.isNone(value)) throw new Error("expected a compiled graph value");

  return value.value;
};

const assertMutable = (values: unknown[]) => {
  for (const value of values) assert.strictEqual(Object.isFrozen(value), false);
};

class ProjectRepo extends Context.Service<
  ProjectRepo,
  { find: (id: string) => Effect.Effect<{ id: string }> }
>()("AppTest/ProjectRepo") {}

const projectResource = resource({
  id: "app-test/projects",
  key: (projectId: string) => [projectId] as const,
  // RETURN_TYPE: Models the fixture's intentional missing failure and ProjectRepo requirement channels.
  lookup: (projectId: string): Effect.Effect<string, "missing", ProjectRepo> =>
    Effect.succeed(projectId),
});

const projectActivity = projectResource.subscribe("activity");

const EditorResult = definition({
  id: "app-test/editor",
  states: ["ready"],
  events: { opened: "bare" },
  operations: { project: projectResource },
});

const Editor = resultSuccess(EditorResult);

const editorMachine = resultSuccess(
  machine(EditorResult, ({ S }) => ({
    default: S.ready,
    on: { opened: S.ready },
    states: { ready: {} },
  })),
);

const ViewerResult = definition({
  id: "app-test/viewer",
  states: ["ready"],
  events: { opened: "bare" },
});

const viewerMachine = resultSuccess(
  machine(ViewerResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const editorMachineVariant = resultSuccess(
  machine(EditorResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const duplicateProjectResource = resource({
  id: projectResource.id,
  key: (projectId: string) => [projectId] as const,
  lookup: (projectId: string) => Effect.succeed(projectId),
});

const DuplicateDefinitionResult = definition({
  id: "app-test/duplicate-descriptor",
  states: ["ready"],
  events: {},
  operations: { project: duplicateProjectResource },
});

const duplicateMachine = resultSuccess(
  machine(DuplicateDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const SharedDefinitionResult = definition({
  id: "app-test/shared-descriptor",
  states: ["ready"],
  events: {},
  operations: { project: projectResource },
});

const sharedDescriptorMachine = resultSuccess(
  machine(SharedDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const EditorModule = module({ id: "app-test/editor-tools", machines: { editor: editorMachine } });

const ViewerModule = module({ id: "app-test/viewer-tools", machines: { viewer: viewerMachine } });

const AppValue = app({
  id: "app-test",
  persistenceVersion: "1",
  modules: [EditorModule, ViewerModule],
});

const EmptyApp = app({
  id: "app-test/empty",
  persistenceVersion: "1",
  modules: [],
});

const openModules: AnyModule[] = [EditorModule];

const OpenApp = app({
  id: "app-test/open",
  persistenceVersion: "1",
  modules: openModules,
});

const AppValuePlan = appPlan(AppValue);

const EmptyAppPlan = appPlan(EmptyApp);

const OpenAppPlan = appPlan(OpenApp);

const invalidApp = (modules: AnyModule[]) => {
  assert.throws(() => app({ id: "app-test-invalid", persistenceVersion: "1", modules }));
};

const invokeModule = (config: unknown) => Function.prototype.call.call(module, undefined, config);

const invokeApp = (config: unknown) => Function.prototype.call.call(app, undefined, config);

export {
  AppValue,
  AppValuePlan,
  DuplicateDefinitionResult,
  Editor,
  EditorModule,
  EditorResult,
  EmptyApp,
  EmptyAppPlan,
  OpenApp,
  OpenAppPlan,
  ProjectRepo,
  SharedDefinitionResult,
  ViewerModule,
  ViewerResult,
  appPlan,
  assertMutable,
  duplicateMachine,
  duplicateProjectResource,
  editorMachine,
  editorMachineVariant,
  invalidApp,
  invokeApp,
  invokeModule,
  projectActivity,
  projectResource,
  required,
  resultSuccess,
  sharedDescriptorMachine,
  viewerMachine,
};
