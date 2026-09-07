import { assert, describe, it } from "@effect/vitest";
import { Context, Effect, Option, Result, Stream, type Types } from "effect";

import { definition } from "../../definition/definition.js";
import type { StateOf } from "../../definition/domain.js";
import type * as Diagnostic from "../../diagnostic/diagnostic.js";
import type { MachineSelectorInput } from "../../machine/grammar.js";
import { machine, type Machine } from "../../machine/machine.js";
import { app, module, type App, type AnyModule, type RequirementsOf } from "../app.js";
import { resource } from "../../operation/resource.js";
import { stream } from "../../operation/stream.js";
import { transaction } from "../../operation/transaction.js";

/*
 * Proof organization:
 *
 * Fixtures and local builders
 * Type relationships and negative authoring cases
 * Behavior suites grouped by observable law
 *
 * Mutable setup remains local to its scenario.
 */

type Expect<Value extends true> = Value;

const resultSuccess = <Value>(result: Result.Result<Value, Diagnostic.PublicDiagnostic>) => {
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};

const required = <Value>(value: Option.Option<Value>) => {
  if (Option.isNone(value)) throw new Error("expected a compiled graph value");
  return value.value;
};

const assertMutable = (values: readonly unknown[]) => {
  for (const value of values) assert.strictEqual(Object.isFrozen(value), false);
};

class ProjectRepo extends Context.Service<
  ProjectRepo,
  { readonly find: (id: string) => Effect.Effect<{ readonly id: string }> }
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
  // RETURN_TYPE: Preserves the duplicate fixture's intentional missing failure and ProjectRepo requirement channels.
  lookup: (projectId: string): Effect.Effect<string, "missing", ProjectRepo> =>
    Effect.succeed(projectId),
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

export type _ModuleRequirements = Expect<
  Types.Equals<RequirementsOf<typeof EditorModule>, ProjectRepo>
>;
export type _AppRequirements = Expect<Types.Equals<RequirementsOf<typeof AppValue>, ProjectRepo>>;
export type _EditorAdmission = Expect<Types.Equals<typeof AppValue.M.editor, typeof editorMachine>>;
export type _ViewerAdmission = Expect<Types.Equals<typeof AppValue.M.viewer, typeof viewerMachine>>;
export type _MissingAdmission = Expect<
  Types.Equals<Extract<keyof typeof AppValue.M, "missing">, never>
>;
export type _ProjectDescriptorKind = Expect<
  Types.Equals<typeof AppValue.M.editor.definition.operations.project.kind, "resource">
>;
export type _ProjectDescriptorId = Expect<
  Types.Equals<typeof AppValue.M.editor.definition.operations.project.id, "app-test/projects">
>;
export type _PlanDescriptorKind = Expect<
  Types.Equals<(typeof AppValue.plan.descriptors)[number]["kind"], "resource">
>;
export type _PlanDescriptorId = Expect<
  Types.Equals<(typeof AppValue.plan.descriptors)[number]["id"], "app-test/projects">
>;
export type _PlanDescriptorRequirements = Expect<
  Types.Equals<RequirementsOf<(typeof AppValue.plan.descriptors)[number]>, ProjectRepo>
>;
export type _PlanMachine = Expect<
  Types.Equals<(typeof AppValue.plan.machines)[number], typeof editorMachine | typeof viewerMachine>
>;
export type _PlanResolvedMachine = Expect<
  Types.Equals<
    NonNullable<ReturnType<typeof AppValue.plan.resolveMachine>>,
    typeof editorMachine | typeof viewerMachine
  >
>;
export type _PlanAdmittedMachine = Expect<
  Types.Equals<
    Parameters<typeof AppValue.plan.admitsMachine>[0],
    typeof editorMachine | typeof viewerMachine
  >
>;
export type _EmptyPlanMachine = Expect<
  Types.Equals<(typeof EmptyApp.plan.machines)[number], never>
>;
export type _OpenPlanMachine = Expect<
  Types.Equals<(typeof OpenApp.plan.machines)[number], Machine>
>;

const invalidApp = (modules: readonly AnyModule[]) => {
  assert.throws(() => app({ id: "app-test-invalid", persistenceVersion: "1", modules }));
};

const invokeModule = (config: unknown) => Function.prototype.call.call(module, undefined, config);
const invokeApp = (config: unknown) => Function.prototype.call.call(app, undefined, config);

