import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { flowStories } from "./inspect.js";
import { renderBehaviorCoverage } from "./core/inspection/behavior-coverage.js";

const behaviorMachine = flow.machine<
  {},
  | Readonly<{ readonly type: "REVIEW" }>
  | Readonly<{ readonly type: "PUBLISH" }>
  | Readonly<{ readonly type: "REOPEN" }>,
  "draft" | "review" | "published"
>({
  id: "behavior.machine",
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
        REOPEN: "draft",
      },
    },
    published: {
      type: "final",
    },
  },
});

const behaviorModule = flow.module(
  "Behavior",
  {
    machines: {
      behaviorMachine,
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

const behaviorStories = flowStories(behaviorMachine, [
  {
    id: "review-story",
    title: "Review story",
    events: [{ type: "REVIEW" }],
    expectedState: "review",
    expectedFacts: {
      issueKinds: ["failure"],
      issueSources: ["transaction"],
      outcomeKinds: ["success"],
      outcomeSources: ["transaction"],
    },
  },
  {
    id: "publish-story",
    title: "Publish story",
    start: {
      kind: "snapshot",
      snapshot: {
        ...behaviorMachine.getInitialSnapshot(),
        value: "review" as const,
      },
    },
    events: [{ type: "PUBLISH" }],
    expectedState: "published",
  },
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
  {
    id: "setup-story",
    title: "Setup story",
    start: {
      kind: "setup",
      description: "Seed an existing approval request.",
    },
    events: [{ type: "PUBLISH" }],
    expectedFacts: {
      outcomeKinds: ["interrupt"],
    },
  },
]);

const behaviorApp = flow.app({
  modules: [behaviorModule, shellModule],
});

describe("behavior coverage renderer", () => {
  it("renders the detailed coverage view from the live behavior gateway inputs", () => {
    const output = renderBehaviorCoverage({
      app: behaviorApp,
      stories: [behaviorStories],
    });

    expect(output).toContain("# Behavior+Shell Coverage");
    expect(output).toContain("## Coverage Scope Note");
    expect(output).toContain("story coverage over curated stories");
    expect(output).toContain("## Covered States By Machine");
    expect(output).toContain("- behavior.machine: draft, published (final), review");
    expect(output).toContain("## Uncovered States By Machine");
    expect(output).toContain("- behavior.machine: none");
    expect(output).toContain("## Covered Transitions By Machine");
    expect(output).toContain("draft --REVIEW--> review [draft:REVIEW:0]");
    expect(output).toContain("review --PUBLISH--> published [review:PUBLISH:0]");
    expect(output).toContain("## Uncovered Transitions By Machine");
    expect(output).toContain("review --REOPEN--> draft [review:REOPEN:0]");
    expect(output).toContain("## Covered Issue Lanes");
    expect(output).toContain("- Kinds: failure");
    expect(output).toContain("- Sources: transaction");
    expect(output).toContain("## Covered Outcome Lanes");
    expect(output).toContain("- Kinds: success");
    expect(output).toContain("- Sources: transaction");
    expect(output).toContain("## Blocked Stories");
    expect(output).toContain("- bad-start (behavior.machine): path-not-found");
    expect(output).toContain("- setup-story (behavior.machine): setup-description");
    expect(output).toContain("## Mismatch Stories");
    expect(output).toContain("- wrong-expectation (behavior.machine): expected-state-mismatch");
  });

  it("renders the same coverage shape as a module slice over the app contract", () => {
    const output = renderBehaviorCoverage(
      {
        app: behaviorApp,
        stories: [behaviorStories],
      },
      {
        moduleId: "Behavior",
      },
    );

    expect(output).toContain("# Behavior+Shell Coverage (module slice: Behavior)");
    expect(output).toContain("Scope: module Behavior within app Behavior+Shell.");
    expect(output).not.toContain("module slice: Shell");
  });
});
