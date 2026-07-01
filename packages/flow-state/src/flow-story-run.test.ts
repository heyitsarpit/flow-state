import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createKey, flow } from "./index.js";
import { flowStories } from "./inspect.js";
import { runFlowStory, test } from "./testing.js";

type ProjectRecord = Readonly<{
  readonly id: string;
  readonly name: string;
}>;

const projectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: "flow-story-run.project",
  key: (projectId) => createKey("flow-story-run", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: `Project ${projectId}` }),
});

const seededProject = {
  id: "project-1",
  name: "Seeded project",
} as const satisfies ProjectRecord;

const projectSeed = [
  {
    ref: projectResource.ref("project-1"),
    value: seededProject,
  },
] as const;

const StoryFixtureModule = flow.module(
  "FlowStoryRunFixtures",
  {
    resources: {
      project: projectResource,
    },
    fixtures: {
      inventorySeed: projectSeed,
    },
  },
  {
    fixtures: ["inventorySeed"] as const,
  },
);

const StoryFixtureApp = flow.app({
  modules: [StoryFixtureModule],
});

function createStorySeedMachine() {
  return flow.machine<{}, never, "idle">({
    id: "flow-story-run.seed.machine",
    initial: "idle",
    context: () => ({}),
    states: {
      idle: {
        invoke: flow.ensure(projectResource.ref("project-1")),
      },
    },
  });
}

function createStoryBootRuntime() {
  return flow.runtime(
    flow.app({ modules: [] as const }).layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
    }),
  );
}

