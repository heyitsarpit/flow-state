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
      expect(harness.receiptSummary().receiptTypes).toEqual([
        "actor:start",
        "timer:start",
        "actor:restore",
        "timer:resume",
      ]);

      await harness.advance("1 second");

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
      expect(harness.snapshot()).toMatchObject({
        value: "idle",
        context: {},
        resources: {},
        transactions: {},
        streams: {},
        timers: {},
        children: {},
      });
      expect(harness.receiptSummary().receiptTypes).toEqual(["actor:restore"]);
    } finally {
      await harness.dispose();
    }
  });
});
