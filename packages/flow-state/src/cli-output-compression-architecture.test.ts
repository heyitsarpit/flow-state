import { describe, expect, it } from "vite-plus/test";

const sources = {
  ...(import.meta.glob("../../../TOOLS_AND_DOCS.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../CLI_OUTPUT_COMPRESSION_RUNBOOK.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../CLI_OUTPUT_COMPRESSION_REVIEW.md", {
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

describe("CLI output compression architecture", () => {
  it("keeps the backlog task explicit about live help, a separate judge, and the review-only first slice", () => {
    const toolsSource = requireSource("../../../TOOLS_AND_DOCS.md");

    expect(toolsSource).toContain("Run the full public CLI surface");
    expect(toolsSource).toContain("`examples/launch-workspace`");
    expect(toolsSource).toContain("`flow-state --help`");
    expect(toolsSource).toContain("CLI_OUTPUT_COMPRESSION_RUNBOOK.md");
    expect(toolsSource).toContain("separate judging subagent");
    expect(toolsSource).toContain("CLI_OUTPUT_COMPRESSION_REVIEW.md");
    expect(toolsSource).toContain(
      "do not change the CLI output contracts in the same slice as the review",
    );
  });

  it("keeps the runbook driven by live help, real receipts, and a stop rule", () => {
    const runbookSource = requireSource("../../../CLI_OUTPUT_COMPRESSION_RUNBOOK.md");

    expect(runbookSource).toContain("Use the live help output as the source of truth");
    expect(runbookSource).toContain("examples/launch-workspace");
    expect(runbookSource).toContain("$CLI --help");
    expect(runbookSource).toContain("$CLI story run --help");
    expect(runbookSource).toContain("CLI_OUTPUT_COMPRESSION_REVIEW.md");
    expect(runbookSource).toContain(
      "Do not change CLI output contracts in the same slice as this review.",
    );
    expect(runbookSource).toContain("Do not implement any output changes in this runbook slice.");
  });

  it("keeps the review artifact concrete and free of placeholder findings", () => {
    const reviewSource = requireSource("../../../CLI_OUTPUT_COMPRESSION_REVIEW.md");

    expect(reviewSource).toContain("# CLI Output Compression Review");
    expect(reviewSource).toContain("## Command Inventory");
    expect(reviewSource).toContain("## Findings By Command Family");
    expect(reviewSource).toContain("## Before / After Examples");
    expect(reviewSource).toContain("## Facts That Must Survive Any Compression");
    expect(reviewSource).toContain("live help tree is the source of truth");
    expect(reviewSource).toContain("story run assistant-running");
    expect(reviewSource).toContain("trace summarize");
    expect(reviewSource).not.toContain("TBD by judging subagent.");
  });
});
