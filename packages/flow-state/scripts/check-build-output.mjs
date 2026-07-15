import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const distRoot = resolve(packageRoot, "dist");
const cliDistRoot = resolve(distRoot, "cli");

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
    'from "node:',
    'import "node:',
    'from "@effect/platform-node"',
    'from "react"',
    "FlowProvider",
    "createControlledEffect",
    "createControlledStream",
    "flowExperimental",
    "useActor",
    "useFlowResource",
    "useFlowView",
    "analyzeTrace",
    "captureTrace",
    "flowStories",
    "graphOf",
    "runFlowScenario",
    "runFlowStory",
    "scenarioToReport",
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
  const cliOutputProjectionsPath = resolve(cliDistRoot, "output-projections.mjs");
  const cliStoryReadPath = resolve(cliDistRoot, "story-read.mjs");
  const cliStoryRunPath = resolve(cliDistRoot, "story-run.mjs");
  const cliStoryPathsPath = resolve(cliDistRoot, "story-paths.mjs");
  const cliStoryRegistryPath = resolve(cliDistRoot, "story-registry.mjs");
  const cliTraceDiffPath = resolve(cliDistRoot, "trace-diff.mjs");
  const cliTraceInputPath = resolve(cliDistRoot, "trace-input.mjs");
  const machineFamilyPath = resolve(distRoot, "core/machines/machine-family.mjs");
  const cliEntry = readFileSync(cliEntryPath, "utf8");
  const cliBehaviorContract = readFileSync(cliBehaviorContractPath, "utf8");
  const cliShared = readFileSync(cliSharedPath, "utf8");
  const cliGateway = readFileSync(cliGatewayPath, "utf8");
  const cliOutputProjections = readFileSync(cliOutputProjectionsPath, "utf8");
  const cliStoryRead = readFileSync(cliStoryReadPath, "utf8");
  const cliStoryRun = readFileSync(cliStoryRunPath, "utf8");
  const cliStoryPaths = readFileSync(cliStoryPathsPath, "utf8");
  const cliStoryRegistry = readFileSync(cliStoryRegistryPath, "utf8");
  const cliTraceDiff = readFileSync(cliTraceDiffPath, "utf8");
  const cliTraceInput = readFileSync(cliTraceInputPath, "utf8");
  const machineFamily = readFileSync(machineFamilyPath, "utf8");

  assert(cliEntry.startsWith("#!/usr/bin/env node"), "dist/cli/index.mjs must keep a node shebang");
  assert(
    cliEntry.includes('from "./shared.mjs"'),
    "dist/cli/index.mjs must import dist/cli/shared.mjs",
  );
  assert(
    cliEntry.includes('from "./behavior-contract.mjs"'),
    "dist/cli/index.mjs must import dist/cli/behavior-contract.mjs",
  );
  assert(
    cliEntry.includes('from "./output-projections.mjs"'),
    "dist/cli/index.mjs must import dist/cli/output-projections.mjs",
  );
  assert(
    cliEntry.includes('from "../inspect.mjs"'),
    "dist/cli/index.mjs must import dist/inspect.mjs",
  );
  assert(
    cliEntry.includes('from "../testing.mjs"'),
    "dist/cli/index.mjs must import dist/testing.mjs",
  );
  assert(
    cliEntry.includes('from "../core/machines/machine-family.mjs"'),
    "dist/cli/index.mjs must import the emitted machine-family runtime module",
  );
  assert(
    !cliEntry.includes('from "./shared.ts"'),
    "dist/cli/index.mjs must not keep TypeScript import specifiers",
  );
  assert(
    !cliEntry.includes('from "./behavior-contract.ts"'),
    "dist/cli/index.mjs must not keep TypeScript behavior-contract imports",
  );
  assert(
    !cliEntry.includes('from "../dist/inspect.mjs"'),
    "dist/cli/index.mjs must not depend on repo-local dist paths",
  );
  assert(
    !cliEntry.includes('from "../inspect.ts"'),
    "dist/cli/index.mjs must not keep source-only inspect imports",
  );
  assert(
    !cliEntry.includes('from "../testing.ts"'),
    "dist/cli/index.mjs must not keep source-only testing imports",
  );
  assert(
    !cliEntry.includes("apps/docs/src/generated/behavior-contract.json"),
    "dist/cli/index.mjs must not default to a repo-only behavior-contract path",
  );
  assert(
    cliBehaviorContract.includes('from "./gateway.mjs"'),
    "dist/cli/behavior-contract.mjs must import dist/cli/gateway.mjs",
  );
  assert(
    cliBehaviorContract.includes('from "../inspect.mjs"'),
    "dist/cli/behavior-contract.mjs must import dist/inspect.mjs",
  );
  assert(
    !/from ".*\.ts"/.test(cliBehaviorContract),
    "dist/cli/behavior-contract.mjs must not keep TypeScript import specifiers",
  );
  assert(
    !cliBehaviorContract.includes('from "../dist/inspect.mjs"'),
    "dist/cli/behavior-contract.mjs must not depend on repo-local dist paths",
  );
  assert(
    cliShared.includes('from "./gateway.mjs"'),
    "dist/cli/shared.mjs must import dist/cli/gateway.mjs",
  );
  assert(
    cliShared.includes('from "./story-read.mjs"'),
    "dist/cli/shared.mjs must import dist/cli/story-read.mjs",
  );
  assert(
    cliShared.includes('from "./story-run.mjs"'),
    "dist/cli/shared.mjs must import dist/cli/story-run.mjs",
  );
  assert(
    cliShared.includes('from "./story-paths.mjs"'),
    "dist/cli/shared.mjs must import dist/cli/story-paths.mjs",
  );
  assert(
    cliShared.includes('from "./story-registry.mjs"'),
    "dist/cli/shared.mjs must import dist/cli/story-registry.mjs",
  );
  assert(
    cliShared.includes('from "./trace-diff.mjs"'),
    "dist/cli/shared.mjs must import dist/cli/trace-diff.mjs",
  );
  assert(
    cliShared.includes('from "./trace-input.mjs"'),
    "dist/cli/shared.mjs must import dist/cli/trace-input.mjs",
  );
  assert(
    cliShared.includes('from "../inspect.mjs"'),
    "dist/cli/shared.mjs must import dist/inspect.mjs",
  );
  assert(
    cliStoryPaths.includes('from "../core/machines/machine-family.mjs"'),
    "dist/cli/story-paths.mjs must import the emitted machine-family runtime module",
  );
  assert(
    machineFamily.includes("function recoverMachineFamily"),
    "dist/core/machines/machine-family.mjs must contain the machine-family recovery owner",
  );
  assert(
    !cliShared.includes('from "./gateway.ts"'),
    "dist/cli/shared.mjs must not keep TypeScript gateway imports",
  );
  assert(
    !cliShared.includes('from "./story-read.ts"'),
    "dist/cli/shared.mjs must not keep TypeScript story-read imports",
  );
  assert(
    !cliShared.includes('from "./story-run.ts"'),
    "dist/cli/shared.mjs must not keep TypeScript story-run imports",
  );
  assert(
    !cliShared.includes('from "./story-paths.ts"'),
    "dist/cli/shared.mjs must not keep TypeScript story-paths imports",
  );
  assert(
    !cliShared.includes('from "./story-registry.ts"'),
    "dist/cli/shared.mjs must not keep TypeScript story-registry imports",
  );
  assert(
    !cliShared.includes('from "./trace-diff.ts"'),
    "dist/cli/shared.mjs must not keep TypeScript trace-diff imports",
  );
  assert(
    !cliShared.includes('from "./trace-input.ts"'),
    "dist/cli/shared.mjs must not keep TypeScript trace-input imports",
  );
  assert(
    !cliShared.includes('from "../dist/inspect.mjs"'),
    "dist/cli/shared.mjs must not depend on repo-local dist paths",
  );
  assert(
    !cliShared.includes('from "../inspect.ts"'),
    "dist/cli/shared.mjs must not keep source-only inspect imports",
  );
  assert(
    !/from ".*\.ts"/.test(cliGateway),
    "dist/cli/gateway.mjs must not keep TypeScript import specifiers",
  );
  assert(
    !cliGateway.includes('from "../dist/'),
    "dist/cli/gateway.mjs must not depend on repo-local dist paths",
  );
  assert(
    !/from ".*\.ts"/.test(cliOutputProjections),
    "dist/cli/output-projections.mjs must not keep TypeScript import specifiers",
  );
  assert(
    !cliOutputProjections.includes('from "../dist/'),
    "dist/cli/output-projections.mjs must not depend on repo-local dist paths",
  );
  assert(
    !/from ".*\.ts"/.test(cliStoryRead),
    "dist/cli/story-read.mjs must not keep TypeScript import specifiers",
  );
  assert(
    !cliStoryRead.includes('from "../dist/'),
    "dist/cli/story-read.mjs must not depend on repo-local dist paths",
  );
  assert(
    !/from ".*\.ts"/.test(cliStoryRun),
    "dist/cli/story-run.mjs must not keep TypeScript import specifiers",
  );
  assert(
    !cliStoryRun.includes('from "../dist/'),
    "dist/cli/story-run.mjs must not depend on repo-local dist paths",
  );
  assert(
    !/from ".*\.ts"/.test(cliStoryPaths),
    "dist/cli/story-paths.mjs must not keep TypeScript import specifiers",
  );
  assert(
    !cliStoryPaths.includes('from "../dist/'),
    "dist/cli/story-paths.mjs must not depend on repo-local dist paths",
  );
  assert(
    cliTraceDiff.includes('from "../inspect.mjs"'),
    "dist/cli/trace-diff.mjs must import dist/inspect.mjs",
  );
  assert(
    !/from ".*\.ts"/.test(cliTraceDiff),
    "dist/cli/trace-diff.mjs must not keep TypeScript import specifiers",
  );
  assert(
    !cliTraceDiff.includes('from "../dist/'),
    "dist/cli/trace-diff.mjs must not depend on repo-local dist paths",
  );
  assert(
    cliStoryRegistry.includes('from "../inspect.mjs"'),
    "dist/cli/story-registry.mjs must import dist/inspect.mjs",
  );
  assert(
    !/from ".*\.ts"/.test(cliStoryRegistry),
    "dist/cli/story-registry.mjs must not keep TypeScript import specifiers",
  );
  assert(
    !cliStoryRegistry.includes('from "../dist/inspect.mjs"'),
    "dist/cli/story-registry.mjs must not depend on repo-local dist paths",
  );
  assert(
    cliTraceInput.includes('from "../inspect.mjs"'),
    "dist/cli/trace-input.mjs must import dist/inspect.mjs",
  );
  assert(
    !/from ".*\.ts"/.test(cliTraceInput),
    "dist/cli/trace-input.mjs must not keep TypeScript import specifiers",
  );
  assert(
    !cliTraceInput.includes('from "../dist/inspect.mjs"'),
    "dist/cli/trace-input.mjs must not depend on repo-local dist paths",
  );
}

