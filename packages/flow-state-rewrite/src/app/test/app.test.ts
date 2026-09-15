import { assert, describe, it } from "@effect/vitest";
import { Effect, Stream, type Types } from "effect";

import { definition } from "../../definition/definition.js";
import { machine, type Machine } from "../../machine/machine.js";
import { app, appPlan, module, type App, type AnyModule, type RequirementsOf } from "../app.js";
import { resource } from "../../operation/resource.js";
import { stream } from "../../operation/stream.js";
import { transaction } from "../../operation/transaction.js";
import {
  AppValue,
  AppValuePlan,
  Editor,
  EditorModule,
  EmptyAppPlan,
  OpenAppPlan,
  ProjectRepo,
  ViewerModule,
  editorMachine,
  invokeApp,
  invokeModule,
  projectResource,
  resultSuccess,
  viewerMachine,
} from "./fixtures.js";

/*
 * Proof organization:
 *
 * Shared fixtures live in fixtures.ts.
 * Type relationships and negative authoring cases
 * Publication and configuration admission suites
 *
 * Mutable setup remains local to its scenario.
 */

type Expect<Value extends true> = Value;

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
  Types.Equals<(typeof AppValuePlan.descriptors)[number]["kind"], "resource">
>;

export type _PlanDescriptorId = Expect<
  Types.Equals<(typeof AppValuePlan.descriptors)[number]["id"], "app-test/projects">
>;

export type _PlanDescriptorRequirements = Expect<
  Types.Equals<RequirementsOf<(typeof AppValuePlan.descriptors)[number]>, ProjectRepo>
>;

export type _PlanMachine = Expect<
  Types.Equals<(typeof AppValuePlan.machines)[number], typeof editorMachine | typeof viewerMachine>
>;

export type _PlanResolvedMachine = Expect<
  Types.Equals<
    NonNullable<ReturnType<typeof AppValuePlan.resolveMachine>>,
    typeof editorMachine | typeof viewerMachine
  >
>;

export type _PlanAdmittedMachine = Expect<
  Types.Equals<
    Parameters<typeof AppValuePlan.admitsMachine>[0],
    typeof editorMachine | typeof viewerMachine
  >
>;

export type _EmptyPlanMachine = Expect<Types.Equals<(typeof EmptyAppPlan.machines)[number], never>>;

export type _OpenPlanMachine = Expect<Types.Equals<(typeof OpenAppPlan.machines)[number], Machine>>;

