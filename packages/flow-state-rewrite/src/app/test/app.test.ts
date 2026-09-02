import { assert, describe, it } from "@effect/vitest";
import { Context, Effect, Result } from "effect";

import { definition } from "../../definition/definition.js";
import { machine } from "../../machine/machine.js";
import { app, module, type App, type AnyModule, type RequirementsOf } from "../app.js";
import { resource } from "../../operation/resource.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type Expect<Value extends true> = Value;

const definitionSuccess = <Value>(result: Result.Result<Value, unknown>): Value => {
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};

class ProjectRepo extends Context.Service<
  ProjectRepo,
  { readonly find: (id: string) => Effect.Effect<{ readonly id: string }> }
>()("AppTest/ProjectRepo") {}

const projectResource = resource({
  id: "app-test/projects",
  key: (projectId: string) => [projectId] as const,
  lookup: (projectId: string): Effect.Effect<string, "missing", ProjectRepo> =>
    Effect.succeed(projectId),
});

const Editor = definitionSuccess(
  definition({
    id: "app-test/editor",
    states: ["ready"],
    events: { opened: "bare" },
    operations: { project: projectResource },
  }),
);

const editorMachine = machine(Editor, ({ S }) => ({
  default: S.ready,
  states: { ready: {} },
}));

const Viewer = definitionSuccess(
  definition({
    id: "app-test/viewer",
    states: ["ready"],
    events: { opened: "bare" },
  }),
);

const viewerMachine = machine(Viewer, ({ S }) => ({
  default: S.ready,
  states: { ready: {} },
}));

const editorMachineVariant = machine(Editor, ({ S }) => ({
  default: S.ready,
  states: { ready: {} },
}));

const duplicateProjectResource = resource({
  id: projectResource.id,
  key: (projectId: string) => [projectId] as const,
  lookup: (projectId: string): Effect.Effect<string, "missing", ProjectRepo> =>
    Effect.succeed(projectId),
});

const DuplicateDefinition = definitionSuccess(
  definition({
    id: "app-test/duplicate-descriptor",
    states: ["ready"],
    events: {},
    operations: { project: duplicateProjectResource },
  }),
);

const duplicateMachine = machine(DuplicateDefinition, ({ S }) => ({
  default: S.ready,
  states: { ready: {} },
}));

const EditorModule = module({ id: "app-test/editor-tools", machines: { editor: editorMachine } });
const ViewerModule = module({ id: "app-test/viewer-tools", machines: { viewer: viewerMachine } });
const AppValue = app({
  id: "app-test",
  persistenceVersion: "1",
  modules: [EditorModule, ViewerModule],
});

type _ModuleRequirements = Expect<Equal<RequirementsOf<typeof EditorModule>, ProjectRepo>>;
type _AppRequirements = Expect<Equal<RequirementsOf<typeof AppValue>, ProjectRepo>>;
type _EditorAdmission = Expect<Equal<typeof AppValue.M.editor, typeof editorMachine>>;
type _ViewerAdmission = Expect<Equal<typeof AppValue.M.viewer, typeof viewerMachine>>;
type _MissingAdmission = Expect<Equal<Extract<keyof typeof AppValue.M, "missing">, never>>;

type TypeProofs = readonly [
  _ModuleRequirements,
  _AppRequirements,
  _EditorAdmission,
  _ViewerAdmission,
  _MissingAdmission,
];

const proofCount: TypeProofs["length"] = 5;
void proofCount;

const invalidApp = (modules: readonly AnyModule[]): void => {
  assert.throws(() => app({ id: "app-test-invalid", persistenceVersion: "1", modules }));
};

