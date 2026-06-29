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
  const serverDeclaration = `import type { RuntimeReadyLayer } from "./index.mjs";

type RootExports = typeof import("./index.mjs");
type RootFlow = RootExports["flow"];

export declare const createKey: RootExports["createKey"];
export declare const createRuntime: RootExports["createRuntime"];
export declare const createTag: RootExports["createTag"];
export declare const flow: RootFlow;
export declare const selectView: RootExports["selectView"];
export declare function withRequestRuntime<AppLayer extends import("effect").Layer.Any, Result>(
  layer: RuntimeReadyLayer<AppLayer>,
  handler: (
    runtime: import("./index.mjs").FlowRuntime<
      import("effect").Layer.Success<AppLayer>,
      import("effect").Layer.Error<AppLayer>
    >,
  ) => Result | Promise<Result>,
): Promise<Result>;

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
  FlowEnsureDefinition,
  FlowEvent,
  FlowEventForState,
  FlowInvalidateDefinition,
  FlowIssue,
  FlowKey,
  FlowMachine,
  FlowOrchestratorDescriptor,
  FlowPermissionDefinition,
  FlowPersistDefinition,
  FlowMachineConfig,
  FlowModuleDefinition,
  FlowObserveDefinition,
  FlowRefreshDefinition,
  FlowResourceDefinition,
  FlowResourceHydrationEntry,
  FlowResourceRef,
  FlowRunDefinition,
  FlowRuntime,
  FlowSeededResource,
  FlowSnapshot,
  FlowStoreDescriptor,
  FlowStreamDefinition,
  FlowTag,
  FlowTimerStatus,
  FlowTransactionDefinition,
  FlowTransitionArgs,
  FlowViewDefinition,
  RuntimeReadyLayer,
  SelectionSource,
} from "./index.mjs";
`;

  writeFileSync(resolve(distRoot, "server.d.mts"), serverDeclaration);
}

for (const entry of readdirSync(distRoot)) {
  if (!entry.endsWith(".map")) {
    continue;
  }

  normalizeSourcesContent(resolve(distRoot, entry));
}

writeServerDeclarations();
