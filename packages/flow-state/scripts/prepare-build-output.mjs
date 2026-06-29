import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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

function writeServerDeclarations() {
  const serverDeclaration = `type RootExports = typeof import("./index.mjs");
type RootFlow = RootExports["flow"];

export declare const createControlledEffect: RootExports["createControlledEffect"];
export declare const createControlledStream: RootExports["createControlledStream"];
export declare const createKey: RootExports["createKey"];
export declare const createRuntime: RootExports["createRuntime"];
export declare const createTag: RootExports["createTag"];
export declare const flow: Pick<
  RootFlow,
  Exclude<keyof RootFlow, "use" | "useResource" | "useView">
>;
export declare const flowExperimental: RootExports["flowExperimental"];
export declare const flowTest: RootExports["flowTest"];
export declare const selectView: RootExports["selectView"];
export declare const withRequestRuntime: RootExports["withRequestRuntime"];

export type {
  FlowActor,
  FlowActorSnapshotTree,
  FlowActorStartOptions,
  FlowAppDefinition,
  FlowAppLayerConfig,
  FlowRuntimeBootActorSnapshot,
  FlowRuntimeBootOptions,
  FlowRuntimeBootPayload,
  FlowRuntimeHydratedBoot,
  FlowChildDefinition,
  FlowConcurrencyPolicy,
  FlowEvent,
  FlowInspectionEvent,
  FlowInspectionSnapshotEvent,
  FlowEventForState,
  FlowGraphDescriptor,
  FlowIssue,
  FlowKey,
  FlowMachine,
  FlowModelDescriptor,
  FlowModelPath,
  FlowModelStep,
  FlowModelTraversalOptions,
  FlowOrchestratorDescriptor,
  FlowPermissionDefinition,
  FlowPersistDefinition,
  FlowReplayDescriptor,
  FlowMachineConfig,
  FlowModuleDefinition,
  FlowResourceDefinition,
  FlowResourceHydrationEntry,
  FlowResourceRef,
  FlowRuntime,
  FlowRuntimeInspection,
  FlowSeededResource,
  FlowSnapshot,
  FlowStoriesDescriptor,
  FlowStoreDescriptor,
  FlowStreamDefinition,
  FlowTag,
  FlowTestBuilder,
  FlowTestHarness,
  FlowTraceDescriptor,
  FlowTraceReport,
  FlowTransactionDefinition,
  FlowTransitionArgs,
  FlowViewDefinition,
  SelectionSource,
} from "./index.mjs";
`;

  writeFileSync(resolve(distRoot, "server.d.mts"), serverDeclaration);
}

normalizeSourcesContent(resolve(distRoot, "index.mjs.map"));
normalizeSourcesContent(resolve(distRoot, "index.d.mts.map"));

for (const entry of readdirSync(distRoot)) {
  if (!entry.endsWith(".map")) {
    continue;
  }

  normalizeSourcesContent(resolve(distRoot, entry));
}

writeServerDeclarations();