describe("flow story execution", () => {
  it("runs snapshot-start stories against a machine and returns a trace-backed result", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "SAVE" }>,
      "idle" | "editing" | "saved"
    >({
      id: "flow-story-run.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            START: "editing",
          },
        },
        editing: {
          on: {
            SAVE: {
              target: "saved",
              actions: () => [{ type: "transaction:success", id: "workspace.save" }],
            },
          },
        },
        saved: {},
      },
    });

    const story = flowStories(machine, [
      {
        id: "save-from-snapshot",
        title: "Save from snapshot",
        start: {
          kind: "snapshot",
          snapshot: Object.freeze({
            ...machine.getInitialSnapshot(),
            value: "editing" as const,
          }),
        },
        events: [{ type: "SAVE" }],
        expectedState: "saved",
      },
    ]).stories[0]!;

    const result = await runFlowStory(machine, story);

    expect(result).toMatchObject({
      kind: "story-run",
      story,
      finalSnapshot: {
        value: "saved",
      },
      trace: {
        options: {
          storyId: "save-from-snapshot",
        },
      },
    });
    if (result.kind === "story-run") {
      expect(result.receipts.map((receipt) => receipt.type)).toEqual([
        "actor:restore",
        "machine:event",
        "machine:transition",
        "machine:action",
        "transaction:success",
        "machine:microstep",
      ]);
    }
  });

  it("runs default-start stories against an existing harness", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "SAVE" }>,
      "idle" | "editing" | "saved"
    >({
      id: "flow-story-run.harness.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            START: "editing",
          },
        },
        editing: {
          on: {
            SAVE: "saved",
          },
        },
        saved: {},
      },
    });

    const harness = test(machine).run([{ type: "START" }]);
    const story = flowStories(machine, [
      {
        id: "save-from-harness",
        title: "Save from harness",
        events: [{ type: "SAVE" }],
        expectedState: "saved",
      },
    ]).stories[0]!;

    const result = await runFlowStory(harness, story);

    expect(result).toMatchObject({
      kind: "story-run",
      story,
      finalSnapshot: {
        value: "saved",
      },
      trace: {
        options: {
          storyId: "save-from-harness",
        },
      },
    });
  });

  it("runs setup stories that seed resources on a plain machine target", async () => {
    const machine = createStorySeedMachine();
    const story = flowStories(machine, [
      {
        id: "seeded-project",
        title: "Seeded project",
        start: {
          kind: "setup",
          description: "Seed the project resource before the actor starts.",
        },
        seed: {
          resources: projectSeed,
        },
        events: [],
        expectedState: "idle",
      },
    ]).stories[0]!;

    const result = await runFlowStory(machine, story);

    expect(result).toMatchObject({
      kind: "story-run",
      story,
      finalSnapshot: {
        value: "idle",
        resources: {
          "flow-story-run.project": {
            value: seededProject,
          },
        },
      },
    });
  });

  it("runs fixture-seeded stories against an app target and blocks them on a plain machine target", async () => {
    const machine = createStorySeedMachine();
    const story = flowStories(machine, [
      {
        id: "fixture-seeded-project",
        title: "Fixture-seeded project",
        start: {
          kind: "setup",
          description: "Seed the app fixture before the actor starts.",
        },
        seed: {
          fixtures: ["inventorySeed"],
        },
        events: [],
        expectedState: "idle",
      },
    ]).stories[0]!;

    const result = await runFlowStory(StoryFixtureApp, machine, story);

    expect(result).toMatchObject({
      kind: "story-run",
      story,
      finalSnapshot: {
        value: "idle",
        resources: {
          "flow-story-run.project": {
            value: seededProject,
          },
        },
      },
    });
    expect(await runFlowStory(machine, story)).toEqual({
      kind: "story-run-blocked",
      story,
      reason: "fixtures-require-app",
    });
  });

  it("rehydrates boot-backed stories and restores the selected actor before replaying events", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "SAVE" }>,
      "idle" | "editing" | "saved"
    >({
      id: "flow-story-run.boot.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            START: "editing",
          },
        },
        editing: {
          on: {
            SAVE: "saved",
          },
        },
        saved: {},
      },
    });

    const runtime = createStoryBootRuntime();
    const actor = runtime.createActor(machine, {
      id: "flow-story-run.boot.actor",
    });
    actor.send({ type: "START" });
    await actor.flush();
    const boot = runtime.dehydrateBoot({
      actors: [actor],
    });
    await runtime.dispose();

    const story = flowStories(machine, [
      {
        id: "save-from-boot",
        title: "Save from boot",
        start: {
          kind: "setup",
          description: "Restore the booted actor and continue the story.",
        },
        seed: {
          boot,
          actorId: "flow-story-run.boot.actor",
        },
        events: [{ type: "SAVE" }],
        expectedState: "saved",
      },
    ]).stories[0]!;

    const result = await runFlowStory(machine, story);

    expect(result).toMatchObject({
      kind: "story-run",
      story,
      finalSnapshot: {
        value: "saved",
      },
    });
    if (result.kind === "story-run") {
      expect(result.receipts.map((receipt) => receipt.type)).toContain("actor:restore");
    }
  });

  it("returns blocked results for setup-description stories and explicit-start stories on harnesses", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "START" }>,
      "idle" | "editing"
    >({
      id: "flow-story-run.blocked.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            START: "editing",
          },
        },
        editing: {},
      },
    });

    const setupStory = flowStories(machine, [
      {
        id: "setup-only",
        title: "Setup only",
        start: {
          kind: "setup",
          description: "Seed an existing draft before the workflow starts.",
        },
        events: [{ type: "START" }],
      },
    ]).stories[0]!;
    const snapshotStory = flowStories(machine, [
      {
        id: "snapshot-only",
        title: "Snapshot only",
        start: {
          kind: "snapshot",
          snapshot: machine.getInitialSnapshot(),
        },
        events: [{ type: "START" }],
      },
    ]).stories[0]!;

    expect(await runFlowStory(machine, setupStory)).toEqual({
      kind: "story-run-blocked",
      story: setupStory,
      reason: "setup-description",
    });
    expect(await runFlowStory(test(machine).run(), snapshotStory)).toEqual({
      kind: "story-run-blocked",
      story: snapshotStory,
      reason: "explicit-start-requires-machine",
    });
  });

  it("returns blocked results when boot payloads contain multiple actors and no actor id is selected", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "SAVE" }>,
      "idle" | "editing" | "saved"
    >({
      id: "flow-story-run.boot-selection.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            START: "editing",
          },
        },
        editing: {
          on: {
            SAVE: "saved",
          },
        },
        saved: {},
      },
    });

    const runtime = createStoryBootRuntime();
    const firstActor = runtime.createActor(machine, {
      id: "flow-story-run.boot-selection.first",
    });
    const secondActor = runtime.createActor(machine, {
      id: "flow-story-run.boot-selection.second",
    });
    firstActor.send({ type: "START" });
    secondActor.send({ type: "START" });
    await firstActor.flush();
    await secondActor.flush();
    const boot = runtime.dehydrateBoot({
      actors: [firstActor, secondActor],
    });
    await runtime.dispose();

    const story = flowStories(machine, [
      {
        id: "save-from-ambiguous-boot",
        title: "Save from ambiguous boot",
        start: {
          kind: "setup",
          description: "Restore one of the booted actors before continuing.",
        },
        seed: {
          boot,
        },
        events: [{ type: "SAVE" }],
      },
    ]).stories[0]!;

    expect(await runFlowStory(machine, story)).toEqual({
      kind: "story-run-blocked",
      story,
      reason: "boot-actor-selection-required",
    });
  });
});
