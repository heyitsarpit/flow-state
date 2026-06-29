import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const distRoot = resolve(packageRoot, "dist");
const runtimeBundlePath = resolve(distRoot, "index.mjs");
const runtimeMapPath = resolve(distRoot, "index.mjs.map");
const dtsMapPath = resolve(distRoot, "index.d.mts.map");
const bundleSizeBaselinePath = resolve(scriptDir, "build-output-size-baseline.json");

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function assertRelativeSources(map, label) {
  assert(Array.isArray(map.sources), `${label} is missing sources`);
  assert(map.sources.length > 0, `${label} has no sources`);
  assert(
    map.sources.every((source) => typeof source === "string" && source.startsWith("../src/")),
    `${label} must keep only relative ../src/* sources`,
  );
  assert(
    map.sources.every((source) => !source.startsWith("/") && !/^[A-Za-z]:\\/.test(source)),
    `${label} must not contain absolute filesystem paths`,
  );
  assert(
    map.sources.every(
      (source) =>
        !source.includes("examples/") && !source.includes("apps/docs") && !source.includes("docs/"),
    ),
    `${label} must not reference example or docs sources`,
  );
}

function assertSourcesContent(map, label) {
  assert(Array.isArray(map.sourcesContent), `${label} is missing sourcesContent`);
  assert(
    map.sourcesContent.length === map.sources.length,
    `${label} sourcesContent must align with sources`,
  );
  assert(
    map.sourcesContent.every((entry) => typeof entry === "string" && entry.length > 0),
    `${label} sourcesContent must include populated source text`,
  );
}

function assertNoBundleLeakage(bundle) {
  const forbiddenNeedles = ["examples/launch-workspace", "apps/docs", "launchWorkspace", "docs/"];

  for (const needle of forbiddenNeedles) {
    assert(!bundle.includes(needle), `dist/index.mjs must not leak '${needle}'`);
  }
}

function assertSourceMapComment(bundle) {
  assert(
    bundle.includes("//# sourceMappingURL=index.mjs.map"),
    "dist/index.mjs must expose a sourceMappingURL comment",
  );
}

function formatBytes(bytes) {
  return `${bytes.toLocaleString("en-US")} bytes`;
}

function assertBundleSizeBaseline(bundleBuffer, baseline) {
  assert(
    baseline?.entry === "dist/index.mjs",
    "bundle-size baseline must target dist/index.mjs",
  );
  assert(
    typeof baseline.bundleBytes === "number" && baseline.bundleBytes > 0,
    "bundle-size baseline must include a positive bundleBytes value",
  );
  assert(
    typeof baseline.gzipBytes === "number" && baseline.gzipBytes > 0,
    "bundle-size baseline must include a positive gzipBytes value",
  );
  assert(
    typeof baseline.maxGrowthRatio === "number" && baseline.maxGrowthRatio >= 1,
    "bundle-size baseline must include a maxGrowthRatio >= 1",
  );

  const bundleBytes = bundleBuffer.length;
  const gzipBytes = gzipSync(bundleBuffer).length;
  const maxBundleBytes = Math.ceil(baseline.bundleBytes * baseline.maxGrowthRatio);
  const maxGzipBytes = Math.ceil(baseline.gzipBytes * baseline.maxGrowthRatio);

  assert(
    bundleBytes <= maxBundleBytes,
    `dist/index.mjs exceeded the bundle-size baseline: ${formatBytes(bundleBytes)} > ${formatBytes(maxBundleBytes)} (baseline ${formatBytes(baseline.bundleBytes)}, maxGrowthRatio ${baseline.maxGrowthRatio})`,
  );
  assert(
    gzipBytes <= maxGzipBytes,
    `dist/index.mjs exceeded the gzip bundle-size baseline: ${formatBytes(gzipBytes)} > ${formatBytes(maxGzipBytes)} (baseline ${formatBytes(baseline.gzipBytes)}, maxGrowthRatio ${baseline.maxGrowthRatio})`,
  );

  console.log(
    `bundle-size baseline ok: raw ${formatBytes(bundleBytes)} / gzip ${formatBytes(gzipBytes)} (baseline raw ${formatBytes(baseline.bundleBytes)} / gzip ${formatBytes(baseline.gzipBytes)}, maxGrowthRatio ${baseline.maxGrowthRatio})`,
  );
}

function assertSourcemappedRuntimeStack() {
  const program = `
    import { flow } from "./dist/index.mjs";

    try {
      flow.module("BrokenSection", {
        resources: {
          project: {
            kind: "resource",
            id: "inventory.project",
          },
        },
      });
      console.log("NO_ERROR");
      process.exit(2);
    } catch (error) {
      console.log(String(error?.stack ?? error));
    }
  `;

  const result = spawnSync(
    process.execPath,
    ["--enable-source-maps", "--input-type=module", "-e", program],
    {
      cwd: packageRoot,
      encoding: "utf8",
    },
  );

  assert(result.status === 0, `source-map smoke program failed: ${result.stderr || result.stdout}`);
  assert(
    result.stdout.includes("packages/flow-state/src/descriptors/validation.ts"),
    "sourcemapped runtime stack must point at src/descriptors/validation.ts",
  );
}

const runtimeBundleBuffer = readFileSync(runtimeBundlePath);
const runtimeBundle = runtimeBundleBuffer.toString("utf8");
const runtimeMap = readJson(runtimeMapPath);
const dtsMap = readJson(dtsMapPath);
const bundleSizeBaseline = readJson(bundleSizeBaselinePath);

assertRelativeSources(runtimeMap, "dist/index.mjs.map");
assertSourcesContent(runtimeMap, "dist/index.mjs.map");
assertRelativeSources(dtsMap, "dist/index.d.mts.map");
assertSourcesContent(dtsMap, "dist/index.d.mts.map");
assertNoBundleLeakage(runtimeBundle);
assertSourceMapComment(runtimeBundle);
assertBundleSizeBaseline(runtimeBundleBuffer, bundleSizeBaseline);
assertSourcemappedRuntimeStack();

console.log("build output hygiene ok");
