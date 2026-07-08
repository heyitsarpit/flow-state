import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import type { FlowBehaviorContract } from "./inspect.js";

const launchWorkspaceRoot = new URL("../../../examples/launch-workspace", import.meta.url).pathname;
const scriptPath = new URL("../scripts/behavior-cli.mjs", import.meta.url);

function writeContractFile(name: string, contents: FlowBehaviorContract): string {
  const directory = mkdtempSync(join(tmpdir(), "flow-state-behavior-cli-"));
  const path = join(directory, name);
  writeFileSync(path, `${JSON.stringify(contents, null, 2)}\n`);
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

function createBaseContract(): FlowBehaviorContract {
  return {
    version: "flow-state/behavior-contract.v1",
    app: {
      id: "Behavior+Shell",
      moduleIds: ["Behavior", "Shell"],
    },
    modules: [
      {
        id: "Behavior",
        dependencies: ["Shell"],
        screenIds: ["Overview"],
        tagIds: ["behavior"],
        fixtureIds: ["behaviorSeed"],
      },
      {
        id: "Shell",
        dependencies: [],
        screenIds: ["Shell"],
        tagIds: ["shell"],
        fixtureIds: [],
      },
    ],
    resources: [],
    transactions: [
      {
        id: "behavior.save",
        moduleId: "Behavior",
        hasParams: true,
        hasPreview: false,
        hasInvalidates: false,
        hasQueueWhen: false,
        hasQueueReplay: false,
        hasQueueUndo: false,
        concurrency: "reject-while-running",
        routeKinds: ["success"],
      },
    ],
    machines: [
      {
        id: "behavior.machine",
        moduleId: "Behavior",
        initialStateId: "idle",
        states: [
          {
            id: "done",
            terminal: true,
            childIds: [],
            timedTransitions: [],
            eventlessTransitions: [],
          },
          {
            id: "idle",
            terminal: false,
            childIds: [],
            timedTransitions: [],
            eventlessTransitions: [],
          },
        ],
        transitions: [
          {
            id: "idle:START:0",
            source: "idle",
            target: "done",
            eventType: "START",
          },
        ],
      },
    ],
    streams: [],
    views: [
      {
        id: "behavior.view",
        moduleId: "Behavior",
        sources: ["context"],
      },
    ],
    stories: [
      {
        id: "default-story",
        machineId: "behavior.machine",
        title: "Default story",
        tags: [],
        start: "default",
        expectedState: "done",
        seed: null,
        expectedFacts: {
          receiptTypes: [],
          relatedIds: ["behavior.save"],
          issueKinds: [],
          issueSources: [],
          outcomeKinds: ["success"],
          outcomeSources: ["transaction"],
        },
      },
    ],
  };
}

function createChangedContract(): FlowBehaviorContract {
  const base = createBaseContract();
  return {
    ...base,
    app: {
      ...base.app,
      moduleIds: ["Behavior", "Shell", "Audit"],
    },
    modules: [
      {
        ...base.modules[0]!,
        screenIds: ["Overview", "Review"],
      },
      ...base.modules.slice(1),
      {
        id: "Audit",
        dependencies: [],
        screenIds: ["Audit"],
        tagIds: ["audit"],
        fixtureIds: [],
      },
    ],
    transactions: [
      {
        ...base.transactions[0]!,
        routeKinds: ["success", "failure"],
      },
    ],
    machines: [
      {
        ...base.machines[0]!,
        states: [
          ...base.machines[0]!.states,
          {
            id: "review",
            terminal: false,
            childIds: [],
            timedTransitions: [],
            eventlessTransitions: [],
          },
        ],
        transitions: [
          ...base.machines[0]!.transitions,
          {
            id: "done:REOPEN:0",
            source: "done",
            target: "review",
            eventType: "REOPEN",
          },
        ],
      },
    ],
    views: [
      {
        ...base.views[0]!,
        sources: ["context", "timers"],
      },
    ],
    stories: [
      {
        ...base.stories[0]!,
        expectedState: "review",
      },
    ],
  };
}

describe("behavior CLI script", () => {
  it("renders a human-readable diff from two contract files", () => {
    const leftPath = writeContractFile("left.json", createBaseContract());
    const rightPath = writeContractFile("right.json", createChangedContract());

    const output = runCli("behavior", "diff", "--left-input", leftPath, "--right-input", rightPath);

    expect(output).toContain("# Behavior Diff");
    expect(output).toContain("## App Summary");
    expect(output).toContain("- Added modules: Audit");
    expect(output).toContain("behavior.machine: added states review");
    expect(output).toContain('behavior.view: sources ["context"] -> ["context","timers"]');
  });

  it("renders live behavior coverage through the shared gateway loader", () => {
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

  it("prints the structured diff as JSON and preserves module-slice options", () => {
    const leftPath = writeContractFile("left.json", createBaseContract());
    const rightPath = writeContractFile("right.json", createChangedContract());

    const output = runCli(
      "behavior",
      "diff",
      "--left-input",
      leftPath,
      "--right-input",
      rightPath,
      "--module",
      "Behavior",
      "--format",
      "json",
    );

    const diff = JSON.parse(output) as {
      readonly kind: string;
      readonly options: Readonly<{ readonly moduleId?: string }>;
      readonly summary: Readonly<{ readonly changedSections: ReadonlyArray<string> }>;
      readonly modules: Readonly<{
        readonly added: ReadonlyArray<Readonly<{ readonly id: string }>>;
      }>;
    };

    expect(diff.kind).toBe("behavior-diff");
    expect(diff.options.moduleId).toBe("Behavior");
    expect(diff.summary.changedSections).toContain("modules");
    expect(diff.modules.added).toEqual([]);
  });

  it("rejects mixed contract-file and live-target diff inputs before loading either side", () => {
    const leftPath = writeContractFile("left.json", createBaseContract());

    const output = runCliFailure(
      "behavior",
      "diff",
      "--left-input",
      leftPath,
      "--right-project-root",
      "/tmp/flow-state-behavior-mixed",
    );

    expect(output).toContain(
      "Do not mix contract-file inputs with live build-target flags in one diff command.",
    );
  });
});
