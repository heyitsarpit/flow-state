import { describe, expect, it } from "vite-plus/test";

import { flow } from "./index.js";
import { flowStories } from "./inspect.js";
import { runFlowStory, test } from "./testing.js";

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
});
