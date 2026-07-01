import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./diagnostics.js";
import { flow } from "./index.js";
import { createRuntime } from "./runtime/contract-runtime.js";
import { flowTest } from "./testing.js";
import { applyMachineEvent, planMachineEvent } from "./machine-transition.js";

type WorkflowEvent =
  | Readonly<{ readonly type: "ADVANCE" }>
  | Readonly<{ readonly type: "STAMP"; readonly count: number }>
  | Readonly<{ readonly type: "SAVE" }>
  | Readonly<{ readonly type: "ACTION_ONLY" }>
  | Readonly<{ readonly type: "UNKNOWN" }>;

describe("machine transition planning and application", () => {
  it("uses the first matching guarded transition and applies pure updates", () => {
    const machine = flow.machine<
      { readonly count: number; readonly stamp: string },
      WorkflowEvent,
      "idle" | "ready" | "blocked"
    >({
      id: "machine.guarded-transition",
      initial: "idle",
      context: () => ({ count: 0, stamp: "initial" }),
      states: {
        idle: {
          on: {
            ADVANCE: [
              {
                target: "ready",
                guard: ({ context }) => context.count === 0,
                update: ({ context }) => ({ count: context.count + 1 }),
              },
              {
                target: "blocked",
                update: () => ({ stamp: "wrong-branch" }),
              },
            ],
            STAMP: {
              update: ({ event }) =>
                event.type === "STAMP" ? { stamp: `count:${event.count}` } : {},
            },
          },
        },
        ready: {},
        blocked: {},
      },
    });

    const harness = flowTest.start(machine).start();

    expect(flow.can(harness.snapshot(), { type: "ADVANCE" })).toBe(true);
    expect(harness.can({ type: "STAMP", count: 2 } as WorkflowEvent)).toBe(true);

    harness.send({ type: "ADVANCE" });
    expect(harness.state()).toBe("ready");
    expect(harness.context()).toEqual({
      count: 1,
      stamp: "initial",
    });
    expect(harness.snapshot().receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "machine:event", eventType: "ADVANCE" }),
        expect.objectContaining({ type: "machine:guard", result: "pass" }),
        expect.objectContaining({
          type: "machine:transition",
          from: "idle",
          to: "ready",
        }),
        expect.objectContaining({ type: "machine:update" }),
      ]),
    );
  });

  it("fails closed when guard inputs are missing instead of throwing", () => {
    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle" | "saving">({
      id: "machine.fail-closed-guard",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            SAVE: {
              target: "saving",
              guard: ({ resources }) =>
                (
                  resources.permissions as Readonly<{
                    readonly value: Readonly<{ readonly canSave: boolean }>;
                  }>
                ).value.canSave,
            },
          },
        },
        saving: {},
      },
    });

    const harness = flowTest.start(machine).start();

    expect(() => flow.can(harness.snapshot(), { type: "SAVE" })).not.toThrow();
    expect(flow.can(harness.snapshot(), { type: "SAVE" })).toBe(false);
    expect(harness.can({ type: "SAVE" })).toBe(false);

    harness.send({ type: "SAVE" });
    expect(harness.state()).toBe("idle");
    expect(harness.snapshot().receipts.at(-1)).toEqual(
      expect.objectContaining({ type: "machine:no-transition", eventType: "SAVE" }),
    );
  });

  it("preserves state and context for unhandled events", () => {
    const machine = flow.machine<
      { readonly count: number; readonly stamp: string },
      WorkflowEvent,
      "idle" | "ready"
    >({
      id: "machine.unhandled-event",
      initial: "idle",
      context: () => ({ count: 2, stamp: "stable" }),
      states: {
        idle: {
          on: {
            ADVANCE: { target: "ready" },
          },
        },
        ready: {},
      },
    });

    const harness = flowTest.start(machine).start();
    const before = harness.snapshot();

    expect(flow.can(before, { type: "UNKNOWN" })).toBe(false);
    harness.send({ type: "UNKNOWN" });

    expect(harness.state()).toBe("idle");
    expect(harness.context()).toEqual({
      count: 2,
      stamp: "stable",
    });
    expect(harness.snapshot().receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "machine:event", eventType: "UNKNOWN" }),
        expect.objectContaining({ type: "machine:no-transition", eventType: "UNKNOWN" }),
      ]),
    );
  });

  it("treats action-only transitions as legal without running actions during can", () => {
    const sideEffects: string[] = [];
    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle">({
      id: "machine.action-only",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ACTION_ONLY: {
              actions: ({ event }) => {
                sideEffects.push(event.type);
                return {
                  type: "domain:action-only",
                  eventType: event.type,
                };
              },
            },
          },
        },
      },
    });

    const harness = flowTest.start(machine).start();

    expect(flow.can(harness.snapshot(), { type: "ACTION_ONLY" })).toBe(true);
    expect(harness.can({ type: "ACTION_ONLY" })).toBe(true);
    expect(sideEffects).toEqual([]);

    harness.send({ type: "ACTION_ONLY" });
    expect(harness.state()).toBe("idle");
    expect(harness.context()).toEqual({ count: 0 });
    expect(sideEffects).toEqual(["ACTION_ONLY"]);
    expect(harness.snapshot().receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "machine:transition", from: "idle", to: "idle" }),
        expect.objectContaining({ type: "machine:action", phase: "transition" }),
        expect.objectContaining({ type: "domain:action-only", eventType: "ACTION_ONLY" }),
      ]),
    );
  });

  it("uses a deterministic default transition runtime clock when none is provided", () => {
    const machine = flow.machine<{}, Readonly<{ readonly type: "STAMP" }>, "idle" | "done">({
      id: "machine.default-clock",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            STAMP: {
              target: "done",
              actions: ({ runtime }) => ({
                type: "domain:stamp",
                now: runtime.now(),
              }),
            },
          },
        },
        done: {},
      },
    });

    const snapshot = applyMachineEvent(
      planMachineEvent(machine.getInitialSnapshot(), { type: "STAMP" }),
    );

    expect(snapshot.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "domain:stamp",
          now: 0,
        }),
      ]),
    );
  });

  it("runs exit, transition, and entry actions in deterministic order", () => {
    const observedOrder: string[] = [];
    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle" | "ready">({
      id: "machine.action-order",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          exit: ({ value, context }) => {
            observedOrder.push("exit");
            return { type: "domain:exit", value, count: context.count };
          },
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
              actions: [
                ({ value, context }) => {
                  observedOrder.push("transition:one");
                  return { type: "domain:transition-one", value, count: context.count };
                },
                ({ value, context }) => {
                  observedOrder.push("transition:two");
                  return { type: "domain:transition-two", value, count: context.count };
                },
              ],
            },
          },
        },
        ready: {
          entry: ({ value, context }) => {
            observedOrder.push("entry");
            return { type: "domain:entry", value, count: context.count };
          },
        },
      },
    });

    const harness = flowTest.start(machine).start();
    harness.send({ type: "ADVANCE" });
    const snapshot = harness.snapshot();
    const correlationId = snapshot.receipts.find(
      (receipt) => receipt.type === "machine:event" && receipt.eventType === "ADVANCE",
    )?.correlationId;

    expect(observedOrder).toEqual(["exit", "transition:one", "transition:two", "entry"]);
    expect(harness.state()).toBe("ready");
    expect(harness.context()).toEqual({ count: 1 });
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
      expect.objectContaining({ phase: "exit", index: 0, correlationId }),
      expect.objectContaining({ phase: "transition", index: 0, correlationId }),
      expect.objectContaining({ phase: "transition", index: 1, correlationId }),
      expect.objectContaining({ phase: "entry", index: 0, correlationId }),
    ]);
  });

  it("runs exit and entry actions for explicit reentering self-transitions", () => {
    const observed: string[] = [];
    const machine = flow.machine<{}, Readonly<{ readonly type: "RESTART" }>, "idle">({
      id: "machine.reenter-self-transition",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          entry: () => {
            observed.push("entry");
          },
          exit: () => {
            observed.push("exit");
          },
          on: {
            RESTART: {
              target: "idle",
              reenter: true,
            },
          },
        },
      },
    });

    const harness = flowTest.start(machine).start();
    observed.length = 0;

    harness.send({ type: "RESTART" });

    expect(observed).toEqual(["exit", "entry"]);
    expect(
      harness.snapshot().receipts.filter((receipt) => receipt.type === "machine:transition"),
    ).toEqual([expect.objectContaining({ from: "idle", to: "idle", reenter: true })]);
    expect(
      harness.snapshot().receipts.filter((receipt) => receipt.type === "machine:action"),
    ).toEqual([
      expect.objectContaining({ phase: "exit", index: 0 }),
      expect.objectContaining({ phase: "entry", index: 0 }),
    ]);
  });

  it("runs bounded always follow-up transitions as inspectable microsteps", () => {
    const observed: string[] = [];
    const machine = flow.machine<
      { readonly count: number; readonly lastEvent: string | null },
      WorkflowEvent,
      "idle" | "ready" | "done"
    >({
      id: "machine.always-follow-up",
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
            guard: ({ context, event }) => {
              observed.push(`guard:${event.type}:${context.count}`);
              return event.type === "ADVANCE" && context.count === 1;
            },
            target: "done",
            update: ({ context, event }) => ({
              count: context.count + 1,
              lastEvent: event.type,
            }),
            actions: ({ context, event, value }) => {
              observed.push(`action:${event.type}:${value}:${context.count}`);
              return {
                type: "domain:always",
                eventType: event.type,
                value,
                count: context.count,
              };
            },
          },
        },
        done: {},
      },
    });

    const harness = flowTest.start(machine).start();
    harness.send({ type: "ADVANCE" });
    const snapshot = harness.snapshot();
    const correlationId = snapshot.receipts.find(
      (receipt) => receipt.type === "machine:event" && receipt.eventType === "ADVANCE",
    )?.correlationId;

    expect(harness.state()).toBe("done");
    expect(harness.context()).toEqual({
      count: 2,
      lastEvent: "ADVANCE",
    });
    expect(observed).toEqual(["guard:ADVANCE:1", "action:ADVANCE:done:2"]);
    expect(correlationId).toEqual(expect.any(String));
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
  });

  it("bounds runaway always loops and records the truncation", () => {
    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle" | "looping">({
      id: "machine.always-limit",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "looping",
            },
          },
        },
        looping: {
          always: {
            guard: ({ context }) => context.count < 1_000,
            update: ({ context }) => ({ count: context.count + 1 }),
          },
        },
      },
    });

    const harness = flowTest.start(machine).start();
    harness.send({ type: "ADVANCE" });

    expect(harness.state()).toBe("looping");
    expect(harness.context()).toEqual({ count: 100 });
    expect(
      harness
        .snapshot()
        .receipts.filter(
          (receipt) => receipt.type === "machine:microstep" && receipt.trigger === "always",
        ),
    ).toHaveLength(100);
    expect(harness.snapshot().receipts.at(-1)).toEqual(
      expect.objectContaining({
        type: "machine:microstep-limit",
        trigger: "always",
        eventType: "ADVANCE",
        step: 101,
        limit: 100,
      }),
    );
  });

  it("drives runtime-owned actor snapshots through the same pure transition planner", async () => {
    const machine = flow.machine<
      { readonly count: number; readonly stamp: string },
      WorkflowEvent,
      "idle" | "ready"
    >({
      id: "machine.runtime-actor",
      initial: "idle",
      context: () => ({ count: 0, stamp: "initial" }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
            },
            STAMP: {
              update: ({ event }) =>
                event.type === "STAMP" ? { stamp: `count:${event.count}` } : {},
            },
          },
        },
        ready: {
          on: {
            STAMP: {
              update: ({ event }) =>
                event.type === "STAMP" ? { stamp: `count:${event.count}` } : {},
            },
          },
        },
      },
    });

    const actor = createRuntime().createActor(machine);
    let notifications = 0;
    const unsubscribe = actor.subscribe(() => {
      notifications += 1;
    });

    actor.send({ type: "ADVANCE" });
    expect(actor.getSnapshot().value).toBe("ready");
    expect(actor.getSnapshot().context).toEqual({
      count: 1,
      stamp: "initial",
    });

    actor.send({ type: "STAMP", count: 7 });
    expect(actor.getSnapshot().context).toEqual({
      count: 1,
      stamp: "count:7",
    });
    expect(notifications).toBe(2);
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "machine:transition", to: "ready" }),
        expect.objectContaining({ type: "machine:update" }),
      ]),
    );

    unsubscribe();
    await actor.dispose();
  });

  it("throws a tagged diagnostic from flowTest when a machine update throws", () => {
    const updateCause = new Error("update exploded");
    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle" | "ready">({
      id: "machine.throwing-update.flow-test",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: () => {
                throw updateCause;
              },
            },
          },
        },
        ready: {},
      },
    });

    const harness = flowTest.start(machine).start();
    let failure: unknown;
    try {
      harness.send({ type: "ADVANCE" });
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-MACHINE-001",
      title: "Machine callback 'update' threw for 'machine.throwing-update.flow-test'",
      debug: {
        callback: "update",
        cause: expect.objectContaining({
          message: "update exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        eventType: "ADVANCE",
        machineId: "machine.throwing-update.flow-test",
        state: "idle",
        step: 0,
        trigger: "event",
      },
    });
    expect(
      (failure as { debug?: { cause?: { stack?: string } } }).debug?.cause?.stack ?? "",
    ).toContain("update exploded");
    expect((failure as { cause?: unknown }).cause).toBe(updateCause);
  });

  it("throws a tagged runtime diagnostic when a machine action throws", async () => {
    const actionCause = new Error("actions.transition exploded");
    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle" | "ready">({
      id: "machine.throwing-action.runtime",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              actions: () => {
                throw actionCause;
              },
            },
          },
        },
        ready: {},
      },
    });

    const actor = createRuntime().createActor(machine);
    let failure: unknown;
    try {
      actor.send({ type: "ADVANCE" });
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-MACHINE-001",
      title: "Machine callback 'actions.transition' threw for 'machine.throwing-action.runtime'",
      debug: {
        callback: "actions.transition",
        cause: expect.objectContaining({
          message: "actions.transition exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        eventType: "ADVANCE",
        machineId: "machine.throwing-action.runtime",
        state: "ready",
        step: 0,
        trigger: "event",
      },
    });
    expect(
      (failure as { debug?: { cause?: { stack?: string } } }).debug?.cause?.stack ?? "",
    ).toContain("actions.transition exploded");
    expect((failure as { cause?: unknown }).cause).toBe(actionCause);

    await actor.dispose();
  });

  it("throws a tagged diagnostic when the machine context factory throws", () => {
    const contextCause = new Error("context exploded");
    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle">({
      id: "machine.throwing-context.snapshot",
      initial: "idle",
      context: () => {
        throw contextCause;
      },
      states: {
        idle: {},
      },
    });

    let failure: unknown;
    try {
      machine.getInitialSnapshot();
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-MACHINE-001",
      title: "Machine callback 'context' threw for 'machine.throwing-context.snapshot'",
      debug: {
        callback: "context",
        cause: expect.objectContaining({
          message: "context exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        machineId: "machine.throwing-context.snapshot",
      },
    });
    expect(
      (failure as { debug?: { cause?: { stack?: string } } }).debug?.cause?.stack ?? "",
    ).toContain("context exploded");
    expect((failure as { cause?: unknown }).cause).toBe(contextCause);
  });

  it("throws a tagged diagnostic from flowTest when the machine context factory throws", () => {
    const contextCause = new Error("context exploded");
    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle">({
      id: "machine.throwing-context.flow-test",
      initial: "idle",
      context: () => {
        throw contextCause;
      },
      states: {
        idle: {},
      },
    });

    let failure: unknown;
    try {
      flowTest.start(machine).start();
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-MACHINE-001",
      title: "Machine callback 'context' threw for 'machine.throwing-context.flow-test'",
      debug: {
        callback: "context",
        cause: expect.objectContaining({
          message: "context exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        machineId: "machine.throwing-context.flow-test",
      },
    });
    expect(
      (failure as { debug?: { cause?: { stack?: string } } }).debug?.cause?.stack ?? "",
    ).toContain("context exploded");
    expect((failure as { cause?: unknown }).cause).toBe(contextCause);
  });

  it("throws a tagged runtime diagnostic when the machine context factory throws", () => {
    const contextCause = new Error("context exploded");
    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle">({
      id: "machine.throwing-context.runtime",
      initial: "idle",
      context: () => {
        throw contextCause;
      },
      states: {
        idle: {},
      },
    });

    let failure: unknown;
    try {
      createRuntime().createActor(machine);
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-MACHINE-001",
      title: "Machine callback 'context' threw for 'machine.throwing-context.runtime'",
      debug: {
        callback: "context",
        cause: expect.objectContaining({
          message: "context exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        machineId: "machine.throwing-context.runtime",
      },
    });
    expect(
      (failure as { debug?: { cause?: { stack?: string } } }).debug?.cause?.stack ?? "",
    ).toContain("context exploded");
    expect((failure as { cause?: unknown }).cause).toBe(contextCause);
  });
});
