import { describe, expect, it } from "vite-plus/test";

const docsSources = {
  ...(import.meta.glob("../../../apps/docs/src/pages/guide/agent-workflow.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/behavior.mdx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/testing.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/inspection.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

function requireDoc(path: string): string {
  const source = docsSources[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source`);
  }

  return source;
}

describe("docs owner split architecture", () => {
  it("keeps the behavior reference focused on declared facts", () => {
    const behaviorSource = requireDoc("../../../apps/docs/src/pages/reference/behavior.mdx");

    expect(behaviorSource).toContain("shared application behavior brief");
    expect(behaviorSource).toContain("flow-state behavior build");
    expect(behaviorSource).toContain("flow-state behavior render");
    expect(behaviorSource).toContain("flow-state behavior diff");
    expect(behaviorSource).not.toContain("flow-state story run");
    expect(behaviorSource).not.toContain("flow-state trace summarize");
  });

  it("keeps the testing reference focused on deterministic execution owners", () => {
    const testingSource = requireDoc("../../../apps/docs/src/pages/reference/testing.md");

    expect(testingSource).toContain("Harness Scenario Tests");
    expect(testingSource).toContain("runFlowScenario(...)");
    expect(testingSource).toContain("test.model(machine)");
    expect(testingSource).toContain("`scenarioToReport(...)` evaluates");
    expect(testingSource).not.toContain("`checkStory(...)`");
    expect(testingSource).not.toContain("flow-state behavior build");
    expect(testingSource).not.toContain("flow-state trace summarize");
  });

  it("keeps the inspection reference focused on library analysis and proof helpers", () => {
    const inspectionSource = requireDoc("../../../apps/docs/src/pages/reference/inspection.md");

    expect(inspectionSource).toContain("flow-state/inspect");
    expect(inspectionSource).toContain("captureTrace(...)");
    expect(inspectionSource).toContain("analyzeTrace(...)");
    expect(inspectionSource).toContain("still exports some pre-CLI helper names");
    expect(inspectionSource).toContain("`storyToDoc(...)` -> `describeStory(...)`");
    expect(inspectionSource).toContain("`analyzeTrace(...)` -> `contextualizeTrace(...)`");
    expect(inspectionSource).toContain(
      "`createLocalInspectionProof(...)` -> `createTraceProof(...)`",
    );
    expect(inspectionSource).toContain("local proof and CLI commands");
    expect(inspectionSource).not.toContain("flow-state behavior build");
    expect(inspectionSource).not.toContain("flow-state story run --check");
  });

  it("keeps the agent workflow guide as the router between owner pages", () => {
    const workflowSource = requireDoc("../../../apps/docs/src/pages/guide/agent-workflow.md");

    expect(workflowSource).toContain("organizes the jobs, then points you back to the owner pages");
    expect(workflowSource).toContain("[Behavior Contract](/reference/behavior)");
    expect(workflowSource).toContain("[Testing Reference](/reference/testing)");
    expect(workflowSource).toContain("[Inspection](/reference/inspection)");
  });
});
