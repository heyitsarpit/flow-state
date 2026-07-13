import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createKey } from "./index.js";
import * as flow from "./index.js";
import { test } from "./testing.js";
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
          dueAt: 1_000,
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
});
