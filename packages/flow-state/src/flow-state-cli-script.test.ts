import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vite-plus/test";

const launchWorkspaceRoot = new URL("../../../examples/launch-workspace", import.meta.url).pathname;
const scriptPath = new URL("../scripts/flow-state-cli.mjs", import.meta.url);

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
