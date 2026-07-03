import { describe, expect, it } from "vite-plus/test";

import type { FlowBehaviorContract } from "./inspect.js";
import { renderBehaviorContract } from "./core/inspection/behavior-render.js";

const behaviorContractFixture: FlowBehaviorContract = {
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
      hasQueueReplay: true,
      hasQueueUndo: true,
      concurrency: "reject-while-running",
      routeKinds: ["success", "failure", "defect", "interrupt"],
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
      routeKinds: ["value", "done", "failure", "defect", "interrupt"],
    },
  ],
  views: [
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
  ],
};

describe("behavior contract renderer", () => {
  it("renders one shared brief from the canonical app contract", () => {
    expect(renderBehaviorContract(behaviorContractFixture)).toContain("# Behavior+Shell");
    expect(renderBehaviorContract(behaviorContractFixture)).toContain("## App");
    expect(renderBehaviorContract(behaviorContractFixture)).toContain("- Modules: Behavior, Shell");
    expect(renderBehaviorContract(behaviorContractFixture)).toContain("- Screens: Overview, Shell");
    expect(renderBehaviorContract(behaviorContractFixture)).toContain(
      "- Resources: behavior.project (schema; placeholder; freshness 5 minutes; invalidate lazy)",
    );
    expect(renderBehaviorContract(behaviorContractFixture)).toContain("## Main Machines");
    expect(renderBehaviorContract(behaviorContractFixture)).toContain("### behavior.machine");
    expect(renderBehaviorContract(behaviorContractFixture)).toContain(
      "- States: done, idle, review, timedOut",
    );
    expect(renderBehaviorContract(behaviorContractFixture)).toContain(
      "- Transactions: behavior.save",
    );
    expect(renderBehaviorContract(behaviorContractFixture)).toContain(
      "- Streams: behavior.updates",
    );
    expect(renderBehaviorContract(behaviorContractFixture)).toContain(
      "- behavior.view: context, resources, transactions, streams, children, issues, receipts",
    );
    expect(renderBehaviorContract(behaviorContractFixture)).toContain("## Current Proof Surface");
    expect(renderBehaviorContract(behaviorContractFixture)).toContain("- Stories: 3");
    expect(renderBehaviorContract(behaviorContractFixture)).toContain(
      "derived coverage view arrives in `behavior render --section coverage`",
    );
  });

  it("renders the same brief shape as a clearly labeled module slice", () => {
    const output = renderBehaviorContract(behaviorContractFixture, {
      moduleId: "Behavior",
    });

    expect(output).toContain("# Behavior+Shell (module slice: Behavior)");
    expect(output).toContain("- Modules: Behavior");
    expect(output).toContain("- Screens: Overview");
    expect(output).not.toContain("- Screens: Overview, Shell");
  });
});
