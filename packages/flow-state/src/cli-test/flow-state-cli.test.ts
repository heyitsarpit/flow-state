import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import type {
  FlowCliStoryPathCheckEnvelope,
  FlowCliStoryPathListEnvelope,
} from "../cli/story-paths.js";
import type { FlowCliStoryDescribeEnvelope, FlowCliStoryListEnvelope } from "../cli/story-read.js";
import type { FlowCliScenarioEnvelope } from "../cli/story-run.js";
import type { FlowCliBehaviorCoverageEnvelope, FlowCliTraceProofEnvelope } from "../cli/shared.js";
import type { FlowCliTraceDiffEnvelope } from "../cli/trace-diff.js";
import type { FlowBehaviorContract } from "../inspect.js";

const basicCachedPostsRoot = new URL("../../../../examples/basic-cached-posts", import.meta.url)
  .pathname;
const scriptPath = new URL("../../dist/cli/index.mjs", import.meta.url);
const inspectLocalProofScript = new URL("../../scripts/inspect-local-proof.mjs", import.meta.url);

function tempPath(name: string): string {
  return join(mkdtempSync(join(tmpdir(), "flow-state-cli-")), name);
}

function writeJsonFile(name: string, contents: unknown): string {
  const path = tempPath(name);
  writeFileSync(path, `${JSON.stringify(contents, null, 2)}\n`);
  return path;
}

function saveStoryTrace(storyId: string, name: string): string {
  const path = tempPath(name);
  runCli("story", "--project-root", basicCachedPostsRoot, "run", storyId, "--save-trace", path);
  return path;
}

function runCli(...args: ReadonlyArray<string>): string {
  return execFileSync(process.execPath, [scriptPath.pathname, ...args], {
    encoding: "utf8",
  });
}

