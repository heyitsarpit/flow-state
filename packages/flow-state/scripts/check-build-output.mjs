import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const distRoot = resolve(packageRoot, "dist");
const cliDistRoot = resolve(distRoot, "cli");
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

function assertNoBundleLeakage(bundle, label) {
  const forbiddenNeedles = ["examples/launch-workspace", "apps/docs", "launchWorkspace", "docs/"];

  for (const needle of forbiddenNeedles) {
    assert(!bundle.includes(needle), `${label} must not leak '${needle}'`);
  }
}

function assertSourceMapComment(bundle, label, mapFile) {
  assert(
    bundle.includes(`//# sourceMappingURL=${mapFile}`),
    `${label} must expose a sourceMappingURL comment`,
  );
}

function assertRuntimeBundleIsCoreOnly(bundle) {
  const forbiddenNeedles = [
    'from "react"',
    "FlowProvider",
    "createControlledEffect",
    "createControlledStream",
    "flowExperimental",
    "useFlowActor",
    "useFlowResource",
    "useFlowView",
    "analyzeTrace",
    "captureTrace",
    "flowStories",
    "graphOf",
    "runFlowStory",
    "storyToDoc",
    "storyToTest",
    "withRequestRuntime",
  ];

  for (const needle of forbiddenNeedles) {
    assert(!bundle.includes(needle), `dist/index.mjs bundle closure must not include '${needle}'`);
  }
}

function localMjsImports(bundle) {
  return Array.from(bundle.matchAll(/from "\.\/([^"]+\.mjs)"/g), (match) => match[1]);
}

function readBundleClosure(entryFile) {
  const visited = new Set();
  const orderedBuffers = [];

  function visit(file) {
    if (visited.has(file)) {
      return;
    }

    visited.add(file);
    const source = readFileSync(resolve(distRoot, file), "utf8");

    orderedBuffers.push(Buffer.from(source));
    for (const child of localMjsImports(source)) {
      visit(child);
    }
  }

  visit(entryFile);
  return Buffer.concat(orderedBuffers);
}

function formatBytes(bytes) {
  return `${bytes.toLocaleString("en-US")} bytes`;
}

