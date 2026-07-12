import type { Layer } from "effect";

import type { OrchestratorSystem } from "../../orchestrator/orchestrator-system.js";
import type { HostSignals } from "./host-signals.js";
import type { InspectionLog } from "./inspection.js";
import type { NotificationScheduler } from "./notification-scheduler.js";
import type { ResourceStore } from "./resource-store.js";
import type { TraceLog } from "./trace.js";

export type FlowRuntimeCoreServices = ResourceStore | OrchestratorSystem | InspectionLog;

export type FlowRuntimeHostServices = NotificationScheduler | HostSignals | TraceLog;

export type FlowRuntimeDefaultServices = FlowRuntimeCoreServices | FlowRuntimeHostServices;

export type FlowRuntimeAdditionalServices<RuntimeServices> = Exclude<
  RuntimeServices,
  FlowRuntimeCoreServices
>;

export type FlowRuntimeAdditionalServiceOutputs<Services extends ReadonlyArray<Layer.Any>> =
  Services extends readonly [
    infer Head extends Layer.Any,
    ...infer Tail extends ReadonlyArray<Layer.Any>,
  ]
    ? Layer.Success<Head> | FlowRuntimeAdditionalServiceOutputs<Tail>
    : never;

export type FlowRuntimeAdditionalServiceErrors<Services extends ReadonlyArray<Layer.Any>> =
  Services extends readonly [
    infer Head extends Layer.Any,
    ...infer Tail extends ReadonlyArray<Layer.Any>,
  ]
    ? Layer.Error<Head> | FlowRuntimeAdditionalServiceErrors<Tail>
    : never;

export type FlowRuntimeAdditionalServiceRequirementsAfter<
  Services extends ReadonlyArray<Layer.Any>,
  Provided,
> = Services extends readonly [
  infer Head extends Layer.Any,
  ...infer Tail extends ReadonlyArray<Layer.Any>,
]
  ?
      | Exclude<Layer.Services<Head>, Provided>
      | FlowRuntimeAdditionalServiceRequirementsAfter<Tail, Provided | Layer.Success<Head>>
  : never;

export type FlowRuntimeAdditionalServiceRequirements<Services extends ReadonlyArray<Layer.Any>> =
  FlowRuntimeAdditionalServiceRequirementsAfter<Services, never>;

export type FlowRuntimeInstallerOutputs<Services extends ReadonlyArray<Layer.Any>> =
  | NotificationScheduler
  | HostSignals
  | FlowRuntimeAdditionalServiceOutputs<Services>;

export type FlowRuntimeInstallerErrors<Services extends ReadonlyArray<Layer.Any>> =
  FlowRuntimeAdditionalServiceErrors<Services>;

export type FlowRuntimeInstallerRequirements<Services extends ReadonlyArray<Layer.Any>> =
  FlowRuntimeAdditionalServiceRequirementsAfter<Services, NotificationScheduler | HostSignals>;

export type FlowAppLayerOutputs<Services extends ReadonlyArray<Layer.Any>> =
  | FlowRuntimeDefaultServices
  | FlowRuntimeAdditionalServiceOutputs<Services>;

export type FlowAppLayerErrors<Services extends ReadonlyArray<Layer.Any>> =
  FlowRuntimeAdditionalServiceErrors<Services>;

export type FlowAppLayerRequirements<Services extends ReadonlyArray<Layer.Any>> =
  FlowRuntimeInstallerRequirements<Services>;

export type FlowRuntimeServiceLayer<Services, Error = never, Requirements = never> = Layer.Layer<
  Services,
  Error,
  Requirements
>;

export type FlowRuntimeLayerKind = "succeed" | "effect" | "scoped";

export type FlowRuntimeLayerContracts = Readonly<{
  readonly notificationScheduler: FlowRuntimeLayerKind;
  readonly hostSignals: FlowRuntimeLayerKind;
  readonly runtimePolicy: FlowRuntimeLayerKind;
  readonly resourceStore: FlowRuntimeLayerKind;
  readonly inspectionLog: FlowRuntimeLayerKind;
  readonly traceLog: FlowRuntimeLayerKind;
  readonly orchestratorSystem: FlowRuntimeLayerKind;
}>;

export const flowRuntimeLayerContracts = Object.freeze({
  notificationScheduler: "succeed",
  hostSignals: "effect",
  runtimePolicy: "effect",
  resourceStore: "effect",
  inspectionLog: "effect",
  traceLog: "effect",
  orchestratorSystem: "effect",
} satisfies FlowRuntimeLayerContracts);
