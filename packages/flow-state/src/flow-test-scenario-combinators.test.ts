import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createKey, flow } from "./index.js";
import { test } from "./testing.js";

type ProjectRecord = Readonly<{
  readonly id: string;
  readonly name: string;
}>;

type ScenarioContext = Readonly<{
  readonly projectName: string;
  readonly launchReady: boolean;
  readonly failed: boolean;
}>;

type ScenarioEvent =
  | Readonly<{ readonly type: "ENABLE" }>
  | Readonly<{ readonly type: "EDIT_NAME"; readonly name: string }>
  | Readonly<{ readonly type: "SUBMIT" }>;

const projectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: "scenario.project",
  key: (projectId) => createKey("scenario-project", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: `Project ${projectId}` }),
});

const scenarioSeed = [
  {
    ref: projectResource.ref("project-1"),
    value: { id: "project-1", name: "Seeded project" },
  },
] as const;

const scenarioMachine = flow.machine<ScenarioContext, ScenarioEvent, "editing" | "submitted">({
  id: "scenario.machine",
  initial: "editing",
  context: () => ({
    projectName: "Atlas",
    launchReady: false,
    failed: false,
  }),
  states: {
    editing: {
      on: {
        ENABLE: {
          update: () => ({ launchReady: true }),
        },
        EDIT_NAME: {
          update: ({ event }) => (event.type === "EDIT_NAME" ? { projectName: event.name } : {}),
        },
        SUBMIT: {
          target: "submitted",
          guard: ({ context }) => context.launchReady,
        },
      },
    },
    submitted: {},
  },
});

const scenarioModule = flow.module(
  "ScenarioModule",
  {
    resources: {
      project: projectResource,
    },
    fixtures: {
      scenarioSeed,
    },
  },
  {
    fixtures: ["scenarioSeed"] as const,
  },
);

const ScenarioApp = flow.app({
  modules: [scenarioModule],
});

describe("flow test scenario combinators", () => {
  it("starts seeded app scenarios and runs an event sequence from run(events)", () => {
    const harness = test
      .app(ScenarioApp)
      .scenario(scenarioMachine)
      .with({
        fixtures: ["scenarioSeed"],
        input: {
          projectName: "Override",
        },
      })
      .run([
        { type: "ENABLE" },
        { type: "EDIT_NAME", name: "Mission Control" },
        { type: "SUBMIT" },
      ]);

    expect(harness.state()).toBe("submitted");
    expect(harness.context()).toEqual({
      projectName: "Mission Control",
      launchReady: true,
      failed: false,
    });
    expect(harness.cache().query("scenario.project")).toMatchObject({
      id: "scenario.project",
      status: "success",
      value: { id: "project-1", name: "Seeded project" },
    });
    expect(harness.receiptSummary()).toMatchObject({
      receiptTypes: expect.arrayContaining([
        "machine:event",
        "machine:update",
        "machine:transition",
      ]),
      relatedIds: expect.arrayContaining(["scenario.machine"]),
    });
  });

  it("batches follow-up events through sendAll(events)", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "INC" }>,
      "idle"
    >({
      id: "scenario.send-all.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            INC: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });

    const harness = test(machine).run();
    harness.sendAll([{ type: "INC" }, { type: "INC" }, { type: "INC" }]);

    expect(harness.context().count).toBe(3);
    expect(harness.receiptSummary()).toMatchObject({
      receiptTypes: expect.arrayContaining(["machine:event", "machine:update"]),
      relatedIds: expect.arrayContaining(["scenario.send-all.machine"]),
    });
  });

  it("summarizes scenario issues as facts without introducing assertion helpers", async () => {
    const machine = flow.machine<
      { readonly defected: boolean },
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "STREAM_DEFECT" }>,
      "idle" | "streaming" | "defected"
    >({
      id: "scenario.issue-summary.machine",
      initial: "idle",
      context: () => ({ defected: false }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "scenario.issue-summary.stream",
            subscribe: () => Stream.die("boom"),
            routes: {
              defect: () => ({ type: "STREAM_DEFECT" }),
            },
          }),
          on: {
            STREAM_DEFECT: {
              target: "defected",
              update: () => ({ defected: true }),
            },
          },
        },
        defected: {},
      },
    });

    const harness = test(machine).run([{ type: "START" }]);
    await harness.flush();

    expect(harness.state()).toBe("defected");
    expect(harness.issueSummary()).toEqual([
      expect.objectContaining({
        kind: "defect",
        source: "stream",
        id: "scenario.issue-summary.stream",
        receiptTypes: expect.arrayContaining(["stream:defect"]),
        relatedIds: expect.arrayContaining(["scenario.issue-summary.stream"]),
      }),
    ]);
  });
});
