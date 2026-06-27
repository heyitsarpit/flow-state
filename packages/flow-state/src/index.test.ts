import { describe, expect, it } from "vite-plus/test";

import {
  createControlledEffect,
  createControlledStream,
  createFlowPreview,
  createKey,
  createRuntime,
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
import { Context, Effect } from "effect";
import type { FlowEvent, FlowQueryConfig, FlowTransitionArgs } from "./index";

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

    const saveMutation = flow.mutation({ id: "save", input: () => null, effect: Effect.void });
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