describe("app composition (GLO-07 / API-010 / ARCH-001..005; owner src/app/app.ts)", () => {
  // API-010 / PROOF-001; production owner: packages/flow-state-rewrite/src/app/app.ts.
  // Rationale: keyed module flattening retains exact machine identity and requirement closure.
  it("PROOF-001: preserves exact keyed admission and requirement closure through the production app owner", () => {
    const appValue: App<"app-test", "1", readonly [typeof EditorModule, typeof ViewerModule]> =
      AppValue;

    assert.strictEqual(appValue.kind, "app");
    assert.strictEqual(appValue.M.editor, editorMachine);
    assert.strictEqual(appValue.M.viewer, viewerMachine);
    assert.deepStrictEqual(appValue.plan.machines, [editorMachine, viewerMachine]);
    assert.strictEqual(appValue.plan.resolveMachine(editorMachine.id), editorMachine);
    assert.strictEqual(appValue.plan.admitsMachine(editorMachine), true);
    assert.strictEqual(appValue.plan.admitsMachine(viewerMachine), true);
  });

  // ARCH-001 / PROOF-002; production owner: packages/flow-state-rewrite/src/app/app.ts.
  // Rationale: plan construction stores no actor or callback execution and remains closed.
  it("PROOF-002: compiles inert closed plans without creating actors or walking callbacks", () => {
    let initializerCalls = 0;
    const InertDefinition = definitionSuccess(
      definition({
        id: "app-test/inert",
        states: ["ready"],
        events: {},
        memory: () => {
          initializerCalls += 1;
          return { ready: true };
        },
      }),
    );
    const InertMachine = machine(InertDefinition, ({ S }) => ({
      default: S.ready,
      states: { ready: {} },
    }));
    const InertApp = app({
      id: "app-test/inert-app",
      persistenceVersion: "1",
      modules: [module({ id: "app-test/inert-module", machines: { inert: InertMachine } })],
    });

    assert.strictEqual(initializerCalls, 0);
    assert.strictEqual(InertApp.plan.admitsMachine(InertMachine), true);
    assert.strictEqual(InertApp.plan.resolveMachine("missing"), undefined);
  });

  // ARCH-001 / API-010 / PROOF-002; production owner: packages/flow-state-rewrite/src/app/app.ts.
  // Rationale: Flow-owned graph containers are frozen while user service values remain untouched.
  it("ARCH-001 / API-010: freezes Flow-owned graph snapshots and indexes", () => {
    const activityService = { mutable: true };
    const ActivityDefinition = definitionSuccess(
      definition({
        id: "app-test/activity-service",
        states: ["ready"],
        events: {},
      }),
    );
    const ActivityMachine = machine(ActivityDefinition, ({ S }) => ({
      default: S.ready,
      states: { ready: { activities: { service: activityService } } },
    }));
    const ActivityApp = app({
      id: "app-test/activity-service-app",
      persistenceVersion: "1",
      modules: [
        module({ id: "app-test/activity-service-module", machines: { activity: ActivityMachine } }),
      ],
    });

    assert.strictEqual(Object.isFrozen(EditorModule), true);
    assert.strictEqual(Object.isFrozen(EditorModule.machines), true);
    assert.strictEqual(Object.isFrozen(AppValue.modules), true);
    assert.strictEqual(Object.isFrozen(AppValue.M), true);
    assert.strictEqual(Object.isFrozen(AppValue.M.editor), true);
    assert.strictEqual(Object.isFrozen(AppValue.M.editor.definition), true);
    assert.strictEqual(Object.isFrozen(AppValue.M.editor.definition.S), true);
    assert.strictEqual(Object.isFrozen(AppValue.M.editor.definition.S.ready), true);
    assert.strictEqual(Object.isFrozen(AppValue.M.editor.config), true);
    assert.strictEqual(Object.isFrozen(AppValue.M.editor.config.states), true);
    assert.strictEqual(Object.isFrozen(AppValue.M.editor.config.states.ready), true);
    assert.strictEqual(Object.isFrozen(AppValue.M.editor.compiled), true);
    assert.strictEqual(Object.isFrozen(AppValue.M.editor.compiled.states), true);
    assert.strictEqual(Object.isFrozen(AppValue.M.editor.compiled.states["S.ready"]), true);
    assert.strictEqual(Object.isFrozen(AppValue.plan), true);
    assert.strictEqual(Object.isFrozen(AppValue.plan.machines), true);
    assert.strictEqual(Object.isFrozen(AppValue.plan.descriptors), true);
    assert.strictEqual(Object.isFrozen(AppValue.plan.descriptors[0]), true);
    assert.strictEqual(
      Object.isFrozen(ActivityApp.M.activity.config.states.ready.activities),
      true,
    );
    assert.strictEqual(Object.isFrozen(activityService), false);
    const machineRecord = AppValue.M;
    const moduleList = AppValue.modules;
    const stateToken = AppValue.M.editor.definition.S.ready;
    const configReady = AppValue.M.editor.config.states.ready;
    const compiledReadyValue = AppValue.M.editor.compiled.states["S.ready"];
    if (compiledReadyValue === undefined) throw new Error("compiled ready state is missing");
    const compiledReady = compiledReadyValue;
    const configStates = AppValue.M.editor.config.states;
    const compiledStates = AppValue.M.editor.compiled.states;
    assert.strictEqual(Reflect.set(machineRecord, "newMachine", editorMachine), false);
    assert.strictEqual(Reflect.set(moduleList, "2", ViewerModule), false);
    assert.strictEqual(Reflect.set(stateToken, "name", "mutated"), false);
    assert.strictEqual(Reflect.set(configReady, "on", {}), false);
    assert.strictEqual(Reflect.set(compiledReady, "kind", "mutated"), false);
    assert.strictEqual(Reflect.set(configStates, "newState", {}), false);
    assert.strictEqual(Reflect.set(compiledStates, "newState", {}), false);
  });

  // ARCH-004 / API-010 / PROOF-002; production owner: packages/flow-state-rewrite/src/app/app.ts.
  // Rationale: descriptor lookup is identity-bound and duplicate IDs cannot create ambiguity.
  it("ARCH-004 / API-010: resolves only admitted descriptor identities", () => {
    const projectDescriptor = editorMachine.operations.project;
    assert.strictEqual(AppValue.plan.resolveDescriptor(projectResource.id), projectDescriptor);
    assert.strictEqual(AppValue.plan.admitsDescriptor(projectDescriptor), true);
    assert.strictEqual(AppValue.plan.admitsDescriptor(projectResource), false);
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

  // API-010 / ARCH-004 / PROOF-002; production owner: packages/flow-state-rewrite/src/app/app.ts.
  // Rationale: plan indexing accepts only valid operation IDs and the three declared operation families.
  it("rejects empty and unsupported operation descriptors before indexing", () => {
    const emptyResource = resource({
      id: "",
      key: (projectId: string) => [projectId] as const,
      lookup: (projectId: string) => Effect.succeed(projectId),
    });
    const EmptyDefinition = definitionSuccess(
      definition({
        id: "app-test/empty-descriptor",
        states: ["ready"],
        events: {},
        operations: { empty: emptyResource },
      }),
    );
    const emptyMachine = machine(EmptyDefinition, ({ S }) => ({
      default: S.ready,
      states: { ready: {} },
    }));
    assert.throws(() =>
      module({ id: "app-test/empty-descriptor-module", machines: { empty: emptyMachine } }),
    );

    const UnsupportedDefinition = definitionSuccess(
      definition({
        id: "app-test/unsupported-descriptor",
        states: ["ready"],
        events: {},
        operations: { unsupported: { kind: "unsupported" } },
      }),
    );
    const unsupportedMachine = machine(UnsupportedDefinition, ({ S }) => ({
      default: S.ready,
      states: { ready: {} },
    }));
    assert.throws(() =>
      module({
        id: "app-test/unsupported-descriptor-module",
        machines: { unsupported: unsupportedMachine },
      }),
    );

    const StructuralDefinition = definitionSuccess(
      definition({
        id: "app-test/structural-descriptor",
        states: ["ready"],
        events: {},
        operations: { structural: { kind: "resource", id: "app-test/structural" } },
      }),
    );
    const structuralMachine = machine(StructuralDefinition, ({ S }) => ({
      default: S.ready,
      states: { ready: {} },
    }));
    assert.throws(() =>
      module({
        id: "app-test/structural-descriptor-module",
        machines: { structural: structuralMachine },
      }),
    );
  });

  // ARCH-001 / API-010 / PROOF-002; production owner: packages/flow-state-rewrite/src/app/app.ts.
  // Rationale: machine admission requires the nominal compiler marker, not structural resemblance.
  it("ARCH-001 / API-010: rejects forged structural machines before admission", () => {
    const forgedMachine = { ...editorMachine };
    assert.throws(() =>
      module({ id: "app-test/forged-machine", machines: { forged: forgedMachine } }),
    );
    assert.strictEqual(AppValue.plan.admitsMachine(forgedMachine), false);
  });

  // API-010 / PROOF-002 / TYPE-P03 / TYPE-P04; production owner: packages/flow-state-rewrite/src/app/app.ts.
  // Rationale: module keys, machine values, and machine IDs form one closed duplicate policy.
  it("TYPE-P03 / TYPE-P04: rejects duplicate names and values at static graph compilation", () => {
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

  // DEL-003 / DEL-006 / SEM-017A; production owner: packages/flow-state-rewrite/src/app/app.ts.
  // Rationale: composition exposes only named admitted machines and has no dynamic-root escape hatch.
  it("DEL-003 / DEL-006 / SEM-017A: has no dynamic, automatic-root, or generic operation admission", () => {
    assert.strictEqual(Object.hasOwn(AppValue, "dynamicMachines"), false);
    assert.strictEqual(Object.hasOwn(AppValue.M, "missing"), false);
    assert.strictEqual(AppValue.plan.admitsMachine(viewerMachine), true);
  });
});
