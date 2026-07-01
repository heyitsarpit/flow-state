import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

const scriptPath = new URL("../scripts/inspect-cli.mjs", import.meta.url);

function writeProofFile(contents: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "flow-state-inspect-cli-"));
  const path = join(directory, "proof.json");
  writeFileSync(path, JSON.stringify(contents, null, 2));
  return path;
}

function runCli(...args: ReadonlyArray<string>): string {
  return execFileSync(process.execPath, [scriptPath.pathname, ...args], {
    encoding: "utf8",
  });
}

describe("inspect CLI script", () => {
  it("prints the formatted inspection buffer from a local proof file", () => {
    const proofPath = writeProofFile({
      kind: "local-inspection-proof",
      machineId: "inspect.cli.machine",
      actorTree: {
        id: "inspect.cli.machine",
        children: {},
      },
      eventTimeline: [],
      correlations: [],
      traceArtifact: {
        kind: "trace-artifact",
        version: "flow-state/trace-artifact.v1",
      },
      formatted: {
        eventTimeline: "1. actor:start [inspect.cli.machine]",
        trace: "Trace inspect.cli.machine",
      },
    });

    expect(runCli("buffer", proofPath).trim()).toBe("1. actor:start [inspect.cli.machine]");
  });

  it("dumps an actor-scoped trace bundle from a local proof file", () => {
    const proofPath = writeProofFile({
      kind: "local-inspection-proof",
      machineId: "inspect.cli.machine",
      actorTree: {
        id: "inspect.cli.machine",
        children: {
          child: {
            id: "inspect.cli.child",
            actorId: "inspect.cli.child.actor",
            state: "running",
            children: {},
          },
        },
      },
      eventTimeline: [],
      correlations: [
        {
          correlationId: "inspect.cli.machine:event:1",
          sourceActorId: "inspect.cli.child.actor",
          targetActorId: "inspect.cli.machine",
          summary: {
            eventType: "START",
            relatedIds: ["inspect.cli.child.actor"],
          },
          details: {
            children: [],
          },
        },
      ],
      traceArtifact: {
        kind: "trace-artifact",
        version: "flow-state/trace-artifact.v1",
      },
      formatted: {
        eventTimeline: "(no inspection events)",
        trace: "Trace inspect.cli.machine",
      },
    });

    const output = JSON.parse(runCli("trace", proofPath, "inspect.cli.child.actor")) as {
      readonly actorId: string;
      readonly actor: Readonly<{ readonly actorId?: string; readonly state?: string }>;
      readonly correlations: ReadonlyArray<Readonly<{ readonly correlationId: string }>>;
    };

    expect(output.actorId).toBe("inspect.cli.child.actor");
    expect(output.actor.actorId).toBe("inspect.cli.child.actor");
    expect(output.actor.state).toBe("running");
    expect(output.correlations).toEqual([
      {
        correlationId: "inspect.cli.machine:event:1",
        sourceActorId: "inspect.cli.child.actor",
        targetActorId: "inspect.cli.machine",
        summary: {
          eventType: "START",
          relatedIds: ["inspect.cli.child.actor"],
        },
        details: {
          children: [],
        },
      },
    ]);
  });

  it("summarizes non-success correlations by correlation id", () => {
    const proofPath = writeProofFile({
      kind: "local-inspection-proof",
      machineId: "inspect.cli.machine",
      actorTree: {
        id: "inspect.cli.machine",
        children: {},
      },
      eventTimeline: [],
      correlations: [
        {
          correlationId: "inspect.cli.machine:event:1",
          summary: {
            eventType: "SAVE",
            relatedIds: ["transactions.save"],
          },
          issues: [{ id: "transactions.save", source: "transaction" }],
          outcomes: [
            {
              kind: "failure",
              id: "transactions.save",
            },
          ],
        },
        {
          correlationId: "inspect.cli.machine:event:2",
          summary: {
            eventType: "REFRESH",
            relatedIds: ["resources.project"],
          },
          issues: [],
          outcomes: [],
        },
      ],
      traceArtifact: {
        kind: "trace-artifact",
        version: "flow-state/trace-artifact.v1",
      },
      formatted: {
        eventTimeline: "(no inspection events)",
        trace: "Trace inspect.cli.machine",
      },
    });

    expect(runCli("failures", proofPath).trim()).toContain(
      "1. inspect.cli.machine:event:1 event=SAVE issues=1 outcomes=failure relatedIds=transactions.save",
    );
  });
});
