import { Context, Effect, Layer } from "effect";

import type { FlowOrchestratorDescriptor, FlowStoreDescriptor } from "../core/api/types.js";
import { HostSignals, type HostSignalsService } from "./host-signals.js";
import {
  NotificationScheduler,
  type NotificationSchedulerService,
} from "./notification-scheduler.js";

export type FlowRuntimePolicyConfig = Readonly<{
  readonly store: FlowStoreDescriptor;
  readonly orchestrators: FlowOrchestratorDescriptor;
}>;

type InstallableLayer<LayerType extends Layer.Any> = Layer.Layer<
  Layer.Success<LayerType>,
  Layer.Error<LayerType>,
  Layer.Services<LayerType>
>;

function notificationSchedulerLayerForPolicy(
  policy: FlowRuntimePolicyConfig,
): Layer.Layer<NotificationScheduler, never, never> {
  return policy.store.mode === "test"
    ? NotificationScheduler.testLayer
    : NotificationScheduler.liveLayer;
}

function hostSignalsLayerForPolicy(
  policy: FlowRuntimePolicyConfig,
): Layer.Layer<HostSignals, never, never> {
  return policy.orchestrators.mode === "test" ? HostSignals.testLayer : HostSignals.liveLayer;
}

export function mergeRuntimeInstallers<Services extends ReadonlyArray<Layer.Any>>(
  policy: FlowRuntimePolicyConfig,
  services: Services | undefined,
): Layer.Layer<
  NotificationScheduler | HostSignals | Layer.Success<Services[number]>,
  Layer.Error<Services[number]>,
  Layer.Services<Services[number]>
> {
  const defaultInstallers = [
    notificationSchedulerLayerForPolicy(policy),
    hostSignalsLayerForPolicy(policy),
  ] as const;

  if (services === undefined || services.length === 0) {
    return Layer.mergeAll(...defaultInstallers) as Layer.Layer<
      NotificationScheduler | HostSignals | Layer.Success<Services[number]>,
      Layer.Error<Services[number]>,
      Layer.Services<Services[number]>
    >;
  }

  const installedLayers = services as unknown as readonly [
    InstallableLayer<Services[number]>,
    ...Array<InstallableLayer<Services[number]>>,
  ];

  return Layer.mergeAll(...defaultInstallers, ...installedLayers) as Layer.Layer<
    NotificationScheduler | HostSignals | Layer.Success<Services[number]>,
    Layer.Error<Services[number]>,
    Layer.Services<Services[number]>
  >;
}

export class FlowRuntimePolicy extends Context.Service<
  FlowRuntimePolicy,
  {
    readonly store: FlowStoreDescriptor;
    readonly orchestrators: FlowOrchestratorDescriptor;
    readonly notificationScheduler: NotificationSchedulerService;
    readonly hostSignals: HostSignalsService;
  }
>()("@flow-state/core/FlowRuntimePolicy") {
  static readonly layer = (config: FlowRuntimePolicyConfig) =>
    Layer.effect(
      FlowRuntimePolicy,
      Effect.gen(function* () {
        const notificationScheduler = yield* NotificationScheduler;
        const hostSignals = yield* HostSignals;

        return FlowRuntimePolicy.of({
          store: config.store,
          orchestrators: config.orchestrators,
          notificationScheduler,
          hostSignals,
        });
      }),
    );
}