function runCliInDirectory(directory: string, ...args: ReadonlyArray<string>): string {
  const command = [
    JSON.stringify(process.execPath),
    JSON.stringify(scriptPath.pathname),
    ...args.map((arg) => JSON.stringify(arg)),
  ].join(" ");

  return execFileSync("zsh", ["-lc", `cd ${JSON.stringify(directory)} && ${command}`], {
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

function runCliFailureResult(...args: ReadonlyArray<string>): Readonly<{
  stdout: string;
  stderr: string;
  status: number | undefined;
}> {
  try {
    runCli(...args);
    throw new Error("Expected CLI to fail.");
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    return {
      stdout: "stdout" in error && typeof error.stdout === "string" ? error.stdout : "",
      stderr: "stderr" in error && typeof error.stderr === "string" ? error.stderr : "",
      status: "status" in error && typeof error.status === "number" ? error.status : undefined,
    };
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

  it("advertises the stuck-run pending-work selector on story run help", () => {
    const output = runCli("story", "run", "--help");

    expect(output).toContain("--pending-work");
    expect(output).toContain("pending-work diagnostics");
  });

  it("builds a behavior contract and renders the same contract in json mode", () => {
    const outputPath = tempPath("behavior-contract.json");

    const buildOutput = runCli(
      "behavior",
      "build",
      "--project-root",
      basicCachedPostsRoot,
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

  it("uses the working-directory behavior-contract.json path as the default package CLI contract location", () => {
    const workingDirectory = mkdtempSync(join(tmpdir(), "flow-state-cli-cwd-"));

    const buildOutput = runCliInDirectory(
      workingDirectory,
      "behavior",
      "build",
      "--project-root",
      basicCachedPostsRoot,
    );

    expect(buildOutput).toContain("Wrote behavior contract to ");
    expect(buildOutput).toContain("behavior-contract.json.");

    const renderOutput = runCliInDirectory(
      workingDirectory,
      "behavior",
      "render",
      "--format",
      "json",
    );

    const rendered = JSON.parse(renderOutput) as FlowBehaviorContract;

    expect(rendered.version).toBe("flow-state/behavior-contract.v1");
    expect(rendered.app.id).toContain("app:5:Posts");
  });

  it("renders live behavior coverage through the main flow-state CLI", () => {
    const output = runCli(
      "behavior",
      "render",
      "--section",
      "coverage",
      "--project-root",
      basicCachedPostsRoot,
      "--gateway",
      "src/app/behavior.ts",
    );

    expect(output).toContain("behavior.coverage");
    expect(output).toContain("curated story coverage, not execution proof");
    expect(output).toContain("posts.screen: states=list");
  });

  it("renders live behavior coverage through the main flow-state CLI in json mode", () => {
    const output = runCli(
      "behavior",
      "render",
      "--section",
      "coverage",
      "--project-root",
      basicCachedPostsRoot,
      "--format",
      "json",
    );

    const payload = JSON.parse(output) as FlowCliBehaviorCoverageEnvelope;

    expect(payload.kind).toBe("behavior-coverage");
    expect(payload.source).toBe("live-gateway");
    expect(payload.appId).toContain("app:5:Posts");
    expect(payload.storyCount).toBeGreaterThan(0);
    expect(payload.coverage).toContain("curated story coverage");
  });

  it("renders the default behavior brief JSON shape as the raw behavior contract", () => {
    const outputPath = tempPath("behavior-brief-contract.json");
    runCli("behavior", "build", "--project-root", basicCachedPostsRoot, "--output", outputPath);

    const output = runCli("behavior", "render", "--input", outputPath, "--format", "json");
    const payload = JSON.parse(output) as FlowBehaviorContract &
      Readonly<{ readonly kind?: string }>;

    expect(payload.kind).toBeUndefined();
    expect(payload.version).toBe("flow-state/behavior-contract.v1");
    expect(payload.modules.length).toBeGreaterThan(0);
    expect(payload.machines.length).toBeGreaterThan(0);
    expect(payload.stories.map((story) => story.id)).toEqual(["list", "detail"]);
  });

  it("diffs two behavior contract files in json mode through the main flow-state CLI", () => {
    const leftPath = tempPath("behavior-left.json");
    runCli("behavior", "build", "--project-root", basicCachedPostsRoot, "--output", leftPath);
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
      readonly app: Readonly<{ readonly left: string; readonly right: string }>;
    };

    expect(diff.kind).toBe("behavior-diff");
    expect(diff.summary.matches).toBe(false);
    expect(diff.summary.changedSections).toContain("app-summary");
    expect(diff.app.left).not.toBe(diff.app.right);
  });

  it("lists declared stories from a behavior gateway in text mode", () => {
    const output = runCli("story", "--project-root", basicCachedPostsRoot, "list");

    expect(output).toContain("story.list — 2 stories");
    expect(output).toContain("list  machine=posts.screen  target=list");
    expect(output).toContain("detail  machine=posts.screen  target=detail-1");
    expect(output).not.toContain("seed=");
  });

  it("resolves an explicit relative gateway path against the selected project root", () => {
    const output = runCli(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "--gateway",
      "src/app/behavior.ts",
      "list",
    );

    expect(output).toContain("list  machine=posts.screen");
  });

  it("filters story listings and emits a stable JSON envelope", () => {
    const output = runCli(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "list",
      "--tag",
      "detail",
      "--format",
      "json",
    );

    const payload = JSON.parse(output) as FlowCliStoryListEnvelope;

    expect(payload.kind).toBe("story-list");
    expect(payload.stories).toHaveLength(1);
    expect(payload.stories[0]).toMatchObject({
      id: "detail",
      machineId: "posts.screen",
      tags: ["docs", "detail"],
    });
  });

  it("emits a stable story describe JSON descriptor envelope", () => {
    const output = runCli(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "describe",
      "list",
      "--format",
      "json",
    );

    const payload = JSON.parse(output) as FlowCliStoryDescribeEnvelope;

    expect(payload.kind).toBe("story-describe");
    expect(payload.machineId).toBe("posts.screen");
    expect(payload.story).toMatchObject({
      kind: "story-doc",
      headline: "Post list",
      tags: ["docs", "overview"],
      start: {
        kind: "default",
      },
    });
    expect(payload.story.story).toMatchObject({
      id: "list",
      expectedState: "list",
    });
    expect(payload.story.expectations).toEqual([
      expect.objectContaining({
        kind: "state",
        state: "list",
      }),
    ]);
    expect(payload).not.toHaveProperty("outcome");
    expect(payload).not.toHaveProperty("check");
    expect(payload).not.toHaveProperty("summary");
  });

  it("describes one story in text mode without running it", () => {
    const output = runCli("story", "--project-root", basicCachedPostsRoot, "describe", "list");

    expect(output).toContain("story.describe list");
    expect(output).toContain("machine: posts.screen");
    expect(output).toContain("Browse the seeded post list.");
    expect(output).toContain("start: default");
    expect(output).toContain("Expect final state 'list'.");
  });

  it("runs a declared story and emits compact execution facts by default", () => {
    const output = runCli("story", "--project-root", basicCachedPostsRoot, "run", "detail");

    expect(output).toContain("story.run detail — PASS");
    expect(output).toContain("machine: posts.screen");
    expect(output).toContain("state: detail-1");
    expect(output).toContain("evidence: 10 receipts, 1 correlations, 0 issues");
    expect(output).toContain("related: posts.list, posts.detail");
  });

  it("renders pending-work diagnostics for human debugging when requested", () => {
    const output = runCli(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "run",
      "detail",
      "--pending-work",
    );

    expect(output).toContain("story.run detail — PASS");
    expect(output).toContain("pending: none");
  });

  it("adds expectation-check deltas over the same run outcome in json mode", () => {
    const output = runCli(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "run",
      "detail",
      "--check",
      "--format",
      "json",
    );

    const payload = JSON.parse(output) as FlowCliScenarioEnvelope;

    expect(payload.kind).toBe("story-run");
    expect(payload.story).toMatchObject({
      id: "detail",
      machineId: "posts.screen",
    });
    expect(payload.evidence).toMatchObject({
      kind: "scenario-evidence",
      status: "success",
      ok: true,
      outcome: {
        kind: "story-run",
        finalState: "detail-1",
      },
    });
    expect(
      payload.evidence.outcome.kind === "story-run"
        ? payload.evidence.outcome.receiptSummary.receiptTypes.length
        : 0,
    ).toBeGreaterThan(0);
    expect(payload.evidence.check).toBeDefined();
    expect(payload.evidence.check?.ok).toBe(true);
    expect(payload.evidence.check?.checkCount).toBeGreaterThan(0);
    expect(payload.evidence.check?.failureCount).toBe(0);
    expect(payload.evidence.check?.failures).toEqual([]);
    expect(payload).not.toHaveProperty("traceArtifact");
    expect(payload).not.toHaveProperty("graph");
    expect(payload).not.toHaveProperty("selector");
  });

  it("emits the shared evidence object before exiting nonzero for a failed proof", () => {
    const gatewayPath = tempPath("failing-proof-gateway.ts");
    const behaviorPath = new URL(
      "../../../../examples/basic-cached-posts/src/app/behavior.ts",
      import.meta.url,
    ).pathname;
    writeFileSync(
      gatewayPath,
      [
        `import { BehaviorGateway as BaseGateway, postsStories } from ${JSON.stringify(behaviorPath)};`,
        "const stories = postsStories.stories.map((story) =>",
        '  story.id === "list" ? { ...story, expectedState: "detail-1" } : story,',
        ");",
        "export const BehaviorGateway = {",
        "  app: BaseGateway.app,",
        "  stories: [{ ...postsStories, stories }],",
        "};",
      ].join("\n"),
    );

    const result = runCliFailureResult(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "--gateway",
      gatewayPath,
      "run",
      "list",
      "--check",
      "--format",
      "json",
    );
    const payload = JSON.parse(result.stdout) as FlowCliScenarioEnvelope;

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(payload.evidence).toMatchObject({
      kind: "scenario-evidence",
      status: "success",
      ok: false,
      check: { ok: false, failureCount: 1 },
    });
  });

  it("adds machine-readable pending-work diagnostics to the story-run JSON envelope", () => {
    const output = runCli(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "run",
      "detail",
      "--pending-work",
      "--format",
      "json",
    );

    const payload = JSON.parse(output) as FlowCliScenarioEnvelope;

    expect(payload.pendingWork).toMatchObject({
      ready: 0,
      activeFibers: 0,
      children: [],
    });
    expect(payload).not.toHaveProperty("traceArtifact");
    expect(payload).not.toHaveProperty("graph");
    expect(payload).not.toHaveProperty("selector");
  });

  it("emits a stable story path list JSON envelope", () => {
    const output = runCli(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "paths",
      "--machine",
      "posts.screen",
      "--strategy",
      "shortest",
      "--event",
      '{"type":"OPEN_POST","postId":1}',
      "--to-state",
      "detail-1",
      "--format",
      "json",
    );

    const payload = JSON.parse(output) as FlowCliStoryPathListEnvelope;

    expect(payload.kind).toBe("story-path-list");
    expect(payload.machineId).toBe("posts.screen");
    expect(payload.strategy).toBe("shortest");
    expect(payload.pathCount).toBe(1);
    expect(payload.toState).toBe("detail-1");
    expect(payload.events).toEqual([{ type: "OPEN_POST", postId: 1 }]);
    expect(payload.paths).toEqual([
      expect.objectContaining({
        finalState: "detail-1",
        stepCount: 1,
        weight: 1,
        events: [{ type: "OPEN_POST", postId: 1 }],
      }),
    ]);
    expect(payload).not.toHaveProperty("outcome");
    expect(payload).not.toHaveProperty("check");
    expect(payload).not.toHaveProperty("summary");
  });

  it("lists shortest legal paths for a machine from repeated event candidates", () => {
    const output = runCli(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "paths",
      "--machine",
      "posts.screen",
      "--strategy",
      "shortest",
      "--event",
      '{"type":"OPEN_POST","postId":1}',
      "--to-state",
      "detail-1",
    );

    expect(output).toContain("story.paths posts.screen — 1 path");
    expect(output).toContain("strategy: shortest");
    expect(output).toContain("detail-1  OPEN_POST");
  });

  it("checks an exact event sequence from an overridden start state in json mode", () => {
    const output = runCli(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "paths",
      "--machine",
      "posts.screen",
      "--check",
      "--from-state",
      "detail-1",
      "--event",
      '{"type":"BACK"}',
      "--to-state",
      "list",
      "--format",
      "json",
    );

    const payload = JSON.parse(output) as FlowCliStoryPathCheckEnvelope;

    expect(payload.kind).toBe("story-path-check");
    expect(payload.machineId).toBe("posts.screen");
    expect(payload.ok).toBe(true);
    expect(payload.path).toMatchObject({
      finalState: "list",
      events: [{ type: "BACK" }],
    });
    expect(payload).not.toHaveProperty("outcome");
    expect(payload).not.toHaveProperty("check");
    expect(payload).not.toHaveProperty("summary");
  });

  it("fails closed when exact-sequence checking is requested without any events", () => {
    const output = runCliFailure(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "paths",
      "--machine",
      "posts.screen",
      "--check",
    );

    expect(output).toContain("`story paths --check` requires at least one `--event <json>` input.");
  });

  it("walks the full public workflow from declared facts to runtime evidence", () => {
    const coverageOutput = runCli(
      "behavior",
      "render",
      "--section",
      "coverage",
      "--project-root",
      basicCachedPostsRoot,
    );

    expect(coverageOutput).toContain("behavior.coverage");
    expect(coverageOutput).toContain("posts.screen: states=list");

    const pathsOutput = runCli(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "paths",
      "--machine",
      "posts.screen",
      "--event",
      '{"type":"OPEN_POST","postId":1}',
      "--to-state",
      "detail-1",
    );

    expect(pathsOutput).toContain("story.paths posts.screen");
    expect(pathsOutput).toContain("detail-1  OPEN_POST");

    const tracePath = tempPath("detail-end-to-end.trace.json");
    const runOutput = runCli(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "run",
      "detail",
      "--save-trace",
      tracePath,
    );

    expect(runOutput).toContain("story.run detail — PASS");
    expect(runOutput).toContain("state: detail-1");
    expect(runOutput).toContain(`trace: ${tracePath}`);

    const summaryOutput = runCli("trace", "summarize", tracePath);

    expect(summaryOutput).toContain("trace.summary posts.screen — detail-1");
    expect(summaryOutput).toContain("evidence: 10 receipts, 1 correlations, 0 issues");
  });

  it("saves a trace artifact from story run and summarizes it through the trace CLI", () => {
    const tracePath = tempPath("detail.trace.json");

    const runOutput = runCli(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "run",
      "detail",
      "--save-trace",
      tracePath,
    );

    expect(runOutput).toContain("story.run detail — PASS");

    const saved = JSON.parse(execFileSync("cat", [tracePath], { encoding: "utf8" })) as {
      readonly kind: string;
      readonly version: string;
    };

    expect(saved).toMatchObject({
      kind: "trace-artifact",
      version: "flow-state/trace-artifact.v1",
    });

    const summaryOutput = runCli("trace", "summarize", tracePath);

    expect(summaryOutput).toContain("trace.summary posts.screen — detail-1");
    expect(summaryOutput).toContain("evidence: 10 receipts, 1 correlations, 0 issues");
  });

  it("normalizes local proof JSON for trace summarize in json mode", () => {
    const proofJson = execFileSync(process.execPath, [inspectLocalProofScript.pathname], {
      encoding: "utf8",
    });
    const proofPath = tempPath("local-proof.json");
    writeFileSync(proofPath, proofJson);

    const output = runCli("trace", "summarize", proofPath, "--format", "json");

    const payload = JSON.parse(output) as Readonly<{
      kind: string;
      machineId: string;
      source: string;
      summary: Readonly<{ counts: Readonly<{ receipts: number }> }>;
    }>;

    expect(payload.kind).toBe("trace-summary");
    expect(payload.machineId).toBe("inspect.local-proof.machine");
    expect(payload.source).toBe("local-inspection-proof");
    expect(payload.summary.counts.receipts).toBeGreaterThan(0);
  });

  it("emits a stable trace summary JSON envelope for story-run traces", () => {
    const tracePath = saveStoryTrace("detail", "assistant-summary-json.trace.json");

    const output = runCli("trace", "summarize", tracePath, "--format", "json");
    const payload = JSON.parse(output) as Readonly<{
      kind: string;
      source: string;
      machineId: string;
      summary: Readonly<{
        kind: string;
        machineId: string;
        finalState: string;
        counts: Readonly<{ receipts: number; correlations: number; issues: number }>;
        outcomes: Readonly<{ success: number }>;
      }>;
    }>;

    expect(payload.kind).toBe("trace-summary");
    expect(payload.source).toBe("story-run-trace");
    expect(payload.machineId).toBe("posts.screen");
    expect(payload.summary).toMatchObject({
      kind: "trace-summary",
      machineId: "posts.screen",
      finalState: "detail-1",
    });
    expect(payload.summary.counts.receipts).toBeGreaterThan(0);
    expect(payload.summary.outcomes.success).toBe(0);
    expect(payload.summary.counts.correlations).toBeGreaterThan(0);
    expect(payload).not.toHaveProperty("story");
    expect(payload).not.toHaveProperty("check");
    expect(payload).not.toHaveProperty("paths");
  });

  it("contextualizes a saved trace through the shared gateway loader in text mode", () => {
    const tracePath = saveStoryTrace("detail", "assistant-context.trace.json");

    const output = runCli(
      "trace",
      "summarize",
      tracePath,
      "--contextualize",
      "--project-root",
      basicCachedPostsRoot,
    );

    expect(output).toContain("trace.summary posts.screen — detail-1");
    expect(output).toContain("context: graph");
    expect(output).toContain("initial=list");
    expect(output).toContain("Resource freshness report");
    expect(output).toContain("posts.detail final=fresh status=success");
  });

  it("emits a stable contextualized trace summary JSON envelope", () => {
    const tracePath = saveStoryTrace("detail", "assistant-context-json.trace.json");

    const output = runCli(
      "trace",
      "summarize",
      tracePath,
      "--contextualize",
      "--project-root",
      basicCachedPostsRoot,
      "--format",
      "json",
    );

    const payload = JSON.parse(output) as Readonly<{
      kind: string;
      source: string;
      machineId: string;
      graph: Readonly<{
        machineId: string;
        initial: string;
        stateCount: number;
        transitionCount: number;
      }>;
      semantic?: Readonly<{ resourceFreshness?: string }>;
    }>;

    expect(payload.kind).toBe("trace-summary-contextualized");
    expect(payload.source).toBe("story-run-trace");
    expect(payload.machineId).toBe("posts.screen");
    expect(payload.graph).toMatchObject({
      machineId: "posts.screen",
      initial: "list",
    });
    expect(payload.graph.stateCount).toBeGreaterThan(0);
    expect(payload.graph.transitionCount).toBeGreaterThan(0);
    expect(payload.semantic?.resourceFreshness).toContain(
      "posts.detail final=fresh status=success",
    );
    expect(payload).not.toHaveProperty("story");
    expect(payload).not.toHaveProperty("check");
  });

  it("fails closed when contextualized summary cannot resolve a machine from the gateway", () => {
    const proofJson = execFileSync(process.execPath, [inspectLocalProofScript.pathname], {
      encoding: "utf8",
    });
    const proofPath = tempPath("contextualize-local-proof.json");
    writeFileSync(proofPath, proofJson);

    const output = runCliFailure(
      "trace",
      "summarize",
      proofPath,
      "--contextualize",
      "--project-root",
      basicCachedPostsRoot,
    );

    expect(output).toContain("Unknown machine 'inspect.local-proof.machine'.");
    expect(output).toContain("Available machine ids:");
  });

  it("fails closed when trace summarize receives codebase context flags without --contextualize", () => {
    const tracePath = saveStoryTrace("detail", "assistant-no-context.trace.json");

    const output = runCliFailure(
      "trace",
      "summarize",
      tracePath,
      "--project-root",
      basicCachedPostsRoot,
    );

    expect(output).toContain(
      "`trace summarize` only accepts --project-root, --gateway, and --machine together with --contextualize.",
    );
  });

  it("renders an actor-focused proof slice from a saved trace artifact", () => {
    const tracePath = saveStoryTrace("detail", "assistant-proof-actor.trace.json");

    const output = runCli("trace", "proof", tracePath, "--actor", "posts.screen");

    expect(output).toContain("trace.proof actor");
    expect(output).toContain("actor: posts.screen");
    expect(output).toContain("- posts.screen state=detail-1");
  });

  it("reports an unknown proof actor through the typed CLI failure channel", () => {
    const tracePath = saveStoryTrace("detail", "assistant-proof-actor-error.trace.json");

    const output = runCliFailure("trace", "proof", tracePath, "--actor", "missing.actor");

    expect(output).toContain("error [invalid-input]: Unknown actor 'missing.actor'.");
    expect(output).toContain("Available actor selectors:");
    expect(output).not.toContain("FiberFailure");
  });

  it("emits a stable correlation-focused proof JSON envelope from a local proof bundle", () => {
    const proofJson = execFileSync(process.execPath, [inspectLocalProofScript.pathname], {
      encoding: "utf8",
    });
    const proofPath = tempPath("proof-correlation.json");
    writeFileSync(proofPath, proofJson);
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

    const payload = JSON.parse(output) as FlowCliTraceProofEnvelope;

    expect(payload.kind).toBe("trace-proof");
    expect(payload.source).toBe("local-inspection-proof");
    expect(payload.selector).toMatchObject({
      kind: "correlation",
      correlationId: proof.correlations[0]!.correlationId,
    });
    expect("correlation" in payload ? payload.correlation.correlationId : undefined).toBe(
      proof.correlations[0]!.correlationId,
    );
    expect("correlation" in payload ? payload.correlation.counts.receipts : 0).toBeGreaterThan(0);
    expect(payload).not.toHaveProperty("story");
    expect(payload).not.toHaveProperty("check");
    expect(payload).not.toHaveProperty("summary");
  });

  it("renders a correlation-focused proof slice in text mode without an undefined headline", () => {
    const proofJson = execFileSync(process.execPath, [inspectLocalProofScript.pathname], {
      encoding: "utf8",
    });
    const proofPath = tempPath("proof-correlation-text.json");
    writeFileSync(proofPath, proofJson);
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

    expect(output).toContain("trace.proof correlation");
    expect(output).toContain("START: idle -> running");
    expect(output).toContain("evidence: 4 receipts, 0 outcomes, 0 issues");
  });

  it("renders the local proof inspection timeline through the timeline selector", () => {
    const proofJson = execFileSync(process.execPath, [inspectLocalProofScript.pathname], {
      encoding: "utf8",
    });
    const proofPath = tempPath("proof-timeline.json");
    writeFileSync(proofPath, proofJson);

    const output = runCli("trace", "proof", proofPath, "--timeline");

    expect(output).toContain("trace.proof timeline");
    expect(output).toContain("actor:snapshot");
  });

  it("emits issue-focused proof JSON even when no issues were recorded", () => {
    const tracePath = saveStoryTrace("detail", "assistant-proof-issues.trace.json");

    const output = runCli("trace", "proof", tracePath, "--issues", "--format", "json");

    const payload = JSON.parse(output) as FlowCliTraceProofEnvelope;

    expect(payload.kind).toBe("trace-proof");
    expect(payload.selector.kind).toBe("issues");
    expect("issues" in payload ? payload.issues : undefined).toEqual([]);
  });

  it("fails closed when trace proof receives zero or multiple selectors", () => {
    const tracePath = saveStoryTrace("detail", "assistant-proof-invalid.trace.json");

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
    const leftPath = saveStoryTrace("list", "list.trace.json");
    const rightPath = saveStoryTrace("detail", "detail.trace.json");

    const output = runCli("trace", "diff", leftPath, rightPath);

    expect(output).toContain("trace.diff — CHANGED");
    expect(output).toContain("machine: posts.screen");
    expect(output).toContain("sections:");
    expect(output).toContain("event-sequence");
  });

  it("emits a stable trace diff JSON envelope", () => {
    const leftPath = saveStoryTrace("list", "overview-json-left.trace.json");
    const rightPath = saveStoryTrace("detail", "assistant-json-right.trace.json");

    const output = runCli("trace", "diff", leftPath, rightPath, "--format", "json");

    const payload = JSON.parse(output) as FlowCliTraceDiffEnvelope;

    expect(payload.kind).toBe("trace-diff");
    expect(payload.left).toMatchObject({
      source: "story-run-trace",
      machineId: "posts.screen",
    });
    expect(payload.right).toMatchObject({
      source: "story-run-trace",
      machineId: "posts.screen",
    });
    expect(payload.summary.matches).toBe(false);
    expect(payload.summary.changedSections).toContain("event-sequence");
    expect(payload).not.toHaveProperty("sections");
  });

  it("filters trace diff output to one named section", () => {
    const leftPath = saveStoryTrace("list", "overview-section-left.trace.json");
    const rightPath = saveStoryTrace("detail", "assistant-section-right.trace.json");

    const output = runCli("trace", "diff", leftPath, rightPath, "--section", "event-sequence");

    expect(output).toContain("trace.diff event-sequence — CHANGED at 0");
    expect(output).toContain("count: 0 -> 1");
  });

  it("fails with a helpful message when trace summarize receives an unsupported json shape", () => {
    const invalidPath = tempPath("not-a-trace.json");
    writeFileSync(invalidPath, `${JSON.stringify({ kind: "not-a-trace" }, null, 2)}\n`);

    const output = runCliFailure("trace", "summarize", invalidPath);

    expect(output).toContain(
      "Expected a trace artifact, local inspection proof, or story-run trace JSON",
    );
    expect(output).toContain(
      "Next step: generate a trace file with `flow-state story --project-root <path> run <story-id> --save-trace <trace-path>`",
    );
  });

  it("fails with a helpful message when a story id is missing", () => {
    const output = runCliFailure(
      "story",
      "--project-root",
      basicCachedPostsRoot,
      "describe",
      "missing-story",
    );

    expect(output).toContain("Unknown story 'missing-story'.");
    expect(output).toContain("error [invalid-input]:");
    expect(output).toContain("Available story ids: detail, list.");
    expect(output).toContain(
      `Next step: run \`flow-state story --project-root ${basicCachedPostsRoot} list\` to inspect the declared story ids.`,
    );
  });

  it("fails with a recovery hint when the gateway file does not export BehaviorGateway", () => {
    const gatewayPath = tempPath("missing-behavior-gateway.ts");
    writeFileSync(gatewayPath, "export const notBehaviorGateway = { nope: true };\n");

    const output = runCliFailure(
      "story",
      "--project-root",
      process.cwd(),
      "--gateway",
      gatewayPath,
      "list",
    );

    expect(output).toContain(`Expected named export BehaviorGateway from ${gatewayPath}.`);
    expect(output).toContain("error [unsupported-environment]:");
    expect(output).toContain(
      "Next step: export `BehaviorGateway` from that module, or omit `--gateway` to use `src/app/behavior.ts` under `--project-root`.",
    );
  });
});
