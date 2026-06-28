import { Layer } from "effect";

import type { FlowAppDefinition, FlowModuleDefinition } from "../public/types.js";
import { FlowAppOwnership } from "../services/app-ownership.js";
import { HostSignals } from "../services/host-signals.js";
import { NotificationScheduler } from "../services/notification-scheduler.js";
import { OrchestratorSystem } from "../services/orchestrator-system.js";
import { ResourceStore } from "../services/resource-store.js";
import { TraceLog } from "../services/trace.js";
import { summarizeApp } from "./inventory.js";
import { validateAppModules } from "./validation.js";

function toModuleMap<Modules extends ReadonlyArray<FlowModuleDefinition>>(
  modules: Modules,
): Record<Modules[number]["id"], Modules[number]> {
  const moduleMap = {} as Record<Modules[number]["id"], Modules[number]>;
  for (const module of modules) {
    moduleMap[module.id as Modules[number]["id"]] = module;
  }
  return moduleMap;
}

function mergeCustomServices<Services extends ReadonlyArray<Layer.Any>>(
  services: Services | undefined,
): Layer.Layer<Layer.Success<Services[number]>, Layer.Error<Services[number]>> {
  let merged = Layer.empty as unknown as Layer.Layer<
    Layer.Success<Services[number]>,
    Layer.Error<Services[number]>
  >;

  for (const service of services ?? []) {
    merged = Layer.mergeAll(
      merged,
      service as unknown as Layer.Layer<any, any, any>,
    ) as Layer.Layer<Layer.Success<Services[number]>, Layer.Error<Services[number]>>;
  }

  return merged;
}

export function createAppDefinition<const Modules extends ReadonlyArray<FlowModuleDefinition>>(
  config: Readonly<{
    readonly modules: Modules;
  }>,
): FlowAppDefinition<Modules> {
  validateAppModules(config.modules);

  const id = config.modules.map((module) => module.id).join("+") || "app";
  const moduleMap = Object.freeze(toModuleMap(config.modules));
  let summary: import("../public/types.js").FlowAppInventorySummary | undefined;

  const app = {
    kind: "app",
    id,
    modules: config.modules,
    moduleMap,
    inventory: () => {
      summary ??= summarizeApp(app);
      return summary;
    },
    layer: <Services extends ReadonlyArray<Layer.Any> = readonly []>(
      layerConfig: import("../public/types.js").FlowAppLayerConfig<Services>,
    ) => {
      void layerConfig.store;
      void layerConfig.orchestrators;

      const services = mergeCustomServices(layerConfig.services);
      const hostSignals =
        layerConfig.orchestrators.mode === "test" ? HostSignals.testLayer : HostSignals.liveLayer;
      const defaultNotificationScheduler =
        layerConfig.store.mode === "test"
          ? NotificationScheduler.testLayer
          : NotificationScheduler.liveLayer;
      const installedServices = Layer.mergeAll(
        defaultNotificationScheduler,
        services,
      ) as Layer.Layer<
        NotificationScheduler | Layer.Success<Services[number]>,
        Layer.Error<Services[number]>
      >;
      const appOwnership = FlowAppOwnership.fromApp(app);
      const resourceStore = ResourceStore.layer.pipe(Layer.provide(installedServices));
      const traceLog = TraceLog.layer;
      const orchestratorSystem = OrchestratorSystem.layer.pipe(
        Layer.provide(
          Layer.mergeAll(installedServices, resourceStore, hostSignals, traceLog, appOwnership),
        ),
      );

      return Layer.mergeAll(
        installedServices,
        resourceStore,
        orchestratorSystem,
        hostSignals,
        traceLog,
        appOwnership,
      ) as Layer.Layer<
        | NotificationScheduler
        | ResourceStore
        | OrchestratorSystem
        | HostSignals
        | TraceLog
        | Layer.Success<Services[number]>,
        Layer.Error<Services[number]>
      >;
    },
  } satisfies FlowAppDefinition<Modules>;

  return Object.freeze(app);
}
