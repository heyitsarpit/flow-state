import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { flowStories, graphOf } from "./inspect.js";
import { test } from "./testing.js";

describe("flow graph descriptors", () => {
  it("projects event transitions into explicit nodes, edges, and the initial state", () => {
    const machine = flow.machine<
      { readonly name: string },
      | Readonly<{ readonly type: "SET_NAME"; readonly name: string }>
      | Readonly<{ readonly type: "REVIEW" }>
      | Readonly<{ readonly type: "REOPEN" }>
      | Readonly<{ readonly type: "PUBLISH" }>,
      "draft" | "review" | "published"
    >({
      id: "flow-graph.project-machine",
      initial: "draft",
      context: () => ({ name: "" }),
      states: {
        draft: {
          on: {
            SET_NAME: {
              update: ({ event }) => (event.type === "SET_NAME" ? { name: event.name } : {}),
            },
            REVIEW: "review",
          },
        },
        review: {
          on: {
            REOPEN: "draft",
            PUBLISH: "published",
          },
        },
        published: {
          type: "final",
        },
      },
    });

    const graph = graphOf(machine);

    expect(graph.kind).toBe("graph");
    expect(graph.machine).toBe(machine);
    expect(graph.initial).toBe("draft");
    expect(graph.nodes.map((node) => node.id)).toEqual(["draft", "review", "published"]);
    expect(graph.edges).toMatchObject([
      {
        source: "draft",
        target: "draft",
        eventType: "SET_NAME",
        label: "SET_NAME",
      },
      {
        source: "draft",
        target: "review",
        eventType: "REVIEW",
        label: "REVIEW",
      },
      {
        source: "review",
        target: "draft",
        eventType: "REOPEN",
        label: "REOPEN",
      },
      {
        source: "review",
        target: "published",
        eventType: "PUBLISH",
        label: "PUBLISH",
      },
    ]);
  });

  it("includes terminal status, child specs, timed transitions, and eventless transitions", () => {
    const childMachine = flow.machine<{}, never, "idle">({
      id: "flow-graph.child-machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "START" }>,
      "draft" | "review" | "timedOut"
    >({
      id: "flow-graph.metadata-machine",
      initial: "draft",
      context: () => ({}),
      states: {
        draft: {
          invoke: flow.child({
            id: "autosave",
            machine: childMachine,
            supervision: "continue-on-failure",
          }),
          after: flow.after({
            id: "graph.timeout",
            delay: "1 second",
            target: "timedOut",
          }),
          always: {
            target: "review",
          },
        },
        review: {},
        timedOut: {
          type: "final",
        },
      },
    });

    const graph = graphOf(machine);
    const draft = graph.nodes.find((node) => node.id === "draft");
    const timedOut = graph.nodes.find((node) => node.id === "timedOut");

    expect(draft).toMatchObject({
      terminal: false,
      childSpecs: [
        {
          id: "autosave",
          machineId: childMachine.id,
          supervision: "continue-on-failure",
        },
      ],
      timedTransitions: [
        {
          id: "graph.timeout",
          delay: "1 second",
          target: "timedOut",
        },
      ],
      eventlessTransitions: [
        {
          id: "draft:always:0",
          target: "review",
        },
      ],
    });
    expect(timedOut).toMatchObject({
      terminal: true,
      childSpecs: [],
      timedTransitions: [],
      eventlessTransitions: [],
    });
  });

  it("answers basic graph queries without reopening machine config", () => {
    const machine = flow.machine<
      { readonly name: string },
      | Readonly<{ readonly type: "SET_NAME"; readonly name: string }>
      | Readonly<{ readonly type: "REVIEW" }>
      | Readonly<{ readonly type: "REOPEN" }>
      | Readonly<{ readonly type: "PUBLISH" }>,
      "draft" | "review" | "published"
    >({
      id: "flow-graph.queries-machine",
      initial: "draft",
      context: () => ({ name: "" }),
      states: {
        draft: {
          on: {
            SET_NAME: {
              update: ({ event }) => (event.type === "SET_NAME" ? { name: event.name } : {}),
            },
            REVIEW: "review",
          },
        },
        review: {
          on: {
            REOPEN: "draft",
            PUBLISH: "published",
          },
        },
        published: {
          type: "final",
        },
      },
    });

    const graph = graphOf(machine);

    expect(graph.findState("review")).toMatchObject({
      id: "review",
      terminal: false,
    });
    expect(graph.outgoingEvents("draft")).toEqual(["SET_NAME", "REVIEW"]);
    expect(
      graph.incomingEdges("published").map((edge) => ({
        source: edge.source,
        eventType: edge.eventType,
      })),
    ).toEqual([
      {
        source: "review",
        eventType: "PUBLISH",
      },
    ]);
    expect(graph.reachableStates().map((node) => node.id)).toEqual([
      "draft",
      "review",
      "published",
    ]);
  });

  it("shares path traversal behavior with test.model and supports explicit event playback", () => {
    type GuardedEvent =
      | Readonly<{ readonly type: "NEXT" }>
      | Readonly<{ readonly type: "ALLOW" }>
      | Readonly<{ readonly type: "PROCEED" }>;

    const machine = flow.machine<
      { readonly allowed: boolean },
      GuardedEvent,
      "start" | "idle" | "done"
    >({
      id: "flow-graph.path-machine",
      initial: "start",
      context: () => ({ allowed: false }),
      states: {
        start: {
          on: {
            NEXT: {
              target: "idle",
            },
          },
        },
        idle: {
          on: {
            ALLOW: {
              update: () => ({ allowed: true }),
            },
            PROCEED: {
              target: "done",
              guard: ({ context }) => context.allowed,
            },
          },
        },
        done: {
          type: "final",
        },
      },
    });

    const graph = graphOf(machine);
    const model = test.model(machine);
    const reachesDone = (snapshot: Readonly<{ readonly value: string }>) =>
      snapshot.value === "done";

    expect(
      graph
        .shortestPaths({
          toState: reachesDone,
        })
        .map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual([["NEXT", "ALLOW", "PROCEED"]]);
    expect(
      model
        .getShortestPaths({
          toState: reachesDone,
        })
        .map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual([["NEXT", "ALLOW", "PROCEED"]]);
    expect(
      graph
        .simplePaths({
          toState: reachesDone,
          maxDepth: 2,
        })
        .map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual([]);

    const path = graph.pathFromEvents([{ type: "NEXT" }, { type: "ALLOW" }, { type: "PROCEED" }]);

    expect(path?.steps.map((step) => step.event.type)).toEqual(["NEXT", "ALLOW", "PROCEED"]);
    expect(path?.state.value).toBe("done");
    expect(path?.description).toBe('Reaches state "done": NEXT -> ALLOW -> PROCEED');
    expect(graph.pathFromEvents([{ type: "PROCEED" }])).toBeUndefined();
  });

  it("shares sync success route traversal with test.model for explicit event playback", () => {
    type SubmitEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{
          readonly type: "SAVED";
          readonly project: { readonly id: "project-1"; readonly name: "Saved draft" };
        }>;

    const saveDraft = flow.transaction<
      void,
      { readonly id: "project-1"; readonly name: "Saved draft" },
      never,
      never,
      SubmitEvent
    >({
      id: "flow-graph.sync-success-route.save",
      commit: () =>
        Effect.succeed({
          id: "project-1" as const,
          name: "Saved draft" as const,
        }),
      routes: {
        success: ({ value }) => ({
          type: "SAVED" as const,
          project: value,
        }),
      },
    });

    const machine = flow.machine<
      { readonly savedProject: { readonly id: "project-1"; readonly name: "Saved draft" } | null },
      SubmitEvent,
      "editing" | "saving" | "done"
    >({
      id: "flow-graph.sync-success-route",
      initial: "editing",
      context: () => ({
        savedProject: null,
      }),
      states: {
        editing: {
          on: {
            SAVE: {
              target: "saving",
              submit: saveDraft,
            },
          },
        },
        saving: {
          on: {
            SAVED: {
              target: "done",
              update: ({ event }) =>
                event.type === "SAVED"
                  ? {
                      savedProject: event.project,
                    }
                  : {},
            },
          },
        },
        done: {
          type: "final",
        },
      },
    });

    const graph = graphOf(machine);
    const model = test.model(machine);
    const graphPath = graph.pathFromEvents([{ type: "SAVE" }], {
      resolveSyncSuccessRoutes: true,
    });
    const modelPath = model.getShortestPaths({
      events: [{ type: "SAVE" }],
      resolveSyncSuccessRoutes: true,
    })[0];

    expect(graphPath?.state.value).toBe("done");
    expect(graphPath?.state.context).toEqual({
      savedProject: {
        id: "project-1",
        name: "Saved draft",
      },
    });
    expect(modelPath?.state).toEqual(graphPath?.state);
  });

  it("maps curated stories onto covered and uncovered graph states and transitions", () => {
    const machine = flow.machine<
      {},
      | Readonly<{ readonly type: "REVIEW" }>
      | Readonly<{ readonly type: "REOPEN" }>
      | Readonly<{ readonly type: "PUBLISH" }>,
      "draft" | "review" | "published"
    >({
      id: "flow-graph.story-coverage.machine",
      initial: "draft",
      context: () => ({}),
      states: {
        draft: {
          on: {
            REVIEW: "review",
          },
        },
        review: {
          on: {
            REOPEN: "draft",
            PUBLISH: "published",
          },
        },
        published: {
          type: "final",
        },
      },
    });

    const graph = graphOf(machine);
    const stories = flowStories(machine, [
      {
        id: "review-story",
        title: "Review",
        events: [{ type: "REVIEW" }],
        expectedState: "review",
        expectedFacts: {
          outcomeKinds: ["failure"],
          outcomeSources: ["transaction"],
        },
      },
      {
        id: "publish-story",
        title: "Publish",
        start: {
          kind: "snapshot",
          snapshot: Object.freeze({
            ...machine.getInitialSnapshot(),
            value: "review" as const,
          }),
        },
        events: [{ type: "PUBLISH" }],
        expectedState: "published",
      },
      {
        id: "setup-story",
        title: "Setup",
        start: {
          kind: "setup",
          description: "Seed an existing approval request.",
        },
        events: [{ type: "PUBLISH" }],
      },
    ]);

    const coverage = graph.storyCoverage(stories);

    expect(coverage.summary).toEqual({
      totalStories: 3,
      coveredStories: 2,
      mismatchStories: 0,
      blockedStories: 1,
      coveredStateCount: 3,
      uncoveredStateCount: 0,
      coveredTransitionCount: 2,
      uncoveredTransitionCount: 1,
    });
    expect(coverage.coveredStates.map((state) => state.id)).toEqual([
      "draft",
      "review",
      "published",
    ]);
    expect(coverage.coveredTransitions.map((edge) => edge.eventType)).toEqual([
      "REVIEW",
      "PUBLISH",
    ]);
    expect(coverage.uncoveredTransitions.map((edge) => edge.eventType)).toEqual(["REOPEN"]);
    expect(coverage.coveredOutcomeKinds).toEqual(["failure"]);
    expect(coverage.coveredOutcomeSources).toEqual(["transaction"]);
    expect(
      coverage.stories.map((story) => ({
        id: story.story.id,
        status: story.status,
        reason: story.reason,
      })),
    ).toEqual([
      {
        id: "review-story",
        status: "covered",
        reason: undefined,
      },
      {
        id: "publish-story",
        status: "covered",
        reason: undefined,
      },
      {
        id: "setup-story",
        status: "blocked",
        reason: "setup-description",
      },
    ]);
  });

  it("reports blocked and mismatched stories without pretending they cover the same path", () => {
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "REVIEW" }> | Readonly<{ readonly type: "PUBLISH" }>,
      "draft" | "review" | "published"
    >({
      id: "flow-graph.story-coverage.mismatch",
      initial: "draft",
      context: () => ({}),
      states: {
        draft: {
          on: {
            REVIEW: "review",
          },
        },
        review: {
          on: {
            PUBLISH: "published",
          },
        },
        published: {
          type: "final",
        },
      },
    });

    const graph = graphOf(machine);
    const coverage = graph.storyCoverage(
      flowStories(machine, [
        {
          id: "bad-start",
          title: "Bad start",
          events: [{ type: "PUBLISH" }],
          expectedState: "published",
        },
        {
          id: "wrong-expectation",
          title: "Wrong expectation",
          events: [{ type: "REVIEW" }],
          expectedState: "draft",
        },
      ]),
    );

    expect(coverage.summary).toEqual({
      totalStories: 2,
      coveredStories: 0,
      mismatchStories: 1,
      blockedStories: 1,
      coveredStateCount: 2,
      uncoveredStateCount: 1,
      coveredTransitionCount: 1,
      uncoveredTransitionCount: 1,
    });
    expect(
      coverage.stories.map((story) => ({
        id: story.story.id,
        status: story.status,
        reason: story.reason,
      })),
    ).toEqual([
      {
        id: "bad-start",
        status: "blocked",
        reason: "path-not-found",
      },
      {
        id: "wrong-expectation",
        status: "mismatch",
        reason: "expected-state-mismatch",
      },
    ]);
    expect(coverage.coveredTransitions.map((edge) => edge.eventType)).toEqual(["REVIEW"]);
    expect(coverage.uncoveredTransitions.map((edge) => edge.eventType)).toEqual(["PUBLISH"]);
  });

  it("exports a stable UI-independent JSON graph shape", () => {
    const machine = flow.machine<
      { readonly name: string },
      | Readonly<{ readonly type: "SET_NAME"; readonly name: string }>
      | Readonly<{ readonly type: "REVIEW" }>
      | Readonly<{ readonly type: "PUBLISH" }>,
      "draft" | "review" | "published"
    >({
      id: "flow-graph.json-machine",
      initial: "draft",
      context: () => ({ name: "" }),
      states: {
        draft: {
          on: {
            SET_NAME: {
              update: ({ event }) => (event.type === "SET_NAME" ? { name: event.name } : {}),
            },
            REVIEW: "review",
          },
        },
        review: {
          on: {
            PUBLISH: "published",
          },
        },
        published: {
          type: "final",
        },
      },
    });

    const graph = graphOf(machine);
    const exported = graph.toJSON();

    expect(exported).toEqual({
      kind: "graph",
      machineId: machine.id,
      initial: "draft",
      nodes: [
        {
          id: "draft",
          terminal: false,
          childSpecs: [],
          timedTransitions: [],
          eventlessTransitions: [],
        },
        {
          id: "review",
          terminal: false,
          childSpecs: [],
          timedTransitions: [],
          eventlessTransitions: [],
        },
        {
          id: "published",
          terminal: true,
          childSpecs: [],
          timedTransitions: [],
          eventlessTransitions: [],
        },
      ],
      edges: [
        {
          id: "draft:SET_NAME:0",
          source: "draft",
          target: "draft",
          eventType: "SET_NAME",
          label: "SET_NAME",
        },
        {
          id: "draft:REVIEW:0",
          source: "draft",
          target: "review",
          eventType: "REVIEW",
          label: "REVIEW",
        },
        {
          id: "review:PUBLISH:0",
          source: "review",
          target: "published",
          eventType: "PUBLISH",
          label: "PUBLISH",
        },
      ],
    });
    expect(JSON.parse(JSON.stringify(graph))).toEqual(exported);
  });

  it("optionally overlays module and app ownership metadata onto graph JSON exports", () => {
    const machine = flow.machine<
      { readonly name: string },
      Readonly<{ readonly type: "REVIEW" }>,
      "draft" | "review"
    >({
      id: "flow-graph.ownership-machine",
      initial: "draft",
      context: () => ({ name: "" }),
      states: {
        draft: {
          on: {
            REVIEW: "review",
          },
        },
        review: {
          type: "final",
        },
      },
    });
    const shellMachine = flow.machine<{}, never, "idle">({
      id: "flow-graph.shell-machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const projectModule = flow.module(
      "Project",
      {
        machines: {
          editorFlow: machine,
        },
      },
      {
        screens: ["editor"],
        tags: ["project"],
        dependencies: ["project.repo"],
        permissions: ["project.write"],
      },
    );
    const shellModule = flow.module("Shell", {
      machines: {
        shellFlow: shellMachine,
      },
    });
    const app = flow.app({
      modules: [projectModule, shellModule],
    });

    const graph = graphOf(machine);

    expect(graph.toJSON()).not.toHaveProperty("ownership");
    expect(graph.toJSON({ source: shellModule })).not.toHaveProperty("ownership");
    expect(graph.toJSON({ source: projectModule })).toMatchObject({
      ownership: {
        moduleId: "Project",
        modulePath: "Project",
        ownerPath: "Project/editorFlow",
        machineName: "editorFlow",
        screens: ["editor"],
        tags: ["project"],
        dependencies: ["project.repo"],
        permissions: ["project.write"],
      },
    });
    expect(graph.toJSON({ source: app })).toMatchObject({
      ownership: {
        appId: app.id,
        moduleId: "Project",
        modulePath: `${app.id}/Project`,
        ownerPath: `${app.id}/Project/editorFlow`,
        machineName: "editorFlow",
        screens: ["editor"],
        tags: ["project"],
        dependencies: ["project.repo"],
        permissions: ["project.write"],
      },
    });
  });
});
