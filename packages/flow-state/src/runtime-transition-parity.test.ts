import { describe, expect, it } from "vite-plus/test";
import { TestClock } from "effect/testing";

import * as flow from "./index.js";
import { createRuntime } from "./runtime/contract-runtime.js";
import { flowTest } from "./testing.js";
import { createFocusedTestApp } from "./testing/focused-app.js";

describe("runtime transition parity", () => {
  it("matches an independent transition oracle across bounded event sequences", async () => {
    type OracleState = "cold" | "hot";
    type OracleEvent =
      | Readonly<{ readonly type: "START"; readonly amount: number }>
      | Readonly<{ readonly type: "BUMP" }>
      | Readonly<{ readonly type: "RESTART" }>;
    type OracleProjection = Readonly<{
      readonly value: OracleState;
      readonly count: number;
      readonly facts: ReadonlyArray<Readonly<Record<string, unknown>>>;
    }>;

    const stepOracle = (projection: OracleProjection, event: OracleEvent): OracleProjection => {
      if (projection.value === "cold" && event.type === "START" && event.amount > 0) {
        const count = projection.count + event.amount;
        return {
          value: "hot",
          count,
          facts: [
            ...projection.facts,
            { type: "oracle:exit", value: "cold", count: projection.count },
            { type: "oracle:transition", value: "hot", count },
            { type: "oracle:entry", value: "hot", count },
          ],
        };
      }

      if (projection.value === "hot" && event.type === "BUMP") {
        const count = projection.count + 1;
        return {
          value: "hot",
          count,
          facts: [...projection.facts, { type: "oracle:bump", value: "hot", count }],
        };
      }

      if (projection.value === "hot" && event.type === "RESTART") {
        return {
          value: "hot",
          count: 0,
          facts: [
            ...projection.facts,
            { type: "oracle:exit", value: "hot", count: projection.count },
            { type: "oracle:restart", value: "hot", count: 0 },
            { type: "oracle:entry", value: "hot", count: 0 },
          ],
        };
      }

      return projection;
    };
    const project = (
      snapshot: flow.FlowSnapshot<{ readonly count: number }, OracleState, OracleEvent>,
    ) => ({
      value: snapshot.value,
      count: snapshot.context.count,
      facts: snapshot.receipts
        .filter((receipt) => receipt.type.startsWith("oracle:"))
        .map(({ correlationId: _correlationId, timestamp: _timestamp, ...fact }) => fact),
    });

    const machine = flow.machine<{ readonly count: number }, OracleEvent, OracleState>({
      id: "runtime-invokes.independent-transition-oracle",
      initial: "cold",
      context: () => ({ count: 0 }),
      states: {
        cold: {
          exit: ({ value, context }) => ({ type: "oracle:exit", value, count: context.count }),
          on: {
            START: {
              target: "hot",
              guard: ({ event }) => event.amount > 0,
              update: ({ context, event }) => ({ count: context.count + event.amount }),
              actions: ({ value, context }) => ({
                type: "oracle:transition",
                value,
                count: context.count,
              }),
            },
          },
        },
        hot: {
          entry: ({ value, context }) => ({
            type: "oracle:entry",
            value,
            count: context.count,
          }),
          exit: ({ value, context }) => ({ type: "oracle:exit", value, count: context.count }),
          on: {
            BUMP: {
              update: ({ context }) => ({ count: context.count + 1 }),
              actions: ({ value, context }) => ({
                type: "oracle:bump",
                value,
                count: context.count,
              }),
            },
            RESTART: {
              target: "hot",
              reenter: true,
              update: () => ({ count: 0 }),
              actions: ({ value, context }) => ({
                type: "oracle:restart",
                value,
                count: context.count,
              }),
            },
          },
        },
      },
    });
    const sequences: ReadonlyArray<ReadonlyArray<OracleEvent>> = [
      [{ type: "START", amount: 0 }],
      [{ type: "BUMP" }, { type: "START", amount: 2 }, { type: "BUMP" }],
      [
        { type: "START", amount: 3 },
        { type: "RESTART" },
        { type: "BUMP" },
        { type: "START", amount: 9 },
      ],
    ];

    for (const [index, events] of sequences.entries()) {
      const harness = flowTest(machine).start();
      const runtime = createRuntime(
        createFocusedTestApp(machine).layer({
          store: { kind: "store", mode: "test" },
          orchestrators: { kind: "orchestrators", mode: "test" },
        }),
      );
      const actor = runtime.createActor(machine, { id: `${machine.id}.${index}` });

      try {
        let expected: OracleProjection = { value: "cold", count: 0, facts: [] };
        for (const event of events) {
          expected = stepOracle(expected, event);
          harness.send(event);
          actor.send(event);
          expect(project(harness.getSnapshot())).toEqual(expected);
          expect(project(actor.getSnapshot())).toEqual(expected);
        }
      } finally {
        await actor.dispose();
        await runtime.dispose();
      }
    }
  });

  it("keeps accepted transition action order aligned between flowTest and a production runtime actor", async () => {
    type WorkflowEvent = Readonly<{ readonly type: "ADVANCE" }>;

    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle" | "ready">({
      id: "runtime-invokes.flow-test.action-order-runtime-alignment",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          exit: ({ value, context }) => ({
            type: "domain:exit",
            value,
            count: context.count,
          }),
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
              actions: [
                ({ value, context }) => ({
                  type: "domain:transition-one",
                  value,
                  count: context.count,
                }),
                ({ value, context }) => ({
                  type: "domain:transition-two",
                  value,
                  count: context.count,
                }),
              ],
            },
          },
        },
        ready: {
          entry: ({ value, context }) => ({
            type: "domain:entry",
            value,
            count: context.count,
          }),
        },
      },
    });

    const harness = flowTest(machine).start();
    const runtime = createRuntime(
      createFocusedTestApp(machine).layer({
        store: {
          kind: "store",
          mode: "test",
        },
        orchestrators: {
          kind: "orchestrators",
          mode: "test",
        },
      }),
    );
    const actor = runtime.createActor(machine, { id: machine.id });

    try {
      const event = { type: "ADVANCE" } as const;

      expect(flow.can(harness.getSnapshot(), event)).toBe(true);
      expect(flow.can(actor.getSnapshot(), event)).toBe(true);
      expect(harness.getSnapshot()).toEqual(actor.getSnapshot());
      expect(harness.receipts()).toEqual(actor.receipts());
      expect(harness.issues()).toEqual(actor.issues());

      harness.send(event);
      actor.send(event);

      expect(harness.getSnapshot()).toEqual(actor.getSnapshot());
      expect(harness.receipts()).toEqual(actor.receipts());
      expect(harness.issues()).toEqual(actor.issues());

      const snapshot = harness.getSnapshot();
      const correlationId = snapshot.receipts.find(
        (receipt) => receipt.type === "machine:event" && receipt.eventType === "ADVANCE",
      )?.correlationId;

      expect(snapshot.value).toBe("ready");
      expect(snapshot.context).toEqual({ count: 1 });
      expect(correlationId).toEqual(expect.any(String));
      expect(snapshot.receipts.filter((receipt) => receipt.type.startsWith("domain:"))).toEqual([
        expect.objectContaining({
          type: "domain:exit",
          value: "idle",
          count: 0,
          correlationId,
        }),
        expect.objectContaining({
          type: "domain:transition-one",
          value: "ready",
          count: 1,
          correlationId,
        }),
        expect.objectContaining({
          type: "domain:transition-two",
          value: "ready",
          count: 1,
          correlationId,
        }),
        expect.objectContaining({
          type: "domain:entry",
          value: "ready",
          count: 1,
          correlationId,
        }),
      ]);
      expect(snapshot.receipts.filter((receipt) => receipt.type === "machine:action")).toEqual([
        expect.objectContaining({
          phase: "exit",
          index: 0,
          transitionIndex: 0,
          from: "idle",
          to: "ready",
          correlationId,
        }),
        expect.objectContaining({
          phase: "transition",
          index: 0,
          transitionIndex: 0,
          from: "idle",
          to: "ready",
          correlationId,
        }),
        expect.objectContaining({
          phase: "transition",
          index: 1,
          transitionIndex: 0,
          from: "idle",
          to: "ready",
          correlationId,
        }),
        expect.objectContaining({
          phase: "entry",
          index: 0,
          transitionIndex: 0,
          from: "idle",
          to: "ready",
          correlationId,
        }),
      ]);
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  });

  it("keeps clock-sensitive guard rejection aligned between flowTest and a production runtime actor", async () => {
    type TimedGuardEvent = Readonly<{ readonly type: "FINISH" }>;

    const machine = flow.machine<{}, TimedGuardEvent, "waiting" | "done">({
      id: "runtime-invokes.flow-test.guard-clock-runtime-alignment",
      initial: "waiting",
      context: () => ({}),
      states: {
        waiting: {
          on: {
            FINISH: {
              target: "done",
              guard: ({ runtime }) => runtime.now() >= 1_000,
            },
          },
        },
        done: {},
      },
    });

    const harness = flowTest(machine)
      .clock(() => 1_000)
      .start();
    const runtime = createRuntime(
      createFocusedTestApp(machine).layer({
        store: {
          kind: "store",
          mode: "test",
        },
        orchestrators: {
          kind: "orchestrators",
          mode: "test",
        },
        services: [TestClock.layer()],
      }),
    );
    await runtime.runPromise(TestClock.setTime(1_000));
    const actor = runtime.createActor(machine, { id: machine.id });

    try {
      const event = { type: "FINISH" } as const;

      expect(flow.can(harness.getSnapshot(), event)).toBe(false);
      expect(flow.can(actor.getSnapshot(), event)).toBe(false);
      expect(harness.can(event)).toBe(false);
      expect(harness.getSnapshot()).toEqual(actor.getSnapshot());
      expect(harness.receipts()).toEqual(actor.receipts());
      expect(harness.issues()).toEqual(actor.issues());

      harness.send(event);
      actor.send(event);

      expect(harness.getSnapshot()).toEqual(actor.getSnapshot());
      expect(harness.receipts()).toEqual(actor.receipts());
      expect(harness.issues()).toEqual(actor.issues());
      expect(harness.state()).toBe("waiting");
      expect(harness.receipts()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "machine:guard",
            eventType: "FINISH",
            result: "fail",
          }),
          expect.objectContaining({
            type: "machine:no-transition",
            eventType: "FINISH",
          }),
        ]),
      );
      expect(harness.issues()).toEqual([]);
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  });

  it("keeps explicit self-reentry aligned between flowTest and a production runtime actor", async () => {
    type ReenterEvent = Readonly<{ readonly type: "RESTART" }>;

    const machine = flow.machine<{}, ReenterEvent, "idle">({
      id: "runtime-invokes.flow-test.reenter-runtime-alignment",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          entry: ({ value }) => ({
            type: "domain:entry",
            value,
          }),
          exit: ({ value }) => ({
            type: "domain:exit",
            value,
          }),
          on: {
            RESTART: {
              target: "idle",
              reenter: true,
            },
          },
        },
      },
    });

    const harness = flowTest(machine).start();
    const runtime = createRuntime(
      createFocusedTestApp(machine).layer({
        store: {
          kind: "store",
          mode: "test",
        },
        orchestrators: {
          kind: "orchestrators",
          mode: "test",
        },
      }),
    );
    const actor = runtime.createActor(machine, { id: machine.id });

    try {
      const event = { type: "RESTART" } as const;

      expect(flow.can(harness.getSnapshot(), event)).toBe(true);
      expect(flow.can(actor.getSnapshot(), event)).toBe(true);
      expect(harness.can(event)).toBe(true);
      expect(harness.getSnapshot()).toEqual(actor.getSnapshot());
      expect(harness.receipts()).toEqual(actor.receipts());
      expect(harness.issues()).toEqual(actor.issues());

      harness.send(event);
      actor.send(event);

      expect(harness.getSnapshot()).toEqual(actor.getSnapshot());
      expect(harness.receipts()).toEqual(actor.receipts());
      expect(harness.issues()).toEqual(actor.issues());
      expect(harness.state()).toBe("idle");

      const snapshot = harness.getSnapshot();
      const correlationId = snapshot.receipts.find(
        (receipt) => receipt.type === "machine:event" && receipt.eventType === "RESTART",
      )?.correlationId;

      expect(snapshot.receipts.filter((receipt) => receipt.type === "machine:transition")).toEqual([
        expect.objectContaining({
          from: "idle",
          to: "idle",
          reenter: true,
          correlationId,
        }),
      ]);
      expect(snapshot.receipts.filter((receipt) => receipt.type === "machine:action")).toEqual([
        expect.objectContaining({
          phase: "exit",
          index: 0,
          transitionIndex: 0,
          from: "idle",
          to: "idle",
          correlationId,
        }),
        expect.objectContaining({
          phase: "entry",
          index: 0,
          transitionIndex: 0,
          from: "idle",
          to: "idle",
          correlationId,
        }),
      ]);
      expect(snapshot.receipts.filter((receipt) => receipt.type.startsWith("domain:"))).toEqual([
        expect.objectContaining({
          type: "domain:exit",
          value: "idle",
          correlationId,
        }),
        expect.objectContaining({
          type: "domain:entry",
          value: "idle",
          correlationId,
        }),
      ]);
      expect(harness.issues()).toEqual([]);
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  });

  it("keeps always follow-up microsteps aligned between flowTest and a production runtime actor", async () => {
    type WorkflowEvent = Readonly<{ readonly type: "ADVANCE" }>;

    const machine = flow.machine<
      { readonly count: number; readonly lastEvent: string | null },
      WorkflowEvent,
      "idle" | "ready" | "done"
    >({
      id: "runtime-invokes.flow-test.always-runtime-alignment",
      initial: "idle",
      context: () => ({ count: 0, lastEvent: null }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
        ready: {
          always: {
            guard: ({ context, event }) => event.type === "ADVANCE" && context.count === 1,
            target: "done",
            update: ({ context, event }) => ({
              count: context.count + 1,
              lastEvent: event.type,
            }),
            actions: ({ context, event, value }) => ({
              type: "domain:always",
              eventType: event.type,
              value,
              count: context.count,
            }),
          },
        },
        done: {},
      },
    });

    const harness = flowTest(machine).start();
    const runtime = createRuntime(
      createFocusedTestApp(machine).layer({
        store: {
          kind: "store",
          mode: "test",
        },
        orchestrators: {
          kind: "orchestrators",
          mode: "test",
        },
      }),
    );
    const actor = runtime.createActor(machine, { id: machine.id });

    try {
      const event = { type: "ADVANCE" } as const;

      expect(flow.can(harness.getSnapshot(), event)).toBe(true);
      expect(flow.can(actor.getSnapshot(), event)).toBe(true);
      expect(harness.can(event)).toBe(true);
      expect(harness.getSnapshot()).toEqual(actor.getSnapshot());
      expect(harness.receipts()).toEqual(actor.receipts());
      expect(harness.issues()).toEqual(actor.issues());

      harness.send(event);
      actor.send(event);

      expect(harness.getSnapshot()).toEqual(actor.getSnapshot());
      expect(harness.receipts()).toEqual(actor.receipts());
      expect(harness.issues()).toEqual(actor.issues());
      expect(harness.state()).toBe("done");
      expect(harness.context()).toEqual({
        count: 2,
        lastEvent: "ADVANCE",
      });

      const snapshot = harness.getSnapshot();
      const correlationId = snapshot.receipts.find(
        (receipt) => receipt.type === "machine:event" && receipt.eventType === "ADVANCE",
      )?.correlationId;

      expect(snapshot.receipts.filter((receipt) => receipt.type === "machine:microstep")).toEqual([
        expect.objectContaining({
          type: "machine:microstep",
          trigger: "event",
          step: 0,
          eventType: "ADVANCE",
          from: "idle",
          to: "ready",
          correlationId,
        }),
        expect.objectContaining({
          type: "machine:microstep",
          trigger: "always",
          step: 1,
          eventType: "ADVANCE",
          from: "ready",
          to: "done",
          correlationId,
        }),
      ]);
      expect(snapshot.receipts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "machine:guard",
            trigger: "always",
            step: 1,
            result: "pass",
            from: "ready",
            target: "done",
            correlationId,
          }),
          expect.objectContaining({
            type: "machine:transition",
            trigger: "always",
            step: 1,
            from: "ready",
            to: "done",
            correlationId,
          }),
          expect.objectContaining({
            type: "machine:update",
            trigger: "always",
            step: 1,
            from: "ready",
            to: "done",
            correlationId,
          }),
          expect.objectContaining({
            type: "domain:always",
            eventType: "ADVANCE",
            value: "done",
            count: 2,
            correlationId,
          }),
        ]),
      );
      expect(harness.issues()).toEqual([]);
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  });

  it("keeps action-only self-transitions aligned between flowTest and a production runtime actor", async () => {
    type ActionOnlyEvent = Readonly<{ readonly type: "PING" }>;

    const machine = flow.machine<{}, ActionOnlyEvent, "idle">({
      id: "runtime-invokes.flow-test.action-only-runtime-alignment",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            PING: {
              actions: ({ event }) => ({
                type: "domain:ping",
                eventType: event.type,
              }),
            },
          },
        },
      },
    });

    const harness = flowTest(machine).start();
    const runtime = createRuntime(
      createFocusedTestApp(machine).layer({
        store: {
          kind: "store",
          mode: "test",
        },
        orchestrators: {
          kind: "orchestrators",
          mode: "test",
        },
      }),
    );
    const actor = runtime.createActor(machine, { id: machine.id });

    try {
      const event = { type: "PING" } as const;

      expect(flow.can(harness.getSnapshot(), event)).toBe(true);
      expect(flow.can(actor.getSnapshot(), event)).toBe(true);
      expect(harness.can(event)).toBe(true);
      expect(harness.getSnapshot()).toEqual(actor.getSnapshot());
      expect(harness.receipts()).toEqual(actor.receipts());
      expect(harness.issues()).toEqual(actor.issues());

      harness.send(event);
      actor.send(event);

      expect(harness.getSnapshot()).toEqual(actor.getSnapshot());
      expect(harness.receipts()).toEqual(actor.receipts());
      expect(harness.issues()).toEqual(actor.issues());
      expect(harness.state()).toBe("idle");
      expect(harness.receipts()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "machine:transition",
            from: "idle",
            to: "idle",
          }),
          expect.objectContaining({
            type: "machine:action",
            phase: "transition",
            from: "idle",
            to: "idle",
          }),
          expect.objectContaining({
            type: "domain:ping",
            eventType: "PING",
          }),
        ]),
      );
      expect(harness.issues()).toEqual([]);
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  });
});
