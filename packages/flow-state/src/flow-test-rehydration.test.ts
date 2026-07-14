import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { createKey } from "./index.js";
import * as flow from "./index.js";
import { createControlledStream, test } from "./testing.js";
import { focusedMachineInventory } from "./testing/focused-app.js";

type ProjectRecord = Readonly<{
  readonly id: string;
  readonly name: string;
}>;

const projectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: "rehydrate.fixture.project",
  key: (projectId) => createKey("rehydrate-fixture", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: `Project ${projectId}` }),
});

const rehydrationSeed = [
  {
    ref: projectResource.ref("project-1"),
    value: { id: "project-1", name: "Seeded project" },
  },
] as const;

describe("flow test rehydration helpers", () => {
  it("keeps rehydrated harness guards pure when runtime time moves", async () => {
    const machine = flow.machine<{}, Readonly<{ readonly type: "FINISH" }>, "waiting" | "done">({
      id: "flow-test.rehydrate.pure-guard-clock.machine",
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

    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.pure-guard-clock.actor",
      snapshot: machine.getInitialSnapshot(),
    });

    try {
      expect(harness.can({ type: "FINISH" })).toBe(false);

      await harness.runtime.runPromise(TestClock.adjust("1 second"));

      expect(harness.can({ type: "FINISH" })).toBe(false);

      harness.send({ type: "FINISH" });
      await harness.flush();

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
    } finally {
      await harness.dispose();
    }
  });

  it("rehydrates a timer-driven actor and resumes delayed work through advance(...)", async () => {
    const machine = flow.machine<{ readonly ticks: number }, never, "waiting" | "done">({
      id: "flow-test.rehydrate.timer.machine",
      initial: "waiting",
      context: () => ({ ticks: 0 }),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.rehydrate.timer.after",
            delay: "1 second",
            target: "done",
            update: ({ context }) => ({ ticks: context.ticks + 1 }),
          }),
        },
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "waiting" as const,
      timers: {
        "flow-test.rehydrate.timer.after": {
          id: "flow-test.rehydrate.timer.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 1_000,
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.timer.actor" },
        {
          type: "timer:start",
          id: "flow-test.rehydrate.timer.after",
          generation: 2,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 1_000,
          scheduledMillis: 1_000,
          restored: false,
        },
      ],
    });

    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.timer.actor",
      snapshot,
    });

    try {
      expect(harness.state()).toBe("waiting");
      expect(harness.pendingWork()).toMatchObject({
        ready: 0,
        activeFibers: 1,
        mailboxes: [],
        streams: [],
        transactions: [],
        timers: [
          expect.objectContaining({
            id: "flow-test.rehydrate.timer.after",
            parentState: "waiting",
            dueAt: 1_000,
          }),
        ],
        nextAfterMillis: 1_000,
      });
      expect(harness.timers().active("flow-test.rehydrate.timer.after")).toMatchObject({
        generation: 2,
        parentState: "waiting",
        dueAt: 1_000,
      });
      expect(harness.receiptSummary().receiptTypes).toEqual([
        "actor:start",
        "timer:start",
        "actor:restore",
        "timer:resume",
      ]);

      await harness.untilState("done");

      expect(harness.state()).toBe("done");
      expect(harness.context().ticks).toBe(1);
      expect(harness.receipts().filter((receipt) => receipt.type === "timer:fire")).toHaveLength(1);
    } finally {
      await harness.dispose();
    }
  });

  it("keeps a rehydrated scheduled timer from firing after harness disposal", async () => {
    const machine = flow.machine<{ readonly ticks: number }, never, "waiting" | "done">({
      id: "flow-test.rehydrate.timer.dispose.machine",
      initial: "waiting",
      context: () => ({ ticks: 0 }),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.rehydrate.timer.dispose.after",
            delay: "1 second",
            target: "done",
            update: ({ context }) => ({ ticks: context.ticks + 1 }),
          }),
        },
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "waiting" as const,
      timers: {
        "flow-test.rehydrate.timer.dispose.after": {
          id: "flow-test.rehydrate.timer.dispose.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 1_000,
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.timer.dispose.actor" },
        {
          type: "timer:start",
          id: "flow-test.rehydrate.timer.dispose.after",
          generation: 2,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 1_000,
          scheduledMillis: 1_000,
          restored: false,
        },
      ],
    });

    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.timer.dispose.actor",
      snapshot,
    });

    await harness.advance("999 millis");

    expect(harness.state()).toBe("waiting");
    expect(harness.context().ticks).toBe(0);

    await harness.dispose();

    expect(harness.state()).toBe("waiting");
    expect(harness.context().ticks).toBe(0);
    expect(harness.snapshot().timers["flow-test.rehydrate.timer.dispose.after"]).toMatchObject({
      id: "flow-test.rehydrate.timer.dispose.after",
      status: "interrupt",
      generation: 2,
      parentState: "waiting",
    });
    expect(harness.receipts().filter((receipt) => receipt.type === "timer:resume")).toHaveLength(1);
    expect(harness.receipts().filter((receipt) => receipt.type === "timer:interrupt")).toHaveLength(
      1,
    );
    expect(harness.receipts().filter((receipt) => receipt.type === "actor:dispose")).toHaveLength(
      1,
    );

    const receiptsAfterDispose = harness.receipts().length;

    await harness.actor.flush();

    expect(harness.state()).toBe("waiting");
    expect(harness.context().ticks).toBe(0);
    expect(harness.receipts()).toHaveLength(receiptsAfterDispose);
    expect(harness.receipts().filter((receipt) => receipt.type === "timer:fire")).toHaveLength(0);
    expect(
      harness
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "machine:transition" &&
            receipt.trigger === "after" &&
            receipt.id === "flow-test.rehydrate.timer.dispose.machine",
        ),
    ).toHaveLength(0);
  });

  it("keeps a rehydrated scheduled timer from firing after the owning state exits", async () => {
    const machine = flow.machine<
      { readonly ticks: number },
      Readonly<{ readonly type: "CANCEL" }>,
      "waiting" | "cancelled" | "done"
    >({
      id: "flow-test.rehydrate.timer.state-exit.machine",
      initial: "waiting",
      context: () => ({ ticks: 0 }),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.rehydrate.timer.state-exit.after",
            delay: "1 second",
            target: "done",
            update: ({ context }) => ({ ticks: context.ticks + 1 }),
          }),
          on: {
            CANCEL: "cancelled",
          },
        },
        cancelled: {},
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "waiting" as const,
      timers: {
        "flow-test.rehydrate.timer.state-exit.after": {
          id: "flow-test.rehydrate.timer.state-exit.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 1_000,
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.timer.state-exit.actor" },
        {
          type: "timer:start",
          id: "flow-test.rehydrate.timer.state-exit.after",
          generation: 2,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 1_000,
          scheduledMillis: 1_000,
          restored: false,
        },
      ],
    });

    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.timer.state-exit.actor",
      snapshot,
    });

    harness.send({ type: "CANCEL" });
    await harness.flush();

    expect(harness.state()).toBe("cancelled");
    expect(harness.context().ticks).toBe(0);
    expect(harness.snapshot().timers["flow-test.rehydrate.timer.state-exit.after"]).toMatchObject({
      id: "flow-test.rehydrate.timer.state-exit.after",
      status: "interrupt",
      generation: 2,
      parentState: "waiting",
    });
    expect(harness.receipts().filter((receipt) => receipt.type === "timer:resume")).toHaveLength(1);
    expect(harness.receipts().filter((receipt) => receipt.type === "timer:interrupt")).toHaveLength(
      1,
    );

    const receiptsAfterExit = harness.receipts().length;

    await harness.advance("1 second");

    expect(harness.state()).toBe("cancelled");
    expect(harness.context().ticks).toBe(0);
    expect(harness.receipts()).toHaveLength(receiptsAfterExit);
    expect(harness.receipts().filter((receipt) => receipt.type === "timer:fire")).toHaveLength(0);
    expect(
      harness
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "machine:transition" &&
            receipt.trigger === "after" &&
            receipt.id === "flow-test.rehydrate.timer.state-exit.machine",
        ),
    ).toHaveLength(0);

    await harness.dispose();
  });

  it("keeps timer generations monotonic when delayed work restarts after rehydration", async () => {
    const machine = flow.machine<
      { readonly ticks: number },
      Readonly<{ readonly type: "CANCEL" }> | Readonly<{ readonly type: "REARM" }>,
      "waiting" | "cancelled" | "done"
    >({
      id: "flow-test.rehydrate.timer.restart.machine",
      initial: "waiting",
      context: () => ({ ticks: 0 }),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.rehydrate.timer.restart.after",
            delay: "2 seconds",
            target: "done",
            update: ({ context }) => ({ ticks: context.ticks + 1 }),
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
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "cancelled" as const,
      timers: {
        "flow-test.rehydrate.timer.restart.after": {
          id: "flow-test.rehydrate.timer.restart.after",
          status: "interrupt" as const,
          generation: 4,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 2_000,
          endedAt: 250,
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.timer.restart.actor" },
        {
          type: "timer:start",
          id: "flow-test.rehydrate.timer.restart.after",
          generation: 4,
          parentState: "waiting",
          dueAt: 2_000,
        },
        {
          type: "timer:interrupt",
          id: "flow-test.rehydrate.timer.restart.after",
          generation: 4,
          parentState: "waiting",
          dueAt: 2_000,
          endedAt: 250,
        },
      ],
    });

    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.timer.restart.actor",
      snapshot,
    });

    try {
      harness.send({ type: "REARM" });
      await harness.flush();

      expect(harness.snapshot().timers["flow-test.rehydrate.timer.restart.after"]).toMatchObject({
        id: "flow-test.rehydrate.timer.restart.after",
        status: "scheduled",
        generation: 5,
        parentState: "waiting",
        startedAt: 0,
        dueAt: 2_000,
      });

      await harness.advance("2 seconds");

      expect(harness.state()).toBe("done");
      expect(harness.context().ticks).toBe(1);
      expect(harness.snapshot().timers["flow-test.rehydrate.timer.restart.after"]).toMatchObject({
        id: "flow-test.rehydrate.timer.restart.after",
        status: "fired",
        generation: 5,
        parentState: "waiting",
      });
      expect(
        harness
          .timers()
          .events("flow-test.rehydrate.timer.restart.after")
          .map((receipt) => {
            switch (receipt.type) {
              case "timer:start":
                return {
                  type: receipt.type,
                  generation: receipt.generation,
                  parentState: receipt.parentState,
                  startedAt: receipt.startedAt,
                  dueAt: receipt.dueAt,
                  scheduledMillis: receipt.scheduledMillis,
                  restored: receipt.restored,
                };
              case "timer:interrupt":
              case "timer:fire":
                return {
                  type: receipt.type,
                  generation: receipt.generation,
                  parentState: receipt.parentState,
                  startedAt: receipt.startedAt,
                  dueAt: receipt.dueAt,
                  endedAt: receipt.endedAt,
                  restored: receipt.restored,
                };
              default:
                throw new Error(`Unexpected timer receipt type: ${receipt.type}`);
            }
          }),
      ).toEqual([
        {
          type: "timer:start",
          generation: 4,
          parentState: "waiting",
          startedAt: undefined,
          dueAt: 2_000,
          scheduledMillis: undefined,
          restored: undefined,
        },
        {
          type: "timer:interrupt",
          generation: 4,
          parentState: "waiting",
          startedAt: undefined,
          dueAt: 2_000,
          endedAt: 250,
          restored: undefined,
        },
        {
          type: "timer:start",
          generation: 5,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 2_000,
          scheduledMillis: 2_000,
          restored: false,
        },
        {
          type: "timer:fire",
          generation: 5,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 2_000,
          endedAt: 2_000,
          restored: false,
        },
      ]);
      expect(
        harness
          .receipts()
          .filter(
            (receipt) =>
              receipt.type === "timer:start" &&
              receipt.id === "flow-test.rehydrate.timer.restart.after",
          )
          .map((receipt) => receipt.generation),
      ).toEqual([4, 5]);
    } finally {
      await harness.dispose();
    }
  });

  it("preserves active child snapshots on a rehydrated harness without replaying child entry work", async () => {
    let childEntries = 0;

    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.rehydrate.child.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            childEntries += 1;
          },
        },
      },
    });

    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "STOP" }>,
      "idle" | "running" | "done"
    >({
      id: "flow-test.rehydrate.child.parent.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        running: {
          invoke: flow.child({
            id: "flow-test.rehydrate.child.binding",
            machine: childMachine,
          }),
          on: {
            STOP: "done",
          },
        },
        done: {},
      },
    });

    const childActorId = "flow-test.rehydrate.child.parent.actor/flow-test.rehydrate.child.binding";
    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "running" as const,
      children: {
        "flow-test.rehydrate.child.binding": {
          id: "flow-test.rehydrate.child.binding",
          actorId: childActorId,
          status: "active" as const,
          state: "running",
          parentState: "running",
          snapshot: childMachine.getInitialSnapshot(),
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.child.parent.actor" },
        {
          type: "child:start",
          id: "flow-test.rehydrate.child.binding",
          actorId: childActorId,
          parentState: "running",
          state: "running",
        },
      ],
    });

    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.child.parent.actor",
      snapshot,
    });

    try {
      expect(childEntries).toBe(0);
      expect(harness.can({ type: "STOP" })).toBe(true);
      expect(harness.children()).toMatchObject({
        "flow-test.rehydrate.child.binding": {
          id: "flow-test.rehydrate.child.binding",
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "running",
        },
      });
      expect(harness.childTree()).toEqual({
        "flow-test.rehydrate.child.binding": {
          id: "flow-test.rehydrate.child.binding",
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "running",
          children: {},
        },
      });
      expect(harness.childSummary()).toMatchObject({
        idsByStatus: {
          active: ["flow-test.rehydrate.child.binding"],
        },
        outcomes: {
          start: ["flow-test.rehydrate.child.binding"],
          stop: [],
        },
        byId: {
          "flow-test.rehydrate.child.binding": {
            actorId: childActorId,
            status: "active",
            state: "running",
            parentState: "running",
          },
        },
      });
      expect(harness.serialize().children["flow-test.rehydrate.child.binding"]).toMatchObject({
        id: "flow-test.rehydrate.child.binding",
        actorId: childActorId,
        status: "active",
        state: "running",
        parentState: "running",
      });
      expect(
        harness
          .receipts()
          .filter(
            (receipt) =>
              receipt.type === "child:start" && receipt.id === "flow-test.rehydrate.child.binding",
          ),
      ).toHaveLength(1);
      expect(harness.receipts().map((receipt) => receipt.type)).toEqual([
        "actor:start",
        "child:start",
        "actor:restore",
      ]);

      harness.send({ type: "STOP" });
      await harness.flush();

      expect(harness.state()).toBe("done");
      expect(harness.children()).toEqual({});
      expect(harness.childTree()).toEqual({});
      expect(harness.childSummary().idsByStatus.active).toEqual([]);
      expect(harness.childSummary().outcomes.stop).toEqual(["flow-test.rehydrate.child.binding"]);
      expect(
        harness
          .receipts()
          .filter(
            (receipt) =>
              receipt.type === "child:stop" && receipt.id === "flow-test.rehydrate.child.binding",
          ),
      ).toHaveLength(1);
    } finally {
      await harness.dispose();
    }
  });

  it("marks a restored active child stopped before harness disposal without replaying child entry work", async () => {
    let childEntries = 0;

    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.rehydrate.child.dispose.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            childEntries += 1;
          },
        },
      },
    });

    const childId = "flow-test.rehydrate.child.dispose.binding";
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "STOP" }>,
      "idle" | "running" | "done"
    >({
      id: "flow-test.rehydrate.child.dispose.parent.machine",
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
            id: childId,
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
          on: {
            STOP: "done",
          },
        },
        done: {},
      },
    });

    const childActorId =
      "flow-test.rehydrate.child.dispose.parent.actor/flow-test.rehydrate.child.dispose.binding";
    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.child.dispose.parent.actor",
      snapshot: Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "running" as const,
        children: {
          [childId]: {
            id: childId,
            actorId: childActorId,
            status: "active" as const,
            state: "running",
            parentState: "running",
            snapshot: childMachine.getInitialSnapshot(),
          },
        },
        receipts: [
          { type: "actor:start", id: "flow-test.rehydrate.child.dispose.parent.actor" },
          {
            type: "child:start",
            id: childId,
            actorId: childActorId,
            parentState: "running",
            state: "running",
          },
        ],
      }),
    });

    expect(childEntries).toBe(0);
    expect(harness.state()).toBe("running");
    expect(harness.children()).toMatchObject({
      [childId]: {
        id: childId,
        actorId: childActorId,
        status: "active",
        state: "running",
        parentState: "running",
      },
    });

    await harness.dispose();

    expect(childEntries).toBe(0);
    expect(harness.state()).toBe("running");
    expect(harness.children()).toMatchObject({
      [childId]: {
        id: childId,
        actorId: childActorId,
        status: "stopped",
        state: "running",
        parentState: "running",
      },
    });
    expect(harness.childTree()).toEqual({
      [childId]: {
        id: childId,
        actorId: childActorId,
        status: "stopped",
        state: "running",
        parentState: "running",
        children: {},
      },
    });
    expect(harness.childSummary()).toEqual({
      idsByStatus: {
        idle: [],
        active: [],
        success: [],
        failure: [],
        interrupt: [],
        stopped: [childId],
      },
      outcomes: {
        start: [childId],
        success: [],
        failure: [],
        interrupt: [],
        stop: [childId],
      },
      byId: {
        [childId]: {
          actorId: childActorId,
          status: "stopped",
          state: "running",
          parentState: "running",
        },
      },
    });
    expect(harness.serialize().children[childId]).toMatchObject({
      id: childId,
      actorId: childActorId,
      status: "stopped",
      state: "running",
      parentState: "running",
    });
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual([
      "actor:start",
      "child:start",
      "actor:restore",
      "child:stop",
      "actor:dispose",
    ]);
    expect(
      harness
        .receipts()
        .filter((receipt) => receipt.type === "child:stop" && receipt.id === childId),
    ).toHaveLength(1);
    expect(harness.receipts().filter((receipt) => receipt.type === "actor:dispose")).toHaveLength(
      1,
    );
  });

  it("removes a restored child from the parent snapshot when the child actor is stopped directly", async () => {
    let childEntries = 0;

    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.rehydrate.child.direct-stop.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            childEntries += 1;
          },
        },
      },
    });

    const childId = "flow-test.rehydrate.child.direct-stop.binding";
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "STOP" }>,
      "idle" | "running" | "done"
    >({
      id: "flow-test.rehydrate.child.direct-stop.parent.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        running: {
          invoke: flow.child({
            id: childId,
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
          on: {
            STOP: "done",
          },
        },
        done: {},
      },
    });

    const childActorId =
      "flow-test.rehydrate.child.direct-stop.parent.actor/flow-test.rehydrate.child.direct-stop.binding";
    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.child.direct-stop.parent.actor",
      snapshot: Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "running" as const,
        children: {
          [childId]: {
            id: childId,
            actorId: childActorId,
            status: "active" as const,
            state: "running",
            parentState: "running",
            snapshot: childMachine.getInitialSnapshot(),
          },
        },
        receipts: [
          { type: "actor:start", id: "flow-test.rehydrate.child.direct-stop.parent.actor" },
          {
            type: "child:start",
            id: childId,
            actorId: childActorId,
            parentState: "running",
            state: "running",
          },
        ],
      }),
    });

    try {
      expect(childEntries).toBe(0);
      expect(harness.state()).toBe("running");
      expect(harness.children()).toMatchObject({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "running",
        },
      });

      await harness.runtime.orchestrators.stop(childActorId);
      await harness.flush();

      expect(childEntries).toBe(0);
      expect(harness.state()).toBe("running");
      expect(harness.children()).toEqual({});
      expect(harness.childTree()).toEqual({});
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
          start: [childId],
          success: [],
          failure: [],
          interrupt: [],
          stop: [childId],
        },
        byId: {},
      });
      expect(harness.serialize().children).toEqual({});
      expect(harness.runtime.orchestrators.get(childActorId)).toBe(null);
      expect(harness.receipts().map((receipt) => receipt.type)).toEqual([
        "actor:start",
        "child:start",
        "actor:restore",
        "child:stop",
      ]);
      expect(
        harness
          .receipts()
          .filter((receipt) => receipt.type === "child:stop" && receipt.id === childId),
      ).toHaveLength(1);
    } finally {
      await harness.dispose();
    }
  });

  it("keeps a restored child flow.after transition aligned with the injected test clock", async () => {
    let childEntries = 0;

    const childTimerId = "flow-test.rehydrate.child.timed.after";
    const childMachine = flow.machine<{}, never, "waiting" | "done">({
      id: "flow-test.rehydrate.child.timed.machine",
      initial: "waiting",
      context: () => ({}),
      states: {
        waiting: {
          entry: () => {
            childEntries += 1;
          },
          after: flow.after({
            id: childTimerId,
            delay: "2 seconds",
            target: "done",
          }),
        },
        done: {
          type: "final",
        },
      },
    });

    const childId = "flow-test.rehydrate.child.timed.binding";
    const machine = flow.machine<{}, Readonly<{ readonly type: "START" }>, "idle" | "running">({
      id: "flow-test.rehydrate.child.timed.parent.machine",
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
            id: childId,
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
        },
      },
    });

    const childActorId =
      "flow-test.rehydrate.child.timed.parent.actor/flow-test.rehydrate.child.timed.binding";
    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.child.timed.parent.actor",
      snapshot: Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "running" as const,
        children: {
          [childId]: {
            id: childId,
            actorId: childActorId,
            status: "active" as const,
            state: "waiting",
            parentState: "running",
            snapshot: Object.freeze({
              ...childMachine.getInitialSnapshot(),
              value: "waiting" as const,
              timers: {
                [childTimerId]: {
                  id: childTimerId,
                  status: "scheduled" as const,
                  generation: 2,
                  parentState: "waiting",
                  startedAt: 0,
                  dueAt: 2_000,
                },
              },
              receipts: [
                {
                  type: "timer:start",
                  id: childTimerId,
                  generation: 2,
                  parentState: "waiting",
                  startedAt: 0,
                  dueAt: 2_000,
                  scheduledMillis: 2_000,
                  restored: false,
                },
              ],
            }),
          },
        },
        receipts: [
          { type: "actor:start", id: "flow-test.rehydrate.child.timed.parent.actor" },
          {
            type: "child:start",
            id: childId,
            actorId: childActorId,
            parentState: "running",
            state: "waiting",
          },
        ],
      }),
    });

    try {
      expect(childEntries).toBe(0);
      expect(harness.state()).toBe("running");
      expect(harness.children()).toMatchObject({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "waiting",
          parentState: "running",
        },
      });

      await harness.advance("1999 millis");
      await harness.flush();

      expect(childEntries).toBe(0);
      expect(harness.state()).toBe("running");
      expect(harness.children()).toMatchObject({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "waiting",
          parentState: "running",
        },
      });

      await harness.advance("1 millis");
      await harness.flush();

      expect(childEntries).toBe(0);
      expect(harness.state()).toBe("running");
      expect(harness.children()).toEqual({});
      expect(harness.childTree()).toEqual({});
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
          start: [childId],
          success: [childId],
          failure: [],
          interrupt: [],
          stop: [],
        },
        byId: {},
      });
      expect(harness.serialize().children).toEqual({});
      expect(harness.runtime.orchestrators.get(childActorId)).toBe(null);
      expect(
        harness
          .receipts()
          .filter((receipt) => receipt.type === "child:success" && receipt.id === childId),
      ).toHaveLength(1);
    } finally {
      await harness.dispose();
    }
  });

  it("lets a restored active child complete and removes it from the parent snapshot", async () => {
    let childEntries = 0;

    const childMachine = flow.machine<
      {},
      Readonly<{ readonly type: "COMPLETE" }>,
      "running" | "done"
    >({
      id: "flow-test.rehydrate.child.complete.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            childEntries += 1;
          },
          on: {
            COMPLETE: "done",
          },
        },
        done: {
          type: "final",
        },
      },
    });

    const machine = flow.machine<{}, never, "idle" | "running">({
      id: "flow-test.rehydrate.child.complete.parent.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        running: {
          invoke: flow.child({
            id: "flow-test.rehydrate.child.complete.binding",
            machine: childMachine,
          }),
        },
      },
    });

    const childActorId =
      "flow-test.rehydrate.child.complete.parent.actor/flow-test.rehydrate.child.complete.binding";
    const childId = "flow-test.rehydrate.child.complete.binding";
    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.child.complete.parent.actor",
      snapshot: Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "running" as const,
        children: {
          [childId]: {
            id: childId,
            actorId: childActorId,
            status: "active" as const,
            state: "running",
            parentState: "running",
            snapshot: childMachine.getInitialSnapshot(),
          },
        },
        receipts: [
          { type: "actor:start", id: "flow-test.rehydrate.child.complete.parent.actor" },
          {
            type: "child:start",
            id: childId,
            actorId: childActorId,
            parentState: "running",
            state: "running",
          },
        ],
      }),
    });

    try {
      const restoredChild = harness.runtime.orchestrators.get(childActorId);

      expect(restoredChild).not.toBe(null);
      expect(childEntries).toBe(0);
      expect(harness.state()).toBe("running");
      expect(harness.children()).toMatchObject({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "running",
        },
      });

      restoredChild?.send({ type: "COMPLETE" });
      await restoredChild?.flush();
      await harness.flush();

      expect(childEntries).toBe(0);
      expect(harness.state()).toBe("running");
      expect(harness.children()).toEqual({});
      expect(harness.childTree()).toEqual({});
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
          start: [childId],
          success: [childId],
          failure: [],
          interrupt: [],
          stop: [],
        },
        byId: {},
      });
      expect(harness.serialize().children).toEqual({});
      expect(harness.receipts().map((receipt) => receipt.type)).toEqual([
        "actor:start",
        "child:start",
        "actor:restore",
        "child:success",
      ]);
      expect(
        harness
          .receipts()
          .filter((receipt) => receipt.type === "child:success" && receipt.id === childId),
      ).toHaveLength(1);
    } finally {
      await harness.dispose();
    }
  });

  it("keeps restored child failure outcomes distinct from success and stop without replaying child entry work", async () => {
    let childEntries = 0;

    const childStream = createControlledStream<string, Error>(
      "flow-test.rehydrate.child.failure.stream",
    );
    const childStreamId = "flow-test.rehydrate.child.failure.tokens";
    const childMachine = flow.machine<{}, { readonly type: "CHILD_TOKEN" }, "running">({
      id: "flow-test.rehydrate.child.failure.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            childEntries += 1;
          },
          invoke: flow.stream<{}, { readonly type: "CHILD_TOKEN" }, void, string, Error>({
            id: childStreamId,
            subscribe: () => childStream.stream(),
            routes: {
              value: () => ({ type: "CHILD_TOKEN" }),
            },
          }),
        },
      },
    });

    const childId = "flow-test.rehydrate.child.failure.binding";
    const machine = flow.machine<{}, never, "idle" | "running">({
      id: "flow-test.rehydrate.child.failure.parent.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        running: {
          invoke: flow.child({
            id: childId,
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
        },
      },
    });

    const childActorId =
      "flow-test.rehydrate.child.failure.parent.actor/flow-test.rehydrate.child.failure.binding";
    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.child.failure.parent.actor",
      snapshot: Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "running" as const,
        children: {
          [childId]: {
            id: childId,
            actorId: childActorId,
            status: "active" as const,
            state: "running",
            parentState: "running",
            snapshot: Object.freeze({
              ...childMachine.getInitialSnapshot(),
              value: "running" as const,
              streams: {
                [childStreamId]: {
                  id: childStreamId,
                  status: "running" as const,
                  generation: 2,
                  emitted: 0,
                },
              },
              receipts: [
                {
                  type: "stream:start",
                  id: childStreamId,
                  generation: 2,
                  parentState: "running",
                },
              ],
            }),
          },
        },
        receipts: [
          { type: "actor:start", id: "flow-test.rehydrate.child.failure.parent.actor" },
          {
            type: "child:start",
            id: childId,
            actorId: childActorId,
            parentState: "running",
            state: "running",
          },
        ],
      }),
    });

    try {
      const restoredChild = harness.runtime.orchestrators.get(childActorId);

      expect(restoredChild).not.toBe(null);
      expect(childEntries).toBe(0);
      expect(harness.state()).toBe("running");
      expect(harness.children()).toMatchObject({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "running",
        },
      });

      childStream.fail(new Error("child stream failed"));
      await restoredChild?.flush();
      await harness.flush();

      expect(childEntries).toBe(0);
      expect(harness.state()).toBe("running");
      expect(harness.children()[childId]).toMatchObject({
        id: childId,
        actorId: childActorId,
        status: "failure",
        state: "running",
        parentState: "running",
      });
      expect(harness.childTree()).toEqual({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "failure",
          state: "running",
          parentState: "running",
          supervision: "stop-on-failure",
          children: {},
        },
      });
      expect(harness.childSummary()).toEqual({
        idsByStatus: {
          idle: [],
          active: [],
          success: [],
          failure: [childId],
          interrupt: [],
          stopped: [],
        },
        outcomes: {
          start: [childId],
          success: [],
          failure: [childId],
          interrupt: [],
          stop: [],
        },
        byId: {
          [childId]: {
            actorId: childActorId,
            status: "failure",
            state: "running",
            parentState: "running",
            supervision: "stop-on-failure",
          },
        },
      });
      expect(harness.serialize().children[childId]).toMatchObject({
        id: childId,
        actorId: childActorId,
        status: "failure",
        state: "running",
        parentState: "running",
      });
      expect(harness.receipts().map((receipt) => receipt.type)).toEqual([
        "actor:start",
        "child:start",
        "actor:restore",
        "child:failure",
      ]);
      expect(
        harness
          .receipts()
          .filter((receipt) => receipt.type === "child:failure" && receipt.id === childId),
      ).toHaveLength(1);
      expect(harness.issues()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "failure",
            source: "child",
            id: childId,
          }),
        ]),
      );
    } finally {
      await harness.dispose();
    }
  });

  it("re-registers a restored child exactly once on a reentering self-transition", async () => {
    let childEntries = 0;

    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.rehydrate.child.reenter.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            childEntries += 1;
          },
        },
      },
    });

    const childId = "flow-test.rehydrate.child.reenter.binding";
    const machine = flow.machine<{}, Readonly<{ readonly type: "REENTER" }>, "idle" | "running">({
      id: "flow-test.rehydrate.child.reenter.parent.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        running: {
          invoke: flow.child({
            id: childId,
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
          on: {
            REENTER: {
              target: "running",
              reenter: true,
            },
          },
        },
      },
    });

    const childActorId =
      "flow-test.rehydrate.child.reenter.parent.actor/flow-test.rehydrate.child.reenter.binding";
    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.child.reenter.parent.actor",
      snapshot: Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "running" as const,
        children: {
          [childId]: {
            id: childId,
            actorId: childActorId,
            status: "active" as const,
            state: "running",
            parentState: "running",
            snapshot: childMachine.getInitialSnapshot(),
          },
        },
        receipts: [
          { type: "actor:start", id: "flow-test.rehydrate.child.reenter.parent.actor" },
          {
            type: "child:start",
            id: childId,
            actorId: childActorId,
            parentState: "running",
            state: "running",
          },
        ],
      }),
    });

    try {
      const restoredChild = harness.runtime.orchestrators.get(childActorId);

      expect(restoredChild).not.toBe(null);
      expect(childEntries).toBe(0);
      expect(harness.children()).toMatchObject({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "running",
        },
      });

      harness.send({ type: "REENTER" });
      await harness.flush();

      const replacedChild = harness.runtime.orchestrators.get(childActorId);

      expect(childEntries).toBe(0);
      expect(replacedChild).not.toBe(null);
      expect(replacedChild).not.toBe(restoredChild);
      expect(harness.state()).toBe("running");
      expect(harness.children()).toMatchObject({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "running",
        },
      });
      expect(harness.childTree()).toEqual({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "running",
          supervision: "stop-on-failure",
          children: {},
        },
      });
      expect(harness.childSummary()).toEqual({
        idsByStatus: {
          idle: [],
          active: [childId],
          success: [],
          failure: [],
          interrupt: [],
          stopped: [],
        },
        outcomes: {
          start: [childId, childId],
          success: [],
          failure: [],
          interrupt: [],
          stop: [childId],
        },
        byId: {
          [childId]: {
            actorId: childActorId,
            status: "active",
            state: "running",
            parentState: "running",
            supervision: "stop-on-failure",
          },
        },
      });
      expect(harness.receipts().map((receipt) => receipt.type)).toEqual([
        "actor:start",
        "child:start",
        "actor:restore",
        "machine:event",
        "machine:transition",
        "machine:microstep",
        "child:stop",
        "child:start",
      ]);
      expect(
        harness
          .receipts()
          .filter((receipt) => receipt.type === "child:start" && receipt.id === childId),
      ).toHaveLength(2);
      expect(
        harness
          .receipts()
          .filter((receipt) => receipt.type === "child:stop" && receipt.id === childId),
      ).toHaveLength(1);
    } finally {
      await harness.dispose();
    }
  });

  it("re-registers a restored child when moving between invoking parent states", async () => {
    let childEntries = 0;

    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.rehydrate.child.switch.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            childEntries += 1;
          },
        },
      },
    });

    const childId = "flow-test.rehydrate.child.switch.binding";
    const machine = flow.machine<{}, Readonly<{ readonly type: "NEXT" }>, "alpha" | "beta">({
      id: "flow-test.rehydrate.child.switch.parent.machine",
      initial: "alpha",
      context: () => ({}),
      states: {
        alpha: {
          invoke: flow.child({
            id: childId,
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
          on: {
            NEXT: "beta",
          },
        },
        beta: {
          invoke: flow.child({
            id: childId,
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
        },
      },
    });

    const childActorId =
      "flow-test.rehydrate.child.switch.parent.actor/flow-test.rehydrate.child.switch.binding";
    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.child.switch.parent.actor",
      snapshot: Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "alpha" as const,
        children: {
          [childId]: {
            id: childId,
            actorId: childActorId,
            status: "active" as const,
            state: "running",
            parentState: "alpha",
            snapshot: childMachine.getInitialSnapshot(),
          },
        },
        receipts: [
          { type: "actor:start", id: "flow-test.rehydrate.child.switch.parent.actor" },
          {
            type: "child:start",
            id: childId,
            actorId: childActorId,
            parentState: "alpha",
            state: "running",
          },
        ],
      }),
    });

    try {
      const restoredChild = harness.runtime.orchestrators.get(childActorId);

      expect(restoredChild).not.toBe(null);
      expect(childEntries).toBe(0);
      expect(harness.state()).toBe("alpha");
      expect(harness.children()).toMatchObject({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "alpha",
        },
      });

      harness.send({ type: "NEXT" });
      await harness.flush();

      const replacedChild = harness.runtime.orchestrators.get(childActorId);

      expect(childEntries).toBe(0);
      expect(replacedChild).not.toBe(null);
      expect(replacedChild).not.toBe(restoredChild);
      expect(harness.state()).toBe("beta");
      expect(harness.children()).toMatchObject({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "beta",
        },
      });
      expect(harness.childTree()).toEqual({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "beta",
          supervision: "stop-on-failure",
          children: {},
        },
      });
      expect(harness.childSummary()).toEqual({
        idsByStatus: {
          idle: [],
          active: [childId],
          success: [],
          failure: [],
          interrupt: [],
          stopped: [],
        },
        outcomes: {
          start: [childId, childId],
          success: [],
          failure: [],
          interrupt: [],
          stop: [childId],
        },
        byId: {
          [childId]: {
            actorId: childActorId,
            status: "active",
            state: "running",
            parentState: "beta",
            supervision: "stop-on-failure",
          },
        },
      });
      expect(harness.receipts().map((receipt) => receipt.type)).toEqual([
        "actor:start",
        "child:start",
        "actor:restore",
        "machine:event",
        "machine:transition",
        "machine:microstep",
        "child:stop",
        "child:start",
      ]);
      expect(
        harness
          .receipts()
          .filter((receipt) => receipt.type === "child:start" && receipt.id === childId),
      ).toHaveLength(2);
      expect(
        harness
          .receipts()
          .filter((receipt) => receipt.type === "child:stop" && receipt.id === childId),
      ).toHaveLength(1);
    } finally {
      await harness.dispose();
    }
  });

  it("preserves restored nested child trees without replaying child or grandchild entry work", async () => {
    let childEntries = 0;
    let grandchildEntries = 0;

    const grandchildMachine = flow.machine<{}, never, "running">({
      id: "flow-test.rehydrate.nested.grandchild.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            grandchildEntries += 1;
          },
        },
      },
    });

    const grandchildId = "flow-test.rehydrate.nested.grandchild.binding";
    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.rehydrate.nested.child.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            childEntries += 1;
          },
          invoke: flow.child({
            id: grandchildId,
            machine: grandchildMachine,
          }),
        },
      },
    });

    const childId = "flow-test.rehydrate.nested.child.binding";
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "STOP" }>,
      "idle" | "running" | "done"
    >({
      id: "flow-test.rehydrate.nested.parent.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        running: {
          invoke: flow.child({
            id: childId,
            machine: childMachine,
          }),
          on: {
            STOP: "done",
          },
        },
        done: {},
      },
    });

    const childActorId =
      "flow-test.rehydrate.nested.parent.actor/flow-test.rehydrate.nested.child.binding";
    const grandchildActorId = `${childActorId}/${grandchildId}`;
    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.nested.parent.actor",
      snapshot: Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "running" as const,
        children: {
          [childId]: {
            id: childId,
            actorId: childActorId,
            status: "active" as const,
            state: "running",
            parentState: "running",
            snapshot: Object.freeze({
              ...childMachine.getInitialSnapshot(),
              value: "running" as const,
              children: {
                [grandchildId]: {
                  id: grandchildId,
                  actorId: grandchildActorId,
                  status: "active" as const,
                  state: "running",
                  parentState: "running",
                  snapshot: grandchildMachine.getInitialSnapshot(),
                },
              },
              receipts: [
                {
                  type: "child:start",
                  id: grandchildId,
                  actorId: grandchildActorId,
                  parentState: "running",
                  state: "running",
                },
              ],
            }),
          },
        },
        receipts: [
          { type: "actor:start", id: "flow-test.rehydrate.nested.parent.actor" },
          {
            type: "child:start",
            id: childId,
            actorId: childActorId,
            parentState: "running",
            state: "running",
          },
        ],
      }),
    });

    try {
      expect(childEntries).toBe(0);
      expect(grandchildEntries).toBe(0);
      expect(harness.can({ type: "STOP" })).toBe(true);
      expect(harness.children()).toMatchObject({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "running",
          snapshot: {
            value: "running",
            children: {
              [grandchildId]: {
                id: grandchildId,
                actorId: grandchildActorId,
                status: "active",
                state: "running",
                parentState: "running",
              },
            },
          },
        },
      });
      expect(harness.childTree()).toEqual({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "running",
          children: {
            [grandchildId]: {
              id: grandchildId,
              actorId: grandchildActorId,
              status: "active",
              state: "running",
              parentState: "running",
              children: {},
            },
          },
        },
      });
      expect(harness.serialize().children[childId]).toMatchObject({
        id: childId,
        actorId: childActorId,
        status: "active",
        state: "running",
        parentState: "running",
        snapshot: {
          value: "running",
          children: {
            [grandchildId]: {
              id: grandchildId,
              actorId: grandchildActorId,
              status: "active",
              state: "running",
              parentState: "running",
            },
          },
        },
      });
      expect(harness.runtime.orchestrators.get(childActorId)?.snapshot().value).toBe("running");
      expect(harness.runtime.orchestrators.get(grandchildActorId)?.snapshot().value).toBe(
        "running",
      );
      expect(harness.receipts().map((receipt) => receipt.type)).toEqual([
        "actor:start",
        "child:start",
        "actor:restore",
      ]);
    } finally {
      await harness.dispose();
    }
  });

  it("lets a restored nested child tree finish and collapse without replaying child or grandchild entry work", async () => {
    let childEntries = 0;
    let grandchildEntries = 0;

    const grandchildMachine = flow.machine<{}, never, "running">({
      id: "flow-test.rehydrate.nested.complete.grandchild.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            grandchildEntries += 1;
          },
        },
      },
    });

    const grandchildId = "flow-test.rehydrate.nested.complete.grandchild.binding";
    const childMachine = flow.machine<
      {},
      Readonly<{ readonly type: "COMPLETE" }>,
      "running" | "done"
    >({
      id: "flow-test.rehydrate.nested.complete.child.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            childEntries += 1;
          },
          invoke: flow.child({
            id: grandchildId,
            machine: grandchildMachine,
          }),
          on: {
            COMPLETE: "done",
          },
        },
        done: {
          type: "final",
        },
      },
    });

    const childId = "flow-test.rehydrate.nested.complete.child.binding";
    const machine = flow.machine<{}, never, "idle" | "running">({
      id: "flow-test.rehydrate.nested.complete.parent.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        running: {
          invoke: flow.child({
            id: childId,
            machine: childMachine,
          }),
        },
      },
    });

    const childActorId =
      "flow-test.rehydrate.nested.complete.parent.actor/flow-test.rehydrate.nested.complete.child.binding";
    const grandchildActorId = `${childActorId}/${grandchildId}`;
    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.nested.complete.parent.actor",
      snapshot: Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "running" as const,
        children: {
          [childId]: {
            id: childId,
            actorId: childActorId,
            status: "active" as const,
            state: "running",
            parentState: "running",
            snapshot: Object.freeze({
              ...childMachine.getInitialSnapshot(),
              value: "running" as const,
              children: {
                [grandchildId]: {
                  id: grandchildId,
                  actorId: grandchildActorId,
                  status: "active" as const,
                  state: "running",
                  parentState: "running",
                  snapshot: grandchildMachine.getInitialSnapshot(),
                },
              },
              receipts: [
                {
                  type: "child:start",
                  id: grandchildId,
                  actorId: grandchildActorId,
                  parentState: "running",
                  state: "running",
                },
              ],
            }),
          },
        },
        receipts: [
          { type: "actor:start", id: "flow-test.rehydrate.nested.complete.parent.actor" },
          {
            type: "child:start",
            id: childId,
            actorId: childActorId,
            parentState: "running",
            state: "running",
          },
        ],
      }),
    });

    try {
      const restoredChild = harness.runtime.orchestrators.get(childActorId);

      expect(restoredChild).not.toBe(null);
      expect(childEntries).toBe(0);
      expect(grandchildEntries).toBe(0);
      expect(harness.children()).toMatchObject({
        [childId]: {
          id: childId,
          actorId: childActorId,
          status: "active",
          state: "running",
          parentState: "running",
          snapshot: {
            value: "running",
            children: {
              [grandchildId]: {
                id: grandchildId,
                actorId: grandchildActorId,
                status: "active",
                state: "running",
                parentState: "running",
              },
            },
          },
        },
      });
      expect(harness.runtime.orchestrators.get(grandchildActorId)?.snapshot().value).toBe(
        "running",
      );

      restoredChild?.send({ type: "COMPLETE" });
      await restoredChild?.flush();
      await harness.flush();

      expect(childEntries).toBe(0);
      expect(grandchildEntries).toBe(0);
      expect(harness.state()).toBe("running");
      expect(harness.children()).toEqual({});
      expect(harness.childTree()).toEqual({});
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
          start: [childId],
          success: [childId],
          failure: [],
          interrupt: [],
          stop: [],
        },
        byId: {},
      });
      expect(harness.serialize().children).toEqual({});
      expect(harness.runtime.orchestrators.get(childActorId)).toBe(null);
      expect(harness.runtime.orchestrators.get(grandchildActorId)).toBe(null);
      expect(harness.receipts().map((receipt) => receipt.type)).toEqual([
        "actor:start",
        "child:start",
        "actor:restore",
        "child:success",
      ]);
      expect(
        harness
          .receipts()
          .filter((receipt) => receipt.type === "child:success" && receipt.id === childId),
      ).toHaveLength(1);
    } finally {
      await harness.dispose();
    }
  });

  it("removes restored nested child trees after parent state exit without replaying child or grandchild entry work", async () => {
    let childEntries = 0;
    let grandchildEntries = 0;

    const grandchildMachine = flow.machine<{}, never, "running">({
      id: "flow-test.rehydrate.nested.cleanup.grandchild.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            grandchildEntries += 1;
          },
        },
      },
    });

    const grandchildId = "flow-test.rehydrate.nested.cleanup.grandchild.binding";
    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.rehydrate.nested.cleanup.child.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            childEntries += 1;
          },
          invoke: flow.child({
            id: grandchildId,
            machine: grandchildMachine,
          }),
        },
      },
    });

    const childId = "flow-test.rehydrate.nested.cleanup.child.binding";
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "STOP" }>,
      "idle" | "running" | "done"
    >({
      id: "flow-test.rehydrate.nested.cleanup.parent.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        running: {
          invoke: flow.child({
            id: childId,
            machine: childMachine,
          }),
          on: {
            STOP: "done",
          },
        },
        done: {},
      },
    });

    const childActorId =
      "flow-test.rehydrate.nested.cleanup.parent.actor/flow-test.rehydrate.nested.cleanup.child.binding";
    const grandchildActorId = `${childActorId}/${grandchildId}`;
    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.nested.cleanup.parent.actor",
      snapshot: Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "running" as const,
        children: {
          [childId]: {
            id: childId,
            actorId: childActorId,
            status: "active" as const,
            state: "running",
            parentState: "running",
            snapshot: Object.freeze({
              ...childMachine.getInitialSnapshot(),
              value: "running" as const,
              children: {
                [grandchildId]: {
                  id: grandchildId,
                  actorId: grandchildActorId,
                  status: "active" as const,
                  state: "running",
                  parentState: "running",
                  snapshot: grandchildMachine.getInitialSnapshot(),
                },
              },
              receipts: [
                {
                  type: "child:start",
                  id: grandchildId,
                  actorId: grandchildActorId,
                  parentState: "running",
                  state: "running",
                },
              ],
            }),
          },
        },
        receipts: [
          { type: "actor:start", id: "flow-test.rehydrate.nested.cleanup.parent.actor" },
          {
            type: "child:start",
            id: childId,
            actorId: childActorId,
            parentState: "running",
            state: "running",
          },
        ],
      }),
    });

    try {
      expect(childEntries).toBe(0);
      expect(grandchildEntries).toBe(0);

      harness.send({ type: "STOP" });
      await harness.flush();

      expect(childEntries).toBe(0);
      expect(grandchildEntries).toBe(0);
      expect(harness.state()).toBe("done");
      expect(harness.children()).toEqual({});
      expect(harness.childTree()).toEqual({});
      expect(harness.childSummary().idsByStatus.active).toEqual([]);
      expect(harness.childSummary().outcomes.stop).toEqual([childId]);
      expect(harness.serialize().children).toEqual({});
      expect(harness.runtime.orchestrators.get(childActorId)).toBe(null);
      expect(harness.runtime.orchestrators.get(grandchildActorId)).toBe(null);
      expect(harness.receipts().map((receipt) => receipt.type)).toEqual([
        "actor:start",
        "child:start",
        "actor:restore",
        "machine:event",
        "machine:transition",
        "machine:microstep",
        "child:stop",
      ]);
      expect(
        harness
          .receipts()
          .filter((receipt) => receipt.type === "child:stop" && receipt.id === childId),
      ).toHaveLength(1);
    } finally {
      await harness.dispose();
    }
  });

  it("marks restored nested child trees stopped before harness disposal without replaying child or grandchild entry work", async () => {
    let childEntries = 0;
    let grandchildEntries = 0;

    const grandchildMachine = flow.machine<{}, never, "running">({
      id: "flow-test.rehydrate.nested.dispose.grandchild.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            grandchildEntries += 1;
          },
        },
      },
    });

    const grandchildId = "flow-test.rehydrate.nested.dispose.grandchild.binding";
    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.rehydrate.nested.dispose.child.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            childEntries += 1;
          },
          invoke: flow.child({
            id: grandchildId,
            machine: grandchildMachine,
          }),
        },
      },
    });

    const childId = "flow-test.rehydrate.nested.dispose.child.binding";
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "STOP" }>,
      "idle" | "running" | "done"
    >({
      id: "flow-test.rehydrate.nested.dispose.parent.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        running: {
          invoke: flow.child({
            id: childId,
            machine: childMachine,
          }),
          on: {
            STOP: "done",
          },
        },
        done: {},
      },
    });

    const childActorId =
      "flow-test.rehydrate.nested.dispose.parent.actor/flow-test.rehydrate.nested.dispose.child.binding";
    const grandchildActorId = `${childActorId}/${grandchildId}`;
    const harness = test.rehydrate(machine, {
      id: "flow-test.rehydrate.nested.dispose.parent.actor",
      snapshot: Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "running" as const,
        children: {
          [childId]: {
            id: childId,
            actorId: childActorId,
            status: "active" as const,
            state: "running",
            parentState: "running",
            snapshot: Object.freeze({
              ...childMachine.getInitialSnapshot(),
              value: "running" as const,
              children: {
                [grandchildId]: {
                  id: grandchildId,
                  actorId: grandchildActorId,
                  status: "active" as const,
                  state: "running",
                  parentState: "running",
                  snapshot: grandchildMachine.getInitialSnapshot(),
                },
              },
              receipts: [
                {
                  type: "child:start",
                  id: grandchildId,
                  actorId: grandchildActorId,
                  parentState: "running",
                  state: "running",
                },
              ],
            }),
          },
        },
        receipts: [
          { type: "actor:start", id: "flow-test.rehydrate.nested.dispose.parent.actor" },
          {
            type: "child:start",
            id: childId,
            actorId: childActorId,
            parentState: "running",
            state: "running",
          },
        ],
      }),
    });

    expect(childEntries).toBe(0);
    expect(grandchildEntries).toBe(0);
    expect(harness.state()).toBe("running");
    expect(harness.children()).toMatchObject({
      [childId]: {
        id: childId,
        actorId: childActorId,
        status: "active",
        state: "running",
        parentState: "running",
        snapshot: {
          value: "running",
          children: {
            [grandchildId]: {
              id: grandchildId,
              actorId: grandchildActorId,
              status: "active",
              state: "running",
              parentState: "running",
            },
          },
        },
      },
    });

    await harness.dispose();

    expect(childEntries).toBe(0);
    expect(grandchildEntries).toBe(0);
    expect(harness.state()).toBe("running");
    expect(harness.children()).toMatchObject({
      [childId]: {
        id: childId,
        actorId: childActorId,
        status: "stopped",
        state: "running",
        parentState: "running",
        snapshot: {
          value: "running",
          children: {
            [grandchildId]: {
              id: grandchildId,
              actorId: grandchildActorId,
              status: "active",
              state: "running",
              parentState: "running",
            },
          },
        },
      },
    });
    expect(harness.childTree()).toEqual({
      [childId]: {
        id: childId,
        actorId: childActorId,
        status: "stopped",
        state: "running",
        parentState: "running",
        children: {
          [grandchildId]: {
            id: grandchildId,
            actorId: grandchildActorId,
            status: "active",
            state: "running",
            parentState: "running",
            children: {},
          },
        },
      },
    });
    expect(harness.childSummary()).toEqual({
      idsByStatus: {
        idle: [],
        active: [],
        success: [],
        failure: [],
        interrupt: [],
        stopped: [childId],
      },
      outcomes: {
        start: [childId],
        success: [],
        failure: [],
        interrupt: [],
        stop: [childId],
      },
      byId: {
        [childId]: {
          actorId: childActorId,
          status: "stopped",
          state: "running",
          parentState: "running",
        },
      },
    });
    expect(harness.serialize().children[childId]).toMatchObject({
      id: childId,
      actorId: childActorId,
      status: "stopped",
      state: "running",
      parentState: "running",
      snapshot: {
        value: "running",
        children: {
          [grandchildId]: {
            id: grandchildId,
            actorId: grandchildActorId,
            status: "active",
            state: "running",
            parentState: "running",
          },
        },
      },
    });
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual([
      "actor:start",
      "child:start",
      "actor:restore",
      "child:stop",
      "actor:dispose",
    ]);
    expect(
      harness
        .receipts()
        .filter((receipt) => receipt.type === "child:stop" && receipt.id === childId),
    ).toHaveLength(1);
    expect(harness.receipts().filter((receipt) => receipt.type === "actor:dispose")).toHaveLength(
      1,
    );
  });

  it("rehydrates app scenarios with typed fixtures and seeded runtime resources", async () => {
    const machine = flow.machine<{}, never, "idle">({
      id: "flow-test.rehydrate.app.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });

    const rehydrationApp = flow.app({
      modules: [
        flow.module(
          "RehydrationModule",
          {
            resources: {
              project: projectResource,
            },
            fixtures: {
              rehydrationSeed,
            },
            machines: focusedMachineInventory(machine),
          },
          {
            fixtures: ["rehydrationSeed"] as const,
          },
        ),
      ],
    });

    const harness = test.app(rehydrationApp).rehydrate(machine, {
      snapshot: machine.getInitialSnapshot(),
      fixtures: ["rehydrationSeed"],
    });

    try {
      expect(harness.runtime.resources.get(projectResource.ref("project-1"))).toMatchObject({
        id: "rehydrate.fixture.project",
        status: "success",
        value: { id: "project-1", name: "Seeded project" },
      });
      expect(harness.pendingWork()).toMatchObject({
        ready: 0,
        activeFibers: 0,
        mailboxes: [],
        streams: [],
        transactions: [],
        timers: [],
        children: [],
      });
      expect(harness.snapshot()).toMatchObject({
        value: "idle",
        context: {},
        resources: {},
        transactions: {},
        streams: {},
        timers: {},
        children: {},
      });
      expect(harness.captureTrace().report.actors.map((receipt) => receipt.type)).toEqual([
        "actor:restore",
      ]);
      expect(harness.receiptSummary().receiptTypes).toEqual(["actor:restore"]);
    } finally {
      await harness.dispose();
    }
  });

  it("rejects a rehydrated pending transaction snapshot that does not belong to the destination state", () => {
    let commits = 0;

    const saveTransaction = flow.transaction({
      id: "flow-test.rehydrate.invalid.pending.save",
      params: () => ({ id: "restore-1" }),
      commit: () =>
        Effect.sync(() => {
          commits += 1;
          return { ok: true } as const;
        }),
    });

    const machine = flow.machine<{}, never, "idle" | "busy">({
      id: "flow-test.rehydrate.invalid.pending.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        busy: {
          invoke: flow.run(saveTransaction),
        },
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "idle" as const,
      transactions: {
        "flow-test.rehydrate.invalid.pending.save": {
          id: "flow-test.rehydrate.invalid.pending.save",
          status: "pending" as const,
        },
      },
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.invalid.pending.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TXN-005",
      debug: {
        machineId: "flow-test.rehydrate.invalid.pending.machine",
        transactionId: "flow-test.rehydrate.invalid.pending.save",
        parentState: "idle",
        status: "pending",
        reason: "pending-transaction-not-in-restored-state",
        allowedTransactionIds: [],
      },
    });
    expect(commits).toBe(0);
  });

  it("rejects a rehydrated queued transaction snapshot because restore cannot reconcile queue ownership metadata", () => {
    let commits = 0;

    const saveTransaction = flow.transaction({
      id: "flow-test.rehydrate.invalid.queued.save",
      params: () => ({ id: "restore-1" }),
      commit: () =>
        Effect.sync(() => {
          commits += 1;
          return { ok: true } as const;
        }),
      concurrency: "serialize",
    });

    const machine = flow.machine<{}, never, "idle" | "busy">({
      id: "flow-test.rehydrate.invalid.queued.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        busy: {
          invoke: flow.run(saveTransaction),
        },
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "busy" as const,
      transactions: {
        "flow-test.rehydrate.invalid.queued.save": {
          id: "flow-test.rehydrate.invalid.queued.save",
          status: "queued" as const,
        },
      },
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.invalid.queued.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TXN-005",
      debug: {
        machineId: "flow-test.rehydrate.invalid.queued.machine",
        transactionId: "flow-test.rehydrate.invalid.queued.save",
        parentState: "busy",
        status: "queued",
        reason: "queued-transaction-restore-not-supported",
        allowedTransactionIds: ["flow-test.rehydrate.invalid.queued.save"],
      },
    });
    expect(commits).toBe(0);
  });

  it("rejects a rehydrated terminal transaction whose id does not exist in the machine inventory", () => {
    let commits = 0;

    const knownTransaction = flow.transaction({
      id: "flow-test.rehydrate.known.save",
      params: () => ({ id: "restore-1" }),
      commit: () =>
        Effect.sync(() => {
          commits += 1;
          return { ok: true } as const;
        }),
    });

    const machine = flow.machine<{}, never, "idle" | "busy">({
      id: "flow-test.rehydrate.invalid.terminal.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        busy: {
          invoke: flow.run(knownTransaction),
        },
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "idle" as const,
      transactions: {
        "flow-test.rehydrate.unknown.save": {
          id: "flow-test.rehydrate.unknown.save",
          status: "success" as const,
          value: { ok: true } as const,
        },
      },
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.invalid.terminal.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TXN-005",
      debug: {
        machineId: "flow-test.rehydrate.invalid.terminal.machine",
        transactionId: "flow-test.rehydrate.unknown.save",
        parentState: "idle",
        status: "success",
        reason: "transaction-id-not-in-machine",
        allowedTransactionIds: ["flow-test.rehydrate.known.save"],
      },
    });
    expect(commits).toBe(0);
  });

  it("rejects a rehydrated pending transaction that lacks its persisted transaction:start receipt", () => {
    let commits = 0;

    const saveTransaction = flow.transaction({
      id: "flow-test.rehydrate.missing.start.save",
      params: () => ({ id: "restore-1" }),
      commit: () =>
        Effect.sync(() => {
          commits += 1;
          return { ok: true } as const;
        }),
    });

    const machine = flow.machine<{}, never, "idle" | "busy">({
      id: "flow-test.rehydrate.missing.start.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        busy: {
          invoke: flow.run(saveTransaction),
        },
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "busy" as const,
      transactions: {
        "flow-test.rehydrate.missing.start.save": {
          id: "flow-test.rehydrate.missing.start.save",
          status: "pending" as const,
        },
      },
      receipts: [{ type: "actor:start", id: "flow-test.rehydrate.missing.start.actor" }],
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.missing.start.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TXN-005",
      debug: {
        machineId: "flow-test.rehydrate.missing.start.machine",
        transactionId: "flow-test.rehydrate.missing.start.save",
        parentState: "busy",
        status: "pending",
        reason: "pending-transaction-missing-start-receipt",
        allowedTransactionIds: ["flow-test.rehydrate.missing.start.save"],
      },
    });
    expect(commits).toBe(0);
  });

  it("rejects a rehydrated scheduled timer whose dueAt precedes startedAt", () => {
    const machine = flow.machine<{}, never, "waiting" | "done">({
      id: "flow-test.rehydrate.invalid.timer-duration.machine",
      initial: "waiting",
      context: () => ({}),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.rehydrate.invalid.timer-duration.after",
            delay: "1 second",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "waiting" as const,
      timers: {
        "flow-test.rehydrate.invalid.timer-duration.after": {
          id: "flow-test.rehydrate.invalid.timer-duration.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "waiting",
          startedAt: 1_000,
          dueAt: 999,
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.invalid.timer-duration.actor" },
        {
          type: "timer:start",
          id: "flow-test.rehydrate.invalid.timer-duration.after",
          generation: 2,
          parentState: "waiting",
          startedAt: 1_000,
          dueAt: 999,
          scheduledMillis: 0,
          restored: false,
        },
      ],
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.invalid.timer-duration.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TIMER-001",
      debug: {
        machineId: "flow-test.rehydrate.invalid.timer-duration.machine",
        timerId: "flow-test.rehydrate.invalid.timer-duration.after",
        parentState: "waiting",
        status: "scheduled",
        startedAt: 1_000,
        dueAt: 999,
        reason: "scheduled-timer-negative-remaining-duration",
      },
    });
  });

  it("rejects a rehydrated scheduled timer that does not belong to the destination state", () => {
    const machine = flow.machine<{}, never, "idle" | "busy" | "done">({
      id: "flow-test.rehydrate.invalid.timer-state.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        busy: {
          after: flow.after({
            id: "flow-test.rehydrate.invalid.timer-state.after",
            delay: "1 second",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "idle" as const,
      timers: {
        "flow-test.rehydrate.invalid.timer-state.after": {
          id: "flow-test.rehydrate.invalid.timer-state.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "busy",
          startedAt: 0,
          dueAt: 1_000,
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.invalid.timer-state.actor" },
        {
          type: "timer:start",
          id: "flow-test.rehydrate.invalid.timer-state.after",
          generation: 2,
          parentState: "busy",
          startedAt: 0,
          dueAt: 1_000,
        },
      ],
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.invalid.timer-state.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TIMER-001",
      debug: {
        machineId: "flow-test.rehydrate.invalid.timer-state.machine",
        timerId: "flow-test.rehydrate.invalid.timer-state.after",
        parentState: "busy",
        status: "scheduled",
        startedAt: 0,
        dueAt: 1_000,
        reason: "scheduled-timer-not-in-restored-state",
        allowedTimerIds: [],
      },
    });
  });

  it("rejects a rehydrated scheduled timer that lacks its persisted timer:start receipt", () => {
    const machine = flow.machine<{}, never, "waiting" | "done">({
      id: "flow-test.rehydrate.missing.start.timer.machine",
      initial: "waiting",
      context: () => ({}),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.rehydrate.missing.start.timer.after",
            delay: "1 second",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "waiting" as const,
      timers: {
        "flow-test.rehydrate.missing.start.timer.after": {
          id: "flow-test.rehydrate.missing.start.timer.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 1_000,
        },
      },
      receipts: [{ type: "actor:start", id: "flow-test.rehydrate.missing.start.timer.actor" }],
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.missing.start.timer.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TIMER-001",
      debug: {
        machineId: "flow-test.rehydrate.missing.start.timer.machine",
        timerId: "flow-test.rehydrate.missing.start.timer.after",
        parentState: "waiting",
        status: "scheduled",
        startedAt: 0,
        dueAt: 1_000,
        reason: "scheduled-timer-missing-start-receipt",
        allowedTimerIds: ["flow-test.rehydrate.missing.start.timer.after"],
      },
    });
  });

  it("rejects a rehydrated scheduled timer whose persisted timer:start receipt omits owner identity fields", () => {
    const machine = flow.machine<{}, never, "waiting" | "done">({
      id: "flow-test.rehydrate.invalid.timer-start-shape.machine",
      initial: "waiting",
      context: () => ({}),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.rehydrate.invalid.timer-start-shape.after",
            delay: "1 second",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "waiting" as const,
      timers: {
        "flow-test.rehydrate.invalid.timer-start-shape.after": {
          id: "flow-test.rehydrate.invalid.timer-start-shape.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 1_000,
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.invalid.timer-start-shape.actor" },
        {
          type: "timer:start",
          id: "flow-test.rehydrate.invalid.timer-start-shape.after",
          startedAt: 0,
          dueAt: 1_000,
        },
      ],
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.invalid.timer-start-shape.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TIMER-001",
      debug: {
        machineId: "flow-test.rehydrate.invalid.timer-start-shape.machine",
        timerId: "flow-test.rehydrate.invalid.timer-start-shape.after",
        parentState: "waiting",
        generation: 2,
        status: "scheduled",
        startedAt: 0,
        dueAt: 1_000,
        reason: "scheduled-timer-missing-start-receipt",
        allowedTimerIds: ["flow-test.rehydrate.invalid.timer-start-shape.after"],
      },
    });
  });

  it("rejects a rehydrated scheduled timer whose persisted timer:start receipt omits timing fields", () => {
    const machine = flow.machine<{}, never, "waiting" | "done">({
      id: "flow-test.rehydrate.invalid.timer-start-timing-shape.machine",
      initial: "waiting",
      context: () => ({}),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.rehydrate.invalid.timer-start-timing-shape.after",
            delay: "1 second",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "waiting" as const,
      timers: {
        "flow-test.rehydrate.invalid.timer-start-timing-shape.after": {
          id: "flow-test.rehydrate.invalid.timer-start-timing-shape.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 1_000,
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.invalid.timer-start-timing-shape.actor" },
        {
          type: "timer:start",
          id: "flow-test.rehydrate.invalid.timer-start-timing-shape.after",
          generation: 2,
          parentState: "waiting",
        },
      ],
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.invalid.timer-start-timing-shape.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TIMER-001",
      debug: {
        machineId: "flow-test.rehydrate.invalid.timer-start-timing-shape.machine",
        timerId: "flow-test.rehydrate.invalid.timer-start-timing-shape.after",
        parentState: "waiting",
        generation: 2,
        status: "scheduled",
        startedAt: 0,
        dueAt: 1_000,
        reason: "scheduled-timer-missing-start-receipt",
        allowedTimerIds: ["flow-test.rehydrate.invalid.timer-start-timing-shape.after"],
      },
    });
  });

  it("rejects a rehydrated scheduled timer whose persisted parentState does not match the restored state", () => {
    const machine = flow.machine<{}, never, "waiting" | "paused" | "done">({
      id: "flow-test.rehydrate.invalid.timer-parent-state.machine",
      initial: "waiting",
      context: () => ({}),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.rehydrate.invalid.timer-parent-state.after",
            delay: "1 second",
            target: "done",
          }),
        },
        paused: {
          after: flow.after({
            id: "flow-test.rehydrate.invalid.timer-parent-state.after",
            delay: "1 second",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "waiting" as const,
      timers: {
        "flow-test.rehydrate.invalid.timer-parent-state.after": {
          id: "flow-test.rehydrate.invalid.timer-parent-state.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "paused",
          startedAt: 0,
          dueAt: 1_000,
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.invalid.timer-parent-state.actor" },
        {
          type: "timer:start",
          id: "flow-test.rehydrate.invalid.timer-parent-state.after",
          generation: 2,
          parentState: "paused",
          startedAt: 0,
          dueAt: 1_000,
        },
      ],
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.invalid.timer-parent-state.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TIMER-001",
      debug: {
        machineId: "flow-test.rehydrate.invalid.timer-parent-state.machine",
        timerId: "flow-test.rehydrate.invalid.timer-parent-state.after",
        parentState: "paused",
        restoredState: "waiting",
        status: "scheduled",
        startedAt: 0,
        dueAt: 1_000,
        reason: "scheduled-timer-parent-state-mismatch",
        allowedTimerIds: ["flow-test.rehydrate.invalid.timer-parent-state.after"],
      },
    });
  });

  it("rejects a rehydrated scheduled timer whose persisted timer:start parentState does not match the timer snapshot", () => {
    const machine = flow.machine<{}, never, "waiting" | "paused" | "done">({
      id: "flow-test.rehydrate.invalid.timer-start-parent-state.machine",
      initial: "waiting",
      context: () => ({}),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.rehydrate.invalid.timer-start-parent-state.after",
            delay: "1 second",
            target: "done",
          }),
        },
        paused: {
          after: flow.after({
            id: "flow-test.rehydrate.invalid.timer-start-parent-state.after",
            delay: "1 second",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "waiting" as const,
      timers: {
        "flow-test.rehydrate.invalid.timer-start-parent-state.after": {
          id: "flow-test.rehydrate.invalid.timer-start-parent-state.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 1_000,
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.invalid.timer-start-parent-state.actor" },
        {
          type: "timer:start",
          id: "flow-test.rehydrate.invalid.timer-start-parent-state.after",
          generation: 2,
          parentState: "paused",
          startedAt: 0,
          dueAt: 1_000,
          scheduledMillis: 1_000,
          restored: false,
        },
      ],
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.invalid.timer-start-parent-state.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TIMER-001",
      debug: {
        machineId: "flow-test.rehydrate.invalid.timer-start-parent-state.machine",
        timerId: "flow-test.rehydrate.invalid.timer-start-parent-state.after",
        parentState: "waiting",
        receiptParentState: "paused",
        generation: 2,
        receiptGeneration: 2,
        status: "scheduled",
        startedAt: 0,
        dueAt: 1_000,
        reason: "scheduled-timer-start-receipt-parent-state-mismatch",
        allowedTimerIds: ["flow-test.rehydrate.invalid.timer-start-parent-state.after"],
      },
    });
  });

  it("rejects a rehydrated scheduled timer whose persisted timer:start generation does not match the timer snapshot", () => {
    const machine = flow.machine<{}, never, "waiting" | "done">({
      id: "flow-test.rehydrate.invalid.timer-start-generation.machine",
      initial: "waiting",
      context: () => ({}),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.rehydrate.invalid.timer-start-generation.after",
            delay: "1 second",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "waiting" as const,
      timers: {
        "flow-test.rehydrate.invalid.timer-start-generation.after": {
          id: "flow-test.rehydrate.invalid.timer-start-generation.after",
          status: "scheduled" as const,
          generation: 3,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 1_000,
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.invalid.timer-start-generation.actor" },
        {
          type: "timer:start",
          id: "flow-test.rehydrate.invalid.timer-start-generation.after",
          generation: 2,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 1_000,
          scheduledMillis: 1_000,
          restored: false,
        },
      ],
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.invalid.timer-start-generation.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TIMER-001",
      debug: {
        machineId: "flow-test.rehydrate.invalid.timer-start-generation.machine",
        timerId: "flow-test.rehydrate.invalid.timer-start-generation.after",
        parentState: "waiting",
        receiptParentState: "waiting",
        generation: 3,
        receiptGeneration: 2,
        status: "scheduled",
        startedAt: 0,
        dueAt: 1_000,
        reason: "scheduled-timer-start-receipt-generation-mismatch",
        allowedTimerIds: ["flow-test.rehydrate.invalid.timer-start-generation.after"],
      },
    });
  });

  it("rejects a rehydrated scheduled timer whose persisted timer:start timing does not match the timer snapshot", () => {
    const machine = flow.machine<{}, never, "waiting" | "done">({
      id: "flow-test.rehydrate.invalid.timer-start-timing.machine",
      initial: "waiting",
      context: () => ({}),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.rehydrate.invalid.timer-start-timing.after",
            delay: "1 second",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "waiting" as const,
      timers: {
        "flow-test.rehydrate.invalid.timer-start-timing.after": {
          id: "flow-test.rehydrate.invalid.timer-start-timing.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "waiting",
          startedAt: 100,
          dueAt: 1_100,
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.invalid.timer-start-timing.actor" },
        {
          type: "timer:start",
          id: "flow-test.rehydrate.invalid.timer-start-timing.after",
          generation: 2,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 1_000,
          scheduledMillis: 1_000,
          restored: false,
        },
      ],
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.invalid.timer-start-timing.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TIMER-001",
      debug: {
        machineId: "flow-test.rehydrate.invalid.timer-start-timing.machine",
        timerId: "flow-test.rehydrate.invalid.timer-start-timing.after",
        parentState: "waiting",
        generation: 2,
        receiptParentState: "waiting",
        receiptGeneration: 2,
        receiptStartedAt: 0,
        receiptDueAt: 1_000,
        status: "scheduled",
        startedAt: 100,
        dueAt: 1_100,
        reason: "scheduled-timer-start-receipt-timing-mismatch",
        allowedTimerIds: ["flow-test.rehydrate.invalid.timer-start-timing.after"],
      },
    });
  });

  it("rejects a rehydrated scheduled timer whose persisted timer:start schedule facts do not match the timer snapshot", () => {
    const machine = flow.machine<{}, never, "waiting" | "done">({
      id: "flow-test.rehydrate.invalid.timer-start-schedule-facts.machine",
      initial: "waiting",
      context: () => ({}),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.rehydrate.invalid.timer-start-schedule-facts.after",
            delay: "1 second",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "waiting" as const,
      timers: {
        "flow-test.rehydrate.invalid.timer-start-schedule-facts.after": {
          id: "flow-test.rehydrate.invalid.timer-start-schedule-facts.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "waiting",
          startedAt: 100,
          dueAt: 1_100,
        },
      },
      receipts: [
        { type: "actor:start", id: "flow-test.rehydrate.invalid.timer-start-schedule-facts.actor" },
        {
          type: "timer:start",
          id: "flow-test.rehydrate.invalid.timer-start-schedule-facts.after",
          generation: 2,
          parentState: "waiting",
          startedAt: 100,
          dueAt: 1_100,
          scheduledMillis: 999,
          restored: true,
        },
      ],
    });

    let restoreError: unknown;
    try {
      test.rehydrate(machine, {
        id: "flow-test.rehydrate.invalid.timer-start-schedule-facts.actor",
        snapshot,
      });
    } catch (error) {
      restoreError = error;
    }

    expect(restoreError).toMatchObject({
      code: "FLOW-TIMER-001",
      debug: {
        machineId: "flow-test.rehydrate.invalid.timer-start-schedule-facts.machine",
        timerId: "flow-test.rehydrate.invalid.timer-start-schedule-facts.after",
        parentState: "waiting",
        generation: 2,
        receiptParentState: "waiting",
        receiptGeneration: 2,
        receiptScheduledMillis: 999,
        receiptRestored: true,
        status: "scheduled",
        startedAt: 100,
        dueAt: 1_100,
        reason: "scheduled-timer-start-receipt-schedule-facts-mismatch",
        allowedTimerIds: ["flow-test.rehydrate.invalid.timer-start-schedule-facts.after"],
      },
    });
  });
});
