import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { flowStories } from "./inspect.js";
import { renderBehaviorCoverage } from "./core/inspection/behavior-coverage.js";

const reviewChildMachine = flow.machine<
  Record<string, never>,
  Readonly<{ readonly type: "STOP" }>,
  "working"
>({
  id: "behavior.review-child",
  initial: "working",
  context: () => ({}),
  states: {
    working: {},
  },
});

const reviewChild = flow.child({
  id: "behavior.review-child",
  machine: reviewChildMachine,
  supervision: "stop-on-failure",
});

const reviewStream = flow.stream<
  Record<string, never>,
  Readonly<{ readonly type: "REVIEW" }>,
  void,
  string
>({
  id: "behavior.review-stream",
  subscribe: () => Stream.empty,
  pressure: { strategy: "queue" as const, limit: 4 },
  routes: {
    value: () => ({ type: "REVIEW" as const }),
  },
});

const reviewResource = flow.resource<[], { readonly id: "review" }>({
  id: "behavior.review-resource",
  key: () => flow.createKey("behavior", "review-resource"),
  lookup: () => Effect.succeed({ id: "review" as const }),
});

const behaviorMachine = flow.machine<
  { readonly allowed: boolean },
  | Readonly<{ readonly type: "REVIEW" }>
  | Readonly<{ readonly type: "PUBLISH" }>
  | Readonly<{ readonly type: "REOPEN" }>
  | Readonly<{ readonly type: "SAVE_FAILED" }>
  | Readonly<{ readonly type: "LOCKED" }>,
  "draft" | "review" | "published" | "failed"
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
      invoke: [flow.ensure(reviewResource.ref()), reviewChild, reviewStream],
      on: {
        PUBLISH: "published",
        REOPEN: "draft",
        SAVE_FAILED: "failed",
      },
    },
    failed: {},
    published: {
      type: "final",
    },
  },
});

const saveBehaviorTransaction = flow.transaction({
  id: "behavior.save",
  commit: () => Effect.succeed(undefined),
  routes: flow.outcomes({
    failure: () => ({ type: "SAVE_FAILED" as const }),
  }),
});

const behaviorView = flow.view<
  { readonly allowed: boolean },
  "draft" | "review" | "published" | "failed",
  { readonly ready: boolean }
>({
  id: "behavior.view",
  sources: ["context", "resources", "transactions", "streams", "children", "issues", "receipts"],
  select: () => ({ ready: true }),
});

const behaviorModule = flow.module(
  "Behavior",
  {
    resources: {
      reviewResource,
    },
    streams: {
      reviewStream,
    },
    transactions: {
      saveBehaviorTransaction,
    },
    machines: {
      behaviorMachine,
    },
    views: {
      behaviorView,
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

const auditChildMachine = flow.machine<
  Record<string, never>,
  Readonly<{ readonly type: "STOP" }>,
  "running"
>({
  id: "audit.child",
  initial: "running",
  context: () => ({}),
  states: {
    running: {},
  },
});

const auditChild = flow.child({
  id: "audit.child",
  machine: auditChildMachine,
  supervision: "continue-on-failure",
});

const auditStream = flow.stream<
  Record<string, never>,
  Readonly<{ readonly type: "OPEN" }>,
  void,
  string
>({
  id: "audit.stream",
  subscribe: () => Stream.empty,
  pressure: {
    strategy: "coalesce-latest" as const,
    limit: 1,
    key: () => "audit",
  },
  routes: {
    value: () => ({ type: "OPEN" as const }),
  },
});

const auditResource = flow.resource<[], { readonly id: "audit" }>({
  id: "audit.resource",
  key: () => flow.createKey("audit", "resource"),
  lookup: () => Effect.succeed({ id: "audit" as const }),
});

const auditView = flow.view<Record<string, never>, "idle" | "open", { readonly ready: boolean }>({
  id: "audit.view",
  sources: ["context", "resources", "timers"],
  select: () => ({ ready: true }),
});

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
    open: {
      invoke: [flow.observe(auditResource.ref()), auditChild, auditStream],
    },
  },
});

const auditModule = flow.module(
  "Audit",
  {
    resources: {
      auditResource,
    },
    streams: {
      auditStream,
    },
    machines: {
      auditOnlyMachine,
    },
    views: {
      auditView,
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
    id: "save-failed",
    title: "Save failed",
    start: {
      kind: "snapshot",
      snapshot: {
        ...behaviorMachine.getInitialSnapshot(),
        value: "review" as const,
      },
    },
    events: [{ type: "SAVE_FAILED" }],
    expectedState: "failed",
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
  modules: [behaviorModule, shellModule, auditModule],
});

describe("behavior coverage renderer", () => {
  it("renders the detailed coverage view from the live behavior gateway inputs", () => {
    const output = renderBehaviorCoverage({
      app: behaviorApp,
      stories: [behaviorStories],
    });

    expect(output).toContain("behavior.coverage Behavior+Shell+Audit — 8 stories");
    expect(output).toContain("curated story coverage, not execution proof");
    expect(output).toContain("covered:");
    expect(output).toContain(
      "behavior.machine: states=draft,review,failed,published; transitions=4",
    );
    expect(output).toContain("unproved:");
    expect(output).toContain("transactions=behavior.save -> failure");
    expect(output).toContain("audit.machine: states=idle,open");
    expect(output).toContain("machines with no covered states: audit.machine");
    expect(output).toContain("blocked stories: bad-start (behavior.machine): path-not-found");
    expect(output).toContain(
      "mismatch stories: wrong-expectation (behavior.machine): expected-state-mismatch",
    );
    expect(output).toContain("unproved views: audit.view(timers)");
    expect(output).not.toContain("## ");
  });

  it("keeps the required contract sections in the documented order", () => {
    const output = renderBehaviorCoverage({
      app: behaviorApp,
      stories: [behaviorStories],
    });

    expect(output.indexOf("covered:") < output.indexOf("unproved:")).toBe(true);
    expect(output.indexOf("unproved:") < output.indexOf("blocked stories:")).toBe(true);
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

    expect(output).toContain("behavior.coverage Behavior+Shell+Audit");
    expect(output).toContain("scope: module Behavior");
    expect(output).not.toContain("audit.machine");
  });

  it("treats machines without story descriptors as empty audit coverage instead of undefined facts", () => {
    const auditApp = flow.app({
      modules: [behaviorModule, shellModule, auditModule],
    });

    const output = renderBehaviorCoverage({
      app: auditApp,
      stories: [behaviorStories],
    });

    expect(output).toContain("behavior.coverage Behavior+Shell+Audit");
    expect(output).toContain("audit.machine: states=idle,open");
    expect(output).toContain("machines with no covered states: audit.machine");
    expect(output).not.toContain("audit.machine: none");
  });
});
