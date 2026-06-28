import { Layer } from "effect";

import type { FlowAppDefinition, FlowModuleDefinition, FlowModuleMap } from "../public/types.js";
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
): FlowModuleMap<Modules> {
  const moduleMap = {} as {
    [Id in Modules[number]["id"]]: Extract<Modules[number], { readonly id: Id }>;
  };
  for (const module of modules) {
    moduleMap[module.id as Modules[number]["id"]] = module as Extract<
      Modules[number],
      { readonly id: typeof module.id }
    >;
  }
  return moduleMap;
}

function hasLayers(
  services: ReadonlyArray<Layer.Any> | undefined,
): services is readonly [Layer.Layer<never, any, any>, ...Array<Layer.Layer<never, any, any>>] {
  return services !== undefined && services.length > 0;
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
      layerConfig: import("../public/types.js").FlowAppLayerConfig<Services>,
    ): Layer.Layer<
      | NotificationScheduler
      | ResourceStore
      | OrchestratorSystem
      | HostSignals
      | TraceLog
      | Layer.Success<Services[number]>,
      Layer.Error<Services[number]>,
      Layer.Services<Services[number]>
    > => {
      void layerConfig.store;
      void layerConfig.orchestrators;

      const hostSignals =
        layerConfig.orchestrators.mode === "test" ? HostSignals.testLayer : HostSignals.liveLayer;
      const defaultNotificationScheduler =
        layerConfig.store.mode === "test"
          ? NotificationScheduler.testLayer
          : NotificationScheduler.liveLayer;
      const customServices = hasLayers(layerConfig.services) ? layerConfig.services : undefined;
      const installedServices = (
        customServices !== undefined
          ? Layer.mergeAll(defaultNotificationScheduler, ...customServices)
          : defaultNotificationScheduler
      ) as Layer.Layer<
        NotificationScheduler | Layer.Success<Services[number]>,
        Layer.Error<Services[number]>,
        Layer.Services<Services[number]>
      >;
      const appOwnership = FlowAppOwnership.fromApp(app);
      const resourceStore = ResourceStore.layer.pipe(
        Layer.provide(Layer.mergeAll(installedServices, hostSignals)),
      );
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
      );
    },
  } satisfies FlowAppDefinition<Modules>;

  return Object.freeze(app);
}
