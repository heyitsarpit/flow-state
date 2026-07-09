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
    const output = renderBehaviorContract(behaviorContractFixture);
    expect(output).toContain("behavior.contract Behavior+Shell");
    expect(output).toContain("modules: Behavior, Shell");
    expect(output).toContain("screens: Overview, Shell");
    expect(output).toContain("resources: behavior.project");
    expect(output).toContain("stories: 3");
    expect(output).toContain("behavior.machine initial=idle states=4 transitions=2");
    expect(output).toContain("transactions: behavior.save");
    expect(output).toContain("streams: behavior.updates");
    expect(output).toContain("views: behavior.view");
    expect(output).not.toContain("none");
  });

  it("renders the same brief shape as a clearly labeled module slice", () => {
    const output = renderBehaviorContract(behaviorContractFixture, {
      moduleId: "Behavior",
    });

    expect(output).toContain("behavior.contract Behavior+Shell module=Behavior");
    expect(output).toContain("modules: Behavior");
    expect(output).toContain("screens: Overview");
    expect(output).not.toContain("screens: Overview, Shell");
  });
});
