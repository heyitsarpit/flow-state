import { describe, expect, it } from "vite-plus/test";

import { flow } from "./index.js";
import { test } from "./testing.js";

describe("flow test child helpers", () => {
  it("builds a nested child tree snapshot for state-owned child actors", () => {
    const grandchildMachine = flow.machine<{}, never, "running">({
      id: "flow-test.child-tree.grandchild",
      initial: "running",
      context: () => ({}),
      states: {
        running: {},
      },
    });

    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.child-tree.child",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.child({
            id: "grand.child",
            machine: grandchildMachine,
          }),
        },
      },
    });

    const parentMachine = flow.machine<
      {},
      Readonly<{ readonly type: "START" }>,
      "idle" | "running"
    >({
      id: "flow-test.child-tree.parent",
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
            id: "child.node",
            machine: childMachine,
          }),
        },
      },
    });

    const harness = test(parentMachine).run([{ type: "START" }]);

    expect(harness.children()).toMatchObject({
      "child.node": {
        id: "child.node",
        status: "active",
        state: "running",
        parentState: "running",
        snapshot: {
          value: "running",
          children: {
            "grand.child": expect.objectContaining({
              id: "grand.child",
              status: "active",
              state: "running",
              parentState: "running",
            }),
          },
        },
      },
    });
    expect(harness.childTree()).toEqual({
      "child.node": {
        id: "child.node",
        actorId: "flow-test.child-tree.parent/child.node",
        status: "active",
        state: "running",
        parentState: "running",
        children: {
          "grand.child": {
            id: "grand.child",
            actorId: "flow-test.child-tree.parent/child.node/grand.child",
            status: "active",
            state: "running",
            parentState: "running",
            children: {},
          },
        },
      },
    });
  });

  it("summarizes child outcomes and supervision without adding assertion helpers", async () => {
    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.child-summary.child",
      initial: "running",
      context: () => ({}),
      states: {
        running: {},
      },
    });

    const parentMachine = flow.machine<
      {},
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "STOP" }>,
      "idle" | "running"
    >({
      id: "flow-test.child-summary.parent",
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
            id: "child.timer",
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
          on: {
            STOP: "idle",
          },
        },
      },
    });

    const harness = test(parentMachine).run([{ type: "START" }]);
    expect(harness.childSummary()).toEqual({
      idsByStatus: {
        idle: [],
        active: ["child.timer"],
        success: [],
        failure: [],
        interrupt: [],
        stopped: [],
      },
      outcomes: {
        start: ["child.timer"],
        success: [],
        failure: [],
        interrupt: [],
        stop: [],
      },
      byId: {
        "child.timer": {
          actorId: "flow-test.child-summary.parent/child.timer",
          status: "active",
          state: "running",
          parentState: "running",
          supervision: "stop-on-failure",
        },
      },
    });

    harness.send({ type: "STOP" });

    expect(harness.children()["child.timer"]).toBeUndefined();
    expect(harness.childSummary()).toEqual({
      idsByStatus: {
        idle: [],
        active: [],
        success: [],
        failure: [],
        interrupt: [],
        stopped: [],
      },
      outcomes: {
        start: ["child.timer"],
        success: [],
        failure: [],
        interrupt: [],
        stop: ["child.timer"],
      },
      byId: {},
    });
    expect(harness.receipts()).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "child:stop", id: "child.timer" })]),
    );
  });
});
