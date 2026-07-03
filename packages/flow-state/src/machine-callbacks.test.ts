import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import * as flow from "./index.js";
import { applyMachineEvent, planMachineEvent } from "./core/machines/machine-transition.js";

type WorkflowEvent = Readonly<{ readonly type: "ADVANCE" }>;

function expectMachineCallbackDiagnostic(
  thunk: () => unknown,
  callback: "update" | "actions.transition" | "actions.entry" | "actions.exit",
  state: "idle" | "ready",
): FlowDiagnostic & { readonly cause?: unknown } {
  try {
    thunk();
  } catch (error) {
    expect(error instanceof FlowDiagnostic).toBe(true);
    if (!(error instanceof FlowDiagnostic)) {
      throw error;
    }

    expect(error).toMatchObject({
      code: "FLOW-MACHINE-001",
      title: `Machine callback '${callback}' threw for 'machine.callback'`,
      debug: {
        callback,
        cause: expect.objectContaining({
          message: `${callback} exploded`,
          name: "Error",
          stack: expect.any(String),
        }),
        eventType: "ADVANCE",
        machineId: "machine.callback",
        state,
        step: 0,
        trigger: "event",
      },
    });
    expect(
      (error.debug.cause as Readonly<{ readonly stack?: string }> | undefined)?.stack,
    ).toContain(`${callback} exploded`);

    return error as FlowDiagnostic & { readonly cause?: unknown };
  }

  throw new Error("expected machine callback to throw a FlowDiagnostic");
}

describe("machine callback execution", () => {
  it("applies machine updates and actions through the pure planner path", () => {
    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle" | "ready">({
      id: "machine.callback",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          exit: () => ({ type: "domain:exit" }),
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
              actions: () => ({ type: "domain:transition" }),
            },
          },
        },
        ready: {
          entry: () => ({ type: "domain:entry" }),
        },
      },
    });

    const snapshot = applyMachineEvent(
      planMachineEvent(machine.getInitialSnapshot(), {
        type: "ADVANCE",
      }),
    );

    expect(snapshot.value).toBe("ready");
    expect(snapshot.context).toEqual({ count: 1 });
    expect(snapshot.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "machine:update" }),
        expect.objectContaining({ type: "machine:action", phase: "exit" }),
        expect.objectContaining({ type: "machine:action", phase: "transition" }),
        expect.objectContaining({ type: "machine:action", phase: "entry" }),
        expect.objectContaining({ type: "domain:exit" }),
        expect.objectContaining({ type: "domain:transition" }),
        expect.objectContaining({ type: "domain:entry" }),
      ]),
    );
  });

  it("wraps synchronous machine update and action throws in tagged diagnostics with preserved causes", () => {
    const updateCause = new Error("update exploded");
    const transitionCause = new Error("actions.transition exploded");
    const entryCause = new Error("actions.entry exploded");
    const exitCause = new Error("actions.exit exploded");

    const throwingUpdateMachine = flow.machine<
      { readonly count: number },
      WorkflowEvent,
      "idle" | "ready"
    >({
      id: "machine.callback",
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
    const throwingTransitionMachine = flow.machine<
      { readonly count: number },
      WorkflowEvent,
      "idle" | "ready"
    >({
      id: "machine.callback",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              actions: () => {
                throw transitionCause;
              },
            },
          },
        },
        ready: {},
      },
    });
    const throwingEntryMachine = flow.machine<
      { readonly count: number },
      WorkflowEvent,
      "idle" | "ready"
    >({
      id: "machine.callback",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
            },
          },
        },
        ready: {
          entry: () => {
            throw entryCause;
          },
        },
      },
    });
    const throwingExitMachine = flow.machine<
      { readonly count: number },
      WorkflowEvent,
      "idle" | "ready"
    >({
      id: "machine.callback",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          exit: () => {
            throw exitCause;
          },
          on: {
            ADVANCE: {
              target: "ready",
            },
          },
        },
        ready: {},
      },
    });

    const updateError = expectMachineCallbackDiagnostic(
      () =>
        applyMachineEvent(
          planMachineEvent(throwingUpdateMachine.getInitialSnapshot(), {
            type: "ADVANCE",
          }),
        ),
      "update",
      "idle",
    );
    const transitionError = expectMachineCallbackDiagnostic(
      () =>
        applyMachineEvent(
          planMachineEvent(throwingTransitionMachine.getInitialSnapshot(), {
            type: "ADVANCE",
          }),
        ),
      "actions.transition",
      "ready",
    );
    const entryError = expectMachineCallbackDiagnostic(
      () =>
        applyMachineEvent(
          planMachineEvent(throwingEntryMachine.getInitialSnapshot(), {
            type: "ADVANCE",
          }),
        ),
      "actions.entry",
      "ready",
    );
    const exitError = expectMachineCallbackDiagnostic(
      () =>
        applyMachineEvent(
          planMachineEvent(throwingExitMachine.getInitialSnapshot(), {
            type: "ADVANCE",
          }),
        ),
      "actions.exit",
      "idle",
    );

    expect(updateError.cause).toBe(updateCause);
    expect(transitionError.cause).toBe(transitionCause);
    expect(entryError.cause).toBe(entryCause);
    expect(exitError.cause).toBe(exitCause);
  });
});