function assertBundleSizeBaseline(bundleBuffer, baseline) {
  assert(baseline?.entry === "dist/index.mjs", "bundle-size baseline must target dist/index.mjs");
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
    import * as flow from "./dist/index.mjs";

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

function assertPackagedCliBinary() {
  const cliEntryPath = resolve(cliDistRoot, "index.mjs");
  const cliBehaviorContractPath = resolve(cliDistRoot, "behavior-contract.mjs");
  const cliSharedPath = resolve(cliDistRoot, "shared.mjs");
  const cliGatewayPath = resolve(cliDistRoot, "gateway.mjs");
  const cliStoryPathsPath = resolve(cliDistRoot, "story-paths.mjs");
  const cliStoryRegistryPath = resolve(cliDistRoot, "story-registry.mjs");
  const cliTraceDiffPath = resolve(cliDistRoot, "trace-diff.mjs");
  const cliTraceInputPath = resolve(cliDistRoot, "trace-input.mjs");
  const cliEntry = readFileSync(cliEntryPath, "utf8");
  const cliBehaviorContract = readFileSync(cliBehaviorContractPath, "utf8");
  const cliShared = readFileSync(cliSharedPath, "utf8");
  const cliGateway = readFileSync(cliGatewayPath, "utf8");
  const cliStoryPaths = readFileSync(cliStoryPathsPath, "utf8");
  const cliStoryRegistry = readFileSync(cliStoryRegistryPath, "utf8");
  const cliTraceDiff = readFileSync(cliTraceDiffPath, "utf8");
  const cliTraceInput = readFileSync(cliTraceInputPath, "utf8");

  assert(cliEntry.startsWith("#!/usr/bin/env node"), "dist/cli/index.mjs must keep a node shebang");
  assert(cliEntry.includes('from "./shared.mjs"'), "dist/cli/index.mjs must import dist/cli/shared.mjs");
  assert(cliEntry.includes('from "./behavior-contract.mjs"'), "dist/cli/index.mjs must import dist/cli/behavior-contract.mjs");
  assert(cliEntry.includes('from "../inspect.mjs"'), "dist/cli/index.mjs must import dist/inspect.mjs");
  assert(cliEntry.includes('from "../testing.mjs"'), "dist/cli/index.mjs must import dist/testing.mjs");
  assert(!cliEntry.includes('from "./shared.ts"'), "dist/cli/index.mjs must not keep TypeScript import specifiers");
  assert(!cliEntry.includes('from "./behavior-contract.ts"'), "dist/cli/index.mjs must not keep TypeScript behavior-contract imports");
  assert(!cliEntry.includes('from "../dist/inspect.mjs"'), "dist/cli/index.mjs must not depend on repo-local dist paths");
  assert(!cliEntry.includes('from "../inspect.ts"'), "dist/cli/index.mjs must not keep source-only inspect imports");
  assert(!cliEntry.includes('from "../testing.ts"'), "dist/cli/index.mjs must not keep source-only testing imports");
  assert(!cliEntry.includes("apps/docs/src/generated/behavior-contract.json"), "dist/cli/index.mjs must not default to a repo-only behavior-contract path");
  assert(cliBehaviorContract.includes('from "./gateway.mjs"'), "dist/cli/behavior-contract.mjs must import dist/cli/gateway.mjs");
  assert(cliBehaviorContract.includes('from "../inspect.mjs"'), "dist/cli/behavior-contract.mjs must import dist/inspect.mjs");
  assert(
    !/from ".*\.ts"/.test(cliBehaviorContract),
    "dist/cli/behavior-contract.mjs must not keep TypeScript import specifiers",
  );
  assert(!cliBehaviorContract.includes('from "../dist/inspect.mjs"'), "dist/cli/behavior-contract.mjs must not depend on repo-local dist paths");
  assert(cliShared.includes('from "./gateway.mjs"'), "dist/cli/shared.mjs must import dist/cli/gateway.mjs");
  assert(cliShared.includes('from "./story-paths.mjs"'), "dist/cli/shared.mjs must import dist/cli/story-paths.mjs");
  assert(cliShared.includes('from "./story-registry.mjs"'), "dist/cli/shared.mjs must import dist/cli/story-registry.mjs");
  assert(cliShared.includes('from "./trace-diff.mjs"'), "dist/cli/shared.mjs must import dist/cli/trace-diff.mjs");
  assert(cliShared.includes('from "./trace-input.mjs"'), "dist/cli/shared.mjs must import dist/cli/trace-input.mjs");
  assert(cliShared.includes('from "../inspect.mjs"'), "dist/cli/shared.mjs must import dist/inspect.mjs");
  assert(!cliShared.includes('from "./gateway.ts"'), "dist/cli/shared.mjs must not keep TypeScript gateway imports");
  assert(!cliShared.includes('from "./story-paths.ts"'), "dist/cli/shared.mjs must not keep TypeScript story-paths imports");
  assert(!cliShared.includes('from "./story-registry.ts"'), "dist/cli/shared.mjs must not keep TypeScript story-registry imports");
  assert(!cliShared.includes('from "./trace-diff.ts"'), "dist/cli/shared.mjs must not keep TypeScript trace-diff imports");
  assert(!cliShared.includes('from "./trace-input.ts"'), "dist/cli/shared.mjs must not keep TypeScript trace-input imports");
  assert(!cliShared.includes('from "../dist/inspect.mjs"'), "dist/cli/shared.mjs must not depend on repo-local dist paths");
  assert(!cliShared.includes('from "../inspect.ts"'), "dist/cli/shared.mjs must not keep source-only inspect imports");
  assert(
    !/from ".*\.ts"/.test(cliGateway),
    "dist/cli/gateway.mjs must not keep TypeScript import specifiers",
  );
  assert(!cliGateway.includes('from "../dist/'), "dist/cli/gateway.mjs must not depend on repo-local dist paths");
  assert(
    !/from ".*\.ts"/.test(cliStoryPaths),
    "dist/cli/story-paths.mjs must not keep TypeScript import specifiers",
  );
  assert(!cliStoryPaths.includes('from "../dist/'), "dist/cli/story-paths.mjs must not depend on repo-local dist paths");
  assert(cliTraceDiff.includes('from "../inspect.mjs"'), "dist/cli/trace-diff.mjs must import dist/inspect.mjs");
  assert(
    !/from ".*\.ts"/.test(cliTraceDiff),
    "dist/cli/trace-diff.mjs must not keep TypeScript import specifiers",
  );
  assert(!cliTraceDiff.includes('from "../dist/'), "dist/cli/trace-diff.mjs must not depend on repo-local dist paths");
  assert(cliStoryRegistry.includes('from "../inspect.mjs"'), "dist/cli/story-registry.mjs must import dist/inspect.mjs");
  assert(
    !/from ".*\.ts"/.test(cliStoryRegistry),
    "dist/cli/story-registry.mjs must not keep TypeScript import specifiers",
  );
  assert(!cliStoryRegistry.includes('from "../dist/inspect.mjs"'), "dist/cli/story-registry.mjs must not depend on repo-local dist paths");
  assert(cliTraceInput.includes('from "../inspect.mjs"'), "dist/cli/trace-input.mjs must import dist/inspect.mjs");
  assert(
    !/from ".*\.ts"/.test(cliTraceInput),
    "dist/cli/trace-input.mjs must not keep TypeScript import specifiers",
  );
  assert(!cliTraceInput.includes('from "../dist/inspect.mjs"'), "dist/cli/trace-input.mjs must not depend on repo-local dist paths");
}

const runtimeBundleBuffer = readBundleClosure("index.mjs");
const runtimeBundleClosure = runtimeBundleBuffer.toString("utf8");
const bundleSizeBaseline = readJson(bundleSizeBaselinePath);
const distEntries = readdirSync(distRoot);
const declarationMapEntries = distEntries.filter((entry) => entry.endsWith(".d.mts.map")).sort();
const runtimeMapEntries = distEntries.filter((entry) => entry.endsWith(".mjs.map")).sort();

assert(declarationMapEntries.length > 0, "dist must emit at least one declaration sourcemap");
for (const declarationMapEntry of declarationMapEntries) {
  const declarationMap = readJson(resolve(distRoot, declarationMapEntry));

  assertRelativeSources(declarationMap, `dist/${declarationMapEntry}`);
  assertSourcesContent(declarationMap, `dist/${declarationMapEntry}`);
}
for (const runtimeMapEntry of runtimeMapEntries) {
  const runtimeMap = readJson(resolve(distRoot, runtimeMapEntry));
  const runtimeSourceEntry = runtimeMapEntry.replace(/\.map$/, "");
  const runtimeSource = readFileSync(resolve(distRoot, runtimeSourceEntry), "utf8");

  assertRelativeSources(runtimeMap, `dist/${runtimeMapEntry}`);
  assertSourcesContent(runtimeMap, `dist/${runtimeMapEntry}`);
  assertSourceMapComment(runtimeSource, `dist/${runtimeSourceEntry}`, runtimeMapEntry);
}
assertNoBundleLeakage(runtimeBundleClosure, "dist/index.mjs bundle closure");
assertRuntimeBundleIsCoreOnly(runtimeBundleClosure);
assertBundleSizeBaseline(runtimeBundleBuffer, bundleSizeBaseline);
assertSourcemappedRuntimeStack();
assertPackagedCliBinary();

console.log("build output hygiene ok");
