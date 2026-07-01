import type { Layer } from "effect";

import { flow as coreFlow } from "@flow-state/core";
import type {
  FlowActorSnapshotTree,
  FlowResourceHydrationEntry,
  FlowRuntime,
  RuntimeReadyLayer,
} from "@flow-state/core";

export { createKey, createTag, flow, selectView } from "@flow-state/core";

export type {
  FlowActionDefinition,
  FlowActor,
  FlowActorSnapshotTree,
  FlowActorStartOptions,
  FlowAppDefinition,
  FlowAppLayerConfig,
  FlowChildDefinition,
  FlowConcurrencyPolicy,
  FlowEnsureDefinition,
  FlowEvent,
  FlowEventForState,
  FlowEventTransitions,
  FlowInvalidationTarget,
  FlowInvalidateDefinition,
  FlowInvokeDescriptor,
  FlowIssue,
  FlowKey,
  FlowMachine,
  FlowMachineConfig,
  FlowModuleDefinition,
  FlowModuleInventory,
  FlowObserveDefinition,
  FlowOrchestratorDescriptor,
  FlowPatchDefinition,
  FlowPreviewPatch,
  FlowRefreshDefinition,
  FlowResourceDefinition,
  FlowResourceHydrationEntry,
  FlowResourceRef,
  FlowRunDefinition,
  FlowRuntime,
  FlowRuntimeOrchestrators,
  FlowRuntimeResources,
  FlowSeededResource,
  FlowSnapshot,
  FlowStoreDescriptor,
  FlowStreamDefinition,
  FlowTag,
  FlowTimerStatus,
  FlowTransactionConfig,
  FlowTransactionDefinition,
  FlowTransitionArgs,
  FlowViewConfig,
  FlowViewDefinition,
  FlowViewSource,
  HostSignals,
  InspectionLog,
  NotificationScheduler,
  OrchestratorSystem,
  ResourceStore,
  RuntimeReadyLayer,
  SelectionSource,
  TraceLog,
} from "@flow-state/core";

export type FlowRuntimeBootActorSnapshot = Readonly<{
  readonly id: string;
  readonly snapshot: FlowActorSnapshotTree;
}>;

export type FlowRuntimeBootOptions = Readonly<{
  readonly actors?: ReadonlyArray<{
    readonly id: string;
    readonly serialize: () => FlowActorSnapshotTree;
  }>;
}>;

export type FlowRuntimeBootPayload = Readonly<{
  readonly version: "flow-state/runtime-boot.v1";
  readonly resources: ReadonlyArray<FlowResourceHydrationEntry>;
  readonly actors: ReadonlyArray<FlowRuntimeBootActorSnapshot>;
}>;

export type FlowRuntimeHydratedBoot = Readonly<{
  readonly payload: FlowRuntimeBootPayload;
  readonly actors: Readonly<Record<string, FlowActorSnapshotTree>>;
  readonly actorSnapshot: (id: string) => FlowActorSnapshotTree | undefined;
}>;

export async function withRequestRuntime<AppLayer extends Layer.Any, Result>(
  layer: RuntimeReadyLayer<AppLayer>,
  handler: (
    runtime: FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>,
  ) => Result | Promise<Result>,
): Promise<Result> {
  const runtime = coreFlow.runtime(layer);

  try {
    return await handler(runtime);
  } finally {
    await runtime.dispose();
  }
}
