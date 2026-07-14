import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createKey } from "./index.js";
import * as flow from "./index.js";
import { flowStories, storyToDoc } from "./inspect.js";
import { runFlowScenario, scenarioToReport } from "./testing.js";

describe("flow story doc and test helpers", () => {
  it("builds a docs-friendly descriptor from a typed story", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "SAVE" }>,
      "idle" | "editing" | "saved"
    >({
      id: "flow-story-helper.docs.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
        editing: {},
        saved: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "editing" as const,
    });
    const story = flowStories(machine, [
      {
        id: "save-happy-path",
        title: "Save happy path",
        description: "Start editing and save without conflicts.",
        start: {
          kind: "snapshot",
          snapshot,
        },
        events: [{ type: "SAVE" }],
        expectedState: "saved",
        expectedFacts: {
          receiptTypes: ["transaction:success"],
          relatedIds: ["workspace.save"],
          outcomeKinds: ["success"],
          outcomeSources: ["transaction"],
        },
        tags: ["docs", "happy-path"],
      },
    ]).stories[0]!;

    expect(storyToDoc(story)).toEqual({
      kind: "story-doc",
      story,
      headline: "Save happy path",
      start: {
        kind: "snapshot",
        label: "Start from snapshot state 'editing'.",
        state: "editing",
        snapshot,
      },
      events: [
        {
          index: 1,
          event: { type: "SAVE" },
          label: "Send SAVE",
        },
      ],
      expectations: [
        {
          kind: "state",
          label: "Expect final state 'saved'.",
          state: "saved",
        },
        {
          kind: "receipt-types",
          label: "Expect receipt types: transaction:success",
          receiptTypes: ["transaction:success"],
        },
        {
          kind: "related-ids",
          label: "Expect related ids: workspace.save",
          relatedIds: ["workspace.save"],
        },
        {
          kind: "outcome-kinds",
          label: "Expect outcome kinds: success",
          outcomeKinds: ["success"],
        },
        {
          kind: "outcome-sources",
          label: "Expect outcome sources: transaction",
          outcomeSources: ["transaction"],
        },
      ],
      tags: ["docs", "happy-path"],
    });
  });

  it("turns a successful story run into a reusable test report", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "SAVE" }>,
      "idle" | "editing" | "saved"
    >({
      id: "flow-story-helper.test.machine",
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
        id: "save-happy-path",
        title: "Save happy path",
        start: {
          kind: "snapshot",
          snapshot: Object.freeze({
            ...machine.getInitialSnapshot(),
            value: "editing" as const,
          }),
        },
        events: [{ type: "SAVE" }],
        expectedState: "saved",
        expectedFacts: {
          receiptTypes: ["transaction:success"],
          relatedIds: ["workspace.save"],
          outcomeKinds: ["success"],
          outcomeSources: ["transaction"],
        },
      },
    ]).stories[0]!;

    const report = scenarioToReport(await runFlowScenario(machine, story));

    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.checks.map((check) => check.kind)).toEqual([
      "execution",
      "expected-state",
      "receipt-types",
      "related-ids",
      "outcome-kinds",
      "outcome-sources",
    ]);
  });

  it("surfaces runnable seed details in the docs descriptor", () => {
    const projectResource = flow.resource<
      [projectId: string],
      Readonly<{ readonly id: string; readonly name: string }>
    >({
      id: "flow-story-helper.seed.project",
      key: (projectId) => createKey("flow-story-helper-seed", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: `Project ${projectId}` }),
    });
    const machine = flow.machine<{}, never, "idle">({
      id: "flow-story-helper.seed.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });

    const story = flowStories(machine, [
      {
        id: "seeded-doc",
        title: "Seeded doc",
        start: {
          kind: "setup",
          description: "Restore the saved boot payload and fixture first.",
        },
        seed: {
          resources: [
            {
              ref: projectResource.ref("project-1"),
              value: { id: "project-1", name: "Seeded project" },
            },
          ],
          fixtures: ["inventorySeed"],
          boot: {
            version: "flow-state/runtime-boot.v1",
            resources: [],
            actors: [],
          },
          actorId: "story.actor",
        },
        events: [],
      },
    ]).stories[0]!;

    expect(storyToDoc(story)).toMatchObject({
      kind: "story-doc",
      story,
      seed: {
        label:
          "1 seeded resource; fixtures: inventorySeed; runtime boot payload; actor: story.actor",
        resourceCount: 1,
        fixtures: ["inventorySeed"],
        hasBoot: true,
        actorId: "story.actor",
      },
      start: {
        kind: "setup",
        description: "Restore the saved boot payload and fixture first.",
      },
    });
  });

  it("surfaces expectation mismatches in the story-backed test report", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "SAVE" }>,
      "editing" | "saved"
    >({
      id: "flow-story-helper.mismatch.machine",
      initial: "editing",
      context: () => ({ count: 0 }),
      states: {
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
        id: "save-mismatch",
        title: "Save mismatch",
        events: [{ type: "SAVE" }],
        expectedState: "editing",
        expectedFacts: {
          outcomeKinds: ["failure"],
        },
      },
    ]).stories[0]!;

    const report = scenarioToReport(await runFlowScenario(machine, story));

    expect(report.ok).toBe(false);
    expect(report.failures).toEqual([
      expect.objectContaining({
        kind: "expected-state",
        expected: "editing",
        actual: "saved",
      }),
      expect.objectContaining({
        kind: "outcome-kinds",
        expected: ["failure"],
        actual: ["success"],
      }),
    ]);
  });

  it("marks blocked story runs as failed test reports until setup becomes runnable", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "START" }>,
      "idle" | "editing"
    >({
      id: "flow-story-helper.blocked.machine",
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

    const story = flowStories(machine, [
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

    const report = scenarioToReport(await runFlowScenario(machine, story));

    expect(report.ok).toBe(false);
    expect(report.failures).toEqual([
      {
        kind: "execution",
        label: "Scenario execution is blocked: setup-description.",
        ok: false,
        expected: "success",
        actual: "setup-description",
      },
    ]);
  });
});
