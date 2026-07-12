import { Context, Effect, Layer } from "effect";

import type { FlowOrchestratorDescriptor, FlowStoreDescriptor } from "../../api/types.js";
import { HostSignals, type HostSignalsService } from "./host-signals.js";
import type {
  FlowRuntimeInstallerErrors,
  FlowRuntimeInstallerOutputs,
  FlowRuntimeInstallerRequirements,
  FlowRuntimeServiceLayer,
} from "./runtime-contracts.js";
import {
  NotificationScheduler,
  type NotificationSchedulerService,
} from "./notification-scheduler.js";

export type FlowRuntimePolicyConfig = Readonly<{
  readonly store: FlowStoreDescriptor;
  readonly orchestrators: FlowOrchestratorDescriptor;
}>;

function mergeCustomInstallers(
  baseInstallers: FlowRuntimeServiceLayer<NotificationScheduler | HostSignals, never, never>,
  services: ReadonlyArray<Layer.Layer<unknown, unknown, unknown>>,
): Layer.Layer<unknown, unknown, unknown> {
  return services.reduce<Layer.Layer<unknown, unknown, unknown>>(
    (installedServices, service) => service.pipe(Layer.provideMerge(installedServices)),
    baseInstallers as unknown as Layer.Layer<unknown, unknown, unknown>,
  );
}

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
): FlowRuntimeServiceLayer<
  FlowRuntimeInstallerOutputs<Services>,
  FlowRuntimeInstallerErrors<Services>,
  FlowRuntimeInstallerRequirements<Services>
> {
  const defaultInstallers = [
    notificationSchedulerLayerForPolicy(policy),
    hostSignalsLayerForPolicy(policy),
  ] as const;
  const defaultInstallerLayer = Layer.mergeAll(...defaultInstallers) as FlowRuntimeServiceLayer<
    NotificationScheduler | HostSignals,
    never,
    never
  >;

  if (services === undefined || services.length === 0) {
    return defaultInstallerLayer as FlowRuntimeServiceLayer<
      FlowRuntimeInstallerOutputs<Services>,
      FlowRuntimeInstallerErrors<Services>,
      FlowRuntimeInstallerRequirements<Services>
    >;
  }

  return mergeCustomInstallers(
    defaultInstallerLayer,
    services as unknown as ReadonlyArray<Layer.Layer<unknown, unknown, unknown>>,
  ) as FlowRuntimeServiceLayer<
    FlowRuntimeInstallerOutputs<Services>,
    FlowRuntimeInstallerErrors<Services>,
    FlowRuntimeInstallerRequirements<Services>
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
>()("flow-state/FlowRuntimePolicy") {
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
