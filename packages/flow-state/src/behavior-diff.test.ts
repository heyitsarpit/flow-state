import { describe, expect, it } from "vite-plus/test";

import type { FlowBehaviorContract } from "./inspect.js";
import { diffBehaviorContracts, renderBehaviorDiff } from "./inspect.js";

function createBaseContract(): FlowBehaviorContract {
  return {
    version: "flow-state/behavior-contract.v1",
    app: {
      id: "Behavior+Shell",
      moduleIds: ["Behavior", "Shell"],
    },
    modules: [
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
    ],
    resources: [
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
    ],
    transactions: [
      {
        id: "behavior.save",
        moduleId: "Behavior",
        hasParams: true,
        hasPreview: true,
        hasInvalidates: true,
        hasQueueWhen: true,
        hasQueueReplay: false,
        hasQueueUndo: false,
        concurrency: "reject-while-running",
        routeKinds: ["success", "failure"],
      },
    ],
    machines: [
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
            timedTransitions: [],
            eventlessTransitions: [],
          },
          {
            id: "review",
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
        ],
      },
    ],
    streams: [
      {
        id: "behavior.updates",
        moduleId: "Behavior",
        hasParams: true,
        pressure: {
          strategy: "queue",
          limit: 2,
        },
        routeKinds: ["value", "done"],
      },
    ],
    views: [
      {
        id: "behavior.view",
        moduleId: "Behavior",
        sources: ["context", "resources", "transactions", "streams", "children"],
      },
    ],
    stories: [
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
          issueKinds: [],
          issueSources: [],
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
          hasBoot: false,
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
    ],
  };
}

function createChangedContract(): FlowBehaviorContract {
  const base = createBaseContract();
  return {
    ...base,
    app: {
      ...base.app,
      moduleIds: ["Behavior", "Shell", "Audit"],
    },
    modules: [
      {
        ...base.modules[0]!,
        screenIds: ["Overview", "Review"],
      },
      ...base.modules.slice(1),
      {
        id: "Audit",
        dependencies: [],
        screenIds: ["Audit"],
        tagIds: ["audit"],
        fixtureIds: [],
      },
    ],
    resources: [
      {
        ...base.resources[0]!,
        freshness: {
          staleAfter: "1 minute",
          onInvalidate: "active",
        },
      },
      {
        id: "audit.log",
        moduleId: "Audit",
        hasSchema: false,
        hasPlaceholder: false,
        freshness: null,
      },
    ],
    transactions: [
      {
        ...base.transactions[0]!,
        concurrency: null,
        routeKinds: ["success", "failure", "interrupt"],
      },
    ],
    machines: [
      {
        ...base.machines[0]!,
        states: [
          ...base.machines[0]!.states.map((state) =>
            state.id === "review"
              ? {
                  ...state,
                  childIds: ["reviewer"],
                }
              : state,
          ),
          {
            id: "failed",
            terminal: false,
            childIds: [],
            timedTransitions: [],
            eventlessTransitions: [],
          },
        ],
        transitions: [
          ...base.machines[0]!.transitions,
          {
            id: "review:REJECT:0",
            source: "review",
            target: "failed",
            eventType: "REJECT",
          },
        ],
      },
      {
        id: "audit.machine",
        moduleId: "Audit",
        initialStateId: "idle",
        states: [
          {
            id: "idle",
            terminal: false,
            childIds: [],
            timedTransitions: [],
            eventlessTransitions: [],
          },
        ],
        transitions: [],
      },
    ],
    streams: [
      {
        ...base.streams[0]!,
        pressure: {
          strategy: "queue",
          limit: 4,
        },
      },
    ],
    views: [
      {
        ...base.views[0]!,
        sources: ["context", "resources", "transactions", "streams", "children", "timers"],
      },
      {
        id: "audit.view",
        moduleId: "Audit",
        sources: ["context"],
      },
    ],
    stories: [
      {
        ...base.stories[0]!,
        expectedState: "review",
      },
      {
        id: "reject-story",
        machineId: "behavior.machine",
        title: "Reject story",
        tags: ["docs"],
        start: "default",
        expectedState: "failed",
        seed: null,
        expectedFacts: {
          receiptTypes: [],
          relatedIds: [],
          issueKinds: ["failure"],
          issueSources: ["transition"],
          outcomeKinds: [],
          outcomeSources: [],
        },
      },
    ],
  };
}

