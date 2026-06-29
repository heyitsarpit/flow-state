import { Context, Duration, Effect, Layer, Stream } from "effect";
import type { Effect as EffectType } from "effect";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import * as flowState from "./index.js";
import { createKey, createTag, flow, flowTest } from "./index.js";
import { HostSignals } from "./services/host-signals.js";
import { InspectionLog } from "./services/inspection.js";
import { NotificationScheduler } from "./services/notification-scheduler.js";
import { OrchestratorSystem } from "./services/orchestrator-system.js";
import { ResourceStore } from "./services/resource-store.js";
import { TraceLog } from "./services/trace.js";
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
  "withRequestRuntime",
]);

type ProjectRecord = Readonly<{
  readonly id: string;
  readonly name: string;
}>;

interface ProjectRepo {
  readonly _tag: "ProjectRepo";
}

class ProjectConfig extends Context.Service<ProjectConfig, { readonly projectId: string }>()(
  "@test/ProjectConfig",
) {}

class ProjectAnalytics extends Context.Service<
  ProjectAnalytics,
  { readonly label: EffectType.Effect<string, never, never> }
>()("@test/ProjectAnalytics") {}

type SaveError = "save-failed";
type SaveEvent =
  | Readonly<{ readonly type: "SAVED"; readonly value: ProjectRecord }>
  | Readonly<{ readonly type: "FAILED"; readonly error: SaveError }>;

function expectType<Type>(_value: Type): void {
  void _value;
}

