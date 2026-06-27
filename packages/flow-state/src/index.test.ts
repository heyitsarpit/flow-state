import { describe, expect, it } from "vite-plus/test";
import * as React from "react";

import {
  createControlledEffect,
  createControlledStream,
  createFlowPreview,
  createKey,
  createPartialTestLayer,
  createRuntime,
  FlowProvider,
  createStatePath,
  createTag,
  createTestLayer,
  flow,
  flowTest,
  packageInfo,
  runEffectExit,
  runEffectWithLayerExit,
  selectView,
} from "./index";
import { Context, Effect, Layer, Stream } from "effect";
import type { FlowEvent, FlowQueryConfig, FlowResourceSnapshot, FlowTransitionArgs } from "./index";

type CounterState = "idle" | "ready";

type CounterEvent =
  | ({ readonly type: "ADD"; readonly amount: number } & FlowEvent)
  | ({ readonly type: "RESET" } & FlowEvent)
  | ({ readonly type: "START" } & FlowEvent);

interface CounterContext {
  readonly count: number;
  readonly log: readonly string[];
}

function positiveAmount({
  event,
}: FlowTransitionArgs<CounterContext, CounterEvent, CounterState>): boolean {
  return event.type === "ADD" && event.amount > 0;
}

function incrementCount({
  context,
  event,
}: FlowTransitionArgs<CounterContext, CounterEvent, CounterState>): Partial<CounterContext> {
  return {
    count: context.count + (event.type === "ADD" ? event.amount : 0),
  };
}

function logCount({
  context,
}: FlowTransitionArgs<CounterContext, CounterEvent, CounterState>): Partial<CounterContext> {
  return {
    log: [...context.log, `count:${context.count}`],
  };
}

const counterMachine = flow.machine<CounterContext, CounterEvent, CounterState>({
  id: "counter",
  initial: "idle",
  context: () => ({ count: 0, log: [] }),
  states: {
    idle: {
      on: {
        START: "ready",
      },
    },
    ready: {
      on: {
        ADD: {
          guard: positiveAmount,
          update: [incrementCount, logCount],
        },
        RESET: {
          update: () => ({
            count: 0,
            log: [],
          }),
        },
      },
    },
  },
});

