import { describe, expect, it } from "vite-plus/test";

const docsSources = {
  ...(import.meta.glob("../../../apps/docs/src/pages/guide/agent-workflow.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/examples.md", {
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

describe("agent workflow docs architecture", () => {
  it("adds a guide page for the durable four-job workflow", () => {
    const workflowSource = requireDoc("../../../apps/docs/src/pages/guide/agent-workflow.md");

    expect(workflowSource).toContain("# Agent Workflow");
    expect(workflowSource).toContain("Declared facts");
    expect(workflowSource).toContain("Path discovery");
    expect(workflowSource).toContain("Reproducible execution");
    expect(workflowSource).toContain("Runtime evidence");
    expect(workflowSource).toContain("flow-state behavior render");
    expect(workflowSource).toContain("flow-state story paths");
    expect(workflowSource).toContain("flow-state story run");
    expect(workflowSource).toContain("flow-state trace summarize");
    expect(workflowSource).toContain("[Behavior Contract](/reference/behavior)");
    expect(workflowSource).toContain("[Testing Reference](/reference/testing)");
    expect(workflowSource).toContain("[Inspection](/reference/inspection)");
    expect(workflowSource).toContain("[Current Status](/reference/status)");
  });

  it("keeps the workflow guide honest about public, narrow, and app-owned surfaces", () => {
    const workflowSource = requireDoc("../../../apps/docs/src/pages/guide/agent-workflow.md");

    expect(workflowSource).toContain("Surface Boundaries");
    expect(workflowSource).toContain(
      "`behavior`, `story`, and `trace` are the durable package CLI families",
    );
    expect(workflowSource).toContain("`story run --pending-work`");
    expect(workflowSource).toContain("`trace summarize --contextualize`");
    expect(workflowSource).toContain("`trace proof`");
    expect(workflowSource).toContain("`packages/flow-state/scripts/**`");
    expect(workflowSource).toContain("`examples/launch-workspace`");
    expect(workflowSource).toContain("not new public job families");
  });

  it("adds receipt-backed CLI examples for the durable workflow jobs", () => {
    const workflowSource = requireDoc("../../../apps/docs/src/pages/guide/agent-workflow.md");

    expect(workflowSource).toContain("Receipt-Backed Examples");
    expect(workflowSource).toContain(
      "flow-state behavior render --section coverage --project-root examples/launch-workspace",
    );
    expect(workflowSource).toContain("# LaunchWorkspace+Session+Launch+Project+Checklist");
    expect(workflowSource).toContain(
      "flow-state story --project-root examples/launch-workspace paths --machine launch-workspace",
    );
    expect(workflowSource).toContain("# Story Paths: launch-workspace");
    expect(workflowSource).toContain(
      "flow-state story --project-root examples/launch-workspace run assistant-running",
    );
    expect(workflowSource).toContain("# Story Run: assistant-running");
    expect(workflowSource).toContain('flow-state trace summarize "<saved-trace-path>"');
    expect(workflowSource).toContain("# Trace Summary");
  });

  it("maps public jobs to the owning internal helpers", () => {
    const workflowSource = requireDoc("../../../apps/docs/src/pages/guide/agent-workflow.md");

    expect(workflowSource).toContain("Public Jobs To Internal Helpers");
    expect(workflowSource).toContain(".inventory()");
    expect(workflowSource).toContain("buildBehaviorContract(...)");
    expect(workflowSource).toContain("renderBehaviorContract(...)");
    expect(workflowSource).toContain("renderBehaviorCoverage(...)");
    expect(workflowSource).toContain("diffBehaviorContracts(...)");
    expect(workflowSource).toContain("flowStories(...)");
    expect(workflowSource).toContain("describeStory(...)");
    expect(workflowSource).toContain("storyToDoc(...)");
    expect(workflowSource).toContain("runFlowStory(...)");
    expect(workflowSource).toContain("checkStory(...)");
    expect(workflowSource).toContain("storyToTest(...)");
    expect(workflowSource).toContain("receiptSummary()");
    expect(workflowSource).toContain("issueSummary()");
    expect(workflowSource).toContain("pendingWork()");
    expect(workflowSource).toContain("test.model(machine)");
    expect(workflowSource).toContain("graph.pathFromEvents(...)");
    expect(workflowSource).toContain("captureTrace(...)");
    expect(workflowSource).toContain("summarizeTrace(...)");
    expect(workflowSource).toContain("diffTrace(...)");
    expect(workflowSource).toContain("contextualizeTrace(...)");
    expect(workflowSource).toContain("analyzeTrace(...)");
    expect(workflowSource).toContain("createTraceProof(...)");
    expect(workflowSource).toContain("createLocalInspectionProof(...)");
    expect(workflowSource).toContain("formatPendingWorkPretty(...)");
    expect(workflowSource).toContain("formatScenarioTranscript(...)");
    expect(workflowSource).toContain("formatTransactionEventsPretty(...)");
    expect(workflowSource).toContain("formatHarnessTracePretty(...)");
  });

  it("keeps the planned helper renames explicit in the workflow guide", () => {
    const workflowSource = requireDoc("../../../apps/docs/src/pages/guide/agent-workflow.md");

    expect(workflowSource).toContain("Pending Helper Renames");
    expect(workflowSource).toContain("`storyToDoc(...)` remains the current helper export");
    expect(workflowSource).toContain("`describeStory(...)`");
    expect(workflowSource).toContain("`storyToTest(...)` remains the current helper export");
    expect(workflowSource).toContain("`checkStory(...)`");
    expect(workflowSource).toContain("`analyzeTrace(...)` remains the current helper export");
    expect(workflowSource).toContain("`contextualizeTrace(...)`");
    expect(workflowSource).toContain(
      "`createLocalInspectionProof(...)` remains the current helper export",
    );
    expect(workflowSource).toContain("`createTraceProof(...)`");
    expect(workflowSource).toContain("current code-level aliases only");
  });

  it("makes the workflow guide discoverable from the examples entrypoint", () => {
    const examplesSource = requireDoc("../../../apps/docs/src/pages/examples.md");

    expect(examplesSource).toContain("[Agent Workflow](/guide/agent-workflow)");
  });
});
