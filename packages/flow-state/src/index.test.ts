import { describe, expect, it } from "vite-plus/test";

import { createFlowPreview, createRuntime, flow, flowTest, packageInfo } from "./index";
import type { FlowEvent, FlowTransitionArgs } from "./index";

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
    expect(packageInfo.primitives).toEqual(["atom", "resource", "mutation", "machine"]);
  });

  it("keeps the Effect and XState smoke path compatible", () => {
    expect(createFlowPreview()).toEqual({
      label: "Effect + XState ready",
      initialState: "idle",
      primitives: ["atom", "resource", "mutation", "machine"],
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

  it("provides a synchronous test harness with flush support", () => {
    const harness = flowTest(counterMachine)
      .start({ context: { count: 2 } })
      .send({ type: "START" })
      .expectState("ready")
      .expectContext({ count: 2, log: [] })
      .expectCan({ type: "ADD", amount: 1 });

    harness
      .send({ type: "ADD", amount: 4 })
      .flush()
      .expectSnapshot({
        value: "ready",
        context: { count: 6, log: ["count:6"] },
        changed: true,
        event: { type: "ADD", amount: 4 },
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
