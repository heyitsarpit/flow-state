import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import type { FlowBehaviorContract } from "./inspect.js";

const launchWorkspaceRoot = new URL("../../../examples/launch-workspace", import.meta.url).pathname;
const scriptPath = new URL("../scripts/flow-state-cli.mjs", import.meta.url);
const inspectLocalProofScript = new URL("../scripts/inspect-local-proof.mjs", import.meta.url);

function tempPath(name: string): string {
  return join(fs.mkdtempSync(join(tmpdir(), "flow-state-cli-")), name);
}

function writeJsonFile(name: string, contents: unknown): string {
  const path = tempPath(name);
  fs.writeFileSync(path, `${JSON.stringify(contents, null, 2)}\n`);
  return path;
}

function saveStoryTrace(storyId: string, name: string): string {
  const path = tempPath(name);
  runCli("story", "--project-root", launchWorkspaceRoot, "run", storyId, "--save-trace", path);
  return path;
}

function runCli(...args: ReadonlyArray<string>): string {
  return execFileSync(process.execPath, [scriptPath.pathname, ...args], {
    encoding: "utf8",
  });
}

function runCliFailure(...args: ReadonlyArray<string>): string {
  try {
    runCli(...args);
    throw new Error("Expected CLI to fail.");
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : undefined;

    return stderr && stderr.length > 0 ? stderr : error.message;
  }
}

