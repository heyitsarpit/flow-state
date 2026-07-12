import { Layer } from "effect";

import type { FlowAppDefinition, FlowModuleDefinition, FlowModuleMap } from "../core/api/types.js";
import { FlowAppOwnership } from "../core/orchestrator/app-ownership.js";
import { InspectionLog } from "../core/runtime/services/inspection.js";
import { OrchestratorSystem } from "../core/orchestrator/orchestrator-system.js";
import { ResourceStore } from "../core/runtime/services/resource-store.js";
import {
  FlowRuntimePolicy,
  mergeRuntimeInstallers,
} from "../core/runtime/services/runtime-policy.js";
import { TraceLog } from "../core/runtime/services/trace.js";
import type {
  FlowAppLayerErrors,
  FlowAppLayerOutputs,
  FlowAppLayerRequirements,
  FlowRuntimeInstallerErrors,
  FlowRuntimeInstallerOutputs,
  FlowRuntimeInstallerRequirements,
  FlowRuntimeServiceLayer,
} from "../core/runtime/services/runtime-contracts.js";
import { summarizeApp } from "./inventory.js";
import { validateAppModules } from "./validation.js";

function canonicalAppId(modules: ReadonlyArray<FlowModuleDefinition>): string {
  if (modules.length === 0) {
    return "app";
  }
  return `app:${modules
    .map((module) => module.id)
    .sort((left, right) => left.localeCompare(right))
    .map((id) => `${id.length}:${id}`)
    .join("|")}`;
}

function presentationAppLabel(modules: ReadonlyArray<FlowModuleDefinition>): string {
  if (modules.length === 0) {
    return "app";
  }
  return modules.map((module) => module.id).join("+");
}

function toModuleMap<Modules extends ReadonlyArray<FlowModuleDefinition>>(
  modules: Modules,
): FlowModuleMap<Modules> {
  const moduleMap = Object.create(null) as Record<string, FlowModuleDefinition>;
  for (const module of modules) {
    moduleMap[module.id] = module;
  }
  return moduleMap as unknown as FlowModuleMap<Modules>;
}

export function createAppDefinition<const Modules extends ReadonlyArray<FlowModuleDefinition>>(
  config: Readonly<{
    readonly modules: Modules;
  }>,
): FlowAppDefinition<Modules> {
  validateAppModules(config.modules);
  const modules = Object.freeze([...config.modules]) as unknown as Modules;

  const id = canonicalAppId(modules);
  const label = presentationAppLabel(modules);
  const moduleMap = Object.freeze(toModuleMap(modules));
  let summary: import("../core/api/types.js").FlowAppInventorySummary | undefined;

  let app!: FlowAppDefinition<Modules>;

  app = {
    kind: "app",
    id,
    label,
    modules,
    moduleMap,
    inventory: () => {
      summary ??= summarizeApp(app);
      return summary;
    },
    layer: <const Services extends ReadonlyArray<Layer.Any> = readonly []>(
      layerConfig: import("../core/api/types.js").FlowAppLayerConfig<Services>,
    ): FlowRuntimeServiceLayer<
      FlowAppLayerOutputs<Services>,
      FlowAppLayerErrors<Services>,
      FlowAppLayerRequirements<Services>
    > => {
      const runtimeInstallers = mergeRuntimeInstallers(
        {
          store: layerConfig.store,
          orchestrators: layerConfig.orchestrators,
        },
        layerConfig.services,
      ) as FlowRuntimeServiceLayer<
        FlowRuntimeInstallerOutputs<Services>,
        FlowRuntimeInstallerErrors<Services>,
        FlowRuntimeInstallerRequirements<Services>
      >;
      const runtimePolicy = FlowRuntimePolicy.layer({
        store: layerConfig.store,
        orchestrators: layerConfig.orchestrators,
      }).pipe(Layer.provide(runtimeInstallers));
      const appOwnership = FlowAppOwnership.fromApp(app);
      const resourceStore = ResourceStore.layer.pipe(
        Layer.provide(Layer.mergeAll(runtimeInstallers, runtimePolicy)),
      );
      const inspectionLog = InspectionLog.layer;
      const traceLog = TraceLog.layer;
      const orchestratorSystem = OrchestratorSystem.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            runtimeInstallers,
            resourceStore,
            inspectionLog,
            traceLog,
            appOwnership,
            runtimePolicy,
          ),
        ),
      );

      return Layer.mergeAll(
        runtimeInstallers,
        resourceStore,
        orchestratorSystem,
        inspectionLog,
        traceLog,
      ) as FlowRuntimeServiceLayer<
        FlowAppLayerOutputs<Services>,
        FlowAppLayerErrors<Services>,
        FlowAppLayerRequirements<Services>
      >;
    },
  } satisfies FlowAppDefinition<Modules>;

  return Object.freeze(app);
}
