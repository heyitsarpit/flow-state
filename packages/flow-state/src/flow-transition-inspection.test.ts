import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createKey } from "./index.js";
import * as flow from "./index.js";
import { FlowDiagnostic } from "./shared/diagnostics.js";
import {
  inspectActions,
  inspectMicrosteps,
  inspectTransition,
  whyNoTransition,
} from "./inspect.js";

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

  it("explains applied event and always microsteps in order", () => {
    const observed: string[] = [];
    type WorkflowEvent = Readonly<{ readonly type: "ADVANCE" }>;

    const machine = flow.machine<
      { readonly count: number; readonly lastEvent: string | null },
      WorkflowEvent,
      "idle" | "ready" | "done"
    >({
      id: "inspect-transition.microsteps-machine",
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
              return context.count === 1;
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
                value,
                count: context.count,
              };
            },
          },
        },
        done: {},
      },
    });

    const inspection = inspectMicrosteps(machine, machine.getInitialSnapshot(), {
      type: "ADVANCE",
    });

    expect(observed).toEqual(["guard:ADVANCE:1", "action:ADVANCE:done:2"]);
    expect(inspection).toMatchObject({
      kind: "microstep-inspection",
      machine,
      event: {
        type: "ADVANCE",
      },
      matched: true,
    });
    expect(inspection.steps).toHaveLength(2);
    expect(inspection.steps[0]).toMatchObject({
      step: 0,
      trigger: "event",
      from: "idle",
      to: "ready",
      index: 0,
      reenter: false,
      guard: "not-applicable",
      hasUpdate: true,
    });
    expect(inspection.steps[0]?.snapshot.value).toBe("ready");
    expect(inspection.steps[0]?.snapshot.context).toEqual({
      count: 1,
      lastEvent: null,
    });
    expect(inspection.steps[0]?.receipts.map((receipt) => receipt.type)).toEqual([
      "machine:event",
      "machine:transition",
      "machine:update",
      "machine:microstep",
    ]);
    expect(inspection.steps[1]).toMatchObject({
      step: 1,
      trigger: "always",
      from: "ready",
      to: "done",
      index: 0,
      reenter: false,
      guard: "pass",
      hasUpdate: true,
    });
    expect(inspection.steps[1]?.snapshot.value).toBe("done");
    expect(inspection.steps[1]?.snapshot.context).toEqual({
      count: 2,
      lastEvent: "ADVANCE",
    });
    expect(inspection.steps[1]?.receipts.map((receipt) => receipt.type)).toEqual([
      "machine:guard",
      "machine:transition",
      "machine:update",
      "machine:action",
      "domain:always",
      "machine:microstep",
    ]);
    expect(inspection.limitReached).toBeUndefined();
    expect(inspection.nextSnapshot.value).toBe("done");
    expect(inspection.nextSnapshot.context).toEqual({
      count: 2,
      lastEvent: "ADVANCE",
    });
    expect(inspection.receipts.map((receipt) => receipt.type)).toEqual([
      "machine:event",
      "machine:transition",
      "machine:update",
      "machine:microstep",
      "machine:guard",
      "machine:transition",
      "machine:update",
      "machine:action",
      "domain:always",
      "machine:microstep",
    ]);
  });

  it("preserves microstep-limit receipts without inventing extra steps", () => {
    type WorkflowEvent = Readonly<{ readonly type: "ADVANCE" }>;

    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle" | "looping">({
      id: "inspect-transition.microstep-limit-machine",
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

    const inspection = inspectMicrosteps(machine, machine.getInitialSnapshot(), {
      type: "ADVANCE",
    });

    expect(inspection.matched).toBe(true);
    expect(inspection.steps).toHaveLength(101);
    expect(inspection.steps[0]?.trigger).toBe("event");
    expect(inspection.steps.slice(1).every((step) => step.trigger === "always")).toBe(true);
    expect(inspection.limitReached).toEqual({
      step: 101,
      limit: 100,
    });
    expect(inspection.nextSnapshot.value).toBe("looping");
    expect(inspection.nextSnapshot.context).toEqual({ count: 100 });
    expect(inspection.receipts.at(-1)).toEqual(
      expect.objectContaining({
        type: "machine:microstep-limit",
        trigger: "always",
        step: 101,
        limit: 100,
      }),
    );
  });

  it("extracts ordered update and action facts from the inspected microsteps", () => {
    type WorkflowEvent = Readonly<{ readonly type: "ADVANCE" }>;

    const machine = flow.machine<
      { readonly count: number; readonly lastEvent: string | null },
      WorkflowEvent,
      "idle" | "ready" | "done"
    >({
      id: "inspect-transition.actions-machine",
      initial: "idle",
      context: () => ({ count: 0, lastEvent: null }),
      states: {
        idle: {
          exit: ({ context }) => ({
            type: "domain:exit",
            count: context.count,
          }),
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
              actions: ({ context }) => ({
                type: "domain:transition",
                count: context.count + 1,
              }),
            },
          },
        },
        ready: {
          entry: ({ context }) => ({
            type: "domain:entry",
            count: context.count,
          }),
          always: {
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

    const inspection = inspectActions(machine, machine.getInitialSnapshot(), {
      type: "ADVANCE",
    });

    expect(inspection).toMatchObject({
      kind: "action-inspection",
      machine,
      matched: true,
    });
    expect(inspection.facts).toEqual([
      expect.objectContaining({
        kind: "update",
        step: 0,
        trigger: "event",
        from: "idle",
        to: "ready",
        transitionIndex: 0,
        index: 0,
      }),
      expect.objectContaining({
        kind: "action",
        step: 0,
        trigger: "event",
        from: "idle",
        to: "ready",
        transitionIndex: 0,
        phase: "exit",
        index: 0,
        emitted: [expect.objectContaining({ type: "domain:exit", count: 0 })],
      }),
      expect.objectContaining({
        kind: "action",
        step: 0,
        trigger: "event",
        from: "idle",
        to: "ready",
        transitionIndex: 0,
        phase: "transition",
        index: 0,
        emitted: [expect.objectContaining({ type: "domain:transition", count: 2 })],
      }),
      expect.objectContaining({
        kind: "action",
        step: 0,
        trigger: "event",
        from: "idle",
        to: "ready",
        transitionIndex: 0,
        phase: "entry",
        index: 0,
        emitted: [expect.objectContaining({ type: "domain:entry", count: 1 })],
      }),
      expect.objectContaining({
        kind: "update",
        step: 1,
        trigger: "always",
        from: "ready",
        to: "done",
        transitionIndex: 0,
        index: 0,
      }),
      expect.objectContaining({
        kind: "action",
        step: 1,
        trigger: "always",
        from: "ready",
        to: "done",
        transitionIndex: 0,
        phase: "transition",
        index: 0,
        emitted: [
          expect.objectContaining({
            type: "domain:always",
            eventType: "ADVANCE",
            value: "done",
            count: 2,
          }),
        ],
      }),
    ]);
    expect(inspection.nextSnapshot.value).toBe("done");
    expect(inspection.nextSnapshot.context).toEqual({
      count: 2,
      lastEvent: "ADVANCE",
    });
    expect(inspection.receipts.at(-1)).toEqual(
      expect.objectContaining({
        type: "machine:microstep",
        trigger: "always",
        step: 1,
      }),
    );
  });

  it("keeps action facts empty when no transition matches", () => {
    type WorkflowEvent =
      | Readonly<{ readonly type: "ADVANCE" }>
      | Readonly<{ readonly type: "UNKNOWN" }>;

    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle" | "ready">({
      id: "inspect-transition.actions-no-transition-machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: "ready",
          },
        },
        ready: {},
      },
    });

    const inspection = inspectActions(machine, machine.getInitialSnapshot(), {
      type: "UNKNOWN",
    });

    expect(inspection.matched).toBe(false);
    expect(inspection.facts).toEqual([]);
    expect(inspection.effects).toEqual([]);
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

  it("explains planned resource, transaction, stream, timer, and child work", () => {
    type WorkflowEvent =
      | Readonly<{ readonly type: "ADVANCE" }>
      | Readonly<{ readonly type: "RESET" }>;

    const projectResource = flow.resource({
      id: "Project.byId",
      key: (projectId: string) => createKey("project", projectId),
      lookup: (projectId: string) =>
        Effect.succeed({
          id: projectId,
          name: `Loaded ${projectId}`,
        }),
    });
    const projectRef = projectResource.ref("project-1");
    const ensureProject = flow.ensure(projectRef);
    const observeProject = flow.observe(projectRef);
    const refreshProject = flow.refresh(projectRef);
    const patchProject = flow.patch(projectRef, {
      name: "Patched",
    });
    const invalidateProject = flow.invalidate(projectRef);
    const saveProject = flow.transaction({
      id: "Project.save",
      commit: () => Effect.succeed({ ok: true as const }),
    });
    const runSaveProject = flow.run(saveProject);
    const projectStream = flow.stream<{}, WorkflowEvent, void, string>({
      id: "Project.activity",
      subscribe: () => Stream.empty,
    });
    const childMachine = flow.machine<{}, never, "idle">({
      id: "Project.child",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const childWorker = flow.child({
      id: "child.editor",
      machine: childMachine,
    });
    const dismissAfter = flow.after<"idle" | "busy", {}, WorkflowEvent>({
      id: "Project.dismiss",
      delay: 1_000,
      target: "idle",
    });
    const machine = flow.machine<{}, WorkflowEvent, "idle" | "busy">({
      id: "inspect-transition.effects-machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            ADVANCE: "busy",
          },
        },
        busy: {
          invoke: [
            ensureProject,
            observeProject,
            refreshProject,
            patchProject,
            invalidateProject,
            runSaveProject,
            projectStream,
            childWorker,
          ],
          after: dismissAfter,
          on: {
            RESET: "idle",
          },
        },
      },
    });

    const startInspection = inspectActions(machine, machine.getInitialSnapshot(), {
      type: "ADVANCE",
    });
    const busySnapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "busy" as const,
      transactions: {
        "Project.save": {
          id: "Project.save",
          status: "pending" as const,
        },
      },
      streams: {
        "Project.activity": {
          id: "Project.activity",
          status: "running" as const,
          generation: 2,
          emitted: 1,
          hasValue: false as const,
        },
      },
      timers: {
        "Project.dismiss": {
          id: "Project.dismiss",
          status: "scheduled" as const,
          generation: 1,
          parentState: "busy",
          startedAt: 0,
          dueAt: 1_000,
        },
      },
      children: {
        "child.editor": {
          id: "child.editor",
          generation: 1,
          actorId: "inspect-transition.effects-machine/child.editor",
          status: "active" as const,
          state: "idle",
          parentState: "busy",
        },
      },
    });
    const stopInspection = inspectActions(machine, busySnapshot, {
      type: "RESET",
    });

    expect(startInspection.effects).toEqual([
      expect.objectContaining({
        kind: "resource-query",
        operation: "start",
        mode: "ensure",
        ownerState: "busy",
        definition: ensureProject,
      }),
      expect.objectContaining({
        kind: "resource-query",
        operation: "start",
        mode: "observe",
        ownerState: "busy",
        definition: observeProject,
      }),
      expect.objectContaining({
        kind: "resource-query",
        operation: "start",
        mode: "refresh",
        ownerState: "busy",
        definition: refreshProject,
      }),
      expect.objectContaining({
        kind: "resource-command",
        operation: "apply",
        command: "patch",
        ownerState: "busy",
        definition: patchProject,
      }),
      expect.objectContaining({
        kind: "resource-command",
        operation: "apply",
        command: "invalidate",
        ownerState: "busy",
        definition: invalidateProject,
      }),
      expect.objectContaining({
        kind: "transaction",
        operation: "start",
        ownerState: "busy",
        definition: runSaveProject,
      }),
      expect.objectContaining({
        kind: "timer",
        operation: "start",
        ownerState: "busy",
        definition: dismissAfter,
      }),
      expect.objectContaining({
        kind: "stream",
        operation: "start",
        ownerState: "busy",
        definition: projectStream,
      }),
      expect.objectContaining({
        kind: "child",
        operation: "start",
        ownerState: "busy",
        definition: childWorker,
      }),
    ]);

    expect(stopInspection.effects).toEqual([
      expect.objectContaining({
        kind: "transaction",
        operation: "interrupt",
        ownerState: "busy",
        definition: runSaveProject,
      }),
      expect.objectContaining({
        kind: "timer",
        operation: "interrupt",
        ownerState: "busy",
        definition: dismissAfter,
      }),
      expect.objectContaining({
        kind: "stream",
        operation: "interrupt",
        ownerState: "busy",
        definition: projectStream,
      }),
      expect.objectContaining({
        kind: "child",
        operation: "stop",
        ownerState: "busy",
        definition: childWorker,
      }),
    ]);
  });

  it("explains unknown, ignored, and guard-blocked no-transition reasons", () => {
    type WorkflowEvent =
      | Readonly<{ readonly type: "ADVANCE" }>
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{ readonly type: "LOCKED" }>
      | Readonly<{ readonly type: "UNKNOWN" }>;

    const machine = flow.machine<{ readonly allowed: boolean }, WorkflowEvent, "idle" | "ready">({
      id: "inspect-transition.why-no-transition-machine",
      initial: "idle",
      context: () => ({ allowed: false }),
      states: {
        idle: {
          on: {
            ADVANCE: "ready",
            LOCKED: {
              target: "ready",
              guard: ({ context }) => context.allowed,
            },
          },
        },
        ready: {
          on: {
            SAVE: "idle",
          },
        },
      },
    });

    const unknown = whyNoTransition(machine, machine.getInitialSnapshot(), {
      type: "UNKNOWN",
    });
    const ignored = whyNoTransition(machine, machine.getInitialSnapshot(), {
      type: "SAVE",
    });
    const blocked = whyNoTransition(machine, machine.getInitialSnapshot(), {
      type: "LOCKED",
    });
    const successful = whyNoTransition(machine, machine.getInitialSnapshot(), {
      type: "ADVANCE",
    });

    expect(unknown).toMatchObject({
      kind: "no-transition-explanation",
      reason: "unknown",
      state: "idle",
      availableInStates: [],
      guardFailures: [],
    });
    expect(unknown?.receipts).toEqual([
      expect.objectContaining({
        type: "machine:event",
        eventType: "UNKNOWN",
      }),
      expect.objectContaining({
        type: "machine:no-transition",
        eventType: "UNKNOWN",
      }),
    ]);

    expect(ignored).toMatchObject({
      kind: "no-transition-explanation",
      reason: "ignored-in-state",
      state: "idle",
      availableInStates: ["ready"],
      guardFailures: [],
    });
    expect(ignored?.receipts).toEqual([
      expect.objectContaining({
        type: "machine:event",
        eventType: "SAVE",
      }),
      expect.objectContaining({
        type: "machine:no-transition",
        eventType: "SAVE",
      }),
    ]);

    expect(blocked).toMatchObject({
      kind: "no-transition-explanation",
      reason: "blocked-by-guard",
      state: "idle",
      availableInStates: ["idle"],
      guardFailures: [0],
    });
    expect(blocked?.receipts).toEqual([
      expect.objectContaining({
        type: "machine:event",
        eventType: "LOCKED",
      }),
      expect.objectContaining({
        type: "machine:guard",
        eventType: "LOCKED",
        index: 0,
        result: "fail",
      }),
      expect.objectContaining({
        type: "machine:no-transition",
        eventType: "LOCKED",
      }),
    ]);

    expect(successful).toBeUndefined();
  });

  it("surfaces guard defects instead of reporting them as blocked-by-guard", () => {
    const cause = new Error("guard exploded");
    type WorkflowEvent = Readonly<{ readonly type: "LOCKED" }>;

    const machine = flow.machine<{}, WorkflowEvent, "idle" | "ready">({
      id: "inspect-transition.guard-defect",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            LOCKED: {
              target: "ready",
              guard: () => {
                throw cause;
              },
            },
          },
        },
        ready: {},
      },
    });

    const snapshot = machine.getInitialSnapshot();

    for (const failure of [
      captureFlowDiagnostic(() => inspectTransition(machine, snapshot, { type: "LOCKED" })),
      captureFlowDiagnostic(() => inspectMicrosteps(machine, snapshot, { type: "LOCKED" })),
      captureFlowDiagnostic(() => inspectActions(machine, snapshot, { type: "LOCKED" })),
      captureFlowDiagnostic(() => whyNoTransition(machine, snapshot, { type: "LOCKED" })),
    ]) {
      expect(failure).toMatchObject({
        code: "FLOW-MACHINE-001",
        debug: {
          callback: "guard",
          eventType: "LOCKED",
          machineId: "inspect-transition.guard-defect",
          state: "idle",
          step: 0,
          trigger: "event",
        },
      });
      expect(failure.cause).toBe(cause);
    }
  });

  it("explains when always transitions stop at the microstep limit", () => {
    type WorkflowEvent = Readonly<{ readonly type: "ADVANCE" }>;

    const machine = flow.machine<{ readonly count: number }, WorkflowEvent, "idle" | "looping">({
      id: "inspect-transition.why-no-transition-limit-machine",
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

    const explanation = whyNoTransition(machine, machine.getInitialSnapshot(), {
      type: "ADVANCE",
    });

    expect(explanation).toMatchObject({
      kind: "no-transition-explanation",
      reason: "stopped-by-microstep-limit",
      state: "looping",
      limitReached: {
        step: 101,
        limit: 100,
      },
      guardFailures: [],
    });
    expect(explanation?.nextSnapshot.value).toBe("looping");
    expect(explanation?.nextSnapshot.context).toEqual({ count: 100 });
    expect(explanation?.receipts.at(-1)).toEqual(
      expect.objectContaining({
        type: "machine:microstep-limit",
        trigger: "always",
        step: 101,
        limit: 100,
      }),
    );
  });

  it("uses a deterministic pure inspection runtime clock", () => {
    type WorkflowEvent =
      | Readonly<{ readonly type: "ADVANCE" }>
      | Readonly<{ readonly type: "BLOCKED" }>;

    const clockedMachine = flow.machine<{}, WorkflowEvent, "idle" | "done">({
      id: "inspect-transition.pure-runtime-machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "done",
              actions: ({ runtime }) => ({
                type: "domain:stamp",
                now: runtime.now(),
              }),
            },
            BLOCKED: {
              target: "done",
              guard: ({ runtime }) => runtime.now() > 0,
            },
          },
        },
        done: {},
      },
    });

    const transition = inspectTransition(clockedMachine, clockedMachine.getInitialSnapshot(), {
      type: "ADVANCE",
    });
    const microsteps = inspectMicrosteps(clockedMachine, clockedMachine.getInitialSnapshot(), {
      type: "ADVANCE",
    });
    const actions = inspectActions(clockedMachine, clockedMachine.getInitialSnapshot(), {
      type: "ADVANCE",
    });
    const blocked = whyNoTransition(clockedMachine, clockedMachine.getInitialSnapshot(), {
      type: "BLOCKED",
    });

    expect(transition.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "domain:stamp",
          now: 0,
        }),
      ]),
    );
    expect(microsteps.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "domain:stamp",
          now: 0,
        }),
      ]),
    );
    expect(actions.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "domain:stamp",
          now: 0,
        }),
      ]),
    );
    expect(blocked).toMatchObject({
      reason: "blocked-by-guard",
      guardFailures: [0],
    });
  });
});
