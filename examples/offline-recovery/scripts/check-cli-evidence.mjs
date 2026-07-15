import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exampleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = mkdtempSync(path.join(tmpdir(), "flow-state-offline-evidence-"));
const leftTrace = path.join(evidenceRoot, "left.trace.json");
const rightTrace = path.join(evidenceRoot, "right.trace.json");

function execute(args) {
  return spawnSync("pnpm", ["exec", "flow-state", ...args], {
    cwd: exampleRoot,
    encoding: "utf8",
  });
}

function run(args) {
  const result = execute(args);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `flow-state exited ${result.status}`);
  }
  return result.stdout;
}

try {
  for (const tracePath of [leftTrace, rightTrace]) {
    const output = JSON.parse(
      run([
        "story",
        "--project-root",
        exampleRoot,
        "run",
        "restored-shell",
        "--check",
        "--save-trace",
        tracePath,
        "--format",
        "json",
      ]),
    );
    if (
      output.kind !== "story-run" ||
      output.evidence?.status !== "success" ||
      output.evidence?.ok !== true
    ) {
      throw new Error("packed story run did not produce passing JSON evidence");
    }
  }

  const leftArtifact = JSON.parse(readFileSync(leftTrace, "utf8"));
  const rightArtifact = JSON.parse(readFileSync(rightTrace, "utf8"));
  for (const artifact of [leftArtifact, rightArtifact]) {
    if (artifact.kind !== "trace-artifact" || artifact.version !== "flow-state/trace-artifact.v1") {
      throw new Error("story run did not persist a supported trace artifact");
    }
  }

  const comparison = JSON.parse(run(["trace", "diff", leftTrace, rightTrace, "--format", "json"]));
  if (comparison.kind !== "trace-diff" || comparison.summary?.matches !== true) {
    throw new Error("repeated packed story traces were not deterministic");
  }

  const proof = JSON.parse(
    run(["trace", "proof", leftTrace, "--actor", "offline.recovery", "--format", "json"]),
  );
  if (proof.kind !== "trace-proof" || proof.selector?.kind !== "actor") {
    throw new Error("packed trace proof did not return the requested actor slice");
  }

  const rejected = execute(["trace", "proof", leftTrace, "--format", "json"]);
  if (rejected.status === 0 || !rejected.stderr.includes("error [invalid-input]")) {
    throw new Error("packed trace proof did not fail closed without exactly one selector");
  }
} finally {
  rmSync(evidenceRoot, { recursive: true, force: true });
}
