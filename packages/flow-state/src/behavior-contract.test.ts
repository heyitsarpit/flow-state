import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { buildBehaviorContract, flowStories, sliceBehaviorContract } from "./inspect.js";

type BehaviorEvent =
  | Readonly<{ readonly type: "START" }>
  | Readonly<{ readonly type: "APPROVE" }>
  | Readonly<{ readonly type: "REJECT" }>
  | Readonly<{ readonly type: "SAVED"; readonly value: { readonly id: string } }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "failed" }>
  | Readonly<{ readonly type: "SAVE_DEFECT"; readonly cause: unknown }>
  | Readonly<{ readonly type: "SAVE_INTERRUPTED" }>
  | Readonly<{ readonly type: "STREAM_VALUE"; readonly value: string }>
  | Readonly<{ readonly type: "STREAM_DONE" }>
  | Readonly<{ readonly type: "STREAM_FAILED"; readonly error: "stream-failed" }>
  | Readonly<{ readonly type: "STREAM_DEFECT"; readonly cause: unknown }>
  | Readonly<{ readonly type: "STREAM_INTERRUPTED" }>;

function createBehaviorFixture() {
  const behaviorTag = flow.createTag("behavior.project");
  const projectResource = flow.resource<[projectId: string], { readonly id: string }>({
    id: "behavior.project",
    key: (projectId) => flow.createKey("behavior.project", projectId),
    lookup: (projectId) => Effect.succeed({ id: projectId }),
    schema: {
      parse: (value: unknown) => value,
    },
    placeholder: (projectId) => ({ id: projectId }),
    freshness: {
      staleAfter: "5 minutes",
      onInvalidate: "lazy",
    },
  });
  const childMachine = flow.machine<{}, never, "idle">({
    id: "behavior.child",
    initial: "idle",
    context: () => ({}),
    states: {
      idle: {},
    },
  });
  const behaviorMachine = flow.machine<
    {},
    BehaviorEvent,
    "idle" | "review" | "timedOut" | "done",
    "idle"
  >({
    id: "behavior.machine",
    initial: "idle",
    context: () => ({}),
    states: {
      idle: {
        invoke: flow.child({
          id: "assistant",
          machine: childMachine,
          supervision: "continue-on-failure",
        }),
        after: flow.after({
          id: "behavior.timeout",
          delay: "1 second",
          target: "timedOut",
        }),
        always: {
          target: "review",
        },
        on: {
          START: "review",
        },
      },
      review: {
        on: {
          APPROVE: "done",
          REJECT: "idle",
        },
      },
      timedOut: {},
      done: {
        type: "final",
      },
    },
  });
  type SaveOutcomeEvent =
    | Readonly<{ readonly type: "SAVED"; readonly value: unknown }>
    | Readonly<{ readonly type: "SAVE_FAILED" }>
    | Readonly<{ readonly type: "SAVE_DEFECT"; readonly cause: unknown }>
    | Readonly<{ readonly type: "SAVE_INTERRUPTED" }>;
  const saveProject = flow.transaction({
    id: "behavior.save",
    params: () => ({ id: "project-1" }),
    preview: {
      apply: ({ params }) => [
        {
          ref: projectResource.ref(params.id),
          replace: { id: params.id },
        },
      ],
    },
    commit: (params) => Effect.succeed({ id: params.id }),
    invalidates: [behaviorTag],
    queue: {
      when: () => true,
      replay: () => true,
      undo: () => true,
    },
    routes: flow.outcomes<unknown, unknown, SaveOutcomeEvent>({
      success: ({ value }) => ({ type: "SAVED", value }),
      failure: ["SAVE_FAILED", "error"],
      defect: ({ cause }) => ({ type: "SAVE_DEFECT", cause }),
      interrupt: () => ({ type: "SAVE_INTERRUPTED" }),
    }),
    concurrency: "reject-while-running",
  });
  const updates = flow.stream<
    unknown,
    BehaviorEvent,
    { readonly topic: string },
    string,
    "stream-failed"
  >({
    id: "behavior.updates",
    params: () => ({ topic: "project-1" }),
    subscribe: () => Stream.fail("stream-failed" as const),
    pressure: {
      strategy: "queue",
      limit: 2,
    },
    routes: {
      value: (value) => ({ type: "STREAM_VALUE", value }),
      done: () => ({ type: "STREAM_DONE" }),
      failure: (error) => ({ type: "STREAM_FAILED", error }),
      defect: (cause) => ({ type: "STREAM_DEFECT", cause }),
      interrupt: () => ({ type: "STREAM_INTERRUPTED" }),
    },
  });
  const behaviorView = flow.view<
    {},
    "idle" | "review" | "timedOut" | "done",
    { readonly ready: boolean },
    "behavior.view"
  >({
    id: "behavior.view",
    sources: ["context", "resources", "transactions", "streams", "children", "issues", "receipts"],
    select: () => ({ ready: true }),
  });
  const behaviorModule = flow.module(
    "Behavior",
    {
      resources: {
        project: projectResource,
      },
      transactions: {
        saveProject,
      },
      machines: {
        workspace: behaviorMachine,
      },
      streams: {
        updates,
      },
      views: {
        summary: behaviorView,
      },
      fixtures: {
        behaviorSeed: [
          {
            ref: projectResource.ref("project-1"),
            value: { id: "project-1" },
          },
        ],
      },
    },
    {
      dependencies: ["Shell"],
      tags: ["behavior"],
      screens: ["Overview"],
      fixtures: ["behaviorSeed"],
    },
  );
  const shellModule = flow.module(
    "Shell",
    {},
    {
      tags: ["shell"],
      screens: ["Shell"],
    },
  );
  const app = flow.app({
    modules: [behaviorModule, shellModule],
  });
  const stories = flowStories(behaviorMachine, [
    {
      id: "default-story",
      title: "Default story",
      events: [{ type: "START" }, { type: "APPROVE" }],
      expectedState: "done",
      expectedFacts: {
        receiptTypes: ["transaction:commit"],
        relatedIds: ["behavior.save"],
        issueKinds: ["failure"],
        issueSources: ["transaction"],
        outcomeKinds: ["success"],
        outcomeSources: ["transaction"],
      },
      tags: ["docs"],
    },
    {
      id: "snapshot-story",
      title: "Snapshot story",
      start: {
        kind: "snapshot",
        snapshot: behaviorMachine.getInitialSnapshot(),
      },
      seed: {
        resources: [
          {
            ref: projectResource.ref("project-1"),
            value: { id: "project-1" },
          },
        ],
        boot: {
          version: "flow-state/runtime-boot.v1",
          resources: [],
          actors: [],
        },
      },
      events: [{ type: "START" }],
      expectedState: "review",
    },
    {
      id: "setup-story",
      title: "Setup story",
      start: {
        kind: "setup",
        description: "Seed the app from fixtures before running.",
      },
      seed: {
        fixtures: ["behaviorSeed"],
        actorId: "behavior.actor",
      },
      events: [],
      expectedFacts: {
        outcomeKinds: ["interrupt"],
      },
    },
  ]);

  return {
    app,
    stories,
  };
}

