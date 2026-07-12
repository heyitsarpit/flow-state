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