function assertPackedBehaviorSelfDiff() {
  const directory = mkdtempSync(resolve(tmpdir(), "flow-state-packed-behavior-"));
  const input = resolve(directory, "contract.json");
  const contract = {
    version: "flow-state/behavior-contract.v1",
    app: { id: "DuplicateResources", moduleIds: ["A", "B"] },
    modules: [
      { id: "A", dependencies: [], screenIds: [], tagIds: [], fixtureIds: [] },
      { id: "B", dependencies: [], screenIds: [], tagIds: [], fixtureIds: [] },
    ],
    resources: [
      { id: "shared", moduleId: "A", hasSchema: false, hasPlaceholder: false, freshness: null },
      { id: "shared", moduleId: "B", hasSchema: true, hasPlaceholder: false, freshness: null },
    ],
    transactions: [],
    machines: [],
    streams: [],
    views: [],
    stories: [],
  };

  try {
    writeFileSync(input, `${JSON.stringify(contract)}\n`);
    const result = spawnSync(
      process.execPath,
      [
        resolve(cliDistRoot, "index.mjs"),
        "behavior",
        "diff",
        "--left-input",
        input,
        "--right-input",
        input,
        "--format",
        "json",
      ],
      { cwd: packageRoot, encoding: "utf8" },
    );
    assert(result.status === 0, `packed behavior self-diff failed: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert(output.summary?.matches === true, "packed behavior self-diff must be reflexive");
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

const runtimeBundleBuffer = readBundleClosure("index.mjs");
const runtimeBundleClosure = runtimeBundleBuffer.toString("utf8");
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
assertSourcemappedRuntimeStack();
assertPackagedCliBinary();
assertPackedBehaviorSelfDiff();

console.log("build output hygiene ok");