describe("behavior contract builder", () => {
  it("builds a deterministic JSON-safe app contract from explicit app and story inputs", () => {
    const fixture = createBehaviorFixture();

    const contract = buildBehaviorContract({
      app: fixture.app,
      stories: [fixture.stories],
    });

    expect(contract.app.moduleIds).toEqual(["Behavior", "Shell"]);
    expect(contract.modules).toEqual([
      {
        id: "Behavior",
        dependencies: ["Shell"],
        screenIds: ["Overview"],
        tagIds: ["behavior"],
        fixtureIds: ["behaviorSeed"],
      },
      {
        id: "Shell",
        dependencies: [],
        screenIds: ["Shell"],
        tagIds: ["shell"],
        fixtureIds: [],
      },
    ]);
    expect(contract.resources).toEqual([
      {
        id: "behavior.project",
        moduleId: "Behavior",
        hasSchema: true,
        hasPlaceholder: true,
        freshness: {
          staleAfter: "5 minutes",
          onInvalidate: "lazy",
        },
      },
    ]);
    expect(contract.transactions).toEqual([
      {
        id: "behavior.save",
        moduleId: "Behavior",
        hasParams: true,
        hasPreview: true,
        hasInvalidates: true,
        hasQueueWhen: true,
        hasQueueReplay: true,
        hasQueueUndo: true,
        concurrency: "reject-while-running",
        routeKinds: ["success", "failure", "defect", "interrupt"],
      },
    ]);
    expect(contract.machines).toEqual([
      {
        id: "behavior.machine",
        moduleId: "Behavior",
        initialStateId: "idle",
        states: [
          {
            id: "done",
            terminal: true,
            childIds: [],
            timedTransitions: [],
            eventlessTransitions: [],
          },
          {
            id: "idle",
            terminal: false,
            childIds: ["assistant"],
            timedTransitions: [
              {
                id: "behavior.timeout",
                delay: "1 second",
                target: "timedOut",
              },
            ],
            eventlessTransitions: [
              {
                id: "idle:always:0",
                target: "review",
              },
            ],
          },
          {
            id: "review",
            terminal: false,
            childIds: [],
            timedTransitions: [],
            eventlessTransitions: [],
          },
          {
            id: "timedOut",
            terminal: false,
            childIds: [],
            timedTransitions: [],
            eventlessTransitions: [],
          },
        ],
        transitions: [
          {
            id: "idle:START:0",
            source: "idle",
            target: "review",
            eventType: "START",
          },
          {
            id: "review:APPROVE:0",
            source: "review",
            target: "done",
            eventType: "APPROVE",
          },
          {
            id: "review:REJECT:0",
            source: "review",
            target: "idle",
            eventType: "REJECT",
          },
        ],
      },
    ]);
    expect(contract.streams).toEqual([
      {
        id: "behavior.updates",
        moduleId: "Behavior",
        hasParams: true,
        pressure: {
          strategy: "queue",
          limit: 2,
        },
        routeKinds: ["value", "done", "failure", "defect", "interrupt"],
      },
    ]);
    expect(contract.views).toEqual([
      {
        id: "behavior.view",
        moduleId: "Behavior",
        sources: [
          "context",
          "resources",
          "transactions",
          "streams",
          "children",
          "issues",
          "receipts",
        ],
      },
    ]);
    expect(contract.stories).toEqual([
      {
        id: "default-story",
        machineId: "behavior.machine",
        title: "Default story",
        tags: ["docs"],
        start: "default",
        expectedState: "done",
        seed: null,
        expectedFacts: {
          receiptTypes: ["transaction:commit"],
          relatedIds: ["behavior.save"],
          issueKinds: ["failure"],
          issueSources: ["transaction"],
          outcomeKinds: ["success"],
          outcomeSources: ["transaction"],
        },
      },
      {
        id: "snapshot-story",
        machineId: "behavior.machine",
        title: "Snapshot story",
        tags: [],
        start: "snapshot",
        expectedState: "review",
        seed: {
          resourceCount: 1,
          fixtureIds: [],
          hasBoot: true,
          actorId: null,
        },
        expectedFacts: {
          receiptTypes: [],
          relatedIds: [],
          issueKinds: [],
          issueSources: [],
          outcomeKinds: [],
          outcomeSources: [],
        },
      },
      {
        id: "setup-story",
        machineId: "behavior.machine",
        title: "Setup story",
        tags: [],
        start: "setup",
        expectedState: null,
        seed: {
          resourceCount: 0,
          fixtureIds: ["behaviorSeed"],
          hasBoot: false,
          actorId: "behavior.actor",
        },
        expectedFacts: {
          receiptTypes: [],
          relatedIds: [],
          issueKinds: [],
          issueSources: [],
          outcomeKinds: ["interrupt"],
          outcomeSources: [],
        },
      },
    ]);
    expect(JSON.parse(JSON.stringify(contract))).toEqual(contract);
    expect(buildBehaviorContract({ app: fixture.app, stories: [fixture.stories] })).toEqual(
      contract,
    );
    expect(sliceBehaviorContract(contract, "Behavior").app.moduleIds).toEqual(["Behavior"]);
  });

  it("rejects stories for machines that are not owned by the assembled app", () => {
    const fixture = createBehaviorFixture();
    const unrelatedMachine = flow.machine<{}, never, "idle">({
      id: "behavior.unrelated",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const unrelatedStories = flowStories(unrelatedMachine, [
      {
        id: "unrelated-story",
        title: "Unrelated story",
        events: [],
      },
    ]);

    expect(() =>
      buildBehaviorContract({
        app: fixture.app,
        stories: [unrelatedStories],
      }),
    ).toThrow(/behavior\.unrelated/);
  });
});
