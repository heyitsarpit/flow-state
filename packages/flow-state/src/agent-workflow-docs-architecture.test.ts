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

  it("makes the workflow guide discoverable from the examples entrypoint", () => {
    const examplesSource = requireDoc("../../../apps/docs/src/pages/examples.md");

    expect(examplesSource).toContain("[Agent Workflow](/guide/agent-workflow)");
  });
});