describe("public API builders and descriptor contracts", () => {
  it("exposes the top-level entrypoints and removes the legacy mutation surface", () => {
    expect(new Set(Object.keys(flowState))).toEqual(expectedTopLevelExports);
    expect("mutation" in flow).toBe(false);
  });

  it("requires FlowProvider callers to pass a runtime", () => {
    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    expectType<React.ReactElement>(
      createElement(flowState.FlowProvider, {
        runtime,
        children: null,
      }),
    );

    const runtimeTransport = {
      kind: "runtime" as const,
      resources: runtime.resources,
      orchestrators: runtime.orchestrators,
      createActor: runtime.createActor,
      dispose: runtime.dispose,
    };

    // @ts-expect-error FlowProvider requires an explicit runtime prop
    createElement(flowState.FlowProvider, {
      children: null,
    });

    createElement(flowState.FlowProvider, {
      // @ts-expect-error FlowProvider requires a full runtime, not a transport subset
      runtime: runtimeTransport,
      children: null,
    });
  });

  it("keeps createRuntime honest about the default service and error channels", () => {
    const runtime = flowState.createRuntime();

    expectType<Promise<void>>(runtime.runPromise(Effect.void));
    expectType<Promise<import("effect").Exit.Exit<never, "boom">>>(
      runtime.runPromiseExit(Effect.fail("boom" as const)),
    );

    type _DefaultRuntimeServices = Expect<
      Equal<
        import("effect").ManagedRuntime.ManagedRuntime.Services<typeof runtime.managedRuntime>,
        | NotificationScheduler
        | ResourceStore
        | OrchestratorSystem
        | HostSignals
        | InspectionLog
        | TraceLog
      >
    >;
    void [true as _DefaultRuntimeServices];

    const expectDefaultRuntimeRejectsUnknownService = () => {
      // @ts-expect-error createRuntime() should not pretend that arbitrary services are installed
      return runtime.runPromise(Effect.flatMap(ProjectAnalytics, (analytics) => analytics.label));
    };
    void expectDefaultRuntimeRejectsUnknownService;
  });

  it("keeps withRequestRuntime honest about app-layer services and return types", async () => {
    const analyticsLayer = Layer.succeed(
      ProjectAnalytics,
      ProjectAnalytics.of({
        label: Effect.succeed("analytics"),
      }),
    );
    const appLayer = flow.app({ modules: [] }).layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [analyticsLayer],
    });

    const result = flowState.withRequestRuntime(appLayer, (runtime) =>
      runtime.runPromise(Effect.flatMap(ProjectAnalytics, (analytics) => analytics.label)),
    );

    expectType<Promise<string>>(result);
    expect(await result).toBe("analytics");
  });

  it("accepts only the honest app-layer descriptor surface", () => {
    const memoryStore = flow.store.memory();
    const testStore = flow.store.test();
    const liveOrchestrators = flow.orchestrators.live();
    const testOrchestrators = flow.orchestrators.test();

    expect(memoryStore).toEqual({
      kind: "store",
      mode: "memory",
    });
    expect(testStore).toEqual({
      kind: "store",
      mode: "test",
    });
    expect(liveOrchestrators).toEqual({
      kind: "orchestrators",
      mode: "live",
    });
    expect(testOrchestrators).toEqual({
      kind: "orchestrators",
      mode: "test",
    });
    expectType<"memory">(memoryStore.mode);
    expectType<"test">(testStore.mode);
    expectType<"live">(liveOrchestrators.mode);
    expectType<"test">(testOrchestrators.mode);

    const appLayer = flow.app({ modules: [] }).layer({
      store: testStore,
      orchestrators: testOrchestrators,
      services: [],
    });
    expect(appLayer).toBeDefined();
    expectType<Layer.Layer<never>>(appLayer);

    // @ts-expect-error legacy namespace config is removed until it is runtime-real
    flow.store.memory({ namespace: "legacy" });
    // @ts-expect-error legacy namespace config is removed until it is runtime-real
    flow.store.test({ namespace: "legacy-test" });
    // @ts-expect-error legacy orchestrator options are removed until they are runtime-real
    flow.orchestrators.live({ mode: "browser" });
    // @ts-expect-error legacy orchestrator options are removed until they are runtime-real
    flow.orchestrators.test({ deterministic: true });
  });

  it("preserves specific flow.run descriptor types", () => {
    const saveProject = flow.transaction<
      { readonly id: string },
      ProjectRecord,
      SaveError,
      ProjectRepo,
      SaveEvent,
      "Project.save"
    >({
      id: "Project.save",
      params: ({ id }: { readonly id?: string }) => ({ id: id ?? "project-1" }),
      commit: ({ id }) =>
        Effect.succeed({
          id,
          name: "Atlas",
        }) as EffectType.Effect<ProjectRecord, SaveError, ProjectRepo>,
      routes: {
        success: ({ value }) => ({ type: "SAVED", value }),
        failure: ({ error }) => ({ type: "FAILED", error }),
      },
    });

    const runDescriptor = flow.run(saveProject);

    expectType<typeof saveProject>(runDescriptor.transaction);
    expectType<"Project.save">(runDescriptor.id);
  });

  it("exposes named invoke descriptor result types for stricter declaration modes", () => {
    const projectTag = createTag("project");
    const resource = flow.resource({
      id: "Project.byId",
      key: (projectId: string) => createKey("project", projectId),
      lookup: (projectId: string) =>
        Effect.succeed({
          id: projectId,
          name: "Atlas",
        }),
      tags: () => [projectTag],
    });
    const resourceRef = resource.ref("project-1");
    const saveProject = flow.transaction({
      id: "Project.save",
      commit: ({ id }: { readonly id: string }) =>
        Effect.succeed({
          id,
          name: "Atlas",
        }),
    });

    const ensureProject: flowState.FlowEnsureDefinition<typeof resourceRef> =
      flow.ensure(resourceRef);
    const observeProject: flowState.FlowObserveDefinition<typeof resourceRef> =
      flow.observe(resourceRef);
    const refreshProject: flowState.FlowRefreshDefinition<typeof resourceRef> =
      flow.refresh(resourceRef);
    const patchProject: flowState.FlowPatchDefinition<
      typeof resourceRef,
      Readonly<{ readonly name: string }>
    > = flow.patch(resourceRef, {
      name: "Atlas v2",
    });
    const invalidateProject: flowState.FlowInvalidateDefinition<typeof projectTag> =
      flow.invalidate(projectTag);
    const runSaveProject: flowState.FlowRunDefinition<typeof saveProject> = flow.run(saveProject);

    expectType<"ensure">(ensureProject.kind);
    expectType<"observe">(observeProject.kind);
    expectType<"refresh">(refreshProject.kind);
    expectType<"patch">(patchProject.kind);
    expectType<"invalidate">(invalidateProject.kind);
    expectType<"run">(runSaveProject.kind);
    expectType<typeof resourceRef>(refreshProject.ref);
    expectType<typeof projectTag>(invalidateProject.target);
    expectType<typeof saveProject>(runSaveProject.transaction);
  });

  it("preserves resource ids, refs, key builders, schema, and lookup effect shape", () => {
    const projectSchema = { kind: "project-schema" } as const;
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
      ReturnType<typeof lookupProject>,
      "Project.byId",
      typeof projectSchema
    >({
      id: "Project.byId",
      key: (projectId: string) => createKey("project", projectId),
      lookup: lookupProject,
      schema: projectSchema,
      tags: () => [createTag("project")],
    });

    const ref = resource.ref("project-1");

    expect(resource.kind).toBe("resource");
    expect(resource.id).toBe("Project.byId");
    expect(resource.config.schema).toEqual(projectSchema);
    expect(ref).toEqual({
      kind: "resourceRef",
      id: "Project.byId",
      params: ["project-1"],
      key: createKey("project", "project-1"),
    });

    expectType<"Project.byId">(resource.id);
    expectType<"Project.byId">(ref.id);
    expectType<typeof projectSchema | undefined>(resource.config.schema);
    expectType<EffectType.Effect<ProjectRecord, "missing", ProjectRepo>>(
      resource.config.lookup("project-1"),
    );
    const seeded: flowState.FlowSeededResource<typeof ref> = {
      ref,
      value: { id: "project-1", name: "Atlas" },
    };
    expectType<ProjectRecord>(seeded.value);

    type _ResourceShape = Expect<Equal<typeof ref.params, [string]>>;
    void [true as _ResourceShape];
  });

  it("types correlated trace reports from flowExperimental", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "NEXT" }>,
      "idle"
    >({
      id: "Trace.types",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });

    const trace = flowState.flowExperimental.captureTrace(
      Object.freeze({
        ...machine.getInitialSnapshot(),
        receipts: [
          {
            type: "machine:event",
            id: machine.id,
            eventType: "NEXT",
            correlationId: "Trace.types:event:1",
            targetActorId: machine.id,
          },
        ],
      }),
      { includeSnapshots: true as const },
    );

    expectType<string | undefined>(trace.report.correlations[0]?.correlationId);
    expectType<string | undefined>(trace.report.correlations[0]?.event.type);
    expectType<ReadonlyArray<string>>(trace.report.summary.receiptTypes);
    expectType<ReadonlyArray<string>>(trace.report.summary.relatedIds);
    expectType<string | undefined>(trace.report.correlations[0]?.summary.eventType);
    expectType<ReadonlyArray<Readonly<{ readonly type: string }>>>(
      trace.report.correlations[0]?.receipts ?? [],
    );
    expectType<ReadonlyArray<Readonly<{ readonly type: string }>>>(
      trace.report.correlations[0]?.transactions ?? [],
    );
    expectType<ReadonlyArray<string>>(trace.report.correlations[0]?.summary.relatedIds ?? []);
    expectType<ReadonlyArray<string>>(trace.report.correlations[0]?.summary.receiptTypes ?? []);
    expectType<true | undefined>(trace.options?.includeSnapshots);
  });

  it("preserves resource value types through runtime resource reads and subscriptions", () => {
    const resource = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      EffectType.Effect<ProjectRecord, never, never>,
      "Runtime.project"
    >({
      id: "Runtime.project",
      key: (projectId: string) => createKey("runtime-project", projectId),
      lookup: (projectId: string) =>
        Effect.succeed({
          id: projectId,
          name: "Runtime project",
        } satisfies ProjectRecord),
    });
    const ref = resource.ref("project-1");
    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );
    expectType<ProjectRecord | undefined>(runtime.resources.get(ref)?.value);
    expectType<ReadonlyArray<flowState.FlowResourceHydrationEntry>>(runtime.resources.dehydrate());

    const unsubscribe = runtime.resources.subscribe(ref, (snapshot) => {
      expectType<ProjectRecord | undefined>(snapshot.value);
    });
    unsubscribe();

    runtime.resources.hydrate([
      {
        ref,
        snapshot: {
          value: { id: "project-1", name: "Hydrated project" },
          updatedAt: 1,
        },
      },
    ]);

    const boot = runtime.dehydrateBoot();
    expectType<ReadonlyArray<flowState.FlowResourceHydrationEntry>>(boot.resources);
    expectType<ReadonlyArray<flowState.FlowRuntimeBootActorSnapshot>>(boot.actors);
    expectType<"flow-state/runtime-boot.v1">(boot.version);

    const restoredBoot = runtime.hydrateBoot(boot);
    expectType<flowState.FlowActorSnapshotTree | undefined>(
      restoredBoot.actorSnapshot("runtime.project.actor"),
    );
  });

  it("types serializable actor snapshots across actor restore", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "INC" }>,
      "idle"
    >({
      id: "Trace.actor-restore",
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
    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(machine);
    expectType<flowState.FlowActorSnapshotTree>(actor.serialize());

    const restored = runtime.createActor(machine, {
      id: "Trace.actor-restore.runtime",
      snapshot: actor.serialize(),
    });

    expectType<number>(restored.snapshot().context.count);

    const boot = runtime.dehydrateBoot({
      actors: [actor],
    });
    expectType<flowState.FlowActorSnapshotTree | undefined>(
      runtime.hydrateBoot(boot).actorSnapshot(actor.id),
    );
  });

  it("types the public runtime inspection surface", () => {
    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    expectType<ReadonlyArray<flowState.FlowInspectionEvent>>(runtime.inspection.entries());
    const unsubscribe = runtime.inspection.subscribe((event) => {
      expectType<string>(event.type);
    });
    expectType<() => void>(unsubscribe);
    unsubscribe();

    const issue = {} as flowState.FlowIssue;
    expectType<string | undefined>(issue.facts?.parentState);
    expectType<string | undefined>(issue.facts?.correlationId);
    expectType<ReadonlyArray<string> | undefined>(issue.facts?.receiptTypes);
    expectType<ReadonlyArray<string> | undefined>(issue.facts?.relatedIds);
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
      SaveEvent,
      "Project.save"
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
    expectType<"Project.save">(transaction.id);
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
      // @ts-expect-error transaction.input was removed from the public contract
      input: () => ({ id: "project-1" }),
      commit: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
    });

    flow.transaction({
      id: "legacy.effect",
      // @ts-expect-error transaction.effect was removed from the public contract
      effect: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
      commit: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
    });

    flow.transaction({
      id: "legacy.optimistic",
      // @ts-expect-error transaction.optimistic was removed from the public contract
      optimistic: { apply: () => [] },
      commit: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
    });

    flow.transaction({
      id: "preview.replace-mismatch",
      preview: {
        apply: () => [
          // @ts-expect-error preview replace values must match the resource value type
          {
            ref: resource.ref("project-1"),
            replace: { id: 123, name: "Atlas v2" },
          },
        ],
      },
      commit: (_params: { readonly id: string }) => Effect.succeed(resource.ref("project-1")),
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
    expectType<"Project.editor">(machine.id);

    flow.machine({
      id: "Project.editor.unsupported-on-done",
      initial: "idle",
      context: () => ({ selectedId: null as string | null }),
      states: {
        idle: {
          // @ts-expect-error Flow State does not expose XState-style onDone transitions
          onDone: "ready",
        },
        ready: {},
      },
    });

    flow.machine({
      id: "Project.editor.unsupported-parallel",
      initial: "idle",
      context: () => ({ selectedId: null as string | null }),
      states: {
        idle: {
          // @ts-expect-error Flow State only supports type: "final" state nodes
          type: "parallel",
        },
        ready: {},
      },
    });

    flow.machine({
      id: "Project.editor.unsupported-history",
      initial: "idle",
      context: () => ({ selectedId: null as string | null }),
      states: {
        idle: {},
        historyKind: {
          // @ts-expect-error Flow State does not expose XState history state nodes
          type: "history",
        },
        historyConfig: {
          // @ts-expect-error Flow State does not expose XState history depth configuration
          history: "deep",
        },
      },
    });

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
      {
        readonly state: "idle" | "loading" | "ready";
        readonly selectedId: string | null;
        readonly issueCount: number;
      },
      "Project.editorView"
    >({
      id: "Project.editorView",
      sources: [
        "context",
        "resources",
        "transactions",
        "streams",
        "timers",
        "children",
        "issues",
        "receipts",
      ],
      select: ({
        context,
        value,
        resources,
        transactions,
        streams,
        timers,
        children,
        issues,
        receipts,
      }) => {
        const resourceSnapshot = resources["Project.byId"];
        const transactionSnapshot = transactions["Project.save"];
        const streamSnapshot = streams["Project.activity"];
        const timerSnapshot = timers["Project.refresh"];
        const childSnapshot = children["Project.child"];

        expectType<string | null>(context.selectedId);
        expectType<"idle" | "loading" | "ready">(value);
        expectType<number>(issues.length);
        expectType<number>(receipts.length);
        expectType<string | undefined>(resourceSnapshot?.status);
        expectType<string | undefined>(transactionSnapshot?.status);
        expectType<string | undefined>(streamSnapshot?.status);
        expectType<number | undefined>(timerSnapshot?.dueAt);
        expectType<string | undefined>(childSnapshot?.status);

        // @ts-expect-error view selectors only receive readonly context
        context.selectedId = "project-2";
        // @ts-expect-error resource projections are readonly snapshots, not definitions
        resources["Project.byId"] = undefined;
        // @ts-expect-error transaction projections do not expose commit controls
        void transactionSnapshot?.commit;
        // @ts-expect-error stream projections do not expose subscription controls
        void streamSnapshot?.subscribe;
        // @ts-expect-error timer projections do not expose cancellation controls
        void timerSnapshot?.cancel;
        // @ts-expect-error child projections are snapshots, not live actors
        childSnapshot?.send({ type: "RETRY" });
        // @ts-expect-error issues are readonly facts
        issues.push({
          kind: "failure",
          source: "transaction",
          id: "Project.save",
        });
        // @ts-expect-error receipts are readonly facts
        receipts.push({ type: "transaction:start", id: "Project.save" });

        return {
          state: value,
          selectedId: context.selectedId,
          issueCount: issues.length,
        };
      },
    });
    expectType<"Project.editorView">(view.id);

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

    const auditMachine = flow.machine<
      { readonly entries: number },
      never,
      "idle",
      "idle",
      "Audit.timeline"
    >({
      id: "Audit.timeline",
      initial: "idle",
      context: () => ({ entries: 0 }),
      states: {
        idle: {},
      },
    });

    const auditModule = flow.module("Audit", {
      timeline: auditMachine,
      machines: { timeline: auditMachine },
    });

    const app = flow.app({
      modules: [projectModule, auditModule],
    });

    expect(factoryCalls).toBe(1);
    expect(app.kind).toBe("app");
    expect(app.modules).toEqual([projectModule, auditModule]);
    expect(app.moduleMap.Project).toBe(projectModule);
    expect(app.moduleMap.Audit).toBe(auditModule);
    expectType<typeof projectModule>(app.moduleMap.Project);
    expectType<typeof auditModule>(app.moduleMap.Audit);
    expectType<"Project">(app.moduleMap.Project.id);
    expectType<"Audit">(app.moduleMap.Audit.id);
    expectType<"Project.editor">(app.moduleMap.Project.editor.id);
    expectType<"Project.editorView">(app.moduleMap.Project.editorView.id);
    expectType<"Audit.timeline">(app.moduleMap.Audit.timeline.id);
    expect(machine.getInitialSnapshot()).toMatchObject({
      value: "idle",
      context: { selectedId: null },
    });

    const appLayer = app.layer({
      store: flow.store.memory(),
      orchestrators: flow.orchestrators.test(),
      services: [],
    });
    expect(appLayer).toBeDefined();
    expectType<Layer.Layer<never>>(appLayer);

    const analyticsLayer = Layer.effect(
      ProjectAnalytics,
      Effect.map(ProjectConfig, (config) =>
        ProjectAnalytics.of({
          label: Effect.succeed(config.projectId),
        }),
      ),
    );

    const appLayerWithRequirement = app.layer<readonly [typeof analyticsLayer]>({
      store: flow.store.memory(),
      orchestrators: flow.orchestrators.test(),
      services: [analyticsLayer],
    });
    type AppLayerRequirements = Expect<
      Equal<Layer.Services<typeof appLayerWithRequirement>, ProjectConfig>
    >;
    const appLayerRequirements: AppLayerRequirements = true;
    expect(appLayerRequirements).toBe(true);

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
      "idle" | "uploading",
      "idle",
      "Assets.upload"
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
    expectType<"Assets.upload">(uploadMachine.id);

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
    expectType<string | undefined>(harness.receipts()[0]?.type);
    expectType<number>(harness.pendingWork().activeFibers);
    expectType<string | undefined>(harness.pendingWork().mailboxes[0]?.id);
    expectType<number | undefined>(harness.pendingWork().timers[0]?.dueAt);
    expectType<"scheduled" | "fired" | "interrupt" | undefined>(
      harness.timers().get("Counter.dismiss")?.status,
    );
  });
});
