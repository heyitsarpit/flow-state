import { Layer } from "effect";

import type { FlowAppDefinition, FlowModuleDefinition, FlowModuleMap } from "../core/api/types.js";
import { FlowAppOwnership } from "../core/orchestrator/app-ownership.js";
import { HostSignals } from "../core/runtime/services/host-signals.js";
import { InspectionLog } from "../core/runtime/services/inspection.js";
import { NotificationScheduler } from "../core/runtime/services/notification-scheduler.js";
import { OrchestratorSystem } from "../core/orchestrator/orchestrator-system.js";
import { ResourceStore } from "../core/runtime/services/resource-store.js";
import {
  FlowRuntimePolicy,
  mergeRuntimeInstallers,
} from "../core/runtime/services/runtime-policy.js";
import { TraceLog } from "../core/runtime/services/trace.js";
import { summarizeApp } from "./inventory.js";
import { validateAppModules } from "./validation.js";

function toModuleMap<Modules extends ReadonlyArray<FlowModuleDefinition>>(
  modules: Modules,
): FlowModuleMap<Modules> {
  const moduleMap: Record<string, FlowModuleDefinition> = {};
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

  const id = config.modules.map((module) => module.id).join("+") || "app";
  const moduleMap = Object.freeze(toModuleMap(config.modules));
  let summary: import("../core/api/types.js").FlowAppInventorySummary | undefined;

  let app!: FlowAppDefinition<Modules>;

  app = {
    kind: "app",
    id,
    modules: config.modules,
    moduleMap,
    inventory: () => {
      summary ??= summarizeApp(app);
      return summary;
    },
    layer: <Services extends ReadonlyArray<Layer.Any> = readonly []>(
      layerConfig: import("../core/api/types.js").FlowAppLayerConfig<Services>,
    ): Layer.Layer<
      | NotificationScheduler
      | ResourceStore
      | OrchestratorSystem
      | HostSignals
      | InspectionLog
      | TraceLog
      | Layer.Success<Services[number]>,
      Layer.Error<Services[number]>,
      Layer.Services<Services[number]>
    > => {
      const runtimeInstallers = mergeRuntimeInstallers(
        {
          store: layerConfig.store,
          orchestrators: layerConfig.orchestrators,
        },
        layerConfig.services,
      ) as Layer.Layer<
        NotificationScheduler | HostSignals | Layer.Success<Services[number]>,
        Layer.Error<Services[number]>,
        Layer.Services<Services[number]>
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
      ) as Layer.Layer<
        | NotificationScheduler
        | ResourceStore
        | OrchestratorSystem
        | HostSignals
        | InspectionLog
        | TraceLog
        | Layer.Success<Services[number]>,
        Layer.Error<Services[number]>,
        Layer.Services<Services[number]>
      >;
    },
  } satisfies FlowAppDefinition<Modules>;

  return Object.freeze(app);
}
