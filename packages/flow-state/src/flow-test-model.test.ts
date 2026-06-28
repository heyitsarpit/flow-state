import { describe, expect, it } from "vite-plus/test";

import { flow, flowTest } from "./index.js";

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

    const model = flowTest.model(machine);
    const expected = [["NEXT", "ALLOW", "PROCEED"]];

    expect(model.kind).toBe("model");
    expect(
      model.getShortestPaths().map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual(expected);
    expect(model.getSimplePaths().map((path) => path.steps.map((step) => step.event.type))).toEqual(
      expected,
    );
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

    const paths = flowTest.model(machine).getShortestPaths({
      events: [{ type: "TYPE_NAME", name: "Atlas" }, { type: "SUBMIT" }],
    });

    expect(paths.map((path) => path.steps.map((step) => step.event.type))).toEqual([
      ["TYPE_NAME", "SUBMIT"],
    ]);
    expect(paths[0]?.description).toBe(
      'Reaches state "submitted": TYPE_NAME ({"name":"Atlas"}) -> SUBMIT',
    );
  });
});
