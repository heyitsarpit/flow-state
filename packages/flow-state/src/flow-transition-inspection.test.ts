import { describe, expect, it } from "vite-plus/test";

import { flow } from "./index.js";
import { inspectTransition } from "./inspect.js";

describe("transition inspection", () => {
  it("explains candidate ordering, chosen targets, and emitted receipts", () => {
    const observed: string[] = [];
    type WorkflowEvent =
      | Readonly<{ readonly type: "ADVANCE" }>
      | Readonly<{ readonly type: "UNKNOWN" }>;

    const machine = flow.machine<
      { readonly allowed: boolean; readonly count: number },
      WorkflowEvent,
      "idle" | "blocked" | "ready" | "done"
    >({
      id: "inspect-transition.explains-machine",
      initial: "idle",
      context: () => ({ allowed: false, count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: [
              {
                guard: ({ context }) => {
                  observed.push(`guard-first:${context.allowed}`);
                  return context.allowed;
                },
                target: "blocked",
              },
              {
                target: "ready",
                update: ({ context }) => ({ count: context.count + 1 }),
                actions: ({ context }) => ({
                  type: "domain:advance",
                  count: context.count + 1,
                }),
              },
              {
                guard: () => {
                  observed.push("guard-third");
                  return true;
                },
                target: "done",
              },
            ],
          },
        },
        blocked: {},
        ready: {
          entry: ({ context }) => ({
            type: "domain:ready",
            count: context.count,
          }),
        },
        done: {},
      },
    });

    const snapshot = machine.getInitialSnapshot();
    const inspection = inspectTransition(machine, snapshot, {
      type: "ADVANCE",
    });

    expect(observed).toEqual(["guard-first:false"]);
    expect(inspection).toMatchObject({
      kind: "transition-inspection",
      machine,
      snapshot,
      event: {
        type: "ADVANCE",
      },
      matched: true,
      target: "ready",
    });
    expect(inspection.candidates).toEqual([
      {
        index: 0,
        target: "blocked",
        reenter: false,
        guard: "fail",
        hasUpdate: false,
        actionCounts: {
          exit: 0,
          transition: 0,
          entry: 0,
        },
      },
      {
        index: 1,
        target: "ready",
        reenter: false,
        guard: "not-applicable",
        hasUpdate: true,
        actionCounts: {
          exit: 0,
          transition: 1,
          entry: 1,
        },
      },
      {
        index: 2,
        target: "done",
        reenter: false,
        guard: "skipped",
        hasUpdate: false,
        actionCounts: {
          exit: 0,
          transition: 0,
          entry: 0,
        },
      },
    ]);
    expect(inspection.chosen).toEqual(inspection.candidates[1]);
    expect(inspection.nextSnapshot.value).toBe("ready");
    expect(inspection.nextSnapshot.context).toEqual({
      allowed: false,
      count: 1,
    });
    expect(inspection.receipts.map((receipt) => receipt.type)).toEqual([
      "machine:event",
      "machine:guard",
      "machine:transition",
      "machine:update",
      "machine:action",
      "domain:advance",
      "machine:action",
      "domain:ready",
      "machine:microstep",
    ]);
  });

  it("explains when an event has no matching transition", () => {
    type WorkflowEvent =
      | Readonly<{ readonly type: "ADVANCE" }>
      | Readonly<{ readonly type: "UNKNOWN" }>;

    const machine = flow.machine<
      { readonly allowed: boolean; readonly count: number },
      WorkflowEvent,
      "idle" | "ready"
    >({
      id: "inspect-transition.no-transition-machine",
      initial: "idle",
      context: () => ({ allowed: false, count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: "ready",
          },
        },
        ready: {},
      },
    });

    const inspection = inspectTransition(machine, machine.getInitialSnapshot(), {
      type: "UNKNOWN",
    });

    expect(inspection.matched).toBe(false);
    expect(inspection.candidates).toEqual([]);
    expect(inspection.chosen).toBeUndefined();
    expect(inspection.target).toBeUndefined();
    expect(inspection.nextSnapshot.value).toBe("idle");
    expect(inspection.nextSnapshot.context).toEqual({
      allowed: false,
      count: 0,
    });
    expect(inspection.receipts).toEqual([
      expect.objectContaining({
        type: "machine:event",
        eventType: "UNKNOWN",
      }),
      expect.objectContaining({
        type: "machine:no-transition",
        eventType: "UNKNOWN",
      }),
    ]);
  });
});
