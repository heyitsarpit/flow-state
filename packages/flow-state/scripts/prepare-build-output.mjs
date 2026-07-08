import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const distRoot = resolve(packageRoot, "dist");
const cliDistRoot = resolve(distRoot, "cli");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readSourceContent(mapPath, source) {
  return readFileSync(resolve(dirname(mapPath), source), "utf8");
}

function normalizeSourcesContent(mapPath) {
  const map = readJson(mapPath);
  if (!Array.isArray(map.sources) || map.sources.length === 0) {
    throw new Error(`${mapPath} is missing sources`);
  }

  const nextSourcesContent = map.sources.map((source) => readSourceContent(mapPath, source));
  const alreadyAligned =
    Array.isArray(map.sourcesContent) &&
    map.sourcesContent.length === nextSourcesContent.length &&
    map.sourcesContent.every((entry, index) => entry === nextSourcesContent[index]);

  if (alreadyAligned) {
    return;
  }

  map.sourcesContent = nextSourcesContent;
  writeFileSync(mapPath, `${JSON.stringify(map)}\n`);
}

function rewriteCliDistributionSource(source) {
  return source
    .replaceAll('from "./shared.ts"', 'from "./shared.mjs"')
    .replaceAll('from "./behavior-contract.ts"', 'from "./behavior-contract.mjs"')
    .replaceAll('from "./gateway.ts"', 'from "./gateway.mjs"')
    .replaceAll('from "./story-paths.ts"', 'from "./story-paths.mjs"')
    .replaceAll('from "./story-registry.ts"', 'from "./story-registry.mjs"')
    .replaceAll('from "./trace-input.ts"', 'from "./trace-input.mjs"')
    .replaceAll('from "../../dist/inspect.mjs"', 'from "../inspect.mjs"')
    .replaceAll('from "../../dist/testing.mjs"', 'from "../testing.mjs"');
}

function ensureCliDistribution() {
  mkdirSync(cliDistRoot, { recursive: true });

  execFileSync(
    "pnpm",
    [
      "exec",
      "esbuild",
      "src/cli/index.ts",
      "src/cli/behavior-contract.ts",
      "src/cli/shared.ts",
      "src/cli/gateway.ts",
      "src/cli/story-paths.ts",
      "src/cli/story-registry.ts",
      "src/cli/trace-input.ts",
      "--format=esm",
      "--platform=node",
      "--target=node22",
      "--outdir=dist",
      "--outbase=src",
      "--out-extension:.js=.mjs",
    ],
    {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  for (const entry of [
    "index.mjs",
    "behavior-contract.mjs",
    "shared.mjs",
    "gateway.mjs",
    "story-paths.mjs",
    "story-registry.mjs",
    "trace-input.mjs",
  ]) {
    const path = resolve(cliDistRoot, entry);
    writeFileSync(path, rewriteCliDistributionSource(readFileSync(path, "utf8")));
  }

  const cliEntryPath = resolve(cliDistRoot, "index.mjs");
  const cliEntry = readFileSync(cliEntryPath, "utf8");

  if (!cliEntry.startsWith("#!/usr/bin/env node\n")) {
    writeFileSync(cliEntryPath, `#!/usr/bin/env node\n${cliEntry}`);
  }
}

for (const entry of readdirSync(distRoot)) {
  if (!entry.endsWith(".map")) {
    continue;
  }

  normalizeSourcesContent(resolve(distRoot, entry));
}

ensureCliDistribution();