describe("app composition", () => {
  describe("publication and plan identity", () => {
    // Keyed module flattening retains exact machine identity and requirement closure.
    it("preserves exact keyed admission and requirement closure", () => {
      const appValue: App<"app-test", "1", readonly [typeof EditorModule, typeof ViewerModule]> =
        AppValue;

      assert.strictEqual(appValue.kind, "app");
      assert.strictEqual(appValue.M.editor, editorMachine);
      assert.strictEqual(appValue.M.viewer, viewerMachine);
      assert.strictEqual(appValue.M.editor.definition, Editor);
      assert.strictEqual(appValue.M.editor.definition.operations.project, projectResource);
      assert.deepStrictEqual(appValue.plan.machines, [editorMachine, viewerMachine]);
      assert.strictEqual(appValue.plan.machines[0], appValue.M.editor);
      assert.strictEqual(appValue.plan.machines[1], appValue.M.viewer);
      assert.strictEqual(appValue.plan.descriptors[0], projectResource);
      assert.strictEqual(appValue.plan.resolveDescriptor(projectResource.id), projectResource);
      assert.strictEqual(Reflect.set(projectResource, "kind", "stream"), false);
      assert.strictEqual(Reflect.set(projectResource, "id", "app-test/changed"), false);
      assert.strictEqual(appValue.plan.descriptors[0], projectResource);
      assert.strictEqual(appValue.plan.resolveDescriptor("app-test/projects"), projectResource);
      assert.strictEqual(appValue.plan.resolveDescriptor("app-test/changed"), undefined);
      assert.strictEqual(appValue.plan.resolveMachine(editorMachine.definition.id), editorMachine);
      assert.strictEqual(appValue.plan.admitsMachine(editorMachine), true);
      assert.strictEqual(appValue.plan.admitsMachine(viewerMachine), true);
      for (const candidate of [null, undefined, {}, { definition: null }]) {
        assert.strictEqual(
          Function.prototype.call.call(appValue.plan.admitsMachine, undefined, candidate),
          false,
        );
        assert.strictEqual(
          Function.prototype.call.call(appValue.plan.admitsDescriptor, undefined, candidate),
          false,
        );
      }
    });

    it("keeps private plan identity indexes isolated from publication arrays", () => {
      const appValue = app({
        id: "app-test/publication-isolation",
        persistenceVersion: "1",
        modules: [EditorModule, ViewerModule],
      });

      assert.deepStrictEqual(appValue.plan.machines, [editorMachine, viewerMachine]);
      assert.deepStrictEqual(appValue.plan.descriptors, [projectResource]);
      assert.strictEqual(Reflect.set(appValue.plan.machines, "length", 0), true);
      assert.strictEqual(Reflect.set(appValue.plan.descriptors, "length", 0), true);
      assert.strictEqual(appValue.plan.resolveMachine(editorMachine.definition.id), editorMachine);
      assert.strictEqual(appValue.plan.resolveDescriptor(projectResource.id), projectResource);
      assert.strictEqual(appValue.plan.admitsMachine(editorMachine), true);
      assert.strictEqual(appValue.plan.admitsDescriptor(projectResource), true);
    });

    it("keeps every operation family identity stable in the AppPlan index", () => {
      const save = transaction({
        id: "app-test/save",
        key: (projectId: string) => [projectId] as const,
        commit: (projectId: string) => Effect.succeed(projectId),
      });
      const updates = stream({
        id: "app-test/updates",
        key: (projectId: string) => [projectId] as const,
        subscribe: (projectId: string) => Stream.make(projectId),
      });
      const definitionResult = definition({
        id: "app-test/operation-families",
        states: ["ready"],
        events: {},
        operations: { project: projectResource, save, updates },
      });
      const definitionValue = resultSuccess(definitionResult);
      const machineValue = resultSuccess(
        machine(definitionResult, ({ S }) => ({
          default: S.ready,
          states: { ready: {} },
        })),
      );
      const appValue = app({
        id: "app-test/operation-families-app",
        persistenceVersion: "1",
        modules: [
          module({ id: "app-test/operation-families-module", machines: { editor: machineValue } }),
        ],
      });
      const descriptors = appValue.plan.descriptors;

      assert.strictEqual(appValue.M.editor.definition, definitionValue);
      assert.deepStrictEqual(descriptors, [projectResource, save, updates]);
      for (const descriptor of descriptors) {
        assert.strictEqual(appValue.plan.resolveDescriptor(descriptor.id), descriptor);
        assert.strictEqual(Reflect.set(descriptor, "kind", "resource"), false);
        assert.strictEqual(Reflect.set(descriptor, "id", "app-test/changed"), false);
        assert.strictEqual(appValue.plan.resolveDescriptor(descriptor.id), descriptor);
      }
    });
  });

  describe("configuration capture and admission", () => {
    it("captures module and app configuration values before validation", () => {
      const moduleConfig = {
        id: "app-test/flapping-module-config",
        machines: { editor: editorMachine },
      };
      let moduleIdReads = 0;
      let moduleMachinesReads = 0;
      const flappingModuleConfig = new Proxy(moduleConfig, {
        get(target, property) {
          if (property === "id") {
            moduleIdReads += 1;
            return moduleIdReads === 1 ? target.id : "";
          }
          if (property === "machines") {
            moduleMachinesReads += 1;
            return moduleMachinesReads === 1 ? target.machines : {};
          }
          throw new Error(`Unexpected module configuration property: ${String(property)}`);
        },
      });
      const capturedModule = module(flappingModuleConfig);

      assert.strictEqual(moduleIdReads, 0);
      assert.strictEqual(moduleMachinesReads, 0);
      assert.strictEqual(capturedModule.id, moduleConfig.id);
      assert.strictEqual(capturedModule.machines.editor, editorMachine);

      const appConfig = {
        id: "app-test/flapping-app-config",
        persistenceVersion: "1",
        modules: [capturedModule],
      };
      let appIdReads = 0;
      let persistenceVersionReads = 0;
      let appModulesReads = 0;
      const flappingAppConfig = new Proxy(appConfig, {
        get(target, property) {
          if (property === "id") {
            appIdReads += 1;
            return appIdReads === 1 ? target.id : "";
          }
          if (property === "persistenceVersion") {
            persistenceVersionReads += 1;
            return persistenceVersionReads === 1 ? target.persistenceVersion : "";
          }
          if (property === "modules") {
            appModulesReads += 1;
            return appModulesReads === 1 ? target.modules : [];
          }
          throw new Error(`Unexpected app configuration property: ${String(property)}`);
        },
      });
      const capturedApp = app(flappingAppConfig);

      assert.strictEqual(appIdReads, 0);
      assert.strictEqual(persistenceVersionReads, 0);
      assert.strictEqual(appModulesReads, 0);
      assert.strictEqual(capturedApp.id, appConfig.id);
      assert.strictEqual(capturedApp.persistenceVersion, appConfig.persistenceVersion);
      assert.strictEqual(capturedApp.modules[0], capturedModule);
    });

    it("captures module identities by index without trusting an iterator", () => {
      const modules: AnyModule[] = new Proxy([EditorModule], {
        get(_target, property) {
          if (property === Symbol.iterator)
            return function* () {
              yield ViewerModule;
            };
          throw new Error(`Unexpected module array property: ${String(property)}`);
        },
      });

      const capturedApp = app({
        id: "app-test/indexed-modules",
        persistenceVersion: "1",
        modules,
      });

      assert.strictEqual(capturedApp.modules[0], EditorModule);
      assert.strictEqual(Object.values(capturedApp.M)[0], editorMachine);
    });

    it("captures module arrays without trusting an overridden slice", () => {
      const modules: AnyModule[] = new Proxy([EditorModule], {
        get(_target, property) {
          if (property === "slice") return () => [ViewerModule];
          throw new Error(`Unexpected module array property: ${String(property)}`);
        },
      });

      const capturedApp = app({
        id: "app-test/intrinsic-slice",
        persistenceVersion: "1",
        modules,
      });

      assert.strictEqual(capturedApp.modules[0], EditorModule);
      assert.strictEqual(Object.values(capturedApp.M)[0], editorMachine);
      assert.strictEqual(Object.hasOwn(capturedApp.M, "viewer"), false);

      modules[0] = ViewerModule;
      assert.strictEqual(capturedApp.modules[0], EditorModule);
    });

    it("indexes the module-owned machine snapshot after publication mutation", () => {
      Object.defineProperty(EditorModule.machines, "viewer", {
        configurable: true,
        enumerable: true,
        value: viewerMachine,
        writable: true,
      });
      try {
        const capturedApp = app({
          id: "app-test/module-snapshot",
          persistenceVersion: "1",
          modules: [EditorModule],
        });

        assert.deepStrictEqual(capturedApp.plan.machines, [editorMachine]);
        assert.strictEqual(capturedApp.M.editor, editorMachine);
        assert.strictEqual(Object.hasOwn(capturedApp.M, "viewer"), false);
        assert.strictEqual(
          Function.prototype.call.call(capturedApp.plan.admitsMachine, undefined, viewerMachine),
          false,
        );
      } finally {
        Reflect.deleteProperty(EditorModule.machines, "viewer");
      }
    });

    it("indexes current machine.definition.operations after definition mutation", () => {
      const addedDescriptor = resource({
        id: "app-test/added-descriptor",
        key: (projectId: string) => [projectId] as const,
        // RETURN_TYPE: Preserves the added fixture's intentional missing failure and ProjectRepo requirement channels.
        lookup: (projectId: string): Effect.Effect<string, "missing", ProjectRepo> =>
          Effect.succeed(projectId),
      });
      Object.defineProperty(editorMachine.definition.operations, "added", {
        configurable: true,
        enumerable: true,
        value: addedDescriptor,
        writable: true,
      });
      try {
        const capturedApp = app({
          id: "app-test/current-definition",
          persistenceVersion: "1",
          modules: [EditorModule],
        });

        const descriptors: readonly (typeof projectResource | typeof addedDescriptor)[] = [
          projectResource,
          addedDescriptor,
        ];
        assert.deepStrictEqual(capturedApp.plan.descriptors, descriptors);
        assert.strictEqual(capturedApp.plan.resolveDescriptor(projectResource.id), projectResource);
        assert.strictEqual(
          Function.prototype.call.call(
            capturedApp.plan.resolveDescriptor,
            undefined,
            addedDescriptor.id,
          ),
          addedDescriptor,
        );
        assert.strictEqual(capturedApp.plan.admitsDescriptor(projectResource), true);
        assert.strictEqual(
          Function.prototype.call.call(
            capturedApp.plan.admitsDescriptor,
            undefined,
            addedDescriptor,
          ),
          true,
        );
      } finally {
        Reflect.deleteProperty(editorMachine.definition.operations, "added");
      }
    });

    it("rejects config key reflection changes before publication", () => {
      const moduleConfig = {
        id: "app-test/flapping-module-keys",
        machines: { editor: editorMachine },
      };
      let moduleKeyReads = 0;
      const flappingModuleConfig = new Proxy(moduleConfig, {
        ownKeys: (target) => {
          moduleKeyReads += 1;
          return moduleKeyReads === 1 ? Reflect.ownKeys(target) : ["id", "extra"];
        },
      });
      assert.throws(() => module(flappingModuleConfig));
      assert.strictEqual(moduleKeyReads, 2);

      const appConfig = {
        id: "app-test/flapping-app-keys",
        persistenceVersion: "1",
        modules: [EditorModule],
      };
      let appKeyReads = 0;
      const flappingAppConfig = new Proxy(appConfig, {
        ownKeys: (target) => {
          appKeyReads += 1;
          return appKeyReads === 1
            ? Reflect.ownKeys(target)
            : ["id", "persistenceVersion", "extra"];
        },
      });
      assert.throws(() => app(flappingAppConfig));
      assert.strictEqual(appKeyReads, 2);
    });

    it("rejects module configuration accessors without executing them", () => {
      let idReads = 0;
      let machinesReads = 0;
      const config = { id: "app-test/accessor-config", machines: { editor: editorMachine } };
      Object.defineProperty(config, "id", {
        configurable: true,
        enumerable: true,
        get: () => {
          idReads += 1;
          throw new Error("module id getter executed");
        },
      });
      Object.defineProperty(config, "machines", {
        configurable: true,
        enumerable: true,
        get: () => {
          machinesReads += 1;
          throw new Error("module machines getter executed");
        },
      });

      assert.throws(() => module(config), /^Module configuration field is invalid: id$/u);
      assert.strictEqual(idReads, 0);
      assert.strictEqual(machinesReads, 0);
    });

    it("preserves app shape precedence and admits modules without indexed getters", () => {
      const validConfig = {
        id: "app-test/app-shape",
        persistenceVersion: "1",
        modules: [EditorModule],
      };
      const capturedApp = app(validConfig);
      assert.strictEqual(capturedApp.modules[0], EditorModule);

      assert.throws(
        () => invokeApp({ id: "app-test/missing-modules", persistenceVersion: "1" }),
        /^App configuration must contain exactly id, persistenceVersion, modules$/u,
      );
      assert.throws(
        () => invokeApp({ id: "app-test/wrong-modules", persistenceVersion: "1", modules: {} }),
        /^App modules must be an array$/u,
      );
      assert.throws(
        () =>
          invokeApp({
            id: "app-test/excess-app-field",
            persistenceVersion: "1",
            modules: [],
            extra: true,
          }),
        /^App configuration must contain exactly id, persistenceVersion, modules$/u,
      );
      assert.throws(
        () => invokeApp({ id: "", persistenceVersion: "", modules: [EditorModule] }),
        /^App id must be a valid authored name$/u,
      );
      assert.throws(
        () => invokeApp({ id: "app-test/invalid-version", persistenceVersion: "", modules: [] }),
        /^Persistence version must be a valid authored name$/u,
      );
      assert.throws(
        () =>
          invokeApp({
            id: "app-test/invalid-module",
            persistenceVersion: "1",
            modules: [EditorModule, {}],
          }),
        /^App modules must be constructed module records$/u,
      );

      const sparseModules: AnyModule[] = [];
      sparseModules.length = 1;
      assert.throws(
        () =>
          invokeApp({
            id: "app-test/sparse-modules",
            persistenceVersion: "1",
            modules: sparseModules,
          }),
        /^App modules must be constructed module records$/u,
      );

      let getterCalls = 0;
      const getterModules = [EditorModule];
      Object.defineProperty(getterModules, "0", {
        configurable: true,
        enumerable: true,
        get: () => {
          getterCalls += 1;
          throw new Error("module getter executed");
        },
      });
      assert.throws(
        () =>
          invokeApp({
            id: "app-test/accessor-module",
            persistenceVersion: "1",
            modules: getterModules,
          }),
        /^App modules must be constructed module records$/u,
      );
      assert.strictEqual(getterCalls, 0);
    });

    it("rejects non-canonical module array reflection", () => {
      const malformedArrays = [
        Object.assign([EditorModule], { extra: EditorModule }),
        Object.defineProperty([EditorModule], Symbol("extra"), { value: EditorModule }),
        Object.setPrototypeOf([EditorModule], Object.create(Array.prototype)),
        Object.defineProperty([EditorModule], "0", { enumerable: false, value: EditorModule }),
      ];
      for (const modules of malformedArrays)
        assert.throws(
          () =>
            invokeApp({ id: "app-test/non-canonical-modules", persistenceVersion: "1", modules }),
          /^App modules must be constructed module records$/u,
        );

      const reflectedExtraKey = new Proxy([EditorModule], {
        ownKeys: () => ["extra", "length"],
      });
      assert.throws(
        () =>
          invokeApp({
            id: "app-test/reflected-extra-key",
            persistenceVersion: "1",
            modules: reflectedExtraKey,
          }),
        /^App modules must be constructed module records$/u,
      );

      const denseApp = app({
        id: "app-test/dense-modules",
        persistenceVersion: "1",
        modules: [EditorModule],
      });
      assert.strictEqual(denseApp.modules[0], EditorModule);
    });

    it("rejects app configuration accessors without executing them", () => {
      let idReads = 0;
      let persistenceVersionReads = 0;
      let modulesReads = 0;
      const config = {
        id: "app-test/accessor-app",
        persistenceVersion: "1",
        modules: [EditorModule],
      };
      Object.defineProperty(config, "id", {
        configurable: true,
        enumerable: true,
        get: () => {
          idReads += 1;
          throw new Error("app id getter executed");
        },
      });
      Object.defineProperty(config, "persistenceVersion", {
        configurable: true,
        enumerable: true,
        get: () => {
          persistenceVersionReads += 1;
          throw new Error("app persistence getter executed");
        },
      });
      Object.defineProperty(config, "modules", {
        configurable: true,
        enumerable: true,
        get: () => {
          modulesReads += 1;
          throw new Error("app modules getter executed");
        },
      });

      assert.throws(() => invokeApp(config), /^App configuration field is invalid: id$/u);
      assert.strictEqual(idReads, 0);
      assert.strictEqual(persistenceVersionReads, 0);
      assert.strictEqual(modulesReads, 0);
    });

    it("preserves module shape precedence and accepts an empty machine record", () => {
      const emptyModule = module({ id: "app-test/empty-module", machines: {} });
      assert.deepStrictEqual(emptyModule.machines, {});

      assert.throws(
        () => invokeModule({ id: "app-test/missing-machines" }),
        /^Module configuration must contain exactly id, machines$/u,
      );
      assert.throws(
        () => invokeModule({ id: "app-test/wrong-machines", machines: [] }),
        /^Module machines must be a plain record$/u,
      );
      assert.throws(
        () => invokeModule({ id: "app-test/excess-field", machines: {}, extra: true }),
        /^Module configuration must contain exactly id, machines$/u,
      );
      assert.throws(
        () =>
          invokeModule({
            id: "",
            machines: { editor: {} },
          }),
        /^Module id must be a valid authored name$/u,
      );
    });

    it("reports a later malformed machine before an earlier duplicate", () => {
      assert.throws(
        () =>
          invokeModule({
            id: "app-test/duplicate-before-malformed",
            machines: { first: editorMachine, second: editorMachine, later: {} },
          }),
        /^Module machine is invalid: later$/u,
      );
    });

    it("isolates authored machine records from the published module record", () => {
      const authoredMachines = { editor: editorMachine };
      const capturedModule = module({
        id: "app-test/authored-machine-copy",
        machines: authoredMachines,
      });

      Object.assign(authoredMachines, { editor: viewerMachine });
      assert.strictEqual(capturedModule.machines.editor, editorMachine);
    });

    it("accepts reordered module and app configuration keys", () => {
      const reorderedModule = module({
        machines: { editor: editorMachine },
        id: "app-test/reordered-module",
      });
      assert.strictEqual(reorderedModule.machines.editor, editorMachine);

      const reorderedApp = app({
        modules: [reorderedModule],
        persistenceVersion: "1",
        id: "app-test/reordered-app",
      });
      assert.strictEqual(reorderedApp.M.editor, editorMachine);
    });
  });

  describe("closed plan and graph laws", () => {
    // Rationale: plan construction stores no actor or callback execution and remains closed.
    it("compiles inert closed plans without creating actors or walking callbacks", () => {
      let initializerCalls = 0;
      const InertDefinitionResult = definition({
        id: "app-test/inert",
        states: ["ready"],
        events: {},
        memory: () => {
          initializerCalls += 1;
          return { ready: true };
        },
      });
      const InertMachine = resultSuccess(
        machine(InertDefinitionResult, ({ S }) => ({
          default: S.ready,
          states: { ready: {} },
        })),
      );
      const InertApp = app({
        id: "app-test/inert-app",
        persistenceVersion: "1",
        modules: [module({ id: "app-test/inert-module", machines: { inert: InertMachine } })],
      });

      assert.strictEqual(initializerCalls, 0);
      assert.strictEqual(InertApp.plan.admitsMachine(InertMachine), true);
      assert.strictEqual(InertApp.plan.resolveMachine("missing"), undefined);
    });

    // App preserves retained identities without runtime freezes.
    it("preserves retained identities without freezing user values", () => {
      const ActivityDefinitionResult = definition({
        id: "app-test/activity-service",
        states: ["idle", { active: ["editing"] }],
        events: { tick: "bare" },
        operations: { activity: projectResource },
        memory: () => ({ count: 0 }),
      });
      const ActivityDefinition = resultSuccess(ActivityDefinitionResult);
      const guard = Object.assign(() => true, { mutable: true });
      const updateMemory = Object.assign(() => ({ count: 1 }), { mutable: true });
      const actions = Object.assign(() => null, { mutable: true });
      const redirectWhen = Object.assign(() => true, { mutable: true });
      const timerGuard = Object.assign(() => true, { mutable: true });
      const timerUpdateMemory = Object.assign(() => ({ count: 1 }), { mutable: true });
      const contextSelector = (input: MachineSelectorInput<typeof ActivityDefinition>) =>
        input.state;
      const contextHandler = Object.assign(
        (
          _current: StateOf<typeof ActivityDefinition>,
          _previous: StateOf<typeof ActivityDefinition> | undefined,
        ) => null,
        { mutable: true },
      );
      const memoryHandler = Object.assign(
        (_input: { readonly memory: { readonly count: number } }) => null,
        { mutable: true },
      );
      const memorySelector = (input: MachineSelectorInput<typeof ActivityDefinition>) =>
        input.memory.count;
      const memorySelectionHandler = Object.assign(
        (_current: number, _previous: number | undefined) => null,
        { mutable: true },
      );
      const ActivityMachine = resultSuccess(
        machine(ActivityDefinitionResult, ({ S, E, onContext, onMemory }) => {
          onContext.select(contextSelector, contextHandler);
          onMemory(memoryHandler);
          onMemory.select(memorySelector, memorySelectionHandler);
          return {
            default: S.idle,
            on: { tick: { target: S.idle, guard, updateMemory, actions } },
            redirect: { when: redirectWhen, target: S.idle },
            states: {
              idle: {},
              active: {
                default: S.active.S.editing,
                activities: { service: projectActivity },
                timers: {
                  refresh: {
                    delay: 1,
                    target: E.tick,
                    guard: timerGuard,
                    updateMemory: timerUpdateMemory,
                  },
                },
                states: { editing: {} },
              },
            },
          };
        }),
      );
      const ActivityApp = app({
        id: "app-test/activity-service-app",
        persistenceVersion: "1",
        modules: [
          module({
            id: "app-test/activity-service-module",
            machines: { activity: ActivityMachine },
          }),
        ],
      });

      assert.strictEqual(Object.isFrozen(AppValue), false);
      assert.strictEqual(Object.isFrozen(AppValue.M.editor.definition), false);
      assert.strictEqual(Object.isFrozen(AppValue.M.editor.definition.S), false);
      assert.strictEqual(Object.isFrozen(AppValue.M.editor.definition.S.ready), false);
      const assertActivityGraph = () => {
        const compiled = ActivityApp.M.activity.compiled;
        const root = required(Option.fromUndefinedOr(compiled.states[""]));
        const active = required(Option.fromUndefinedOr(compiled.states["S.active"]));
        const transitions = required(Option.fromUndefinedOr(root.handlers.tick));
        const transition = required(Option.fromUndefinedOr(transitions[0]));
        const redirect = required(Option.fromUndefinedOr(root.redirects[0]));
        const timer = required(Option.fromUndefinedOr(active.timers.refresh));
        const contextRegistration = required(Option.fromUndefinedOr(compiled.context[0]));
        const memoryHandlerRegistration = required(
          Option.fromUndefinedOr(
            compiled.memory.find((registration) => registration.kind === "handler"),
          ),
        );
        const memorySelectionRegistration = required(
          Option.fromUndefinedOr(
            compiled.memory.find((registration) => registration.kind === "selection"),
          ),
        );

        assert.strictEqual(transition.guard, guard);
        assert.strictEqual(transition.updateMemory, updateMemory);
        assert.strictEqual(transition.actions, actions);
        assert.strictEqual(redirect.when, redirectWhen);
        assert.strictEqual(timer.guard, timerGuard);
        assert.strictEqual(timer.updateMemory, timerUpdateMemory);
        assert.strictEqual(active.activities.service, projectActivity);
        assert.strictEqual(
          contextRegistration.use((selector, handler) => {
            assert.strictEqual(Object.is(selector, contextSelector), true);
            assert.strictEqual(Object.is(handler, contextHandler), true);
            return true;
          }),
          true,
        );
        assert.strictEqual(memoryHandlerRegistration.handler, memoryHandler);
        assert.strictEqual(
          memorySelectionRegistration.use((selector, handler) => {
            assert.strictEqual(Object.is(selector, memorySelector), true);
            assert.strictEqual(Object.is(handler, memorySelectionHandler), true);
            return true;
          }),
          true,
        );
        assertMutable([
          guard,
          updateMemory,
          actions,
          redirectWhen,
          timerGuard,
          timerUpdateMemory,
          contextSelector,
          contextHandler,
          memoryHandler,
          memorySelector,
          memorySelectionHandler,
        ]);
        guard.mutable = false;
        assert.strictEqual(guard.mutable, false);
      };
      assertActivityGraph();
    });

    // Rationale: App indexes exact descriptor identities held by machine values.
    it("indexes only admitted descriptor identities", () => {
      const projectDescriptor = editorMachine.definition.operations.project;
      assert.strictEqual(AppValue.plan.resolveDescriptor(projectResource.id), projectDescriptor);
      assert.strictEqual(AppValue.plan.admitsDescriptor(projectDescriptor), true);
      assert.strictEqual(AppValue.plan.admitsDescriptor(projectResource), true);
      assert.strictEqual(AppValue.plan.admitsDescriptor(duplicateProjectResource), false);
      assert.throws(() =>
        app({
          id: "app-test/duplicate-descriptor-app",
          persistenceVersion: "1",
          modules: [
            EditorModule,
            module({ id: "app-test/duplicate-descriptor-module", machines: { duplicateMachine } }),
          ],
        }),
      );
    });

    it("accepts one descriptor identity reused by distinct definitions and machines", () => {
      const sharedApp = app({
        id: "app-test/shared-descriptor-app",
        persistenceVersion: "1",
        modules: [
          EditorModule,
          module({
            id: "app-test/shared-descriptor-module",
            machines: { shared: sharedDescriptorMachine },
          }),
        ],
      });

      assert.strictEqual(sharedApp.M.editor.definition.operations.project, projectResource);
      assert.strictEqual(sharedApp.M.shared.definition.operations.project, projectResource);
      assert.strictEqual(sharedApp.plan.resolveDescriptor(projectResource.id), projectResource);
    });

    it("rejects lossy machine registry reflection before publication", () => {
      const nonEnumerableMachines: Record<string, typeof editorMachine> = {};
      Object.defineProperty(nonEnumerableMachines, "editor", {
        configurable: true,
        enumerable: false,
        value: editorMachine,
      });
      assert.throws(() =>
        module({ id: "app-test/non-enumerable-machines", machines: nonEnumerableMachines }),
      );

      const accessorMachines: Record<string, typeof editorMachine> = {};
      Object.defineProperty(accessorMachines, "editor", {
        configurable: true,
        enumerable: true,
        get: () => editorMachine,
      });
      assert.throws(() => module({ id: "app-test/accessor-machines", machines: accessorMachines }));

      const symbolMachines: Record<string, typeof editorMachine> = {};
      Object.defineProperty(symbolMachines, Symbol("machine"), {
        enumerable: true,
        value: editorMachine,
      });
      assert.throws(() => module({ id: "app-test/symbol-machines", machines: symbolMachines }));

      const flappingSource = { editor: editorMachine };
      let keyReads = 0;
      const flappingMachines = new Proxy(flappingSource, {
        ownKeys: (target) => {
          keyReads += 1;
          return keyReads === 1 ? Reflect.ownKeys(target) : [];
        },
      });
      assert.throws(() => module({ id: "app-test/flapping-machines", machines: flappingMachines }));
      assert.strictEqual(keyReads, 2);

      assert.strictEqual(EditorModule.machines.editor, editorMachine);
    });

    it("rejects copied modules before indexing nested graph values", () => {
      const copiedModule = { ...EditorModule };
      assert.throws(() =>
        app({
          id: "app-test/copied-module-app",
          persistenceVersion: "1",
          modules: [copiedModule],
        }),
      );

      const copiedNestedModule = {
        ...EditorModule,
        machines: {
          editor: {
            ...editorMachine,
            operations: { project: { ...projectResource } },
          },
        },
      };
      assert.throws(() =>
        app({
          id: "app-test/copied-nested-module-app",
          persistenceVersion: "1",
          modules: [copiedNestedModule],
        }),
      );

      assert.strictEqual(AppValue.plan.admitsMachine(editorMachine), true);
    });

    it("reports a later malformed module before an earlier duplicate", () => {
      assert.throws(
        () =>
          invokeApp({
            id: "app-test/duplicate-before-malformed-module",
            persistenceVersion: "1",
            modules: [EditorModule, EditorModule, {}],
          }),
        /^App modules must be constructed module records$/u,
      );
    });

    // Rationale: machine admission requires the nominal compiler marker, not structural resemblance.
    it("rejects forged structural machines before admission", () => {
      const forgedMachine = { ...editorMachine };
      assert.throws(() =>
        module({ id: "app-test/forged-machine", machines: { forged: forgedMachine } }),
      );
      assert.strictEqual(AppValue.plan.admitsMachine(forgedMachine), false);
    });

    // Rationale: module keys, machine values, and machine IDs form one closed duplicate policy.
    it("rejects duplicate names and values at static graph compilation", () => {
      invalidApp([EditorModule, EditorModule]);
      invalidApp([
        module({ id: "app-test/duplicate-key-a", machines: { editor: editorMachine } }),
        module({ id: "app-test/duplicate-key-b", machines: { editor: viewerMachine } }),
      ]);
      invalidApp([
        module({ id: "app-test/duplicate-value-a", machines: { editor: editorMachine } }),
        module({ id: "app-test/duplicate-value-b", machines: { viewer: editorMachine } }),
      ]);
      invalidApp([
        module({ id: "app-test/duplicate-id-a", machines: { editor: editorMachine } }),
        module({ id: "app-test/duplicate-id-b", machines: { editor: editorMachineVariant } }),
      ]);
    });

    // Rationale: composition exposes only named admitted machines and has no dynamic-root escape hatch.
    it("has no dynamic, automatic-root, or generic operation admission", () => {
      assert.strictEqual(Object.hasOwn(AppValue, "dynamicMachines"), false);
      assert.strictEqual(Object.hasOwn(AppValue.M, "missing"), false);
      assert.strictEqual(AppValue.plan.admitsMachine(viewerMachine), true);
    });
  });
});
