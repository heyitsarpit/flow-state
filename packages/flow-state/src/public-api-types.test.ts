import { Duration, Effect, Stream } from "effect";
import type { Effect as EffectType, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flowState from "./index.js";
import { createKey, createTag, flow, flowTest } from "./index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Type extends true> = Type;

const expectedTopLevelExports = new Set([
  "FlowProvider",
  "createControlledEffect",
  "createControlledStream",
  "createKey",
  "createRuntime",
  "createTag",
  "flow",
  "flowExperimental",
  "flowTest",
  "selectView",
]);

type ProjectRecord = Readonly<{
  readonly id: string;
  readonly name: string;
}>;

interface ProjectRepo {
  readonly _tag: "ProjectRepo";
}

type SaveError = "save-failed";
type SaveEvent =
  | Readonly<{ readonly type: "SAVED"; readonly value: ProjectRecord }>
  | Readonly<{ readonly type: "FAILED"; readonly error: SaveError }>;

function expectType<Type>(_value: Type): void {
  void _value;
}

describe("Phase 1 public API contract", () => {
  it("exposes the phase 1 entrypoints and removes the legacy mutation surface", () => {
    expect(new Set(Object.keys(flowState))).toEqual(expectedTopLevelExports);
    expect("mutation" in flow).toBe(false);
  });

  it("preserves resource ids, refs, key builders, schema, and lookup effect shape", () => {
    const lookupProject = (
      projectId: string,
    ): EffectType.Effect<ProjectRecord, "missing", ProjectRepo> =>
      Effect.succeed({
        id: projectId,
        name: "Atlas",
      }) as EffectType.Effect<ProjectRecord, "missing", ProjectRepo>;

    const resource = flow.resource<
      [projectId: string],
      ProjectRecord,
      "missing",
      ReturnType<typeof lookupProject>
    >({
      id: "Project.byId",
      key: (projectId: string) => createKey("project", projectId),
      lookup: lookupProject,
      schema: { kind: "project-schema" },
      tags: () => [createTag("project")],
    });

    const ref = resource.ref("project-1");

    expect(resource.kind).toBe("resource");
    expect(resource.id).toBe("Project.byId");
    expect(resource.config.schema).toEqual({ kind: "project-schema" });
    expect(ref).toEqual({
      kind: "resourceRef",
      id: "Project.byId",
      params: ["project-1"],
      key: createKey("project", "project-1"),
    });

    expectType<EffectType.Effect<ProjectRecord, "missing", unknown>>(
      resource.config.lookup("project-1"),
    );

    type _ResourceShape = Expect<Equal<typeof ref.params, [string]>>;
    void [true as _ResourceShape];
  });

  it("accepts the final transaction contract and rejects legacy fields", () => {
    const loadProject = (projectId: string): EffectType.Effect<ProjectRecord> =>
      Effect.succeed({ id: projectId, name: "Atlas" });

    const resource = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      ReturnType<typeof loadProject>
    >({
      id: "Project.byId",
      key: (projectId: string) => createKey("project", projectId),
      lookup: loadProject,
    });
    const projectTag = createTag("project");

    const transaction = flow.transaction<
      { readonly id: string },
      ProjectRecord,
      SaveError,
      ProjectRepo,
      SaveEvent
    >({
      id: "Project.save",
      params: () => ({ id: "project-1" }),
      preview: {
        apply: ({ params }) => [
          {
            ref: resource.ref(params.id),
            replace: {
              id: params.id,
              name: "Atlas v2",
            },
          },
        ],
      },
      commit: (params) =>
        Effect.succeed({
          id: params.id,
          name: "Atlas v2",
        }) as EffectType.Effect<ProjectRecord, SaveError, ProjectRepo>,
      invalidates: ({ params }) => [projectTag, createKey("project", params.id)],
      routes: flow.outcomes<ProjectRecord, SaveError, SaveEvent>({
        success: ({ value }) => ({ type: "SAVED", value }),
        failure: ({ error }) => ({ type: "FAILED", error }),
      }),
      scope: {
        id: "project-saves",
      },
      concurrency: "serialize",
    });

    expect(transaction.kind).toBe("transaction");
    expect(transaction.id).toBe("Project.save");
    expect(transaction.config.concurrency).toBe("serialize");
    expect(transaction.config.scope).toEqual({
      id: "project-saves",
    });
    expect(transaction.config.preview?.apply({ params: { id: "project-1" } })).toEqual([
      {
        ref: resource.ref("project-1"),
        replace: {
          id: "project-1",
          name: "Atlas v2",
        },
      },
    ]);

    flow.transaction({
      id: "legacy.input",
      // @ts-expect-error Phase 1 removes legacy transaction.input
      input: () => ({ id: "project-1" }),
      commit: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
    });

    flow.transaction({
      id: "legacy.effect",
      // @ts-expect-error Phase 1 removes legacy transaction.effect
      effect: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
      commit: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
    });

    flow.transaction({
      id: "legacy.optimistic",
      // @ts-expect-error Phase 1 removes legacy transaction.optimistic
      optimistic: { apply: () => [] },
      commit: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
    });
  });

  it("preserves machine, module, and app descriptors without triggering app-time work", () => {
    type MachineEvent =
      | Readonly<{ readonly type: "LOAD" }>
      | Readonly<{ readonly type: "READY"; readonly project: ProjectRecord }>;

    const loadProject = (projectId: string): EffectType.Effect<ProjectRecord> =>
      Effect.succeed({ id: projectId, name: "Atlas" });

    const resource = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      ReturnType<typeof loadProject>
    >({
      id: "Project.byId",
      key: (projectId: string) => createKey("project", projectId),
      lookup: loadProject,
    });

    const machineConfig = {
      id: "Project.editor",
      initial: "idle",
      context: () => ({ selectedId: null }),
      states: {
        idle: {
          exit: ({ context, event, value, snapshot }) => {
            expectType<string | null>(context.selectedId);
            expectType<MachineEvent>(event);
            expectType<"idle" | "loading" | "ready">(value);
            expectType<"idle" | "loading" | "ready">(snapshot.value);
            return { type: "machine:idle-exit" };
          },
          on: {
            LOAD: {
              target: "loading",
              actions: ({ context, event, value }) => {
                expectType<string | null>(context.selectedId);
                expectType<Extract<MachineEvent, { readonly type: "LOAD" }>>(event);
                expectType<"idle" | "loading" | "ready">(value);
                return [{ type: "machine:load-action" }];
              },
            },
          },
        },
        loading: {
          entry: ({ context, event, value, snapshot }) => {
            expectType<string | null>(context.selectedId);
            expectType<MachineEvent>(event);
            expectType<"idle" | "loading" | "ready">(value);
            expectType<"idle" | "loading" | "ready">(snapshot.value);
            return { type: "machine:loading-entry" };
          },
          invoke: flow.ensure(resource.ref("project-1")),
          on: {
            READY: {
              target: "ready",
              actions: [
                ({ event }) => {
                  expectType<Extract<MachineEvent, { readonly type: "READY" }>>(event);
                  expectType<ProjectRecord>(event.project);
                },
              ],
            },
          },
        },
        ready: {
          always: {
            guard: ({ context, event, value, snapshot }) => {
              expectType<string | null>(context.selectedId);
              expectType<MachineEvent>(event);
              expectType<"idle" | "loading" | "ready">(value);
              expectType<"idle" | "loading" | "ready">(snapshot.value);
              return event.type === "LOAD";
            },
            actions: ({ event }) => {
              expectType<MachineEvent>(event);
              return { type: "machine:ready-always" };
            },
          },
        },
      },
    } satisfies flowState.FlowMachineConfig<
      "Project.editor",
      { readonly selectedId: string | null },
      MachineEvent,
      "idle" | "loading" | "ready",
      "idle"
    >;

    const machine = flow.machine(machineConfig);

    type IdleEvent = flowState.FlowEventForState<MachineEvent, typeof machineConfig.states, "idle">;
    type LoadingEvent = flowState.FlowEventForState<
      MachineEvent,
      typeof machineConfig.states,
      "loading"
    >;
    type ReadyEvent = flowState.FlowEventForState<
      MachineEvent,
      typeof machineConfig.states,
      "ready"
    >;
    type IdleEventType = keyof NonNullable<typeof machineConfig.states.idle.on>;
    type LoadingEventType = keyof NonNullable<typeof machineConfig.states.loading.on>;

    const idleEventType: IdleEventType = "LOAD";
    const loadingEventType: LoadingEventType = "READY";
    void idleEventType;
    void loadingEventType;

    // @ts-expect-error idle only defines LOAD
    const invalidIdleEventType: IdleEventType = "READY";
    void invalidIdleEventType;

    const idleEvent: IdleEvent = { type: "LOAD" };
    expectType<Extract<MachineEvent, { readonly type: "LOAD" }>>(idleEvent);

    const loadingEvent: LoadingEvent = {
      type: "READY",
      project: { id: "project-1", name: "Atlas" },
    };
    expectType<Extract<MachineEvent, { readonly type: "READY" }>>(loadingEvent);

    // @ts-expect-error ready has no legal events configured
    const readyEvent: ReadyEvent = { type: "LOAD" };
    void readyEvent;

    const invalidIdleEvent: IdleEvent = {
      // @ts-expect-error idle only accepts LOAD
      type: "READY",
      project: { id: "project-1", name: "Atlas" },
    };
    void invalidIdleEvent;

    const view = flow.view<
      { readonly selectedId: string | null },
      "idle" | "loading" | "ready",
      { readonly state: "idle" | "loading" | "ready"; readonly selectedId: string | null }
    >({
      id: "Project.editorView",
      sources: ["context"],
      select: ({ context, value }) => ({
        state: value,
        selectedId: context.selectedId,
      }),
    });

    let factoryCalls = 0;
    const projectModule = flow.module(
      "Project",
      () => {
        factoryCalls += 1;
        return {
          byId: resource,
          editor: machine,
          editorView: view,
          resources: { byId: resource },
          machines: { editor: machine },
          views: { editorView: view },
        };
      },
      {
        tags: ["project"],
      },
    );

    expect(factoryCalls).toBe(1);
    expect(projectModule.kind).toBe("module");
    expect(projectModule.editor.kind).toBe("machine");
    expect(projectModule.editorView.kind).toBe("view");

    const app = flow.app({
      modules: [projectModule],
    });

    expect(factoryCalls).toBe(1);
    expect(app.kind).toBe("app");
    expect(app.modules).toEqual([projectModule]);
    expect(machine.getInitialSnapshot()).toMatchObject({
      value: "idle",
      context: { selectedId: null },
    });

    const appLayer = app.layer({
      store: flow.store.memory({ namespace: "phase-1" }),
      orchestrators: flow.orchestrators.test({ deterministic: true }),
      services: [],
    });
    expect(appLayer).toBeDefined();
    expectType<Layer.Layer<never>>(appLayer);

    expect(() =>
      flow.app({
        modules: [projectModule, flow.module("Project", { duplicate: true })],
      }),
    ).toThrow("Duplicate flow module id: Project");
  });

  it("accepts state-owned stream invokes that derive subscribe params from context", () => {
    type UploadEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "UPLOADED"; readonly assetId: string }>
      | Readonly<{ readonly type: "UPLOAD_DEFECT"; readonly cause: unknown }>;

    const uploadMachine = flow.machine<
      { readonly assets: ReadonlyArray<Readonly<{ readonly id: string }>> },
      UploadEvent,
      "idle" | "uploading"
    >({
      id: "Assets.upload",
      initial: "idle",
      context: () => ({
        assets: [{ id: "asset-1" }],
      }),
      states: {
        idle: {
          on: {
            START: "uploading",
          },
        },
        uploading: {
          invoke: flow.stream<
            { readonly assets: ReadonlyArray<Readonly<{ readonly id: string }>> },
            UploadEvent,
            ReadonlyArray<Readonly<{ readonly id: string }>>,
            Readonly<{ readonly id: string }>
          >({
            id: "Assets.uploadStream",
            params: ({
              context,
            }: {
              readonly context: {
                readonly assets: ReadonlyArray<Readonly<{ readonly id: string }>>;
              };
            }) => context.assets,
            subscribe: ({ params }) => Stream.fromIterable(params),
            routes: {
              value: (asset) => ({ type: "UPLOADED", assetId: asset.id }),
              defect: (cause) => ({ type: "UPLOAD_DEFECT", cause }),
            },
          }),
        },
      },
    });

    expect(uploadMachine.config.states.uploading.invoke).toMatchObject({
      kind: "stream",
      id: "Assets.uploadStream",
    });
  });

  it("accepts flow.after as a Duration.Input one-shot descriptor", () => {
    const after = flow.after({
      id: "Project.dismiss",
      delay: Duration.seconds(2),
      target: "done" as const,
    });

    expect(after.kind).toBe("after");
    expect(after.id).toBe("Project.dismiss");
    expect(after.config.delay).toEqual(Duration.seconds(2));
  });

  it("preserves the started-builder shape for flowTest(machine)", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "INC" }>,
      "idle"
    >({
      id: "Counter.test",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            INC: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });

    const harness = flowTest(machine).start();
    harness.send({ type: "INC" });

    expectType<number>(harness.context().count);
    expectType<"idle">(harness.state());
    expectType<number | undefined>(harness.snapshot().timers["Counter.dismiss"]?.generation);
    expectType<"scheduled" | "fired" | "interrupt" | undefined>(
      harness.timers().get("Counter.dismiss")?.status,
    );
  });
});
