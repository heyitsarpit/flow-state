import type {
  AnyFlowMachine,
  FlowAfterDefinition,
  FlowIssue,
  FlowInvokeDescriptor,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import { createAfterTimerOwnershipController } from "./orchestrator-after-timer-ownership.js";
import { createStreamOwnershipController } from "./orchestrator-stream-ownership.js";
import type { OwnedEffectRunner } from "../runtime/owned-effect-runner.js";

type SnapshotForMachine<Machine extends AnyFlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type AfterDefinitionForMachine<Machine extends AnyFlowMachine> = FlowAfterDefinition<
  InferMachineState<Machine>,
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>
>;
type AnyFlowStreamDefinition = Extract<FlowInvokeDescriptor, { readonly kind: "stream" }>;

type StreamTimerControllerDeps<Machine extends AnyFlowMachine> = Readonly<{
  readonly generationSeedSnapshot?: SnapshotForMachine<Machine>;
  readonly currentSnapshot: () => SnapshotForMachine<Machine>;
  readonly replaceSnapshot: (
    next: SnapshotForMachine<Machine>,
    notifyListenersAfter?: boolean,
  ) => void;
  readonly currentIssues: () => ReadonlyArray<FlowIssue>;
  readonly replaceIssues: (
    nextIssues: ReadonlyArray<FlowIssue>,
    notifyListenersAfter?: boolean,
  ) => void;
  readonly dispatchOwnedMachineEvent: (event: InferMachineEvent<Machine>) => void;
  readonly enqueue: (work: () => void) => void;
  readonly currentCorrelationId: () => string | undefined;
  readonly isDisposed: () => boolean;
  readonly now: () => number;
  readonly runEffect: OwnedEffectRunner;
  readonly invokeArgsForSnapshot: (
    snapshot: SnapshotForMachine<Machine>,
  ) => Record<string, unknown>;
  readonly streamsForState: (
    snapshot: SnapshotForMachine<Machine>,
  ) => ReadonlyArray<AnyFlowStreamDefinition>;
  readonly aftersForState: (
    snapshot: SnapshotForMachine<Machine>,
  ) => ReadonlyArray<AfterDefinitionForMachine<Machine>>;
  readonly applyAfterTransition: Parameters<
    typeof createAfterTimerOwnershipController<Machine>
  >[0]["applyAfterTransition"];
}>;

export function createStreamTimerController<Machine extends AnyFlowMachine>(
  deps: StreamTimerControllerDeps<Machine>,
) {
  const afterTimerController = createAfterTimerOwnershipController<Machine>({
    ...(deps.generationSeedSnapshot === undefined
      ? {}
      : { generationSeedSnapshot: deps.generationSeedSnapshot }),
    currentSnapshot: deps.currentSnapshot,
    replaceSnapshot: deps.replaceSnapshot,
    enqueue: deps.enqueue,
    currentCorrelationId: deps.currentCorrelationId,
    isDisposed: deps.isDisposed,
    now: deps.now,
    runEffect: deps.runEffect,
    aftersForState: deps.aftersForState,
    applyAfterTransition: deps.applyAfterTransition,
  });

  const streamController = createStreamOwnershipController<Machine>({
    ...(deps.generationSeedSnapshot === undefined
      ? {}
      : { generationSeedSnapshot: deps.generationSeedSnapshot }),
    currentSnapshot: deps.currentSnapshot,
    replaceSnapshot: deps.replaceSnapshot,
    currentIssues: deps.currentIssues,
    replaceIssues: deps.replaceIssues,
    dispatchOwnedMachineEvent: deps.dispatchOwnedMachineEvent,
    enqueue: deps.enqueue,
    currentCorrelationId: deps.currentCorrelationId,
    isDisposed: deps.isDisposed,
    runEffect: deps.runEffect,
    invokeArgsForSnapshot: deps.invokeArgsForSnapshot,
    streamsForState: deps.streamsForState,
  });

  return {
    drainInterruptedFinalizers: () => [
      ...afterTimerController.drainInterruptedFinalizers(),
      ...streamController.drainInterruptedFinalizers(),
    ],
    rehydrateStateOwnedAfters: afterTimerController.rehydrateStateOwnedAfters,
    rehydrateStateOwnedStreams: streamController.rehydrateStateOwnedStreams,
    startStateOwnedAfters: afterTimerController.startStateOwnedAfters,
    startStateOwnedStreams: streamController.startStateOwnedStreams,
    stopStateOwnedAfters: afterTimerController.stopStateOwnedAfters,
    stopStateOwnedStreams: streamController.stopStateOwnedStreams,
  };
}