describe("app composition", () => {
  describe("publication and plan identity", () => {
    // Keyed module flattening retains exact machine identity and requirement closure.
    it("preserves exact keyed admission and requirement closure", () => {
      // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: proves App accepts the const-inferred module tuple published by app().
      const appValue: App<"app-test", "1", readonly [typeof EditorModule, typeof ViewerModule]> =
        AppValue;

      const plan = appPlan(appValue);

      assert.strictEqual(appValue.kind, "app");
      assert.strictEqual(appValue.M.editor, editorMachine);
      assert.strictEqual(appValue.M.viewer, viewerMachine);
      assert.strictEqual(appValue.M.editor.definition, Editor);
      assert.strictEqual(appValue.M.editor.definition.operations.project, projectResource);
      assert.deepStrictEqual(plan.machines, [editorMachine, viewerMachine]);
      assert.strictEqual(plan.machines[0], appValue.M.editor);
      assert.strictEqual(plan.machines[1], appValue.M.viewer);
      assert.strictEqual(plan.descriptors[0], projectResource);
      assert.strictEqual(plan.resolveDescriptor(projectResource.id), projectResource);
      assert.strictEqual(Reflect.set(projectResource, "kind", "stream"), false);
      assert.strictEqual(Reflect.set(projectResource, "id", "app-test/changed"), false);
      assert.strictEqual(plan.descriptors[0], projectResource);
      assert.strictEqual(plan.resolveDescriptor("app-test/projects"), projectResource);
      assert.strictEqual(plan.resolveDescriptor("app-test/changed"), undefined);
      assert.strictEqual(plan.resolveMachine(editorMachine.definition.id), editorMachine);
      assert.strictEqual(plan.admitsMachine(editorMachine), true);
      assert.strictEqual(plan.admitsMachine(viewerMachine), true);

      for (const candidate of [null, undefined, {}, { definition: null }]) {
        assert.strictEqual(
          Function.prototype.call.call(plan.admitsMachine, undefined, candidate),
          false,
        );
        assert.strictEqual(
          Function.prototype.call.call(plan.admitsDescriptor, undefined, candidate),
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

      const plan = appPlan(appValue);

      assert.deepStrictEqual(plan.machines, [editorMachine, viewerMachine]);
      assert.deepStrictEqual(plan.descriptors, [projectResource]);
      assert.strictEqual(Reflect.set(plan.machines, "length", 0), true);
      assert.strictEqual(Reflect.set(plan.descriptors, "length", 0), true);
      assert.strictEqual(plan.resolveMachine(editorMachine.definition.id), editorMachine);
      assert.strictEqual(plan.resolveDescriptor(projectResource.id), projectResource);
      assert.strictEqual(plan.admitsMachine(editorMachine), true);
      assert.strictEqual(plan.admitsDescriptor(projectResource), true);
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

      const plan = appPlan(appValue);
      const descriptors = plan.descriptors;

      assert.strictEqual(appValue.M.editor.definition, definitionValue);
      assert.deepStrictEqual(descriptors, [projectResource, save, updates]);

      for (const descriptor of descriptors) {
        assert.strictEqual(plan.resolveDescriptor(descriptor.id), descriptor);
        assert.strictEqual(Reflect.set(descriptor, "kind", "resource"), false);
        assert.strictEqual(Reflect.set(descriptor, "id", "app-test/changed"), false);
        assert.strictEqual(plan.resolveDescriptor(descriptor.id), descriptor);
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

        const plan = appPlan(capturedApp);

        assert.deepStrictEqual(plan.machines, [editorMachine]);
        assert.strictEqual(capturedApp.M.editor, editorMachine);
        assert.strictEqual(Object.hasOwn(capturedApp.M, "viewer"), false);
        assert.strictEqual(
          Function.prototype.call.call(plan.admitsMachine, undefined, viewerMachine),
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
        lookup: (projectId: string) => Effect.succeed(projectId),
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

        const plan = appPlan(capturedApp);

        const descriptors: (typeof projectResource | typeof addedDescriptor)[] = [
          projectResource,
          addedDescriptor,
        ];

        assert.deepStrictEqual(plan.descriptors, descriptors);
        assert.strictEqual(plan.resolveDescriptor(projectResource.id), projectResource);
        assert.strictEqual(
          Function.prototype.call.call(plan.resolveDescriptor, undefined, addedDescriptor.id),
          addedDescriptor,
        );
        assert.strictEqual(plan.admitsDescriptor(projectResource), true);
        assert.strictEqual(
          Function.prototype.call.call(plan.admitsDescriptor, undefined, addedDescriptor),
          true,
        );
      } finally {
        Reflect.deleteProperty(editorMachine.definition.operations, "added");
      }
    });

    it("rejects malformed operation descriptors added before App construction", () => {
      for (const malformed of [undefined, { kind: "resource", id: "app-test/not-constructed" }]) {
        Object.defineProperty(editorMachine.definition.operations, "malformed", {
          configurable: true,
          enumerable: true,
          value: malformed,
          writable: true,
        });

        try {
          assert.throws(
            () =>
              app({
                id: "app-test/malformed-operation",
                persistenceVersion: "1",
                modules: [EditorModule],
              }),
            /^App operation descriptor is invalid: malformed$/u,
          );
        } finally {
          Reflect.deleteProperty(editorMachine.definition.operations, "malformed");
        }
      }
    });

    it("rejects operation catalogs whose reflected values diverge from their descriptors", () => {
      const originalOperations = editorMachine.definition.operations;

      const alternateDescriptor = resource({
        id: "app-test/hostile-alternate",
        key: (projectId: string) => [projectId] as const,
        lookup: (projectId: string) => Effect.succeed(projectId),
      });

      for (const reflected of [undefined, alternateDescriptor]) {
        const hostileOperations = new Proxy(originalOperations, {
          get: (target, key, receiver) =>
            key === "project"
              ? reflected
              : // SAFETY: this proxy forwards all non-target properties unchanged for the hostile catalog proof.
                // oxlint-disable-next-line anti-slop/no-reflect-get
                Reflect.get(target, key, receiver),
        });

        Object.defineProperty(editorMachine.definition, "operations", {
          configurable: true,
          enumerable: true,
          value: hostileOperations,
          writable: true,
        });

        try {
          assert.throws(
            () =>
              app({
                id: "app-test/hostile-operation-catalog",
                persistenceVersion: "1",
                modules: [EditorModule],
              }),
            /^App operation descriptor is invalid: project$/u,
          );
        } finally {
          Object.defineProperty(editorMachine.definition, "operations", {
            configurable: true,
            enumerable: true,
            value: originalOperations,
            writable: true,
          });
        }
      }

      const capturedApp = app({
        id: "app-test/captured-operation-catalog",
        persistenceVersion: "1",
        modules: [EditorModule],
      });

      const plan = appPlan(capturedApp);
      const facts = plan.resolveMachineFacts(editorMachine);

      if (facts === undefined) throw new Error("expected captured machine facts");
      assert.deepStrictEqual(plan.descriptors, [projectResource]);
      assert.strictEqual(plan.resolveDescriptor(projectResource.id), projectResource);
      assert.strictEqual(facts.definition.operations.project, projectResource);
    });

    it("rejects operation catalogs whose enumerable keys flap during capture", () => {
      const originalOperations = editorMachine.definition.operations;
      let ownKeysReads = 0;

      const hostileOperations = new Proxy(originalOperations, {
        ownKeys: (target) => {
          ownKeysReads += 1;

          return ownKeysReads === 1 ? [] : Reflect.ownKeys(target);
        },
      });

      Object.defineProperty(editorMachine.definition, "operations", {
        configurable: true,
        enumerable: true,
        value: hostileOperations,
        writable: true,
      });

      try {
        assert.throws(
          () =>
            app({
              id: "app-test/flapping-operation-keys",
              persistenceVersion: "1",
              modules: [EditorModule],
            }),
          /^App operation catalog changed during admission$/u,
        );
        assert.strictEqual(ownKeysReads, 2);
      } finally {
        Object.defineProperty(editorMachine.definition, "operations", {
          configurable: true,
          enumerable: true,
          value: originalOperations,
          writable: true,
        });
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
});
