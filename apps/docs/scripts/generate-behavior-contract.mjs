import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
const outputPath = resolve(repoRoot, "apps/docs/src/generated/behavior-contract.json");
const gatewayPath = resolve(repoRoot, "examples/launch-workspace/src/app/behavior.ts");
const projectRoot = resolve(repoRoot, "examples/launch-workspace");
const cliPath = resolve(repoRoot, "packages/flow-state/scripts/behavior-cli.mjs");
const checkMode = process.argv.includes("--check");

function buildInto(path) {
  execFileSync(
    process.execPath,
    [
      cliPath,
      "behavior",
      "build",
      "--project-root",
      projectRoot,
      "--gateway",
      gatewayPath,
      "--output",
      path,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
    },
  );
}

function formatArtifact(path) {
  execFileSync("pnpm", ["exec", "vp", "check", "--fix", path], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
}

const directory = mkdtempSync(join(tmpdir(), "flow-state-behavior-contract-"));
const nextPath = join(directory, "behavior-contract.json");

try {
  buildInto(nextPath);
  formatArtifact(nextPath);
  const nextContent = readFileSync(nextPath, "utf8");

  if (checkMode) {
    const currentContent = readFileSync(outputPath, "utf8");
    if (currentContent !== nextContent) {
      throw new Error(
        "Generated behavior contract artifact is stale. Run apps/docs/scripts/generate-behavior-contract.mjs.",
      );
    }
  } else {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, nextContent);
  }
} finally {
  rmSync(directory, { force: true, recursive: true });
}
