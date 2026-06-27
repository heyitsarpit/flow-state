import { describe, expect, it } from "vite-plus/test";

import { createRuntime, flow, flowTest } from "./index.js";

type WorkflowEvent =
  | Readonly<{ readonly type: "ADVANCE" }>
  | Readonly<{ readonly type: "STAMP"; readonly count: number }>
  | Readonly<{ readonly type: "SAVE" }>;

describe("Phase 4 machine transition core", () => {
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
});
