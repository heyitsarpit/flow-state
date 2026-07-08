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
    .replaceAll('from "./cli-shared.mjs"', 'from "./shared.mjs"')
    .replaceAll('from "../dist/inspect.mjs"', 'from "../inspect.mjs"')
    .replaceAll('from "../dist/testing.mjs"', 'from "../testing.mjs"');
}

function ensureCliDistribution() {
  mkdirSync(cliDistRoot, { recursive: true });

  const sharedSource = rewriteCliDistributionSource(
    readFileSync(resolve(scriptDir, "cli-shared.mjs"), "utf8"),
  );
  const entrySource = rewriteCliDistributionSource(
    readFileSync(resolve(scriptDir, "flow-state-cli.mjs"), "utf8"),
  );

  writeFileSync(resolve(cliDistRoot, "shared.mjs"), sharedSource);
  writeFileSync(resolve(cliDistRoot, "index.mjs"), entrySource);
}

for (const entry of readdirSync(distRoot)) {
  if (!entry.endsWith(".map")) {
    continue;
  }

  normalizeSourcesContent(resolve(distRoot, entry));
}

ensureCliDistribution();
