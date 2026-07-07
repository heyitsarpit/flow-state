import { describe, expect, it } from "vite-plus/test";

const sources = {
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/behavior.mdx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/examples.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../HOW_TO_USE_FLOW_STATE.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../GOALS.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

function requireSource(path: string): string {
  const source = sources[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source`);
  }

  return source;
}

describe("behavior guidance architecture", () => {
  it("routes terse app onboarding and planning through the behavior contract page", () => {
    const behaviorSource = requireSource("../../../apps/docs/src/pages/reference/behavior.mdx");
    const examplesSource = requireSource("../../../apps/docs/src/pages/examples.md");

    expect(behaviorSource).toContain("shortest app-level onboarding and planning surface");
    expect(behaviorSource).toContain("flow-state behavior build");
    expect(behaviorSource).toContain("flow-state behavior render");
    expect(behaviorSource).toContain("flow-state behavior diff");
    expect(behaviorSource).toContain("[Launch Workspace](/guide/launch-workspace)");
    expect(behaviorSource).toContain("[Current Status](/reference/status)");
    expect(examplesSource).toContain("[Behavior Contract](/reference/behavior)");
  });

  it("keeps HOW_TO_USE_FLOW_STATE as the usage-model note and points concrete build flow to behavior outputs", () => {
    const howToUseSource = requireSource("../../../HOW_TO_USE_FLOW_STATE.md");

    expect(howToUseSource).toContain("This is not a docs page yet.");
    expect(howToUseSource).toContain("Concrete behavior-contract build flow");
    expect(howToUseSource).toContain("[BEHAVIOR_SYSTEM.md]");
    expect(howToUseSource).toContain("[BEHAVIOR_CONTRACT.md]");
    expect(howToUseSource).toContain("[behavior-contract.json]");
    expect(howToUseSource).toContain("flow-state behavior build");
    expect(howToUseSource).toContain("flow-state behavior render");
    expect(howToUseSource).toContain("flow-state behavior diff");
  });

  it("keeps a standalone Goal 8 /goal prompt entry for autonomous behavior-system passes", () => {
    const goalsSource = requireSource("../../../GOALS.md");

    expect(goalsSource).toContain("## Goal 8");
    expect(goalsSource).toContain("Build Goal 8 strictly from");
    expect(goalsSource).toContain("BEHAVIOR_SYSTEM.md and BEHAVIOR_CONTRACT.md.");
    expect(goalsSource).toContain("Review bar: Tests are the contract");
  });
});