describe("behavior contract diffing", () => {
  it("is reflexive when separate modules declare the same resource id", () => {
    const base = createBaseContract();
    const resource = base.resources[0];
    if (resource === undefined) throw new Error("expected resource fixture");
    const contract: FlowBehaviorContract = {
      ...base,
      resources: [...base.resources, { ...resource, moduleId: "Shell" }],
    };

    const diff = diffBehaviorContracts(contract, contract);

    expect(diff.summary.matches).toBe(true);
    expect(diff.resources).toEqual({ matches: true, added: [], removed: [], changed: [] });
  });

  it("builds a structured diff and renders the required report sections in order", () => {
    const diff = diffBehaviorContracts(createBaseContract(), createChangedContract());
    const output = renderBehaviorDiff(diff);

    expect(diff.kind).toBe("behavior-diff");
    expect(diff.summary.matches).toBe(false);
    expect(diff.summary.changedSections).toEqual([
      "app-summary",
      "modules",
      "machines",
      "resources",
      "transactions",
      "streams",
      "views",
      "stories",
      "coverage-obligations",
    ]);
    expect(output).toContain("# Behavior Diff");
    expect(output).toContain("## App Summary");
    expect(output).toContain("## Module Changes");
    expect(output).toContain("## Machine/State/Transition Changes");
    expect(output).toContain("## Resource Changes");
    expect(output).toContain("## Transaction Changes");
    expect(output).toContain("## Stream Changes");
    expect(output).toContain("## View Changes");
    expect(output).toContain("## Story Changes");
    expect(output).toContain("## Coverage Obligation Changes");
    expect(output).toContain("- Added modules: Audit");
    expect(output).toContain("- Added machines: audit.machine");
    expect(output).toContain("behavior.machine: added states failed");
    expect(output).toContain("- Added resources: audit.log");
    expect(output).toContain('concurrency "reject-while-running" -> null');
    expect(output).toContain("- Changed streams: behavior.updates");
    expect(output).toContain("- Changed views: behavior.view");
    expect(output).toContain("- Added stories: reject-story");
    expect(output).toContain("- Added obligations:");
    expect(output).toContain("behavior.machine state failed");
    expect(output).toContain("behavior.machine transition review:REJECT:0");
    expect(output).toContain("behavior.save outcome interrupt");
    expect(output).toContain("behavior.view source timers");
    expect(output).toContain(
      "- Story-backed additions: behavior.machine state failed via reject-story",
    );
    expect(output).toContain("- Still unproved additions:");
    expect(output).toContain("behavior.machine transition review:REJECT:0");
    expect(output).toContain(
      "- behavior.machine state done: story-backed via default-story -> needs proof",
    );

    const headings = output
      .split("\n")
      .filter((line) => line.startsWith("## "))
      .slice(0, 9);
    expect(headings).toEqual([
      "## App Summary",
      "## Module Changes",
      "## Machine/State/Transition Changes",
      "## Resource Changes",
      "## Transaction Changes",
      "## Stream Changes",
      "## View Changes",
      "## Story Changes",
      "## Coverage Obligation Changes",
    ]);
  });

  it("diffs the filtered module slice instead of reporting unrelated app changes", () => {
    const diff = diffBehaviorContracts(createBaseContract(), createChangedContract(), {
      moduleId: "Behavior",
    });
    const output = renderBehaviorDiff(diff);

    expect(output).toContain("module slice: Behavior");
    expect(output).not.toContain("Added modules: Audit");
    expect(output).not.toContain("audit.machine");
    expect(output).toContain("- Changed modules: Behavior");
    expect(output).toContain("behavior.machine: added states failed");
    expect(output).toContain("behavior.view source timers");
  });
});
