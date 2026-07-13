import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { graphOf } from "./inspect.js";
import { FlowDiagnostic } from "./shared/diagnostics.js";
import { createControlledStream, flowTest, test } from "./testing.js";

type GuardedEvent =
  | Readonly<{ readonly type: "NEXT" }>
  | Readonly<{ readonly type: "ALLOW" }>
  | Readonly<{ readonly type: "PROCEED" }>;

function captureFlowDiagnostic(thunk: () => unknown): FlowDiagnostic {
  try {
    thunk();
  } catch (error) {
    if (error instanceof FlowDiagnostic) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected FlowDiagnostic");
}

describe("flowTest model paths", () => {
  it("generates shortest and simple paths from events allowed by flow.can", () => {
    const machine = flow.machine<
      { readonly allowed: boolean },
      GuardedEvent,
      "start" | "idle" | "done"
    >({
      id: "flow-test.model.guarded-paths",
      initial: "start",
      context: () => ({ allowed: false }),
      states: {
        start: {
          on: {
            NEXT: { target: "idle" },
          },
        },
        idle: {
          on: {
            ALLOW: {
              update: () => ({ allowed: true }),
            },
            PROCEED: {
              target: "done",
              guard: ({ context }) => context.allowed,
            },
          },
        },
        done: {},
      },
    });

    const model = test.model(machine);
    const expected = [["NEXT", "ALLOW", "PROCEED"]];

    expect(model.kind).toBe("model");
    expect(
      model.getShortestPaths().map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual(expected);
    expect(model.getSimplePaths().map((path) => path.steps.map((step) => step.event.type))).toEqual(
      expected,
    );
  });

  it("replays discovered model paths through the live harness", () => {
    const machine = flow.machine<
      { readonly allowed: boolean },
      GuardedEvent,
      "start" | "idle" | "done"
    >({
      id: "flow-test.model.replay",
      initial: "start",
      context: () => ({ allowed: false }),
      states: {
        start: {
          on: {
            NEXT: { target: "idle" },
          },
        },
        idle: {
          on: {
            ALLOW: {
              update: () => ({ allowed: true }),
            },
            PROCEED: {
              target: "done",
              guard: ({ context }) => context.allowed,
            },
          },
        },
        done: {},
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths()[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["NEXT", "ALLOW", "PROCEED"]);
    expect(harness.state()).toBe(path.state.value);
    expect(harness.context()).toEqual(path.state.context);
  });

  it("accepts explicit payload candidates when commands need runtime data", () => {
    type FormEvent =
      | Readonly<{ readonly type: "TYPE_NAME"; readonly name: string }>
      | Readonly<{ readonly type: "SUBMIT" }>;

    const machine = flow.machine<{ readonly name: string }, FormEvent, "editing" | "submitted">({
      id: "flow-test.model.payload-events",
      initial: "editing",
      context: () => ({ name: "" }),
      states: {
        editing: {
          on: {
            TYPE_NAME: {
              update: ({ event }) => (event.type === "TYPE_NAME" ? { name: event.name } : {}),
            },
            SUBMIT: {
              target: "submitted",
              guard: ({ context }) => context.name.trim().length > 0,
            },
          },
        },
        submitted: {},
      },
    });

    const paths = test.model(machine).getShortestPaths({
      events: [{ type: "TYPE_NAME", name: "Atlas" }, { type: "SUBMIT" }],
    });

    expect(paths.map((path) => path.steps.map((step) => step.event.type))).toEqual([
      ["TYPE_NAME", "SUBMIT"],
    ]);
    expect(paths[0]?.description).toBe(
      'Reaches state "submitted": TYPE_NAME ({"name":"Atlas"}) -> SUBMIT',
    );
  });

  it("replays model paths with seeded input", () => {
    type FormEvent =
      | Readonly<{ readonly type: "TYPE_NAME"; readonly name: string }>
      | Readonly<{ readonly type: "SUBMIT" }>;

    const machine = flow.machine<{ readonly name: string }, FormEvent, "editing" | "submitted">({
      id: "flow-test.model.replay-input",
      initial: "editing",
      context: () => ({ name: "" }),
      states: {
        editing: {
          on: {
            TYPE_NAME: {
              update: ({ event }) => (event.type === "TYPE_NAME" ? { name: event.name } : {}),
            },
            SUBMIT: {
              target: "submitted",
              guard: ({ context }) => context.name.trim().length > 0,
            },
          },
        },
        submitted: {},
      },
    });

    const model = test.model(machine, {
      input: {
        name: "Atlas",
      },
    });
    const path = model.getShortestPaths({
      events: [{ type: "SUBMIT" }],
    })[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["SUBMIT"]);
    expect(harness.state()).toBe("submitted");
    expect(harness.context()).toEqual({
      name: "Atlas",
    });
  });

  it("surfaces guard defects during model path discovery instead of treating them as blocked or falling through", () => {
    const cause = new Error("guard exploded");
    const fallbackActions: Array<string> = [];
    type GuardDefectEvent = Readonly<{ readonly type: "SAVE" }>;

    const machine = flow.machine<
      { readonly count: number },
      GuardDefectEvent,
      "idle" | "saving" | "fallback"
    >({
      id: "flow-test.model.guard-defect",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            SAVE: [
              {
                target: "saving",
                guard: () => {
                  throw cause;
                },
              },
              {
                target: "fallback",
                actions: ({ event }) => {
                  fallbackActions.push(event.type);
                },
              },
            ],
          },
        },
        saving: {},
        fallback: {},
      },
    });

    const model = test.model(machine);
    const shortestFailure = captureFlowDiagnostic(() =>
      model.getShortestPaths({
        events: [{ type: "SAVE" }],
      }),
    );
    const simpleFailure = captureFlowDiagnostic(() =>
      model.getSimplePaths({
        events: [{ type: "SAVE" }],
      }),
    );

    for (const failure of [shortestFailure, simpleFailure]) {
      expect(failure).toMatchObject({
        code: "FLOW-MACHINE-001",
        debug: {
          callback: "guard",
          eventType: "SAVE",
          machineId: "flow-test.model.guard-defect",
          state: "idle",
          step: 0,
          trigger: "event",
        },
      });
      expect(failure.cause).toBe(cause);
    }

    expect(fallbackActions).toEqual([]);
  });

  it("keeps model path discovery aligned with a clocked harness for time-sensitive guards", () => {
    type TimedGuardEvent = Readonly<{ readonly type: "FINISH" }>;

    const machine = flow.machine<{}, TimedGuardEvent, "waiting" | "done">({
      id: "flow-test.model.guard-clock-parity",
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

    const model = test.model(machine);
    const harness = flowTest(machine)
      .clock(() => 1_000)
      .start();

    expect(
      model
        .getShortestPaths({
          events: [{ type: "FINISH" }],
        })
        .map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual([[]]);
    expect(
      model
        .getSimplePaths({
          events: [{ type: "FINISH" }],
        })
        .map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual([[]]);
    expect(flow.can(harness.snapshot(), { type: "FINISH" })).toBe(false);
    expect(harness.can({ type: "FINISH" })).toBe(false);

    harness.send({ type: "FINISH" });

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
  });

  it("models always follow-up microsteps within a discovered accepted event path", () => {
    type WorkflowEvent = Readonly<{ readonly type: "ADVANCE" }>;
    const observed: string[] = [];

    const machine = flow.machine<
      { readonly count: number; readonly lastEvent: string | null },
      WorkflowEvent,
      "idle" | "ready" | "done"
    >({
      id: "flow-test.model.always-follow-up",
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

    const model = test.model(machine);
    const path = model.getShortestPaths({
      toState: (snapshot) => snapshot.value === "done",
    })[0]!;

    expect(observed).toEqual(["guard:ADVANCE:1", "action:ADVANCE:done:2"]);

    observed.length = 0;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["ADVANCE"]);
    expect(path.state.value).toBe("done");
    expect(path.state.context).toEqual({
      count: 2,
      lastEvent: "ADVANCE",
    });
    expect(observed).toEqual(["guard:ADVANCE:1", "action:ADVANCE:done:2"]);
    expect(path.state.receipts.filter((receipt) => receipt.type === "machine:microstep")).toEqual([
      expect.objectContaining({
        type: "machine:microstep",
        trigger: "event",
        step: 0,
        eventType: "ADVANCE",
        from: "idle",
        to: "ready",
      }),
      expect.objectContaining({
        type: "machine:microstep",
        trigger: "always",
        step: 1,
        eventType: "ADVANCE",
        from: "ready",
        to: "done",
      }),
    ]);
    expect(path.state.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "machine:guard",
          trigger: "always",
          step: 1,
          result: "pass",
          from: "ready",
          target: "done",
        }),
        expect.objectContaining({
          type: "machine:transition",
          trigger: "always",
          step: 1,
          from: "ready",
          to: "done",
        }),
        expect.objectContaining({
          type: "machine:update",
          trigger: "always",
          step: 1,
          from: "ready",
          to: "done",
        }),
        expect.objectContaining({
          type: "domain:always",
          eventType: "ADVANCE",
          value: "done",
          count: 2,
        }),
      ]),
    );
    expect(harness.snapshot()).toEqual(path.state);
  });

  it("keeps always microstep-limit traversal aligned with the replayed harness", () => {
    type WorkflowEvent = Readonly<{ readonly type: "ADVANCE" }>;

    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle" | "looping">({
      id: "flow-test.model.always-limit",
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

    const model = test.model(machine);
    const path = model.getShortestPaths({
      toState: (snapshot) =>
        snapshot.receipts.some((receipt) => receipt.type === "machine:microstep-limit"),
    })[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["ADVANCE"]);
    expect(path.state.value).toBe("looping");
    expect(path.state.context).toEqual({ count: 100 });
    expect(path.state.receipts.at(-1)).toEqual(
      expect.objectContaining({
        type: "machine:microstep-limit",
        trigger: "always",
        eventType: "ADVANCE",
        step: 101,
        limit: 100,
      }),
    );
    expect(harness.snapshot()).toEqual(path.state);
  });

  it("keeps accepted reentering self-transitions in shortest and simple path discovery", () => {
    type ReenterEvent = Readonly<{ readonly type: "RESTART" }>;

    const machine = flow.machine<{}, ReenterEvent, "idle">({
      id: "flow-test.model.reenter-self-transition",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            RESTART: {
              target: "idle",
              reenter: true,
            },
          },
        },
      },
    });

    const model = test.model(machine);
    const expected = [["RESTART"]];

    expect(
      model.getShortestPaths().map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual(expected);
    expect(model.getSimplePaths().map((path) => path.steps.map((step) => step.event.type))).toEqual(
      expected,
    );

    const harness = model.replay(model.getShortestPaths()[0]!);

    expect(harness.state()).toBe("idle");
    expect(
      harness
        .receipts()
        .filter((receipt) => receipt.type === "machine:transition")
        .map((receipt) => receipt.reenter),
    ).toEqual([true]);
  });

  it("keeps accepted action-only self-transitions in shortest and simple path discovery", () => {
    type ActionOnlyEvent = Readonly<{ readonly type: "PING" }>;

    const machine = flow.machine<{}, ActionOnlyEvent, "idle">({
      id: "flow-test.model.action-only-self-transition",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            PING: {
              actions: () => ({
                type: "domain:ping",
              }),
            },
          },
        },
      },
    });

    const model = test.model(machine);
    const expected = [["PING"]];

    expect(
      model.getShortestPaths().map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual(expected);
    expect(model.getSimplePaths().map((path) => path.steps.map((step) => step.event.type))).toEqual(
      expected,
    );

    const harness = model.replay(model.getShortestPaths()[0]!);

    expect(harness.state()).toBe("idle");
    expect(harness.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "machine:transition",
          from: "idle",
          to: "idle",
        }),
        expect.objectContaining({
          type: "domain:ping",
        }),
      ]),
    );
  });

  it("models state-owned flow.run activation on state entry with pending transaction state and previewed resources", () => {
    type RunEvent = Readonly<{ readonly type: "SAVE" }> | Readonly<{ readonly type: "SAVED" }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.state-run.project",
      key: (projectId) => flow.createKey("flow-test.model.state-run.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const saveDraft = flow.transaction({
      id: "flow-test.model.state-run.save",
      params: ({
        context,
      }: {
        readonly context: { readonly draft: { readonly name: string } };
      }) => ({
        projectId: "project-1" as const,
        name: context.draft.name,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: params.name,
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const machine = flow.machine<
      { readonly draft: { readonly name: string } },
      RunEvent,
      "idle" | "saving"
    >({
      id: "flow-test.model.state-run",
      initial: "idle",
      context: () => ({
        draft: { name: "Draft v1" },
      }),
      states: {
        idle: {
          on: {
            SAVE: {
              target: "saving",
            },
          },
        },
        saving: {
          invoke: flow.run(saveDraft),
        },
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths()[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["SAVE"]);
    expect(path.state.value).toBe("saving");
    expect(path.state.resources).toEqual({
      "flow-test.model.state-run.project": {
        id: "flow-test.model.state-run.project",
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        value: {
          name: "Draft v1",
        },
        isPlaceholderData: false,
      },
    });
    expect(path.state.transactions).toEqual({
      "flow-test.model.state-run.save": {
        id: "flow-test.model.state-run.save",
        status: "pending",
      },
    });
    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining([
        "machine:transition",
        "transaction:start",
        "transaction:preview-patch",
      ]),
    );
    expect(
      path.state.receipts.filter((receipt) => receipt.type === "transaction:preview-patch"),
    ).toHaveLength(1);
    expect(harness.state()).toBe(path.state.value);
    expect(harness.context()).toEqual(path.state.context);
    expect(harness.snapshot().resources).toEqual(path.state.resources);
    expect(harness.snapshot().transactions).toEqual(path.state.transactions);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
  });

  it("models state-owned flow.run interruption when a transition leaves the owning state", () => {
    type RunEvent = Readonly<{ readonly type: "START" } | { readonly type: "STOP" }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.state-run.stop.project",
      key: (projectId) => flow.createKey("flow-test.model.state-run.stop.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const saveDraft = flow.transaction({
      id: "flow-test.model.state-run.stop.save",
      params: ({
        context,
      }: {
        readonly context: { readonly draft: { readonly name: string } };
      }) => ({
        projectId: "project-1" as const,
        name: context.draft.name,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: params.name,
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const machine = flow.machine<
      { readonly draft: { readonly name: string } },
      RunEvent,
      "idle" | "saving"
    >({
      id: "flow-test.model.state-run.stop",
      initial: "idle",
      context: () => ({
        draft: { name: "Draft v1" },
      }),
      states: {
        idle: {
          on: {
            START: "saving",
          },
        },
        saving: {
          invoke: flow.run(saveDraft),
          on: {
            STOP: "idle",
          },
        },
      },
    });

    const model = test.model(machine);
    const path = graphOf(machine).pathFromEvents([{ type: "START" }, { type: "STOP" }]);
    const harness = model.replay(path!);

    expect(path).toBeDefined();
    expect(path!.state.value).toBe("idle");
    expect(path!.state.resources).toEqual(harness.snapshot().resources);
    expect(path!.state.transactions).toEqual(harness.snapshot().transactions);
    expect(path!.state.receipts.map((receipt) => receipt.type)).toEqual(
      harness.receipts().map((receipt) => receipt.type),
    );
    expect(harness.issues()).toEqual(path!.issues);
    expect(harness.issueSummary()).toEqual(path!.issueSummary);
  });

  it("models state-owned flow.run replacement before the next transaction generation starts", () => {
    type RunEvent = Readonly<{ readonly type: "START" } | { readonly type: "STOP" }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.state-run.restart.project",
      key: (projectId) => flow.createKey("flow-test.model.state-run.restart.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const saveDraft = flow.transaction({
      id: "flow-test.model.state-run.restart.save",
      params: ({
        context,
      }: {
        readonly context: { readonly draft: { readonly name: string } };
      }) => ({
        projectId: "project-1" as const,
        name: context.draft.name,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: params.name,
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const machine = flow.machine<
      { readonly draft: { readonly name: string } },
      RunEvent,
      "idle" | "saving"
    >({
      id: "flow-test.model.state-run.restart",
      initial: "idle",
      context: () => ({
        draft: { name: "Draft v1" },
      }),
      states: {
        idle: {
          on: {
            START: "saving",
          },
        },
        saving: {
          invoke: flow.run(saveDraft),
          on: {
            STOP: "idle",
          },
        },
      },
    });

    const model = test.model(machine);
    const path = graphOf(machine).pathFromEvents([
      { type: "START" },
      { type: "STOP" },
      { type: "START" },
    ]);
    const harness = model.replay(path!);

    expect(path).toBeDefined();
    expect(path!.state.value).toBe("saving");
    expect(path!.state.resources).toEqual(harness.snapshot().resources);
    expect(path!.state.transactions).toEqual(harness.snapshot().transactions);
    expect(path!.state.receipts.map((receipt) => receipt.type)).toEqual(
      harness.receipts().map((receipt) => receipt.type),
    );
    expect(harness.issues()).toEqual(path!.issues);
    expect(harness.issueSummary()).toEqual(path!.issueSummary);
  });

  it("models state-owned flow.after activation on state entry with a scheduled timer snapshot", () => {
    type TimerEvent = Readonly<{ readonly type: "START" }>;

    const machine = flow.machine<{}, TimerEvent, "idle" | "waiting" | "done">({
      id: "flow-test.model.state-after",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: {
              target: "waiting",
            },
          },
        },
        waiting: {
          after: flow.after({
            id: "flow-test.model.state-after.timer",
            delay: "2 seconds",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths()[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(path.state.value).toBe("waiting");
    expect(path.state.timers).toEqual({
      "flow-test.model.state-after.timer": {
        id: "flow-test.model.state-after.timer",
        status: "scheduled",
        generation: 1,
        parentState: "waiting",
        startedAt: 0,
        dueAt: 2_000,
      },
    });
    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining(["machine:transition", "timer:start"]),
    );
    expect(harness.snapshot().timers).toEqual(path.state.timers);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
  });

  it("models state-owned flow.after interruption when a transition leaves the owning state", () => {
    type TimerEvent = Readonly<{ readonly type: "START" } | { readonly type: "CANCEL" }>;

    const machine = flow.machine<{}, TimerEvent, "idle" | "waiting" | "cancelled">({
      id: "flow-test.model.state-after.stop",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "waiting",
          },
        },
        waiting: {
          after: flow.after({
            id: "flow-test.model.state-after.stop.timer",
            delay: "2 seconds",
            target: "cancelled",
          }),
          on: {
            CANCEL: "cancelled",
          },
        },
        cancelled: {},
      },
    });

    const model = test.model(machine);
    const path = graphOf(machine).pathFromEvents([{ type: "START" }, { type: "CANCEL" }]);
    const harness = model.replay(path!);

    expect(path).toBeDefined();
    expect(path!.state.value).toBe("cancelled");
    expect(path!.state.timers).toEqual(harness.snapshot().timers);
    expect(path!.state.receipts.map((receipt) => receipt.type)).toEqual(
      harness.receipts().map((receipt) => receipt.type),
    );
  });

  it("models state-owned flow.after replacement before the next generation starts", () => {
    type TimerEvent = Readonly<
      { readonly type: "START" } | { readonly type: "CANCEL" } | { readonly type: "REARM" }
    >;

    const machine = flow.machine<{}, TimerEvent, "idle" | "waiting" | "cancelled">({
      id: "flow-test.model.state-after.restart",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "waiting",
          },
        },
        waiting: {
          after: flow.after({
            id: "flow-test.model.state-after.restart.timer",
            delay: "2 seconds",
            target: "cancelled",
          }),
          on: {
            CANCEL: "cancelled",
          },
        },
        cancelled: {
          on: {
            REARM: "waiting",
          },
        },
      },
    });

    const model = test.model(machine);
    const path = graphOf(machine).pathFromEvents([
      { type: "START" },
      { type: "CANCEL" },
      { type: "REARM" },
    ]);
    const harness = model.replay(path!);

    expect(path).toBeDefined();
    expect(path!.state.value).toBe("waiting");
    expect(path!.state.timers).toEqual(harness.snapshot().timers);
    expect(path!.state.receipts.map((receipt) => receipt.type)).toEqual(
      harness.receipts().map((receipt) => receipt.type),
    );
  });

  it("models state-owned flow.child activation on state entry with the active child snapshot", () => {
    type ParentEvent = Readonly<{ readonly type: "START" }>;

    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.model.state-child.worker",
      initial: "running",
      context: () => ({}),
      states: {
        running: {},
      },
    });

    const machine = flow.machine<{}, ParentEvent, "idle" | "running">({
      id: "flow-test.model.state-child.parent",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: {
              target: "running",
            },
          },
        },
        running: {
          invoke: flow.child({
            id: "child.worker",
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
        },
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths()[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(path.state.value).toBe("running");
    expect(path.state.children).toMatchObject({
      "child.worker": {
        id: "child.worker",
        actorId: "flow-test.model.state-child.parent/child.worker",
        status: "active",
        state: "running",
        parentState: "running",
        supervision: "stop-on-failure",
      },
    });
    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining(["machine:transition", "child:start"]),
    );
    expect(harness.snapshot().children).toMatchObject(path.state.children);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
  });

  it("models state-owned flow.child interruption when a transition leaves the owning state", () => {
    type ParentEvent = Readonly<{ readonly type: "START" } | { readonly type: "STOP" }>;

    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.model.state-child.stop.worker",
      initial: "running",
      context: () => ({}),
      states: {
        running: {},
      },
    });

    const machine = flow.machine<{}, ParentEvent, "idle" | "running">({
      id: "flow-test.model.state-child.stop.parent",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "running",
          },
        },
        running: {
          invoke: flow.child({
            id: "child.worker",
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
          on: {
            STOP: "idle",
          },
        },
      },
    });

    const model = test.model(machine);
    const path = graphOf(machine).pathFromEvents([{ type: "START" }, { type: "STOP" }]);
    const harness = model.replay(path!);

    expect(path).toBeDefined();
    expect(path!.state.value).toBe("idle");
    expect(path!.state.children).toEqual(harness.snapshot().children);
    expect(path!.state.receipts.map((receipt) => receipt.type)).toEqual(
      harness.receipts().map((receipt) => receipt.type),
    );
  });

  it("models state-owned flow.child replacement before the next child generation starts", () => {
    type ParentEvent = Readonly<{ readonly type: "START" } | { readonly type: "STOP" }>;

    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.model.state-child.restart.worker",
      initial: "running",
      context: () => ({}),
      states: {
        running: {},
      },
    });

    const machine = flow.machine<{}, ParentEvent, "idle" | "running">({
      id: "flow-test.model.state-child.restart.parent",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "running",
          },
        },
        running: {
          invoke: flow.child({
            id: "child.worker",
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
          on: {
            STOP: "idle",
          },
        },
      },
    });

    const model = test.model(machine);
    const path = graphOf(machine).pathFromEvents([
      { type: "START" },
      { type: "STOP" },
      { type: "START" },
    ]);
    const harness = model.replay(path!);

    expect(path).toBeDefined();
    expect(path!.state.value).toBe("running");
    expect(path!.state.children).toEqual(harness.snapshot().children);
    expect(path!.state.receipts.map((receipt) => receipt.type)).toEqual(
      harness.receipts().map((receipt) => receipt.type),
    );
  });

  it("models state-owned flow.stream activation on state entry with the running stream snapshot", () => {
    type StreamEvent = Readonly<{ readonly type: "START" }>;
    const tokens = createControlledStream<string>("flow-test.model.state-stream.tokens");

    const machine = flow.machine<{}, StreamEvent, "idle" | "streaming">({
      id: "flow-test.model.state-stream",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: {
              target: "streaming",
            },
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "state-stream.tokens",
            subscribe: () => tokens.stream(),
          }),
        },
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths()[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(path.state.value).toBe("streaming");
    expect(path.state.streams).toEqual({
      "state-stream.tokens": {
        id: "state-stream.tokens",
        status: "running",
        generation: 1,
        emitted: 0,
      },
    });
    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining(["machine:transition", "stream:start"]),
    );
    expect(harness.snapshot().streams).toEqual(path.state.streams);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
  });

  it("replays and flushes synchronous state-owned stream completion after the discovered path", async () => {
    type StreamEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "STREAM_DONE" }>;

    const machine = flow.machine<
      { readonly completed: boolean },
      StreamEvent,
      "idle" | "streaming" | "done"
    >({
      id: "flow-test.model.state-stream.flush",
      initial: "idle",
      context: () => ({
        completed: false,
      }),
      states: {
        idle: {
          on: {
            START: {
              target: "streaming",
            },
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "state-stream.flush",
            subscribe: () => Stream.empty,
            routes: {
              done: () => ({ type: "STREAM_DONE" }),
            },
          }),
          on: {
            STREAM_DONE: {
              target: "done",
              update: () => ({
                completed: true,
              }),
            },
          },
        },
        done: {},
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths({
      events: [{ type: "START" }],
    })[0]!;
    const immediateHarness = model.replay(path);
    const flushedHarness = await model.replayFlushed(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(path.state.value).toBe("streaming");
    expect(path.state.streams).toEqual({
      "state-stream.flush": {
        id: "state-stream.flush",
        status: "running",
        generation: 1,
        emitted: 0,
      },
    });
    expect(immediateHarness.state()).toBe("streaming");
    expect(immediateHarness.snapshot().streams).toEqual({
      "state-stream.flush": {
        id: "state-stream.flush",
        status: "running",
        generation: 1,
        emitted: 0,
      },
    });
    expect(flushedHarness.state()).toBe("done");
    expect(flushedHarness.context()).toEqual({
      completed: true,
    });
    expect(flushedHarness.snapshot().streams).toEqual({
      "state-stream.flush": {
        id: "state-stream.flush",
        status: "success",
        generation: 1,
        emitted: 0,
      },
    });
    expect(flushedHarness.receipts().map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining(["stream:start", "stream:done", "machine:transition"]),
    );
  });

  it("models synchronous state-owned stream done routing when sync success routes are enabled", async () => {
    type StreamEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "STREAM_DONE" }>;

    const machine = flow.machine<
      { readonly completed: boolean },
      StreamEvent,
      "idle" | "streaming" | "done"
    >({
      id: "flow-test.model.state-stream.sync-route",
      initial: "idle",
      context: () => ({
        completed: false,
      }),
      states: {
        idle: {
          on: {
            START: {
              target: "streaming",
            },
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "state-stream.sync-route",
            subscribe: () => Stream.empty,
            routes: {
              done: () => ({ type: "STREAM_DONE" }),
            },
          }),
          on: {
            STREAM_DONE: {
              target: "done",
              update: () => ({
                completed: true,
              }),
            },
          },
        },
        done: {},
      },
    });

    const model = test.model(machine);
    const immediatePath = model.getShortestPaths({
      events: [{ type: "START" }],
    })[0]!;
    const resolvedPath = model.getShortestPaths({
      events: [{ type: "START" }],
      resolveSyncSuccessRoutes: true,
    })[0]!;
    const flushedHarness = await model.replayFlushed(immediatePath);

    expect(immediatePath.state.value).toBe("streaming");
    expect(resolvedPath.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(resolvedPath.state.value).toBe("done");
    expect(resolvedPath.state.context).toEqual({
      completed: true,
    });
    expect(resolvedPath.state.streams).toEqual(flushedHarness.snapshot().streams);
    expect(resolvedPath.state.receipts.map((receipt) => receipt.type)).toEqual(
      flushedHarness.receipts().map((receipt) => receipt.type),
    );
  });

  it("models synchronous state-owned stream failure routing when sync success routes are enabled", async () => {
    type StreamEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "STREAM_FAILED"; readonly error: "offline" }>;

    const machine = flow.machine<
      { readonly failedWith: "offline" | null },
      StreamEvent,
      "idle" | "streaming" | "failed"
    >({
      id: "flow-test.model.state-stream.sync-failure-route",
      initial: "idle",
      context: () => ({
        failedWith: null,
      }),
      states: {
        idle: {
          on: {
            START: {
              target: "streaming",
            },
          },
        },
        streaming: {
          invoke: flow.stream<
            { readonly failedWith: "offline" | null },
            StreamEvent,
            void,
            never,
            "offline"
          >({
            id: "state-stream.sync-failure-route",
            subscribe: () => Stream.fail("offline"),
            routes: {
              failure: (error) => ({ type: "STREAM_FAILED", error }),
            },
          }),
          on: {
            STREAM_FAILED: {
              target: "failed",
              update: ({ event }) =>
                event.type === "STREAM_FAILED" ? { failedWith: event.error } : {},
            },
          },
        },
        failed: {},
      },
    });

    const model = test.model(machine);
    const immediatePath = model.getShortestPaths({
      events: [{ type: "START" }],
    })[0]!;
    const resolvedPath = model.getShortestPaths({
      events: [{ type: "START" }],
      resolveSyncSuccessRoutes: true,
    })[0]!;
    const flushedHarness = await model.replayFlushed(immediatePath);

    expect(immediatePath.state.value).toBe("streaming");
    expect(resolvedPath.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(resolvedPath.state.value).toBe("failed");
    expect(resolvedPath.state.context).toEqual({
      failedWith: "offline",
    });
    expect(resolvedPath.state.streams).toEqual(flushedHarness.snapshot().streams);
    expect(resolvedPath.state.receipts.map((receipt) => receipt.type)).toEqual(
      flushedHarness.receipts().map((receipt) => receipt.type),
    );
    expect(resolvedPath.issues).toEqual(flushedHarness.issues());
    expect(resolvedPath.issueSummary).toEqual(flushedHarness.issueSummary());
  });

  it("models synchronous state-owned stream interrupt routing when sync success routes are enabled", async () => {
    type StreamEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "STREAM_INTERRUPTED" }>;

    const machine = flow.machine<
      { readonly interrupted: boolean },
      StreamEvent,
      "idle" | "streaming" | "interrupted"
    >({
      id: "flow-test.model.state-stream.sync-interrupt-route",
      initial: "idle",
      context: () => ({
        interrupted: false,
      }),
      states: {
        idle: {
          on: {
            START: {
              target: "streaming",
            },
          },
        },
        streaming: {
          invoke: flow.stream<{ readonly interrupted: boolean }, StreamEvent, void, never, never>({
            id: "state-stream.sync-interrupt-route",
            subscribe: () => Stream.unwrap(Effect.interrupt),
            routes: {
              interrupt: () => ({ type: "STREAM_INTERRUPTED" as const }),
            },
          }),
          on: {
            STREAM_INTERRUPTED: {
              target: "interrupted",
              update: () => ({ interrupted: true }),
            },
          },
        },
        interrupted: {},
      },
    });

    const model = test.model(machine);
    const immediatePath = model.getShortestPaths({
      events: [{ type: "START" }],
    })[0]!;
    const resolvedPath = model.getShortestPaths({
      events: [{ type: "START" }],
      resolveSyncSuccessRoutes: true,
    })[0]!;
    const flushedHarness = await model.replayFlushed(immediatePath);

    expect(immediatePath.state.value).toBe("streaming");
    expect(resolvedPath.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(resolvedPath.state.value).toBe("interrupted");
    expect(resolvedPath.state.context).toEqual({
      interrupted: true,
    });
    expect(resolvedPath.state.streams).toEqual(flushedHarness.snapshot().streams);
    expect(resolvedPath.state.receipts.map((receipt) => receipt.type)).toEqual(
      flushedHarness.receipts().map((receipt) => receipt.type),
    );
    expect(resolvedPath.issues).toHaveLength(1);
    expect(resolvedPath.issues[0]).toMatchObject({
      kind: flushedHarness.issues()[0]?.kind,
      source: flushedHarness.issues()[0]?.source,
      id: flushedHarness.issues()[0]?.id,
      facts: flushedHarness.issues()[0]?.facts,
    });
    const resolvedCause = (resolvedPath.issues[0] as { cause?: unknown } | undefined)?.cause as
      | Readonly<{ readonly reasons?: ReadonlyArray<unknown> }>
      | undefined;
    expect(resolvedCause).toBeDefined();
    expect(resolvedCause?.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ _tag: "Interrupt" })]),
    );
    expect(resolvedPath.issueSummary).toEqual(flushedHarness.issueSummary());
  });

  it("models synchronous state-owned stream defect routing when sync success routes are enabled", async () => {
    type StreamEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "STREAM_DEFECT" }>;

    const machine = flow.machine<
      { readonly defected: boolean },
      StreamEvent,
      "idle" | "streaming" | "defected"
    >({
      id: "flow-test.model.state-stream.sync-defect-route",
      initial: "idle",
      context: () => ({
        defected: false,
      }),
      states: {
        idle: {
          on: {
            START: {
              target: "streaming",
            },
          },
        },
        streaming: {
          invoke: flow.stream<{ readonly defected: boolean }, StreamEvent, void, never, never>({
            id: "state-stream.sync-defect-route",
            subscribe: () => Stream.unwrap(Effect.die("stream defect" as const)),
            routes: {
              defect: () => ({ type: "STREAM_DEFECT" as const }),
            },
          }),
          on: {
            STREAM_DEFECT: {
              target: "defected",
              update: () => ({ defected: true }),
            },
          },
        },
        defected: {},
      },
    });

    const model = test.model(machine);
    const immediatePath = model.getShortestPaths({
      events: [{ type: "START" }],
    })[0]!;
    const resolvedPath = model.getShortestPaths({
      events: [{ type: "START" }],
      resolveSyncSuccessRoutes: true,
    })[0]!;
    const flushedHarness = await model.replayFlushed(immediatePath);

    expect(immediatePath.state.value).toBe("streaming");
    expect(resolvedPath.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(resolvedPath.state.value).toBe("defected");
    expect(resolvedPath.state.context).toEqual({
      defected: true,
    });
    expect(resolvedPath.state.streams).toEqual(flushedHarness.snapshot().streams);
    expect(resolvedPath.state.receipts.map((receipt) => receipt.type)).toEqual(
      flushedHarness.receipts().map((receipt) => receipt.type),
    );
    expect(resolvedPath.issues).toEqual(flushedHarness.issues());
    expect(resolvedPath.issueSummary).toEqual(flushedHarness.issueSummary());
  });

  it("models state-owned stream interruption when a transition leaves the owning state", () => {
    const tokens = createControlledStream<string>("flow-test.model.state-stream.stop");

    const machine = flow.machine<
      { readonly partial: string },
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "STOP" }>
      | Readonly<{ readonly type: "TOKEN"; readonly token: string }>,
      "idle" | "streaming"
    >({
      id: "flow-test.model.state-stream.stop",
      initial: "idle",
      context: () => ({
        partial: "",
      }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "state-stream.stop",
            subscribe: () => tokens.stream(),
            routes: {
              value: (token) => ({ type: "TOKEN", token }),
            },
          }),
          on: {
            STOP: "idle",
            TOKEN: {
              update: ({ context, event }) =>
                event.type === "TOKEN" ? { partial: `${context.partial}${event.token}` } : {},
            },
          },
        },
      },
    });

    const model = test.model(machine);
    const path = graphOf(machine).pathFromEvents([{ type: "START" }, { type: "STOP" }]);
    const harness = model.replay(path!);

    expect(path).toBeDefined();
    expect(path!.state.value).toBe("idle");
    expect(path!.state.streams).toEqual(harness.snapshot().streams);
    expect(path!.state.receipts.map((receipt) => receipt.type)).toEqual(
      harness.receipts().map((receipt) => receipt.type),
    );
    expect(harness.issues()).toEqual(path!.issues);
    expect(harness.issueSummary()).toEqual(path!.issueSummary);
  });

  it("models state-owned stream replacement before the next generation starts", () => {
    const tokens = createControlledStream<string>("flow-test.model.state-stream.restart");

    const machine = flow.machine<
      { readonly partial: string },
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "STOP" }>
      | Readonly<{ readonly type: "TOKEN"; readonly token: string }>,
      "idle" | "streaming"
    >({
      id: "flow-test.model.state-stream.restart",
      initial: "idle",
      context: () => ({
        partial: "",
      }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "state-stream.restart",
            subscribe: () => tokens.stream(),
            routes: {
              value: (token) => ({ type: "TOKEN", token }),
            },
          }),
          on: {
            STOP: {
              target: "idle",
              update: () => ({
                partial: "",
              }),
            },
            TOKEN: {
              update: ({ context, event }) =>
                event.type === "TOKEN" ? { partial: `${context.partial}${event.token}` } : {},
            },
          },
        },
      },
    });

    const model = test.model(machine);
    const path = graphOf(machine).pathFromEvents([
      { type: "START" },
      { type: "STOP" },
      { type: "START" },
    ]);
    const harness = model.replay(path!);

    expect(path).toBeDefined();
    expect(path!.state.value).toBe("streaming");
    expect(path!.state.streams).toEqual(harness.snapshot().streams);
    expect(path!.state.receipts.map((receipt) => receipt.type)).toEqual(
      harness.receipts().map((receipt) => receipt.type),
    );
    expect(harness.issues()).toEqual(path!.issues);
    expect(harness.issueSummary()).toEqual(path!.issueSummary);
  });

  it("starts state-owned flow.run before event-owned submit when both activate on the same transition", () => {
    type DualStartEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{ readonly type: "SAVED" }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.dual-start.project",
      key: (projectId) => flow.createKey("flow-test.model.dual-start.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const stateOwnedSave = flow.transaction({
      id: "flow-test.model.dual-start.state-save",
      params: ({
        context,
      }: {
        readonly context: { readonly draft: { readonly name: string } };
      }) => ({
        projectId: "project-1" as const,
        name: context.draft.name,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: params.name,
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const eventOwnedAudit = flow.transaction({
      id: "flow-test.model.dual-start.event-audit",
      params: () => ({ reason: "event-submit" as const }),
      commit: () => Effect.never,
    });

    const machine = flow.machine<
      { readonly draft: { readonly name: string } },
      DualStartEvent,
      "idle" | "saving"
    >({
      id: "flow-test.model.dual-start",
      initial: "idle",
      context: () => ({
        draft: { name: "Draft v1" },
      }),
      states: {
        idle: {
          on: {
            SAVE: {
              target: "saving",
              submit: eventOwnedAudit,
            },
          },
        },
        saving: {
          invoke: flow.run(stateOwnedSave),
        },
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths()[0]!;
    const harness = model.replay(path);
    const transactionStarts = path.state.receipts.filter(
      (receipt) => receipt.type === "transaction:start",
    );

    expect(transactionStarts.map((receipt) => receipt.id)).toEqual([
      "flow-test.model.dual-start.state-save",
      "flow-test.model.dual-start.event-audit",
    ]);
    expect(path.state.transactions).toEqual({
      "flow-test.model.dual-start.state-save": {
        id: "flow-test.model.dual-start.state-save",
        status: "pending",
      },
      "flow-test.model.dual-start.event-audit": {
        id: "flow-test.model.dual-start.event-audit",
        status: "pending",
      },
    });
    expect(
      harness
        .receipts()
        .filter((receipt) => receipt.type === "transaction:start")
        .map((receipt) => receipt.id),
    ).toEqual(transactionStarts.map((receipt) => receipt.id));
  });

  it("models accepted submit self-transitions with the pending transaction snapshot", () => {
    type SubmitEvent = Readonly<{ readonly type: "SAVE" }>;

    const saveDraft = flow.transaction({
      id: "flow-test.model.submit-self-transition.save",
      commit: () => Effect.never,
    });

    const machine = flow.machine<{}, SubmitEvent, "editing">({
      id: "flow-test.model.submit-self-transition",
      initial: "editing",
      context: () => ({}),
      states: {
        editing: {
          on: {
            SAVE: {
              submit: saveDraft,
            },
          },
        },
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths({
      events: [{ type: "SAVE" }],
      maxDepth: 1,
    })[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["SAVE"]);
    expect(path.state.transactions).toEqual({
      "flow-test.model.submit-self-transition.save": {
        id: "flow-test.model.submit-self-transition.save",
        status: "pending",
      },
    });
    expect(harness.snapshot().transactions).toEqual(path.state.transactions);
  });

  it("keeps exploring same-state submit paths once the first accepted event installs pending work", () => {
    type SubmitEvent = Readonly<{ readonly type: "SAVE" }>;

    const saveDraft = flow.transaction({
      id: "flow-test.model.submit-follow-up.save",
      commit: () => Effect.never,
    });

    const machine = flow.machine<{}, SubmitEvent, "editing">({
      id: "flow-test.model.submit-follow-up",
      initial: "editing",
      context: () => ({}),
      states: {
        editing: {
          on: {
            SAVE: {
              submit: saveDraft,
            },
          },
        },
      },
    });

    const model = test.model(machine);
    const path = model
      .getSimplePaths({
        events: [{ type: "SAVE" }, { type: "SAVE" }],
      })
      .find((candidate) => candidate.steps.length === 2);
    const harness = path === undefined ? undefined : model.replay(path);

    expect(path).toBeDefined();
    expect(path?.steps.map((step) => step.event.type)).toEqual(["SAVE", "SAVE"]);
    expect(path?.state.transactions).toEqual({
      "flow-test.model.submit-follow-up.save": {
        id: "flow-test.model.submit-follow-up.save",
        status: "pending",
      },
    });
    expect(
      path?.state.receipts.filter((receipt) => receipt.type === "transaction:start"),
    ).toHaveLength(1);
    expect(path?.state.receipts.filter((receipt) => receipt.type === "transaction:reject")).toEqual(
      [
        expect.objectContaining({
          id: "flow-test.model.submit-follow-up.save",
          overlapCause: "reject-while-running",
          activeAttemptCount: 1,
          parentState: "editing",
        }),
      ],
    );
    expect(path?.issues).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "flow-test.model.submit-follow-up.save",
        facts: expect.objectContaining({
          correlationId: "flow-test.model.submit-follow-up:event:2",
          parentState: "editing",
        }),
      }),
    ]);
    expect(harness?.snapshot().transactions).toEqual(path?.state.transactions);
    expect(harness?.receipts().map((receipt) => receipt.type)).toEqual(
      path?.state.receipts.map((receipt) => receipt.type),
    );
    expect(harness?.issues()).toEqual(path?.issues);
    expect(harness?.issueSummary()).toEqual(path?.issueSummary);
  });

  it("keeps exploring same-state serialized submit paths when queue state lives only in receipts", () => {
    type SubmitEvent = Readonly<{ readonly type: "SAVE" }>;

    const saveDraft = flow.transaction({
      id: "flow-test.model.submit-serialize-follow-up.save",
      concurrency: "serialize" as const,
      commit: () => Effect.never,
    });

    const machine = flow.machine<{}, SubmitEvent, "editing">({
      id: "flow-test.model.submit-serialize-follow-up",
      initial: "editing",
      context: () => ({}),
      states: {
        editing: {
          on: {
            SAVE: {
              submit: saveDraft,
            },
          },
        },
      },
    });

    const model = test.model(machine);
    const path = model
      .getSimplePaths({
        events: [{ type: "SAVE" }, { type: "SAVE" }, { type: "SAVE" }],
      })
      .find((candidate) => candidate.steps.length === 3);
    const harness = path === undefined ? undefined : model.replay(path);

    expect(path).toBeDefined();
    expect(path?.steps.map((step) => step.event.type)).toEqual(["SAVE", "SAVE", "SAVE"]);
    expect(path?.state.transactions).toEqual({
      "flow-test.model.submit-serialize-follow-up.save": {
        id: "flow-test.model.submit-serialize-follow-up.save",
        status: "pending",
      },
    });
    expect(
      path?.state.receipts.filter((receipt) => receipt.type === "transaction:start"),
    ).toHaveLength(1);
    expect(path?.state.receipts.filter((receipt) => receipt.type === "transaction:queue")).toEqual([
      expect.objectContaining({
        queueKey: "flow-test.model.submit-serialize-follow-up.save",
        overlapCause: "active-attempt",
        parentState: "editing",
      }),
    ]);
    expect(path?.state.receipts.filter((receipt) => receipt.type === "transaction:reject")).toEqual(
      [
        expect.objectContaining({
          queueKey: "flow-test.model.submit-serialize-follow-up.save",
          overlapCause: "active-attempt",
          activeAttemptCount: 1,
          queuedAttemptCount: 1,
          queueCapacity: 1,
          parentState: "editing",
        }),
      ],
    );
    expect(path?.issues).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "flow-test.model.submit-serialize-follow-up.save",
        facts: expect.objectContaining({
          correlationId: "flow-test.model.submit-serialize-follow-up:event:3",
          parentState: "editing",
        }),
      }),
    ]);
    expect(harness?.snapshot().transactions).toEqual(path?.state.transactions);
    expect(harness?.receipts().map((receipt) => receipt.type)).toEqual(
      path?.state.receipts.map((receipt) => receipt.type),
    );
    expect(harness?.issues()).toEqual(path?.issues);
    expect(harness?.issueSummary()).toEqual(path?.issueSummary);
  });

  it("models accepted submit self-transitions with synchronous start receipts and previewed resources", () => {
    type SubmitEvent = Readonly<{ readonly type: "SAVE" }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.submit-preview.project",
      key: (projectId) => flow.createKey("flow-test.model.submit-preview.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const saveDraft = flow.transaction({
      id: "flow-test.model.submit-preview.save",
      params: () => ({
        projectId: "project-1" as const,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: "Draft v2",
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const machine = flow.machine<{}, SubmitEvent, "editing">({
      id: "flow-test.model.submit-preview",
      initial: "editing",
      context: () => ({}),
      states: {
        editing: {
          on: {
            SAVE: {
              submit: saveDraft,
            },
          },
        },
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths({
      events: [{ type: "SAVE" }],
      maxDepth: 1,
    })[0]!;
    const harness = model.replay(path);

    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining([
        "machine:transition",
        "transaction:start",
        "transaction:preview-patch",
      ]),
    );
    expect(path.state.resources).toEqual({
      "flow-test.model.submit-preview.project": {
        id: "flow-test.model.submit-preview.project",
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        value: {
          name: "Draft v2",
        },
        isPlaceholderData: false,
      },
    });
    expect(harness.snapshot().resources).toEqual(path.state.resources);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
  });

  it("replays and flushes synchronous transaction completion after the discovered path", async () => {
    type SubmitEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{
          readonly type: "SAVED";
          readonly project: { readonly id: "project-1"; readonly name: "Saved draft" };
        }>;

    const saveDraft = flow.transaction<
      void,
      { readonly id: "project-1"; readonly name: "Saved draft" },
      never,
      never,
      SubmitEvent
    >({
      id: "flow-test.model.submit-flush.save",
      commit: () =>
        Effect.succeed({
          id: "project-1" as const,
          name: "Saved draft" as const,
        }),
      routes: {
        success: ({ value }) => ({
          type: "SAVED" as const,
          project: value,
        }),
      },
    });

    const machine = flow.machine<
      { readonly savedProject: { readonly id: "project-1"; readonly name: "Saved draft" } | null },
      SubmitEvent,
      "editing" | "saving" | "done"
    >({
      id: "flow-test.model.submit-flush",
      initial: "editing",
      context: () => ({
        savedProject: null,
      }),
      states: {
        editing: {
          on: {
            SAVE: {
              target: "saving",
              submit: saveDraft,
            },
          },
        },
        saving: {
          on: {
            SAVED: {
              target: "done",
              update: ({ event }) =>
                event.type === "SAVED"
                  ? {
                      savedProject: event.project,
                    }
                  : {},
            },
          },
        },
        done: {},
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths({
      events: [{ type: "SAVE" }],
    })[0]!;
    const immediateHarness = model.replay(path);
    const flushedHarness = await model.replayFlushed(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["SAVE"]);
    expect(path.state.value).toBe("saving");
    expect(path.state.transactions).toEqual({
      "flow-test.model.submit-flush.save": {
        id: "flow-test.model.submit-flush.save",
        status: "pending",
      },
    });
    expect(immediateHarness.state()).toBe("saving");
    expect(immediateHarness.snapshot().transactions).toEqual({
      "flow-test.model.submit-flush.save": {
        id: "flow-test.model.submit-flush.save",
        status: "pending",
      },
    });
    expect(flushedHarness.state()).toBe("done");
    expect(flushedHarness.context()).toEqual({
      savedProject: {
        id: "project-1",
        name: "Saved draft",
      },
    });
    expect(flushedHarness.snapshot().transactions).toEqual({
      "flow-test.model.submit-flush.save": {
        id: "flow-test.model.submit-flush.save",
        status: "success",
        value: {
          id: "project-1",
          name: "Saved draft",
        },
      },
    });
    expect(flushedHarness.receipts().map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining(["transaction:start", "transaction:success", "machine:transition"]),
    );
    expect(flushedHarness.issues()).toEqual([]);
  });

  it("models synchronous state-owned flow.run success routing when sync success routes are enabled", async () => {
    type RunEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{
          readonly type: "SAVED";
          readonly project: { readonly id: "project-1"; readonly name: "Saved draft" };
        }>;

    const saveDraft = flow.transaction<
      void,
      { readonly id: "project-1"; readonly name: "Saved draft" },
      never,
      never,
      RunEvent
    >({
      id: "flow-test.model.run-sync-route.save",
      commit: () =>
        Effect.succeed({
          id: "project-1" as const,
          name: "Saved draft" as const,
        }),
      routes: {
        success: ({ value }) => ({
          type: "SAVED" as const,
          project: value,
        }),
      },
    });

    const machine = flow.machine<
      { readonly savedProject: { readonly id: "project-1"; readonly name: "Saved draft" } | null },
      RunEvent,
      "editing" | "saving" | "done"
    >({
      id: "flow-test.model.run-sync-route",
      initial: "editing",
      context: () => ({
        savedProject: null,
      }),
      states: {
        editing: {
          on: {
            START: {
              target: "saving",
            },
          },
        },
        saving: {
          invoke: flow.run(saveDraft),
          on: {
            SAVED: {
              target: "done",
              update: ({ event }) =>
                event.type === "SAVED"
                  ? {
                      savedProject: event.project,
                    }
                  : {},
            },
          },
        },
        done: {},
      },
    });

    const model = test.model(machine);
    const immediatePath = model.getShortestPaths({
      events: [{ type: "START" }],
    })[0]!;
    const resolvedPath = model.getShortestPaths({
      events: [{ type: "START" }],
      resolveSyncSuccessRoutes: true,
    })[0]!;
    const flushedHarness = await model.replayFlushed(immediatePath);

    expect(immediatePath.state.value).toBe("saving");
    expect(resolvedPath.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(resolvedPath.state.value).toBe("done");
    expect(resolvedPath.state.context).toEqual({
      savedProject: {
        id: "project-1",
        name: "Saved draft",
      },
    });
    expect(resolvedPath.state.transactions).toEqual(flushedHarness.snapshot().transactions);
    expect(resolvedPath.state.receipts.map((receipt) => receipt.type)).toEqual(
      flushedHarness.receipts().map((receipt) => receipt.type),
    );
    expect(resolvedPath.issues).toEqual(flushedHarness.issues());
  });

  it("models synchronous state-owned flow.run failure routing when sync success routes are enabled", async () => {
    type RunEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

    const saveDraft = flow.transaction<void, never, "conflict", never, RunEvent>({
      id: "flow-test.model.run-sync-failure-route.save",
      commit: () => Effect.fail("conflict" as const),
      routes: {
        failure: ({ error }) => ({
          type: "SAVE_FAILED" as const,
          error,
        }),
      },
    });

    const machine = flow.machine<
      { readonly saveError: "conflict" | null },
      RunEvent,
      "editing" | "saving" | "failed"
    >({
      id: "flow-test.model.run-sync-failure-route",
      initial: "editing",
      context: () => ({
        saveError: null,
      }),
      states: {
        editing: {
          on: {
            START: {
              target: "saving",
            },
          },
        },
        saving: {
          invoke: flow.run(saveDraft),
          on: {
            SAVE_FAILED: {
              target: "failed",
              update: ({ event }) =>
                event.type === "SAVE_FAILED" ? { saveError: event.error } : {},
            },
          },
        },
        failed: {},
      },
    });

    const model = test.model(machine);
    const immediatePath = model.getShortestPaths({
      events: [{ type: "START" }],
    })[0]!;
    const resolvedPath = model.getShortestPaths({
      events: [{ type: "START" }],
      resolveSyncSuccessRoutes: true,
    })[0]!;
    const flushedHarness = await model.replayFlushed(immediatePath);

    expect(immediatePath.state.value).toBe("saving");
    expect(resolvedPath.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(resolvedPath.state.value).toBe("failed");
    expect(resolvedPath.state.context).toEqual({
      saveError: "conflict",
    });
    expect(resolvedPath.state.transactions).toEqual(flushedHarness.snapshot().transactions);
    expect(resolvedPath.state.receipts.map((receipt) => receipt.type)).toEqual(
      flushedHarness.receipts().map((receipt) => receipt.type),
    );
    expect(resolvedPath.issues).toEqual(flushedHarness.issues());
    expect(resolvedPath.issueSummary).toEqual(flushedHarness.issueSummary());
  });

  it("models synchronous state-owned flow.run interrupt routing when sync success routes are enabled", async () => {
    type RunEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "SAVE_INTERRUPTED" }>;

    const saveDraft = flow.transaction<void, never, never, never, RunEvent>({
      id: "flow-test.model.run-sync-interrupt-route.save",
      commit: () => Effect.interrupt,
      routes: {
        interrupt: () => ({
          type: "SAVE_INTERRUPTED" as const,
        }),
      },
    });

    const machine = flow.machine<
      { readonly interrupted: boolean },
      RunEvent,
      "editing" | "saving" | "interrupted"
    >({
      id: "flow-test.model.run-sync-interrupt-route",
      initial: "editing",
      context: () => ({
        interrupted: false,
      }),
      states: {
        editing: {
          on: {
            START: {
              target: "saving",
            },
          },
        },
        saving: {
          invoke: flow.run(saveDraft),
          on: {
            SAVE_INTERRUPTED: {
              target: "interrupted",
              update: () => ({ interrupted: true }),
            },
          },
        },
        interrupted: {},
      },
    });

    const model = test.model(machine);
    const immediatePath = model.getShortestPaths({
      events: [{ type: "START" }],
    })[0]!;
    const resolvedPath = model.getShortestPaths({
      events: [{ type: "START" }],
      resolveSyncSuccessRoutes: true,
    })[0]!;
    const flushedHarness = await model.replayFlushed(immediatePath);

    expect(immediatePath.state.value).toBe("saving");
    expect(resolvedPath.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(resolvedPath.state.value).toBe("interrupted");
    expect(resolvedPath.state.context).toEqual({
      interrupted: true,
    });
    expect(resolvedPath.state.transactions).toEqual(flushedHarness.snapshot().transactions);
    expect(resolvedPath.state.receipts.map((receipt) => receipt.type)).toEqual(
      flushedHarness.receipts().map((receipt) => receipt.type),
    );
    expect(resolvedPath.issues).toHaveLength(1);
    expect(resolvedPath.issues[0]).toMatchObject({
      kind: flushedHarness.issues()[0]?.kind,
      source: flushedHarness.issues()[0]?.source,
      id: flushedHarness.issues()[0]?.id,
      handled: flushedHarness.issues()[0]?.handled,
      facts: flushedHarness.issues()[0]?.facts,
    });
    const resolvedCause = (resolvedPath.issues[0] as { cause?: unknown } | undefined)?.cause as
      | Readonly<{ readonly reasons?: ReadonlyArray<unknown> }>
      | undefined;
    expect(resolvedCause).toBeDefined();
    expect(resolvedCause?.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ _tag: "Interrupt" })]),
    );
    expect(resolvedPath.issueSummary).toEqual(flushedHarness.issueSummary());
  });

  it("models synchronous state-owned flow.run defect routing when sync success routes are enabled", async () => {
    type RunEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "SAVE_DEFECT" }>;

    const saveDraft = flow.transaction<void, never, never, never, RunEvent>({
      id: "flow-test.model.run-sync-defect-route.save",
      commit: () => Effect.die("save defect" as const),
      routes: {
        defect: () => ({
          type: "SAVE_DEFECT" as const,
        }),
      },
    });

    const machine = flow.machine<
      { readonly defected: boolean },
      RunEvent,
      "editing" | "saving" | "defected"
    >({
      id: "flow-test.model.run-sync-defect-route",
      initial: "editing",
      context: () => ({
        defected: false,
      }),
      states: {
        editing: {
          on: {
            START: {
              target: "saving",
            },
          },
        },
        saving: {
          invoke: flow.run(saveDraft),
          on: {
            SAVE_DEFECT: {
              target: "defected",
              update: () => ({ defected: true }),
            },
          },
        },
        defected: {},
      },
    });

    const model = test.model(machine);
    const immediatePath = model.getShortestPaths({
      events: [{ type: "START" }],
    })[0]!;
    const resolvedPath = model.getShortestPaths({
      events: [{ type: "START" }],
      resolveSyncSuccessRoutes: true,
    })[0]!;
    const flushedHarness = await model.replayFlushed(immediatePath);

    expect(immediatePath.state.value).toBe("saving");
    expect(resolvedPath.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(resolvedPath.state.value).toBe("defected");
    expect(resolvedPath.state.context).toEqual({
      defected: true,
    });
    expect(resolvedPath.state.transactions).toEqual(flushedHarness.snapshot().transactions);
    expect(resolvedPath.state.receipts.map((receipt) => receipt.type)).toEqual(
      flushedHarness.receipts().map((receipt) => receipt.type),
    );
    expect(resolvedPath.issues).toEqual(flushedHarness.issues());
    expect(resolvedPath.issueSummary).toEqual(flushedHarness.issueSummary());
  });

  it("models synchronous transaction success routing when sync success routes are enabled", async () => {
    type SubmitEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{
          readonly type: "SAVED";
          readonly project: { readonly id: "project-1"; readonly name: "Saved draft" };
        }>;

    const saveDraft = flow.transaction<
      void,
      { readonly id: "project-1"; readonly name: "Saved draft" },
      never,
      never,
      SubmitEvent
    >({
      id: "flow-test.model.submit-sync-route.save",
      commit: () =>
        Effect.succeed({
          id: "project-1" as const,
          name: "Saved draft" as const,
        }),
      routes: {
        success: ({ value }) => ({
          type: "SAVED" as const,
          project: value,
        }),
      },
    });

    const machine = flow.machine<
      { readonly savedProject: { readonly id: "project-1"; readonly name: "Saved draft" } | null },
      SubmitEvent,
      "editing" | "saving" | "done"
    >({
      id: "flow-test.model.submit-sync-route",
      initial: "editing",
      context: () => ({
        savedProject: null,
      }),
      states: {
        editing: {
          on: {
            SAVE: {
              target: "saving",
              submit: saveDraft,
            },
          },
        },
        saving: {
          on: {
            SAVED: {
              target: "done",
              update: ({ event }) =>
                event.type === "SAVED"
                  ? {
                      savedProject: event.project,
                    }
                  : {},
            },
          },
        },
        done: {},
      },
    });

    const model = test.model(machine);
    const immediatePath = model.getShortestPaths({
      events: [{ type: "SAVE" }],
    })[0]!;
    const resolvedPath = model.getShortestPaths({
      events: [{ type: "SAVE" }],
      resolveSyncSuccessRoutes: true,
    })[0]!;
    const flushedHarness = await model.replayFlushed(immediatePath);

    expect(immediatePath.state.value).toBe("saving");
    expect(resolvedPath.steps.map((step) => step.event.type)).toEqual(["SAVE"]);
    expect(resolvedPath.state.value).toBe("done");
    expect(resolvedPath.state.context).toEqual({
      savedProject: {
        id: "project-1",
        name: "Saved draft",
      },
    });
    expect(resolvedPath.state.transactions).toEqual(flushedHarness.snapshot().transactions);
    expect(resolvedPath.state.receipts.map((receipt) => receipt.type)).toEqual(
      flushedHarness.receipts().map((receipt) => receipt.type),
    );
    expect(resolvedPath.issues).toEqual(flushedHarness.issues());
  });

  it("models synchronous transaction failure routing when sync success routes are enabled", async () => {
    type SubmitEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

    const saveDraft = flow.transaction<void, never, "conflict", never, SubmitEvent>({
      id: "flow-test.model.submit-sync-failure-route.save",
      commit: () => Effect.fail("conflict" as const),
      routes: {
        failure: ({ error }) => ({
          type: "SAVE_FAILED" as const,
          error,
        }),
      },
    });

    const machine = flow.machine<
      { readonly saveError: "conflict" | null },
      SubmitEvent,
      "editing" | "saving" | "failed"
    >({
      id: "flow-test.model.submit-sync-failure-route",
      initial: "editing",
      context: () => ({
        saveError: null,
      }),
      states: {
        editing: {
          on: {
            SAVE: {
              target: "saving",
              submit: saveDraft,
            },
          },
        },
        saving: {
          on: {
            SAVE_FAILED: {
              target: "failed",
              update: ({ event }) =>
                event.type === "SAVE_FAILED" ? { saveError: event.error } : {},
            },
          },
        },
        failed: {},
      },
    });

    const model = test.model(machine);
    const immediatePath = model.getShortestPaths({
      events: [{ type: "SAVE" }],
    })[0]!;
    const resolvedPath = model.getShortestPaths({
      events: [{ type: "SAVE" }],
      resolveSyncSuccessRoutes: true,
    })[0]!;
    const flushedHarness = await model.replayFlushed(immediatePath);

    expect(immediatePath.state.value).toBe("saving");
    expect(resolvedPath.steps.map((step) => step.event.type)).toEqual(["SAVE"]);
    expect(resolvedPath.state.value).toBe("failed");
    expect(resolvedPath.state.context).toEqual({
      saveError: "conflict",
    });
    expect(resolvedPath.state.transactions).toEqual(flushedHarness.snapshot().transactions);
    expect(resolvedPath.state.receipts.map((receipt) => receipt.type)).toEqual(
      flushedHarness.receipts().map((receipt) => receipt.type),
    );
    expect(resolvedPath.issues).toEqual(flushedHarness.issues());
    expect(resolvedPath.issueSummary).toEqual(flushedHarness.issueSummary());
  });

  it("models synchronous transaction interrupt routing when sync success routes are enabled", async () => {
    type SubmitEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{ readonly type: "SAVE_INTERRUPTED" }>;

    const saveDraft = flow.transaction<void, never, never, never, SubmitEvent>({
      id: "flow-test.model.submit-sync-interrupt-route.save",
      commit: () => Effect.interrupt,
      routes: {
        interrupt: () => ({
          type: "SAVE_INTERRUPTED" as const,
        }),
      },
    });

    const machine = flow.machine<
      { readonly interrupted: boolean },
      SubmitEvent,
      "editing" | "saving" | "interrupted"
    >({
      id: "flow-test.model.submit-sync-interrupt-route",
      initial: "editing",
      context: () => ({
        interrupted: false,
      }),
      states: {
        editing: {
          on: {
            SAVE: {
              target: "saving",
              submit: saveDraft,
            },
          },
        },
        saving: {
          on: {
            SAVE_INTERRUPTED: {
              target: "interrupted",
              update: () => ({ interrupted: true }),
            },
          },
        },
        interrupted: {},
      },
    });

    const model = test.model(machine);
    const immediatePath = model.getShortestPaths({
      events: [{ type: "SAVE" }],
    })[0]!;
    const resolvedPath = model.getShortestPaths({
      events: [{ type: "SAVE" }],
      resolveSyncSuccessRoutes: true,
    })[0]!;
    const flushedHarness = await model.replayFlushed(immediatePath);

    expect(immediatePath.state.value).toBe("saving");
    expect(resolvedPath.steps.map((step) => step.event.type)).toEqual(["SAVE"]);
    expect(resolvedPath.state.value).toBe("interrupted");
    expect(resolvedPath.state.context).toEqual({
      interrupted: true,
    });
    expect(resolvedPath.state.transactions).toEqual(flushedHarness.snapshot().transactions);
    expect(resolvedPath.state.receipts.map((receipt) => receipt.type)).toEqual(
      flushedHarness.receipts().map((receipt) => receipt.type),
    );
    expect(resolvedPath.issues).toHaveLength(1);
    expect(resolvedPath.issues[0]).toMatchObject({
      kind: flushedHarness.issues()[0]?.kind,
      source: flushedHarness.issues()[0]?.source,
      id: flushedHarness.issues()[0]?.id,
      handled: flushedHarness.issues()[0]?.handled,
      facts: flushedHarness.issues()[0]?.facts,
    });
    const resolvedCause = (resolvedPath.issues[0] as { cause?: unknown } | undefined)?.cause as
      | Readonly<{ readonly reasons?: ReadonlyArray<unknown> }>
      | undefined;
    expect(resolvedCause).toBeDefined();
    expect(resolvedCause?.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ _tag: "Interrupt" })]),
    );
    expect(resolvedPath.issueSummary).toEqual(flushedHarness.issueSummary());
  });

  it("models synchronous transaction defect routing when sync success routes are enabled", async () => {
    type SubmitEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{ readonly type: "SAVE_DEFECT" }>;

    const saveDraft = flow.transaction<void, never, never, never, SubmitEvent>({
      id: "flow-test.model.submit-sync-defect-route.save",
      commit: () => Effect.die("save defect" as const),
      routes: {
        defect: () => ({
          type: "SAVE_DEFECT" as const,
        }),
      },
    });

    const machine = flow.machine<
      { readonly defected: boolean },
      SubmitEvent,
      "editing" | "saving" | "defected"
    >({
      id: "flow-test.model.submit-sync-defect-route",
      initial: "editing",
      context: () => ({
        defected: false,
      }),
      states: {
        editing: {
          on: {
            SAVE: {
              target: "saving",
              submit: saveDraft,
            },
          },
        },
        saving: {
          on: {
            SAVE_DEFECT: {
              target: "defected",
              update: () => ({ defected: true }),
            },
          },
        },
        defected: {},
      },
    });

    const model = test.model(machine);
    const immediatePath = model.getShortestPaths({
      events: [{ type: "SAVE" }],
    })[0]!;
    const resolvedPath = model.getShortestPaths({
      events: [{ type: "SAVE" }],
      resolveSyncSuccessRoutes: true,
    })[0]!;
    const flushedHarness = await model.replayFlushed(immediatePath);

    expect(immediatePath.state.value).toBe("saving");
    expect(resolvedPath.steps.map((step) => step.event.type)).toEqual(["SAVE"]);
    expect(resolvedPath.state.value).toBe("defected");
    expect(resolvedPath.state.context).toEqual({
      defected: true,
    });
    expect(resolvedPath.state.transactions).toEqual(flushedHarness.snapshot().transactions);
    expect(resolvedPath.state.receipts.map((receipt) => receipt.type)).toEqual(
      flushedHarness.receipts().map((receipt) => receipt.type),
    );
    expect(resolvedPath.issues).toEqual(flushedHarness.issues());
    expect(resolvedPath.issueSummary).toEqual(flushedHarness.issueSummary());
  });

  it("models serialized submit overlap by queueing the second accepted save without a second preview", () => {
    type SaveEvent = Readonly<{ readonly type: "SAVE"; readonly name: string }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.submit-serialize.project",
      key: (projectId) => flow.createKey("flow-test.model.submit-serialize.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const saveDraft = flow.transaction({
      id: "flow-test.model.submit-serialize.save",
      concurrency: "serialize" as const,
      params: ({
        context,
      }: {
        readonly context: { readonly draft: { readonly name: string } };
      }) => ({
        projectId: "project-1" as const,
        name: context.draft.name,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: params.name,
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const machine = flow.machine<{ readonly draft: { readonly name: string } }, SaveEvent, "ready">(
      {
        id: "flow-test.model.submit-serialize",
        initial: "ready",
        context: () => ({
          draft: { name: "Draft v0" },
        }),
        states: {
          ready: {
            on: {
              SAVE: {
                submit: saveDraft,
                update: ({ context, event }) =>
                  event.type === "SAVE"
                    ? {
                        draft: {
                          ...context.draft,
                          name: event.name,
                        },
                      }
                    : {},
              },
            },
          },
        },
      },
    );

    const model = test.model(machine);
    const path = model
      .getSimplePaths({
        events: [
          { type: "SAVE", name: "Draft A" },
          { type: "SAVE", name: "Draft B" },
        ],
        allowDuplicatePaths: true,
      })
      .find(
        (candidate) =>
          candidate.steps.length === 2 &&
          candidate.steps[0]?.event.name === "Draft A" &&
          candidate.steps[1]?.event.name === "Draft B",
      )!;
    const harness = model.replay(path);

    expect(path.state.context).toEqual({
      draft: { name: "Draft B" },
    });
    expect(path.state.resources).toEqual({
      "flow-test.model.submit-serialize.project": {
        id: "flow-test.model.submit-serialize.project",
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        value: {
          name: "Draft A",
        },
        isPlaceholderData: false,
      },
    });
    expect(path.state.transactions).toEqual({
      "flow-test.model.submit-serialize.save": {
        id: "flow-test.model.submit-serialize.save",
        status: "pending",
      },
    });
    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining([
        "transaction:start",
        "transaction:preview-patch",
        "transaction:queue",
      ]),
    );
    expect(
      path.state.receipts.filter((receipt) => receipt.type === "transaction:preview-patch"),
    ).toHaveLength(1);
    expect(harness.context()).toEqual(path.state.context);
    expect(harness.snapshot().resources).toEqual(path.state.resources);
    expect(harness.snapshot().transactions).toEqual(path.state.transactions);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
  });

  it("models serialized submit overflow by rejecting the third accepted save without replacing the active preview", () => {
    type SaveEvent = Readonly<{ readonly type: "SAVE"; readonly name: string }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.submit-serialize-reject.project",
      key: (projectId) =>
        flow.createKey("flow-test.model.submit-serialize-reject.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const saveDraft = flow.transaction({
      id: "flow-test.model.submit-serialize-reject.save",
      concurrency: "serialize" as const,
      params: ({
        context,
      }: {
        readonly context: { readonly draft: { readonly name: string } };
      }) => ({
        projectId: "project-1" as const,
        name: context.draft.name,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: params.name,
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const machine = flow.machine<{ readonly draft: { readonly name: string } }, SaveEvent, "ready">(
      {
        id: "flow-test.model.submit-serialize-reject",
        initial: "ready",
        context: () => ({
          draft: { name: "Draft v0" },
        }),
        states: {
          ready: {
            on: {
              SAVE: {
                submit: saveDraft,
                update: ({ context, event }) =>
                  event.type === "SAVE"
                    ? {
                        draft: {
                          ...context.draft,
                          name: event.name,
                        },
                      }
                    : {},
              },
            },
          },
        },
      },
    );

    const model = test.model(machine);
    const path = model
      .getSimplePaths({
        events: [
          { type: "SAVE", name: "Draft A" },
          { type: "SAVE", name: "Draft B" },
          { type: "SAVE", name: "Draft C" },
        ],
        allowDuplicatePaths: true,
      })
      .find(
        (candidate) =>
          candidate.steps.length === 3 &&
          candidate.steps[0]?.event.name === "Draft A" &&
          candidate.steps[1]?.event.name === "Draft B" &&
          candidate.steps[2]?.event.name === "Draft C",
      )!;
    const harness = model.replay(path);

    expect(path.state.context).toEqual({
      draft: { name: "Draft C" },
    });
    expect(path.state.resources).toEqual({
      "flow-test.model.submit-serialize-reject.project": {
        id: "flow-test.model.submit-serialize-reject.project",
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        value: {
          name: "Draft A",
        },
        isPlaceholderData: false,
      },
    });
    expect(path.state.transactions).toEqual({
      "flow-test.model.submit-serialize-reject.save": {
        id: "flow-test.model.submit-serialize-reject.save",
        status: "pending",
      },
    });
    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining([
        "transaction:start",
        "transaction:preview-patch",
        "transaction:queue",
        "transaction:reject",
      ]),
    );
    expect(
      path.state.receipts.filter((receipt) => receipt.type === "transaction:preview-patch"),
    ).toHaveLength(1);
    expect(
      path.state.receipts.filter((receipt) => receipt.type === "transaction:queue"),
    ).toHaveLength(1);
    expect(path.state.receipts.filter((receipt) => receipt.type === "transaction:reject")).toEqual([
      expect.objectContaining({
        queueKey: "flow-test.model.submit-serialize-reject.save",
        overlapCause: "active-attempt",
        activeAttemptCount: 1,
        queuedAttemptCount: 1,
        queueCapacity: 1,
        parentState: "ready",
      }),
    ]);
    expect(path.issues).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "flow-test.model.submit-serialize-reject.save",
        error: expect.objectContaining({
          code: "FLOW-TXN-004",
          title:
            "Transaction 'flow-test.model.submit-serialize-reject.save' exceeded the serialized queue capacity",
        }),
        facts: expect.objectContaining({
          correlationId: "flow-test.model.submit-serialize-reject:event:3",
          parentState: "ready",
        }),
      }),
    ]);
    expect(harness.context()).toEqual(path.state.context);
    expect(harness.snapshot().resources).toEqual(path.state.resources);
    expect(harness.snapshot().transactions).toEqual(path.state.transactions);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
    expect(harness.issues()).toEqual(path.issues);
    expect(harness.issueSummary()).toEqual(path.issueSummary);
  });

  it("models reject-while-running overlap by rejecting the second accepted save without replacing the active preview", () => {
    type SaveEvent = Readonly<{ readonly type: "SAVE"; readonly name: string }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.submit-reject.project",
      key: (projectId) => flow.createKey("flow-test.model.submit-reject.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const saveDraft = flow.transaction({
      id: "flow-test.model.submit-reject.save",
      params: ({
        context,
      }: {
        readonly context: { readonly draft: { readonly name: string } };
      }) => ({
        projectId: "project-1" as const,
        name: context.draft.name,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: params.name,
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const machine = flow.machine<{ readonly draft: { readonly name: string } }, SaveEvent, "ready">(
      {
        id: "flow-test.model.submit-reject",
        initial: "ready",
        context: () => ({
          draft: { name: "Draft v0" },
        }),
        states: {
          ready: {
            on: {
              SAVE: {
                submit: saveDraft,
                update: ({ context, event }) =>
                  event.type === "SAVE"
                    ? {
                        draft: {
                          ...context.draft,
                          name: event.name,
                        },
                      }
                    : {},
              },
            },
          },
        },
      },
    );

    const model = test.model(machine);
    const path = model
      .getSimplePaths({
        events: [
          { type: "SAVE", name: "Draft A" },
          { type: "SAVE", name: "Draft B" },
        ],
        allowDuplicatePaths: true,
      })
      .find(
        (candidate) =>
          candidate.steps.length === 2 &&
          candidate.steps[0]?.event.name === "Draft A" &&
          candidate.steps[1]?.event.name === "Draft B",
      )!;
    const harness = model.replay(path);

    expect(path.state.context).toEqual({
      draft: { name: "Draft B" },
    });
    expect(path.state.resources).toEqual({
      "flow-test.model.submit-reject.project": {
        id: "flow-test.model.submit-reject.project",
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        value: {
          name: "Draft A",
        },
        isPlaceholderData: false,
      },
    });
    expect(path.state.transactions).toEqual({
      "flow-test.model.submit-reject.save": {
        id: "flow-test.model.submit-reject.save",
        status: "pending",
      },
    });
    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining([
        "transaction:start",
        "transaction:preview-patch",
        "transaction:reject",
      ]),
    );
    expect(
      path.state.receipts.filter((receipt) => receipt.type === "transaction:preview-patch"),
    ).toHaveLength(1);
    expect(path.state.receipts.filter((receipt) => receipt.type === "transaction:reject")).toEqual([
      expect.objectContaining({
        queueKey: "flow-test.model.submit-reject.save",
        overlapCause: "reject-while-running",
        activeAttemptCount: 1,
        parentState: "ready",
      }),
    ]);
    expect(path.issues).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "flow-test.model.submit-reject.save",
        error: expect.objectContaining({
          code: "FLOW-TXN-001",
          title:
            "Transaction 'flow-test.model.submit-reject.save' was rejected while another attempt was running",
        }),
        facts: expect.objectContaining({
          correlationId: "flow-test.model.submit-reject:event:2",
          parentState: "ready",
        }),
      }),
    ]);
    expect(harness.context()).toEqual(path.state.context);
    expect(harness.snapshot().resources).toEqual(path.state.resources);
    expect(harness.snapshot().transactions).toEqual(path.state.transactions);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
    expect(harness.issues()).toEqual(path.issues);
    expect(harness.issueSummary()).toEqual(path.issueSummary);
  });
});