describe("flow-state CLI script", () => {
  it("advertises only the durable top-level job families", () => {
    const output = runCli("--help");

    expect(output).toContain("SUBCOMMANDS");
    expect(output).toContain("behavior    Inspect declared app and module behavior facts.");
    expect(output).toContain(
      "story       Discover declared codebase stories without executing them.",
    );
    expect(output).toContain("trace       Read saved runtime trace evidence.");
    expect(output).not.toContain("\n  inventory");
    expect(output).not.toContain("\n  inspect");
  });

  it("keeps low-level inspection plumbing out of the public trace subcommands", () => {
    const output = runCli("trace", "--help");

    expect(output).toContain("SUBCOMMANDS");
    expect(output).toContain("summarize    Summarize one saved runtime trace or proof bundle.");
    expect(output).toContain(
      "proof        Inspect one selector-first proof slice from saved runtime evidence.",
    );
    expect(output).toContain("diff         Diff two saved runtime traces or proof bundles.");
    expect(output).not.toContain("entries");
    expect(output).not.toContain("subscribe");
    expect(output).not.toContain("attachInspectionSink");
    expect(output).not.toContain("createInspectionBufferSink");
  });

  it("keeps fine-grained machine inspection helpers behind the story paths workflow", () => {
    const storyOutput = runCli("story", "--help");
    const pathsOutput = runCli("story", "paths", "--help");

    expect(storyOutput).toContain(
      "paths       Discover or validate legal machine paths without running a story.",
    );
    expect(storyOutput).not.toContain("graph");
    expect(storyOutput).not.toContain("transition");
    expect(storyOutput).not.toContain("microsteps");
    expect(storyOutput).not.toContain("actions");
    expect(storyOutput).not.toContain("whyNoTransition");

    expect(pathsOutput).toContain("--strategy choice");
    expect(pathsOutput).toContain("--check");
    expect(pathsOutput).not.toContain("graphOf");
    expect(pathsOutput).not.toContain("inspectTransition");
    expect(pathsOutput).not.toContain("inspectMicrosteps");
    expect(pathsOutput).not.toContain("inspectActions");
    expect(pathsOutput).not.toContain("whyNoTransition");
  });

  it("keeps testing debug formatters out of the public story verb tree", () => {
    const output = runCli("story", "--help");

    expect(output).toContain("list        List declared stories from the behavior gateway.");
    expect(output).toContain("describe    Describe one declared story without running it.");
    expect(output).toContain("run         Run one declared story and emit compact runtime facts.");
    expect(output).toContain(
      "paths       Discover or validate legal machine paths without running a story.",
    );
    expect(output).not.toContain("transcript");
    expect(output).not.toContain("transactions");
    expect(output).not.toContain("pending-work");
    expect(output).not.toContain("formatHarnessTracePretty");
    expect(output).not.toContain("formatPendingWorkPretty");
    expect(output).not.toContain("formatScenarioTranscript");
    expect(output).not.toContain("formatTransactionEventsPretty");
  });

  it("builds a behavior contract and renders the same contract in json mode", () => {
    const outputPath = tempPath("behavior-contract.json");

    const buildOutput = runCli(
      "behavior",
      "build",
      "--project-root",
      launchWorkspaceRoot,
      "--output",
      outputPath,
    );

    expect(buildOutput).toContain("Wrote behavior contract");

    const saved = JSON.parse(
      execFileSync("cat", [outputPath], { encoding: "utf8" }),
    ) as FlowBehaviorContract;

    expect(saved.version).toBe("flow-state/behavior-contract.v1");

    const renderOutput = runCli("behavior", "render", "--input", outputPath, "--format", "json");
    const rendered = JSON.parse(renderOutput) as FlowBehaviorContract;

    expect(rendered).toEqual(saved);
  });

  it("renders live behavior coverage through the main flow-state CLI", () => {
    const output = runCli(
      "behavior",
      "render",
      "--section",
      "coverage",
      "--project-root",
      launchWorkspaceRoot,
      "--gateway",
      "src/app/behavior.ts",
    );

    expect(output).toContain("Coverage");
    expect(output).toContain("story coverage over curated stories");
    expect(output).toContain("launch-workspace: ready, runningAssistant");
  });

  it("fails closed when live behavior coverage is requested in json mode", () => {
    const output = runCliFailure(
      "behavior",
      "render",
      "--section",
      "coverage",
      "--project-root",
      launchWorkspaceRoot,
      "--format",
      "json",
    );

    expect(output).toContain(
      "`behavior render --section coverage` does not yet expose a stable JSON envelope.",
    );
  });

  it("diffs two behavior contract files in json mode through the main flow-state CLI", () => {
    const leftPath = tempPath("behavior-left.json");
    runCli("behavior", "build", "--project-root", launchWorkspaceRoot, "--output", leftPath);
    const left = JSON.parse(
      execFileSync("cat", [leftPath], { encoding: "utf8" }),
    ) as FlowBehaviorContract;
    const rightPath = writeJsonFile("behavior-right.json", {
      ...left,
      app: {
        ...left.app,
        id: `${left.app.id}+review`,
      },
    });

    const output = runCli(
      "behavior",
      "diff",
      "--left-input",
      leftPath,
      "--right-input",
      rightPath,
      "--format",
      "json",
    );

    const diff = JSON.parse(output) as {
      readonly kind: string;
      readonly summary: Readonly<{
        readonly matches: boolean;
        readonly changedSections: ReadonlyArray<string>;
      }>;
      readonly appSummary: Readonly<{
        readonly matches: boolean;
        readonly changedFields: ReadonlyArray<string>;
      }>;
    };

    expect(diff.kind).toBe("behavior-diff");
    expect(diff.summary.matches).toBe(false);
    expect(diff.summary.changedSections).toContain("app-summary");
    expect(diff.appSummary.matches).toBe(false);
    expect(diff.appSummary.changedFields).toContain("id");
  });

  it("lists declared stories from a behavior gateway in text mode", () => {
    const output = runCli("story", "--project-root", launchWorkspaceRoot, "list");

    expect(output).toContain("# Stories");
    expect(output).toContain("overview-ready [launch-workspace] Overview");
    expect(output).toContain("assistant-running [launch-workspace] Assistant running");
    expect(output).toContain("seed=fixtures: launchWorkspaceSeed");
  });

  it("resolves an explicit relative gateway path against the selected project root", () => {
    const output = runCli(
      "story",
      "--project-root",
      launchWorkspaceRoot,
      "--gateway",
      "src/app/behavior.ts",
      "list",
    );

    expect(output).toContain("overview-ready [launch-workspace] Overview");
  });

  it("filters story listings and emits a stable JSON envelope", () => {
    const output = runCli(
      "story",
      "--project-root",
      launchWorkspaceRoot,
      "list",
      "--tag",
      "assistant",
      "--format",
      "json",
    );

    const payload = JSON.parse(output) as {
      readonly kind: string;
      readonly stories: ReadonlyArray<
        Readonly<{
          readonly id: string;
          readonly machineId: string;
          readonly tags: ReadonlyArray<string>;
        }>
      >;
    };

    expect(payload.kind).toBe("story-list");
    expect(payload.stories).toHaveLength(1);
    expect(payload.stories[0]).toMatchObject({
      id: "assistant-running",
      machineId: "launch-workspace",
      tags: ["docs", "assistant"],
    });
  });

  it("describes one story in text mode without running it", () => {
    const output = runCli(
      "story",
      "--project-root",
      launchWorkspaceRoot,
      "describe",
      "overview-ready",
    );

    expect(output).toContain("# Story: overview-ready");
    expect(output).toContain("Machine: launch-workspace");
    expect(output).toContain("Open the seeded workspace in its ready overview state.");
    expect(output).toContain("Start from the machine's initial snapshot.");
    expect(output).toContain("Expect final state 'ready'.");
  });

  it("runs a declared story and emits compact execution facts by default", () => {
    const output = runCli(
      "story",
      "--project-root",
      launchWorkspaceRoot,
      "run",
      "assistant-running",
    );

    expect(output).toContain("# Story Run: assistant-running");
    expect(output).toContain("Machine: launch-workspace");
    expect(output).toContain("Final state: runningAssistant");
    expect(output).toContain("Receipt types:");
    expect(output).toContain("Related ids:");
    expect(output).toContain("Issue kinds:");
  });

  it("adds expectation-check deltas over the same run outcome in json mode", () => {
    const output = runCli(
      "story",
      "--project-root",
      launchWorkspaceRoot,
      "run",
      "assistant-running",
      "--check",
      "--format",
      "json",
    );

    const payload = JSON.parse(output) as {
      readonly kind: string;
      readonly story: Readonly<{
        readonly id: string;
        readonly machineId: string;
      }>;
      readonly outcome: Readonly<{
        readonly kind: string;
        readonly finalState?: string;
        readonly receiptSummary?: Readonly<{
          readonly receiptTypes: ReadonlyArray<string>;
        }>;
      }>;
      readonly check?: Readonly<{
        readonly ok: boolean;
        readonly failures: ReadonlyArray<unknown>;
      }>;
    };

    expect(payload.kind).toBe("story-run");
    expect(payload.story).toMatchObject({
      id: "assistant-running",
      machineId: "launch-workspace",
    });
    expect(payload.outcome).toMatchObject({
      kind: "story-run",
      finalState: "runningAssistant",
    });
    expect(payload.outcome.receiptSummary?.receiptTypes.length).toBeGreaterThan(0);
    expect(payload.check).toBeDefined();
    expect(payload.check?.ok).toBe(true);
    expect(payload.check?.failures).toEqual([]);
  });

  it("lists shortest legal paths for a machine from repeated event candidates", () => {
    const output = runCli(
      "story",
      "--project-root",
      launchWorkspaceRoot,
      "paths",
      "--machine",
      "launch-workspace",
      "--strategy",
      "shortest",
      "--event",
      '{"type":"RUN_ASSISTANT"}',
      "--to-state",
      "runningAssistant",
    );

    expect(output).toContain("# Story Paths: launch-workspace");
    expect(output).toContain("Strategy: shortest");
    expect(output).toContain("Path count: 1");
    expect(output).toContain('Reaches state "runningAssistant": RUN_ASSISTANT');
  });

  it("checks an exact event sequence from an overridden start state in json mode", () => {
    const output = runCli(
      "story",
      "--project-root",
      launchWorkspaceRoot,
      "paths",
      "--machine",
      "launch-workspace",
      "--check",
      "--from-state",
      "runningAssistant",
      "--event",
      '{"type":"ASSISTANT_DONE"}',
      "--to-state",
      "ready",
      "--format",
      "json",
    );

    const payload = JSON.parse(output) as {
      readonly kind: string;
      readonly machineId: string;
      readonly ok: boolean;
      readonly path?: Readonly<{
        readonly finalState: string;
        readonly events: ReadonlyArray<Readonly<{ readonly type: string }>>;
      }>;
    };

    expect(payload.kind).toBe("story-path-check");
    expect(payload.machineId).toBe("launch-workspace");
    expect(payload.ok).toBe(true);
    expect(payload.path).toMatchObject({
      finalState: "ready",
      events: [{ type: "ASSISTANT_DONE" }],
    });
  });

  it("fails closed when exact-sequence checking is requested without any events", () => {
    const output = runCliFailure(
      "story",
      "--project-root",
      launchWorkspaceRoot,
      "paths",
      "--machine",
      "launch-workspace",
      "--check",
    );

    expect(output).toContain("`story paths --check` requires at least one `--event <json>` input.");
  });

  it("saves a trace artifact from story run and summarizes it through the trace CLI", () => {
    const tracePath = tempPath("assistant-running.trace.json");

    const runOutput = runCli(
      "story",
      "--project-root",
      launchWorkspaceRoot,
      "run",
      "assistant-running",
      "--save-trace",
      tracePath,
    );

    expect(runOutput).toContain("# Story Run: assistant-running");

    const saved = JSON.parse(execFileSync("cat", [tracePath], { encoding: "utf8" })) as {
      readonly kind: string;
      readonly version: string;
    };

    expect(saved).toMatchObject({
      kind: "trace-artifact",
      version: "flow-state/trace-artifact.v1",
    });

    const summaryOutput = runCli("trace", "summarize", tracePath);

    expect(summaryOutput).toContain("# Trace Summary");
    expect(summaryOutput).toContain("Machine: launch-workspace");
    expect(summaryOutput).toContain("Receipt count:");
    expect(summaryOutput).toContain("Correlation count:");
  });

  it("normalizes local proof JSON for trace summarize in json mode", () => {
    const proofJson = execFileSync(process.execPath, [inspectLocalProofScript.pathname], {
      encoding: "utf8",
    });
    const proofPath = tempPath("local-proof.json");
    fs.writeFileSync(proofPath, proofJson);

    const output = runCli("trace", "summarize", proofPath, "--format", "json");

    const payload = JSON.parse(output) as {
      readonly kind: string;
      readonly machineId: string;
      readonly source: string;
      readonly summary: Readonly<{
        readonly receiptCount: number;
      }>;
    };

    expect(payload.kind).toBe("trace-summary");
    expect(payload.machineId).toBe("inspect.local-proof.machine");
    expect(payload.source).toBe("local-inspection-proof");
    expect(payload.summary.receiptCount).toBeGreaterThan(0);
  });

  it("contextualizes a saved trace through the shared gateway loader in text mode", () => {
    const tracePath = saveStoryTrace("assistant-running", "assistant-context.trace.json");

    const output = runCli(
      "trace",
      "summarize",
      tracePath,
      "--contextualize",
      "--project-root",
      launchWorkspaceRoot,
    );

    expect(output).toContain("# Trace Summary");
    expect(output).toContain("Contextualized: yes");
    expect(output).toContain("Graph: launch-workspace");
    expect(output).toContain("initial=ready");
    expect(output).toContain("Resource freshness report");
    expect(output).toContain("Transaction overlap summary");
    expect(output).toContain("Rehydration summary");
  });

  it("emits a stable contextualized trace summary JSON envelope", () => {
    const tracePath = saveStoryTrace("assistant-running", "assistant-context-json.trace.json");

    const output = runCli(
      "trace",
      "summarize",
      tracePath,
      "--contextualize",
      "--project-root",
      launchWorkspaceRoot,
      "--format",
      "json",
    );

    const payload = JSON.parse(output) as {
      readonly kind: string;
      readonly source: string;
      readonly machineId: string;
      readonly graph: Readonly<{
        readonly kind: string;
        readonly machineId: string;
        readonly initial: string;
        readonly nodes: ReadonlyArray<unknown>;
        readonly edges: ReadonlyArray<unknown>;
      }>;
      readonly semanticSummaries: Readonly<{
        readonly resourceFreshness: string;
        readonly transactionOverlap: string;
        readonly rehydration: string;
      }>;
    };

    expect(payload.kind).toBe("trace-summary-contextualized");
    expect(payload.source).toBe("story-run-trace");
    expect(payload.machineId).toBe("launch-workspace");
    expect(payload.graph).toMatchObject({
      kind: "graph",
      machineId: "launch-workspace",
      initial: "ready",
    });
    expect(payload.graph.nodes.length).toBeGreaterThan(0);
    expect(payload.graph.edges.length).toBeGreaterThan(0);
    expect(payload.semanticSummaries.resourceFreshness).toContain("Resource freshness report");
    expect(payload.semanticSummaries.transactionOverlap).toContain("Transaction overlap summary");
    expect(payload.semanticSummaries.rehydration).toContain("Rehydration summary");
  });

  it("fails closed when contextualized summary cannot resolve a machine from the gateway", () => {
    const proofJson = execFileSync(process.execPath, [inspectLocalProofScript.pathname], {
      encoding: "utf8",
    });
    const proofPath = tempPath("contextualize-local-proof.json");
    fs.writeFileSync(proofPath, proofJson);

    const output = runCliFailure(
      "trace",
      "summarize",
      proofPath,
      "--contextualize",
      "--project-root",
      launchWorkspaceRoot,
    );

    expect(output).toContain("Unknown machine 'inspect.local-proof.machine'.");
    expect(output).toContain("Available machine ids:");
  });

  it("fails closed when trace summarize receives codebase context flags without --contextualize", () => {
    const tracePath = saveStoryTrace("assistant-running", "assistant-no-context.trace.json");

    const output = runCliFailure(
      "trace",
      "summarize",
      tracePath,
      "--project-root",
      launchWorkspaceRoot,
    );

    expect(output).toContain(
      "`trace summarize` only accepts --project-root, --gateway, and --machine together with --contextualize.",
    );
  });

  it("renders an actor-focused proof slice from a saved trace artifact", () => {
    const tracePath = saveStoryTrace("assistant-running", "assistant-proof-actor.trace.json");

    const output = runCli("trace", "proof", tracePath, "--actor", "Assistant.task");

    expect(output).toContain("# Trace Proof: actor");
    expect(output).toContain("Selector: Assistant.task");
    expect(output).toContain("- Assistant.task");
  });

  it("emits a stable correlation-focused proof JSON envelope from a local proof bundle", () => {
    const proofJson = execFileSync(process.execPath, [inspectLocalProofScript.pathname], {
      encoding: "utf8",
    });
    const proofPath = tempPath("proof-correlation.json");
    fs.writeFileSync(proofPath, proofJson);
    const proof = JSON.parse(proofJson) as {
      readonly correlations: ReadonlyArray<Readonly<{ readonly correlationId: string }>>;
    };

    const output = runCli(
      "trace",
      "proof",
      proofPath,
      "--correlation",
      proof.correlations[0]!.correlationId,
      "--format",
      "json",
    );

    const payload = JSON.parse(output) as {
      readonly kind: string;
      readonly source: string;
      readonly selector: Readonly<{
        readonly kind: string;
        readonly correlationId?: string;
      }>;
      readonly correlation: Readonly<{
        readonly correlationId: string;
        readonly receipts: ReadonlyArray<unknown>;
      }>;
    };

    expect(payload.kind).toBe("trace-proof");
    expect(payload.source).toBe("local-inspection-proof");
    expect(payload.selector).toMatchObject({
      kind: "correlation",
      correlationId: proof.correlations[0]!.correlationId,
    });
    expect(payload.correlation.correlationId).toBe(proof.correlations[0]!.correlationId);
    expect(payload.correlation.receipts.length).toBeGreaterThan(0);
  });

  it("renders a correlation-focused proof slice in text mode without an undefined headline", () => {
    const proofJson = execFileSync(process.execPath, [inspectLocalProofScript.pathname], {
      encoding: "utf8",
    });
    const proofPath = tempPath("proof-correlation-text.json");
    fs.writeFileSync(proofPath, proofJson);
    const proof = JSON.parse(proofJson) as {
      readonly correlations: ReadonlyArray<Readonly<{ readonly correlationId: string }>>;
    };

    const output = runCli(
      "trace",
      "proof",
      proofPath,
      "--correlation",
      proof.correlations[0]!.correlationId,
    );

    expect(output).toContain("# Trace Proof: correlation");
    expect(output).toContain("Headline: START: idle -> running; 4 receipt(s)");
    expect(output).not.toContain("Headline: undefined");
  });

  it("renders the local proof inspection timeline through the timeline selector", () => {
    const proofJson = execFileSync(process.execPath, [inspectLocalProofScript.pathname], {
      encoding: "utf8",
    });
    const proofPath = tempPath("proof-timeline.json");
    fs.writeFileSync(proofPath, proofJson);

    const output = runCli("trace", "proof", proofPath, "--timeline");

    expect(output).toContain("# Trace Proof: timeline");
    expect(output).toContain("actor:snapshot");
  });

  it("emits issue-focused proof JSON even when no issues were recorded", () => {
    const tracePath = saveStoryTrace("assistant-running", "assistant-proof-issues.trace.json");

    const output = runCli("trace", "proof", tracePath, "--issues", "--format", "json");

    const payload = JSON.parse(output) as {
      readonly kind: string;
      readonly selector: Readonly<{ readonly kind: string }>;
      readonly issues: ReadonlyArray<unknown>;
    };

    expect(payload.kind).toBe("trace-proof");
    expect(payload.selector.kind).toBe("issues");
    expect(payload.issues).toEqual([]);
  });

  it("fails closed when trace proof receives zero or multiple selectors", () => {
    const tracePath = saveStoryTrace("assistant-running", "assistant-proof-invalid.trace.json");

    const noSelector = runCliFailure("trace", "proof", tracePath);
    expect(noSelector).toContain(
      "`trace proof` requires exactly one selector: --actor, --correlation, --issues, or --timeline.",
    );

    const multipleSelectors = runCliFailure("trace", "proof", tracePath, "--issues", "--timeline");
    expect(multipleSelectors).toContain(
      "`trace proof` requires exactly one selector: --actor, --correlation, --issues, or --timeline.",
    );
  });

  it("diffs two saved traces in text mode and reports changed sections", () => {
    const leftPath = saveStoryTrace("overview-ready", "overview-ready.trace.json");
    const rightPath = saveStoryTrace("assistant-running", "assistant-running.trace.json");

    const output = runCli("trace", "diff", leftPath, rightPath);

    expect(output).toContain("# Trace Diff");
    expect(output).toContain("Left: launch-workspace (story-run-trace)");
    expect(output).toContain("Right: launch-workspace (story-run-trace)");
    expect(output).toContain("Changed sections:");
    expect(output).toContain("event-sequence");
  });

  it("emits a stable trace diff JSON envelope", () => {
    const leftPath = saveStoryTrace("overview-ready", "overview-json-left.trace.json");
    const rightPath = saveStoryTrace("assistant-running", "assistant-json-right.trace.json");

    const output = runCli("trace", "diff", leftPath, rightPath, "--format", "json");

    const payload = JSON.parse(output) as {
      readonly kind: string;
      readonly left: Readonly<{
        readonly source: string;
        readonly machineId: string;
      }>;
      readonly right: Readonly<{
        readonly source: string;
        readonly machineId: string;
      }>;
      readonly summary: Readonly<{
        readonly matches: boolean;
        readonly changedSections: ReadonlyArray<string>;
      }>;
      readonly sections: Readonly<Record<string, Readonly<{ readonly matches: boolean }>>>;
    };

    expect(payload.kind).toBe("trace-diff");
    expect(payload.left).toMatchObject({
      source: "story-run-trace",
      machineId: "launch-workspace",
    });
    expect(payload.right).toMatchObject({
      source: "story-run-trace",
      machineId: "launch-workspace",
    });
    expect(payload.summary.matches).toBe(false);
    expect(payload.summary.changedSections).toContain("event-sequence");
    expect(payload.sections["event-sequence"]?.matches).toBe(false);
  });

  it("filters trace diff output to one named section", () => {
    const leftPath = saveStoryTrace("overview-ready", "overview-section-left.trace.json");
    const rightPath = saveStoryTrace("assistant-running", "assistant-section-right.trace.json");

    const output = runCli("trace", "diff", leftPath, rightPath, "--section", "event-sequence");

    expect(output).toContain("# Trace Diff Section: event-sequence");
    expect(output).toContain("First difference index:");
    expect(output).toContain("Left count:");
    expect(output).toContain("Right count:");
  });

  it("fails with a helpful message when trace summarize receives an unsupported json shape", () => {
    const invalidPath = tempPath("not-a-trace.json");
    fs.writeFileSync(invalidPath, `${JSON.stringify({ kind: "not-a-trace" }, null, 2)}\n`);

    const output = runCliFailure("trace", "summarize", invalidPath);

    expect(output).toContain(
      "Expected a trace artifact, local inspection proof, or story-run trace JSON",
    );
  });

  it("fails with a helpful message when a story id is missing", () => {
    const output = runCliFailure(
      "story",
      "--project-root",
      launchWorkspaceRoot,
      "describe",
      "missing-story",
    );

    expect(output).toContain("Unknown story 'missing-story'.");
    expect(output).toContain("Available story ids: assistant-running, overview-ready.");
  });
});
