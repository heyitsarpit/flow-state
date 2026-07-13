import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { test } from "./testing.js";

type GuardedEvent =
  | Readonly<{ readonly type: "NEXT" }>
  | Readonly<{ readonly type: "ALLOW" }>
  | Readonly<{ readonly type: "PROCEED" }>;

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
});
