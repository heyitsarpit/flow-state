import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const distRoot = resolve(packageRoot, "dist");

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

normalizeSourcesContent(resolve(distRoot, "index.mjs.map"));
normalizeSourcesContent(resolve(distRoot, "index.d.mts.map"));
