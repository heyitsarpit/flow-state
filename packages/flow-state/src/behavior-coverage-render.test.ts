import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { flowStories } from "./inspect.js";
import { renderBehaviorCoverage } from "./core/inspection/behavior-coverage.js";

const behaviorMachine = flow.machine<
  { readonly allowed: boolean },
  | Readonly<{ readonly type: "REVIEW" }>
  | Readonly<{ readonly type: "PUBLISH" }>
  | Readonly<{ readonly type: "REOPEN" }>
  | Readonly<{ readonly type: "LOCKED" }>,
  "draft" | "review" | "published"
>({
  id: "behavior.machine",
  initial: "draft",
  context: () => ({ allowed: false }),
  states: {
    draft: {
      on: {
        LOCKED: {
          target: "review",
          guard: ({ context }) => context.allowed,
        },
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

const auditOnlyMachine = flow.machine<
  Record<string, never>,
  Readonly<{ readonly type: "OPEN" }>,
  "idle" | "open"
>({
  id: "audit.machine",
  initial: "idle",
  context: () => ({}),
  states: {
    idle: {
      on: {
        OPEN: "open",
      },
    },
    open: {},
  },
});

const auditModule = flow.module(
  "Audit",
  {
    machines: {
      auditOnlyMachine,
    },
  },
  {
    tags: ["audit"],
    screens: ["Audit"],
  },
);

const behaviorStories = flowStories(behaviorMachine, [
  {
    id: "review-story",
    title: "Review story",
    events: [{ type: "REVIEW" }],
    expectedState: "review",
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
    id: "locked-success",
    title: "Locked success",
    start: {
      kind: "snapshot",
      snapshot: {
        ...behaviorMachine.getInitialSnapshot(),
        context: {
          allowed: true,
        },
      },
    },
    events: [{ type: "LOCKED" }],
    expectedState: "review",
  },
  {
    id: "bad-start",
    title: "Bad start",
    events: [{ type: "PUBLISH" }],
    expectedState: "published",
  },
  {
    id: "locked-blocked",
    title: "Locked blocked",
    events: [{ type: "LOCKED" }],
    expectedState: "review",
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
    expect(output).toContain("- Covered-story receipt types: transaction:commit");
    expect(output).toContain("- Covered-story related ids: behavior.save");
    expect(output).toContain("## Covered States By Machine");
    expect(output).toContain("- behavior.machine: draft, published (final), review");
    expect(output).toContain("## Uncovered States By Machine");
    expect(output).toContain("- behavior.machine: none");
    expect(output).toContain("## Covered Transitions By Machine");
    expect(output).toContain(
      "draft --LOCKED--> review [draft:LOCKED:0] guard pass via locked-success",
    );
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
    expect(output).toContain("Event PUBLISH has no transition from draft.");
    expect(output).toContain("- locked-blocked (behavior.machine): path-not-found");
    expect(output).toContain("Event LOCKED is blocked in draft by guard(s) #0.");
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

  it("treats machines without story descriptors as empty audit coverage instead of undefined facts", () => {
    const auditApp = flow.app({
      modules: [behaviorModule, shellModule, auditModule],
    });

    const output = renderBehaviorCoverage({
      app: auditApp,
      stories: [behaviorStories],
    });

    expect(output).toContain("# Behavior+Shell+Audit Coverage");
    expect(output).toContain("- Covered-story receipt types: transaction:commit");
    expect(output).toContain("- Covered-story related ids: behavior.save");
    expect(output).toContain("- audit.machine: none");
    expect(output).toContain("- audit.machine: idle, open");
  });
});