describe("@flow-state/core", () => {
  it("exposes the planned primitive buckets", () => {
    expect(packageInfo.primitives).toEqual([
      "atom",
      "resource",
      "mutation",
      "machine",
      "cache",
      "workflow",
      "tooling",
      "actor",
      "trace",
      "graph",
    ]);
  });

  it("keeps the Effect and XState smoke path compatible", () => {
    expect(createFlowPreview()).toEqual({
      label: "Effect + XState ready",
      initialState: "idle",
      primitives: [
        "atom",
        "resource",
        "mutation",
        "machine",
        "cache",
        "workflow",
        "tooling",
        "actor",
        "trace",
        "graph",
      ],
    });
  });

  it("disposes scoped services supplied to flow.runtime", async () => {
    const events: string[] = [];
    interface ScopedServiceShape {
      readonly touch: Effect.Effect<string>;
    }
    class ScopedService extends Context.Service<ScopedService, ScopedServiceShape>()(
      "test/ScopedService",
    ) {}
    const layer = Layer.effect(
      ScopedService,
      Effect.gen(function* () {
        events.push("acquire");
        yield* Effect.addFinalizer(() => Effect.sync(() => events.push("release")));
        return ScopedService.of({
          touch: Effect.succeed("ok"),
        });
      }),
    );
    const runtime = flow.runtime(layer);

    await expect(
      runtime.runPromise(
        Effect.gen(function* () {
          const service = yield* ScopedService;
          return yield* service.touch;
        }),
      ),
    ).resolves.toBe("ok");
    expect(events).toEqual(["acquire"]);

    await runtime.dispose();

    expect(events).toEqual(["acquire", "release"]);
  });

  it("compiles a minimal app, service layer, runtime, flow, transaction, resource, and provider smoke path", async () => {
    interface ProjectRecord {
      readonly id: string;
      readonly name: string;
    }
    interface ProjectApiShape {
      readonly load: (id: string) => Effect.Effect<ProjectRecord>;
      readonly save: (project: ProjectRecord) => Effect.Effect<ProjectRecord>;
    }
    class ProjectApi extends Context.Service<ProjectApi, ProjectApiShape>()(
      "test/SmokeProjectApi",
    ) {}
    type Event =
      | ({ readonly type: "OPEN"; readonly id: string } & FlowEvent)
      | ({ readonly type: "SAVE" } & FlowEvent);
    interface ContextShape {
      readonly projectId: string;
      readonly draftName: string;
    }
    const project = flow.resource<[string], ProjectRecord, never, ProjectApi>({
      id: "smoke.project",
      key: (id) => createKey("smoke", "project", id),
      lookup: (id) =>
        Effect.gen(function* () {
          const api = yield* ProjectApi;
          return yield* api.load(id);
        }),
    });
    const saveProject = flow.transaction({
      id: "smoke.save-project",
      params: ({ context }: { readonly context: ContextShape }) => ({
        id: context.projectId,
        name: context.draftName,
      }),
      commit: (params: ProjectRecord) =>
        Effect.gen(function* () {
          const api = yield* ProjectApi;
          return yield* api.save(params);
        }),
    });
    const machine = flow.machine<ContextShape, Event, "idle" | "editing" | "saving">({
      id: "smoke.editor",
      initial: "idle",
      context: () => ({ projectId: "p1", draftName: "Atlas" }),
      states: {
        idle: {
          invoke: flow.ensure(project.ref("p1")),
          on: {
            OPEN: {
              target: "editing",
              update: ({ event }) => (event.type === "OPEN" ? { projectId: event.id } : {}),
            },
          },
        },
        editing: {
          on: { SAVE: "saving" },
        },
        saving: {
          invoke: flow.run(saveProject),
        },
      },
    });
    const SmokeModule = flow.module("Smoke", () => ({
      project,
      saveProject,
      machine,
    }));
    const SmokeApp = flow.app({ modules: [SmokeModule] });
    const layer = SmokeApp.layer({
      store: flow.store.memory(),
      orchestrators: flow.orchestrators.live(),
      services: [
        Layer.succeed(
          ProjectApi,
          ProjectApi.of({
            load: (id) => Effect.succeed({ id, name: "Atlas" }),
            save: (next) => Effect.succeed(next),
          }),
        ),
      ],
    });
    const runtime = flow.runtime(layer);
    const provider = React.createElement(
      FlowProvider,
      { runtime: createRuntime() },
      React.createElement("div", null, SmokeApp.kind),
    );

    await expect(runtime.runPromise(project.config.lookup("p1"))).resolves.toEqual({
      id: "p1",
      name: "Atlas",
    });
    await expect(
      runtime.runPromise(saveProject.config.commit({ id: "p1", name: "Atlas v2" })),
    ).resolves.toEqual({ id: "p1", name: "Atlas v2" });
    expect(machine.id).toBe("smoke.editor");
    expect(provider.type).toBe(FlowProvider);

    await runtime.dispose();
  });

  it("runs deterministic guarded transitions with update reducers", () => {
    const actor = createRuntime().createActor(counterMachine);

    expect(actor.getSnapshot()).toMatchObject({
      value: "idle",
      context: { count: 0, log: [] },
      status: "active",
      changed: false,
    });
    expect(flow.can(actor, { type: "ADD", amount: 1 })).toBe(false);

    actor.send({ type: "START" });
    expect(actor.getSnapshot().value).toBe("ready");
    expect(flow.can(actor, { type: "ADD", amount: 1 })).toBe(true);
    expect(flow.can(actor, { type: "ADD", amount: 0 })).toBe(false);

    actor.send({ type: "ADD", amount: 3 });
    expect(actor.getSnapshot().context).toEqual({
      count: 3,
      log: ["count:3"],
    });
  });

  it("matches snapshots by state with a fallback handler", () => {
    const actor = createRuntime().createActor(counterMachine);

    expect(
      flow.match(actor.getSnapshot(), {
        idle: () => "nothing yet",
        _: () => "fallback",
      }),
    ).toBe("nothing yet");

    actor.send({ type: "START" });
    expect(
      flow.match(actor.getSnapshot(), {
        idle: () => "nothing yet",
        _: ({ value }) => `state:${value}`,
      }),
    ).toBe("state:ready");
  });

  it("selects snapshot-backed view descriptors", () => {
    const actor = createRuntime().createActor(counterMachine);
    const view = flow.view<
      CounterContext,
      CounterState,
      {
        readonly state: CounterState;
        readonly count: number;
        readonly receipts: number;
      }
    >({
      id: "counter.summary",
      sources: ["context", "receipts"],
      select: ({ context, value, receipts }) => ({
        state: value,
        count: context.count,
        receipts: receipts.length,
      }),
    });

    expect(selectView(actor.getSnapshot(), view)).toEqual({
      state: "idle",
      count: 0,
      receipts: 0,
    });
  });

  it("provides a test harness with async flush support", async () => {
    const harness = flowTest(counterMachine)
      .start({ context: { count: 2 } })
      .send({ type: "START" });

    expect(harness.state()).toBe("ready");
    expect(harness.context()).toEqual({ count: 2, log: [] });
    expect(harness.can({ type: "ADD", amount: 1 })).toBe(true);

    harness.send({ type: "ADD", amount: 4 });
    await harness.flush();

    expect(harness.snapshot()).toMatchObject({
      value: "ready",
      context: { count: 6, log: ["count:6"] },
      changed: true,
      event: { type: "ADD", amount: 4 },
    });
  });

  it("fails loudly for unsupported bounded settle and virtual time helpers", async () => {
    const harness = flowTest(counterMachine);

    await expect(harness.settle({ maxEvents: 1 })).rejects.toThrow(
      "flowTest.settle is not implemented",
    );
    await expect(harness.advance("2 seconds")).rejects.toThrow(
      "flowTest.advance is not implemented",
    );
  });

  it("records controlled effect attempts without corrupting terminal state payloads", () => {
    const work = createControlledEffect<number, { readonly _tag: "ExpectedFailure" }>("work");

    expect(work.state()).toEqual({ status: "idle", attempts: 0 });
    work.effect();
    expect(work.state()).toEqual({ status: "running", attempts: 1 });

    work.succeed(42);
    expect(work.state()).toEqual({ status: "success", attempts: 1, value: 42 });

    work.effect();
    expect(work.state()).toEqual({ status: "running", attempts: 2 });

    work.fail({ _tag: "ExpectedFailure" });
    expect(work.state()).toEqual({
      status: "failure",
      attempts: 2,
      error: { _tag: "ExpectedFailure" },
    });
  });

  it("runs controlled effects through real Effect outcomes", async () => {
    const work = createControlledEffect<number, { readonly _tag: "ExpectedFailure" }>("work");

    const success = runEffectExit(work.effect());
    expect(work.state()).toEqual({ status: "running", attempts: 1 });
    work.succeed(42);
    await expect(success).resolves.toEqual({ status: "success", value: 42 });

    const failure = runEffectExit(work.effect());
    work.fail({ _tag: "ExpectedFailure" });
    await expect(failure).resolves.toEqual({
      status: "failure",
      error: { _tag: "ExpectedFailure" },
    });

    const defect = new Error("unexpected");
    const died = runEffectExit(work.effect());
    work.die(defect);
    await expect(died).resolves.toEqual({ status: "defect", defect });

    const interrupted = runEffectExit(work.effect());
    work.cancel();
    await expect(interrupted).resolves.toEqual({ status: "interrupt" });
    expect(work.state()).toEqual({ status: "cancelled", attempts: 4 });
  });

  it("records the final controlled stream API shape without running stream runtime", () => {
    const stream = createControlledStream<number, { readonly _tag: "ExpectedStreamFailure" }>(
      "upload.progress",
    );

    expect(stream.kind).toBe("controlledStream");
    expect(stream.name).toBe("upload.progress");
    expect(stream.active()).toBe(false);
    expect(stream.state()).toEqual({ status: "idle", emitted: 0 });

    stream.stream();
    expect(stream.active()).toBe(true);

    stream.emit(50);
    expect(stream.state()).toEqual({ status: "value", emitted: 1, latest: 50 });

    stream.fail({ _tag: "ExpectedStreamFailure" });
    expect(stream.events()).toEqual([
      { type: "start" },
      { type: "value", value: 50 },
      { type: "failure", error: { _tag: "ExpectedStreamFailure" } },
    ]);

    stream.cancel();
    expect(stream.cancelled()).toBe(true);
  });

  it("requires vNext stream descriptors to carry an Effect Stream and typed routes", async () => {
    type UploadEvent =
      | ({ readonly type: "UPLOAD_PROGRESS"; readonly progress: number } & FlowEvent)
      | ({ readonly type: "UPLOAD_DONE" } & FlowEvent)
      | ({ readonly type: "UPLOAD_FAILED"; readonly error: string } & FlowEvent);

    const upload = flow.stream<unknown, UploadEvent, void, number, string, void>({
      id: "upload.progress",
      subscribe: () => Stream.make(25, 50, 100),
      pressure: { strategy: "coalesce-latest", key: (value) => `asset:${value}` },
      routes: {
        value: (progress) => ({ type: "UPLOAD_PROGRESS", progress }),
        done: () => ({ type: "UPLOAD_DONE" }),
        failure: (error) => ({ type: "UPLOAD_FAILED", error }),
      },
    });

    expect(upload.kind).toBe("stream");
    const subscribe = upload.config.subscribe;
    expect(subscribe).toBeTypeOf("function");
    if (subscribe === undefined) {
      throw new Error("expected upload stream to expose subscribe");
    }
    expect(
      subscribe({
        params: undefined,
        input: undefined,
        services: undefined,
        runtime: { now: () => 0 },
      }),
    ).toBeDefined();
    expect(upload.config.routes?.value?.(25)).toEqual({
      type: "UPLOAD_PROGRESS",
      progress: 25,
    });
    const uploadMachine = flow.machine<{ readonly progress: number }, UploadEvent, "uploading">({
      id: "upload.subscribe-machine",
      initial: "uploading",
      context: () => ({ progress: 0 }),
      states: {
        uploading: {
          invoke: upload,
          on: {
            UPLOAD_PROGRESS: {
              update: ({ event }) =>
                event.type === "UPLOAD_PROGRESS" ? { progress: event.progress } : {},
            },
          },
        },
      },
    });

    const harness = flowTest(uploadMachine).start();
    await harness.flush();
    expect(harness.context().progress).toBe(100);

    flow.stream({
      id: "upload.strict",
      // @ts-expect-error flow.stream requires Effect Stream descriptors, not raw AsyncIterable.
      subscribe: () => ({
        async *[Symbol.asyncIterator]() {
          yield 1;
        },
      }),
    });
  });

  it("builds compact outcome routes and submit transitions with guards", () => {
    type SaveState = "editing" | "saving";
    type SaveEvent =
      | ({ readonly type: "SAVE"; readonly requestId?: number } & FlowEvent)
      | ({
          readonly type: "SAVED";
          readonly requestId: number;
          readonly project: { id: string };
        } & FlowEvent)
      | ({
          readonly type: "SAVE_FAILED";
          readonly requestId: number;
          readonly error: string;
        } & FlowEvent)
      | ({
          readonly type: "SAVE_DEFECT";
          readonly requestId: number;
          readonly defect: unknown;
        } & FlowEvent)
      | ({ readonly type: "SAVE_INTERRUPTED"; readonly requestId: number } & FlowEvent);
    interface SaveContext {
      readonly dirty: boolean;
    }

    const saveMutation = flow.mutation({
      id: "save",
      input: () => null,
      effect: () => Effect.void,
    });
    // @ts-expect-error executable mutations must declare an Effect-backed effect.
    flow.mutation({ id: "missing-effect", input: () => ({}) });
    const routes = flow.outcomes<{ readonly id: string }, string, SaveEvent>({
      success: ["SAVED", "project"],
      failure: ["SAVE_FAILED", "error"],
      defect: ["SAVE_DEFECT", "defect"],
      interrupt: "SAVE_INTERRUPTED",
    });
    const submit = flow.submit<SaveContext, SaveEvent, SaveState>(saveMutation, {
      target: "saving",
      guard: ({ context }) => context.dirty,
    });

    expect(routes.success?.({ requestId: 7, value: { id: "p1" } })).toEqual({
      type: "SAVED",
      requestId: 7,
      project: { id: "p1" },
    });
    expect(routes.failure?.({ requestId: 8, error: "nope" })).toEqual({
      type: "SAVE_FAILED",
      requestId: 8,
      error: "nope",
    });
    expect(routes.defect?.({ requestId: 9, defect: "boom" })).toEqual({
      type: "SAVE_DEFECT",
      requestId: 9,
      defect: "boom",
    });
    expect(routes.interrupt?.({ requestId: 10 })).toEqual({
      type: "SAVE_INTERRUPTED",
      requestId: 10,
    });
    expect(submit).toMatchObject({
      target: "saving",
      submit: saveMutation,
      guard: expect.any(Function),
    });
  });

  it("marks tag-invalidated cached query resources stale after a successful mutation", async () => {
    interface Panel {
      readonly id: string;
      readonly value: number;
    }

    interface DashboardContext {
      readonly tenantId: string;
    }

    type DashboardState = "ready" | "saving";
    type DashboardEvent =
      | ({ readonly type: "SAVE_WIDGET" } & FlowEvent)
      | ({ readonly type: "WIDGET_SAVED" } & FlowEvent);

    const panelTag = createTag("dashboard-panel");
    const save = createControlledEffect<{ readonly ok: true }, never>("save-widget");

    const statsQuery = flow.query<FlowQueryConfig<DashboardContext, DashboardEvent, Panel, never>>({
      id: "dashboard.stats",
      key: ({ context }) => createKey("dashboard", context.tenantId, "stats"),
      tags: [panelTag],
      effect: () => Effect.succeed({ id: "stats", value: 42 }),
      cache: {
        staleTime: 1_000,
        gcTime: 5_000,
        keepPreviousData: true,
      },
      policy: "stale-while-revalidate",
    });

    const alertsQuery = flow.query<FlowQueryConfig<DashboardContext, DashboardEvent, Panel, never>>(
      {
        id: "dashboard.alerts",
        key: ({ context }) => createKey("dashboard", context.tenantId, "alerts"),
        tags: [panelTag],
        effect: () => Effect.succeed({ id: "alerts", value: 7 }),
        cache: {
          staleTime: 1_000,
          gcTime: 5_000,
        },
      },
    );

    const saveMutation = flow.mutation({
      id: "dashboard.save-widget",
      input: () => ({ widgetId: "widget-1" }),
      effect: () => save.effect(),
      invalidates: [panelTag],
    });

    const dashboardMachine = flow.machine<DashboardContext, DashboardEvent, DashboardState>({
      id: "dashboard-cache",
      initial: "ready",
      context: () => ({ tenantId: "tenant-1" }),
      states: {
        ready: {
          invoke: [statsQuery, alertsQuery],
          on: {
            SAVE_WIDGET: flow.submit<DashboardContext, DashboardEvent, DashboardState>(
              saveMutation,
              { target: "saving" },
            ),
          },
        },
        saving: {
          on: {
            WIDGET_SAVED: "ready",
          },
        },
      },
    });

    let now = 1_000;
    const harness = flowTest(dashboardMachine).clock(() => now);

    expect(harness.cache().query("dashboard.stats")).toMatchObject({
      status: "loading",
      fetchStatus: "fetching",
      observers: 1,
    });

    await harness.flush();

    expect(harness.cache().writes()).toHaveLength(2);
    expect(harness.cache().get(createKey("dashboard", "tenant-1", "stats"))).toMatchObject({
      id: "dashboard.stats",
      status: "success",
      stale: false,
      tags: ["dashboard-panel"],
      updatedAt: 1_000,
      staleAt: 2_000,
      gcAt: 6_000,
    });

    now = 2_500;
    harness.send({ type: "SAVE_WIDGET" });
    save.succeed({ ok: true });
    await harness.flush();
    await harness.flush();

    expect(harness.state()).toBe("saving");
    expect(harness.cache().invalidations(panelTag)).toContainEqual(
      expect.objectContaining({
        type: "cache:invalidate",
        target: "tag:dashboard-panel",
      }),
    );
    expect(
      harness
        .cache()
        .stale()
        .map((resource) => resource.id)
        .sort(),
    ).toEqual(["dashboard.alerts", "dashboard.stats"]);
    expect(harness.cache().query("dashboard.stats")).toMatchObject({
      stale: true,
      invalidatedAt: 2_500,
    });
  });

  it("seeds app resources through flowTest.app before starting a focused flow", () => {
    const counterResource = flow.resource<[string], { readonly count: number }>({
      id: "counter.resource",
      key: (id) => createKey("counter", id),
      lookup: () => Effect.succeed({ count: 0 }),
      tags: () => [createTag("counter")],
    });
    const summary = flow.view<CounterContext, CounterState, { readonly count: number }>({
      id: "counter.resource-summary",
      sources: ["resources"],
      select: ({ resources }) => {
        const resource = Object.values(resources).find((entry) => entry.id === "counter.resource");
        return {
          count: resource === undefined ? 0 : (resource.value as { readonly count: number }).count,
        };
      },
    });
    const app = flow.app({ modules: [flow.module("Counter", () => ({ counterResource }))] });

    const harness = flowTest
      .app(app)
      .seedResource(counterResource.ref("main"), { count: 42 })
      .start(counterMachine);

    expect(harness.cache().query("counter.resource")).toMatchObject({
      id: "counter.resource",
      status: "success",
      value: { count: 42 },
    });
    expect(selectView(harness.snapshot(), summary)).toEqual({ count: 42 });
  });

  it("seeds module fixtures through flowTest.app without hand-wiring every resource", () => {
    const counterResource = flow.resource<[string], { readonly count: number }>({
      id: "counter.fixture",
      key: (id) => createKey("counter", id),
      lookup: () => Effect.succeed({ count: 0 }),
      tags: () => [createTag("counter")],
    });
    const summary = flow.view<CounterContext, CounterState, { readonly count: number }>({
      id: "counter.fixture-summary",
      sources: ["resources"],
      select: ({ resources }) => {
        const resource = Object.values(resources).find((entry) => entry.id === "counter.fixture");
        return {
          count: resource === undefined ? 0 : (resource.value as { readonly count: number }).count,
        };
      },
    });
    const app = flow.app({
      modules: [
        flow.module(
          "CounterFixtures",
          () => ({
            resources: { counter: counterResource },
            fixtures: {
              defaultCounter: [
                {
                  ref: counterResource.ref("main"),
                  value: { count: 64 },
                },
              ],
            },
          }),
          { fixtures: ["defaultCounter"] },
        ),
      ],
    });

    const harness = flowTest.app(app).seedModuleFixtures().start(counterMachine);

    expect(harness.cache().query("counter.fixture")).toMatchObject({
      id: "counter.fixture",
      status: "success",
      value: { count: 64 },
    });
    expect(selectView(harness.snapshot(), summary)).toEqual({ count: 64 });

    const emptyHarness = flowTest
      .app(app)
      .seedModuleFixtures("missingFixture")
      .start(counterMachine);
    expect(emptyHarness.cache().query("counter.fixture")).toBeNull();
  });

  it("preserves store and orchestrator descriptors on app layers", () => {
    const app = flow.app({ modules: [flow.module("Counter", () => ({ counterMachine }))] });
    const store = flow.store.memory({ namespace: "counter" });
    const orchestrators = flow.orchestrators.test({ deterministic: true });

    const layer = app.layer({ store, orchestrators });

    expect(layer.flowAppLayer).toMatchObject({
      kind: "app-layer",
      store,
      orchestrators,
      services: [],
    });
  });

  it("creates runtime-real ResourceStore and OrchestratorSystem handles from app layers", async () => {
    const counterResource = flow.resource<[string], { readonly count: number }>({
      id: "counter.byId",
      key: (id) => createKey("counter", id),
      lookup: () => Effect.succeed({ count: 0 }),
    });
    type CounterEvent = ({ readonly type: "INC" } | { readonly type: "READY" }) & FlowEvent;
    const counterActor = flow.machine<{ readonly count: number }, CounterEvent, "ready">({
      id: "Counter.actor",
      initial: "ready",
      context: () => ({ count: 0 }),
      states: {
        ready: {
          on: {
            INC: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });
    const app = flow.app({
      modules: [
        flow.module("Counter", () => ({
          resources: { counter: counterResource },
          machines: { counter: counterActor },
        })),
      ],
    });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ deterministic: true }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
      }),
    );
    const seen: FlowResourceSnapshot[] = [];
    const counterRef = counterResource.ref("main");
    const counterKey = createKey("counter", "main");

    const unsubscribe = runtime.resources.subscribe(counterRef, (snapshot) => {
      seen.push(snapshot);
    });
    runtime.resources.seedResource(counterRef, { count: 1 });
    runtime.resources.patch(counterRef, (current) => ({ count: (current?.count ?? 0) + 1 }));

    expect(runtime.resources.get(counterRef)).toMatchObject({
      id: "counter.byId",
      key: counterKey.hash,
      status: "success",
      value: { count: 2 },
    });
    expect(seen.map((snapshot) => snapshot.value)).toEqual([{ count: 1 }, { count: 2 }]);

    unsubscribe();
    runtime.resources.patch(counterRef, () => ({ count: 3 }));
    expect(seen).toHaveLength(2);

    const actor = runtime.orchestrators.start(counterActor, {
      id: "counter:actor",
      policy: "keep-alive",
    });
    actor.send({ type: "INC" });

    expect(runtime.orchestrators.get("counter:actor")).toBe(actor);
    expect(runtime.orchestrators.snapshot("counter:actor")?.context).toEqual({ count: 1 });

    await runtime.orchestrators.stop("counter:actor");
    expect(runtime.orchestrators.get("counter:actor")).toBeNull();
  });

  it("keys seeded app resources by resource ref key instead of resource id", () => {
    const projectResource = flow.resource<[string], { readonly name: string }>({
      id: "project.byId",
      key: (id) => createKey("project", id),
      lookup: () => Effect.succeed({ name: "unused" }),
    });
    const app = flow.app({ modules: [flow.module("Project", () => ({ projectResource }))] });
    const alphaKey = createKey("project", "a");
    const betaKey = createKey("project", "b");

    const harness = flowTest
      .app(app)
      .seedResource(projectResource.ref("a"), { name: "Alpha" })
      .seedResource(projectResource.ref("b"), { name: "Beta" })
      .start(counterMachine);

    expect(harness.cache().get(alphaKey)).toMatchObject({
      id: "project.byId",
      key: alphaKey.hash,
      value: { name: "Alpha" },
    });
    expect(harness.cache().get(betaKey)).toMatchObject({
      id: "project.byId",
      key: betaKey.hash,
      value: { name: "Beta" },
    });
  });

  it("records preview mutation patches and rollback receipts as transaction proof", async () => {
    type SaveEvent =
      | ({ readonly type: "SAVE" } & FlowEvent)
      | ({ readonly type: "SAVE_FAILED"; readonly error: string } & FlowEvent);
    interface SaveContext {
      readonly draft: string;
    }
    const projectRef = flow.resource<[string], { readonly name: string }>({
      id: "project.byId",
      key: (id) => createKey("project", id),
      lookup: () => Effect.succeed({ name: "Atlas" }),
    });
    const save = createControlledEffect<{ readonly ok: true }, string>("save-project");
    const mutation = flow.mutation({
      id: "project.save",
      input: ({ context }: { readonly context: SaveContext }) => ({ name: context.draft }),
      effect: () => save.effect(),
      preview: {
        apply: ({ input }: { readonly input: { readonly name: string } }) => [
          {
            ref: projectRef.ref("launch-1"),
            replace: { name: input.name },
          },
        ],
      },
      routes: flow.outcomes<{ readonly ok: true }, string, SaveEvent>({
        failure: ["SAVE_FAILED", "error"],
      }),
    });
    const machine = flow.machine<SaveContext, SaveEvent, "editing" | "saving">({
      id: "preview-save",
      initial: "editing",
      context: () => ({ draft: "Atlas v2" }),
      states: {
        editing: {
          on: {
            SAVE: { target: "saving", submit: mutation },
          },
        },
        saving: {
          on: {
            SAVE_FAILED: "editing",
          },
        },
      },
    });

    const harness = flowTest
      .app(flow.app({ modules: [flow.module("Project", () => ({ projectRef, mutation }))] }))
      .seedResource(projectRef.ref("launch-1"), { name: "Atlas" })
      .start(machine)
      .send({ type: "SAVE" });

    expect(harness.cache().query("project.byId")).toMatchObject({
      value: { name: "Atlas v2" },
    });
    expect(harness.transactions().previewPatches("project.save")).toHaveLength(1);

    save.fail("conflict");
    await harness.flush();

    expect(harness.cache().query("project.byId")).toMatchObject({
      value: { name: "Atlas" },
    });
    expect(harness.transactions().rollbacks("project.save")).toHaveLength(1);
    expect(harness.state()).toBe("editing");
  });

  it("records checkout workflow API descriptors for paths, permissions, invariants, schemas, views, and persistence", () => {
    type CheckoutState = "draft" | "review";
    type CheckoutEvent =
      | ({ readonly type: "SUBMIT" } & FlowEvent)
      | ({ readonly type: "BACK" } & FlowEvent);
    interface CheckoutContext {
      readonly total: number;
      readonly role: "buyer" | "approver";
    }

    const reviewPath = createStatePath("checkout", "approval", "review");
    const permission = flow.permission<CheckoutContext, CheckoutEvent, CheckoutState>({
      id: "checkout.can-approve",
      description: "Only an assigned approver can submit a checkout decision.",
      path: reviewPath,
      event: "SUBMIT",
      meta: {
        commandLabel: "Submit",
      },
      check: ({ context }) =>
        context.role === "approver"
          ? { allowed: true }
          : { allowed: false, reason: "Approver role required." },
    });
    const invariant = flow.invariant<CheckoutContext, CheckoutEvent, CheckoutState>({
      id: "checkout.non-negative-total",
      description: "The checkout total must remain payable.",
      path: reviewPath,
      meta: {
        owner: "checkout",
      },
      check: ({ context }) => context.total >= 0,
      message: "Checkout total cannot be negative.",
      severity: "error",
    });
    const persist = flow.persist({
      id: "checkout.snapshot",
      version: 1,
      redact: (value: unknown) => value,
    });
    const schema = flow.schema({
      id: "checkout.context",
      version: 1,
    });
    const history = flow.history({
      id: "checkout.previous-step",
      depth: "shallow",
      target: reviewPath,
    });
    const view = flow.view({
      id: "checkout.summary",
      sources: ["context"],
      select: ({ context }: { readonly context: CheckoutContext }) => ({ total: context.total }),
    });

    expect(reviewPath).toEqual({
      kind: "statePath",
      segments: ["checkout", "approval", "review"],
      id: "checkout.approval.review",
    });
    expect(permission.kind).toBe("permission");
    expect(permission).toMatchObject({
      description: "Only an assigned approver can submit a checkout decision.",
      path: reviewPath,
      event: "SUBMIT",
      meta: {
        commandLabel: "Submit",
      },
    });
    expect(invariant).toMatchObject({
      kind: "invariant",
      id: "checkout.non-negative-total",
      path: reviewPath,
      severity: "error",
      meta: {
        owner: "checkout",
      },
    });
    expect(persist.kind).toBe("persist");
    expect(schema.kind).toBe("schema");
    expect(history.kind).toBe("history");
    expect(view.kind).toBe("view");
  });

  it("completes overlapping controlled effect attempts in start order", async () => {
    const work = createControlledEffect<number, never>("overlap");

    const first = runEffectExit(work.effect());
    const second = runEffectExit(work.effect());

    expect(work.state()).toEqual({ status: "running", attempts: 2 });

    work.succeed(1);
    await expect(first).resolves.toEqual({ status: "success", value: 1 });

    work.succeed(2);
    await expect(second).resolves.toEqual({ status: "success", value: 2 });
  });

  it("creates real Effect layers for service-backed tests", async () => {
    interface GreetingService {
      readonly greeting: Effect.Effect<string>;
    }

    class Greeting extends Context.Service<Greeting, GreetingService>()("Greeting") {}

    const greetingLayer = createTestLayer(Greeting, {
      greeting: Effect.succeed("hello from layer"),
    });

    expect(greetingLayer.kind).toBe("testLayer");
    await expect(
      runEffectWithLayerExit(
        Effect.gen(function* () {
          const service = yield* Greeting;
          return yield* service.greeting;
        }),
        greetingLayer.layer,
      ),
    ).resolves.toEqual({ status: "success", value: "hello from layer" });
  });

  it("creates partial Effect test layers that die on missing service methods", async () => {
    interface ProjectService {
      readonly load: (id: string) => Effect.Effect<string>;
      readonly save: (draft: string) => Effect.Effect<void>;
    }

    class Project extends Context.Service<Project, ProjectService>()("Project") {}

    const projectLayer = createPartialTestLayer(Project, {
      load: (id) => Effect.succeed(`loaded:${id}`),
    });

    await expect(
      runEffectWithLayerExit(
        Effect.gen(function* () {
          const service = yield* Project;
          return yield* service.load("launch-1");
        }),
        projectLayer.layer,
      ),
    ).resolves.toEqual({ status: "success", value: "loaded:launch-1" });

    const missingMethod = await runEffectWithLayerExit(
      Effect.gen(function* () {
        const service = yield* Project;
        return yield* service.save("draft");
      }),
      projectLayer.layer,
    );

    expect(missingMethod).toMatchObject({
      status: "defect",
      defect: expect.objectContaining({
        message: 'Missing test service method "Project.save".',
      }),
    });
  });

  it("creates fresh context for every actor from a context factory", () => {
    const actorA = createRuntime().createActor(counterMachine);
    const actorB = createRuntime().createActor(counterMachine);

    actorA.send({ type: "START" });
    actorA.send({ type: "ADD", amount: 5 });

    expect(actorA.getSnapshot().context).toEqual({
      count: 5,
      log: ["count:5"],
    });
    expect(actorB.getSnapshot().context).toEqual({
      count: 0,
      log: [],
    });
  });

  it("applies actor context overrides with partial values and updater functions", () => {
    const partialActor = createRuntime().createActor(counterMachine, {
      context: { count: 7 },
    });
    const updaterActor = createRuntime().createActor(counterMachine, {
      context: (context) => ({
        ...context,
        count: 11,
        log: ["seeded"],
      }),
    });

    expect(partialActor.getSnapshot().context).toEqual({
      count: 7,
      log: [],
    });
    expect(updaterActor.getSnapshot().context).toEqual({
      count: 11,
      log: ["seeded"],
    });
  });

  it("notifies subscribers and inspectors only for accepted transitions", () => {
    const inspected: Array<{ readonly eventType: string | null; readonly value: string }> = [];
    const actor = createRuntime({
      inspect: (snapshot, event) => {
        inspected.push({
          eventType: event?.type ?? null,
          value: snapshot.value,
        });
      },
    }).createActor(counterMachine);
    let notifications = 0;
    const unsubscribe = actor.subscribe(() => {
      notifications += 1;
    });

    actor.send({ type: "ADD", amount: 1 });
    expect(notifications).toBe(0);

    actor.send({ type: "START" });
    actor.send({ type: "ADD", amount: 2 });
    expect(notifications).toBe(2);

    unsubscribe();
    actor.send({ type: "RESET" });

    expect(notifications).toBe(2);
    expect(inspected).toEqual([
      { eventType: null, value: "idle" },
      { eventType: "START", value: "ready" },
      { eventType: "ADD", value: "ready" },
      { eventType: "RESET", value: "ready" },
    ]);
  });

  it("runs assign, effect actions, and plain actions in declared order", () => {
    const seen: string[] = [];
    const machine = flow.machine<CounterContext, CounterEvent, CounterState>({
      id: "action-order",
      initial: "ready",
      context: () => ({ count: 0, log: [] }),
      states: {
        idle: {},
        ready: {
          on: {
            ADD: {
              actions: [
                flow.assign<CounterContext, CounterEvent, CounterState>(({ context, event }) => ({
                  count: context.count + (event.type === "ADD" ? event.amount : 0),
                })),
                flow.action<CounterContext, CounterEvent, CounterState>(({ context, snapshot }) => {
                  seen.push(`${snapshot.value}:${context.count}`);
                }),
                ({ context }) => {
                  seen.push(`plain:${context.count}`);
                },
              ],
            },
          },
        },
      },
    });

    const actor = createRuntime().createActor(machine);
    actor.send({ type: "ADD", amount: 6 });

    expect(actor.getSnapshot().context.count).toBe(6);
    expect(seen).toEqual(["ready:6", "plain:6"]);
  });

  it("selects the first transition array item whose guard passes", () => {
    type RouteState = "checking" | "accepted" | "rejected";
    type RouteEvent =
      | ({ readonly type: "RESOLVE"; readonly score: number } & FlowEvent)
      | CounterEvent;
    interface RouteContext {
      readonly path: readonly string[];
    }

    const routeMachine = flow.machine<RouteContext, RouteEvent, RouteState>({
      id: "route",
      initial: "checking",
      context: () => ({ path: [] }),
      states: {
        checking: {
          on: {
            RESOLVE: [
              {
                target: "accepted",
                guard: ({ event }) => event.type === "RESOLVE" && event.score >= 80,
                update: ({ context }) => ({
                  path: [...context.path, "accepted"],
                }),
              },
              {
                target: "rejected",
                guard: ({ event }) => event.type === "RESOLVE" && event.score < 80,
                update: ({ context }) => ({
                  path: [...context.path, "rejected"],
                }),
              },
            ],
          },
        },
        accepted: {},
        rejected: {},
      },
    });

    const accepted = createRuntime().createActor(routeMachine);
    const rejected = createRuntime().createActor(routeMachine);
    const blocked = createRuntime().createActor(routeMachine);

    expect(accepted.can({ type: "RESOLVE", score: 90 })).toBe(true);
    accepted.send({ type: "RESOLVE", score: 90 });
    rejected.send({ type: "RESOLVE", score: 20 });

    const beforeBlocked = blocked.getSnapshot();
    blocked.send({ type: "RESOLVE", score: Number.NaN });

    expect(accepted.getSnapshot()).toMatchObject({
      value: "accepted",
      context: { path: ["accepted"] },
    });
    expect(rejected.getSnapshot()).toMatchObject({
      value: "rejected",
      context: { path: ["rejected"] },
    });
    expect(blocked.getSnapshot()).toBe(beforeBlocked);
  });
});
