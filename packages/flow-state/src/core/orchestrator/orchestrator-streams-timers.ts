import type {
  FlowAfterDefinition,
  FlowEvent,
  FlowIssue,
  FlowInvokeDescriptor,
  FlowMachine,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import type { Effect, Exit } from "effect";
import { createAfterTimerOwnershipController } from "./orchestrator-after-timer-ownership.js";
import { createStreamOwnershipController } from "./orchestrator-stream-ownership.js";

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type AnyFlowAfterDefinition = FlowAfterDefinition<string, unknown, FlowEvent>;
type AnyFlowStreamDefinition = Extract<FlowInvokeDescriptor, { readonly kind: "stream" }>;

type EffectRunner = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  onExit?: (exit: Exit.Exit<A, E>) => void,
) => (interruptor?: number) => void;

type StreamTimerControllerDeps<Machine extends FlowMachine> = Readonly<{
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
  readonly runEffect: EffectRunner;
  readonly invokeArgsForSnapshot: (
    snapshot: SnapshotForMachine<Machine>,
  ) => Record<string, unknown>;
  readonly streamsForState: (
    snapshot: SnapshotForMachine<Machine>,
  ) => ReadonlyArray<AnyFlowStreamDefinition>;
  readonly aftersForState: (
    snapshot: SnapshotForMachine<Machine>,
  ) => ReadonlyArray<AnyFlowAfterDefinition>;
  readonly applyAfterTransition: Parameters<
    typeof createAfterTimerOwnershipController<Machine>
  >[0]["applyAfterTransition"];
}>;

export function createStreamTimerController<Machine extends FlowMachine>(
  deps: StreamTimerControllerDeps<Machine>,
) {
  const afterTimerController = createAfterTimerOwnershipController<Machine>({
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
    rehydrateStateOwnedAfters: afterTimerController.rehydrateStateOwnedAfters,
    rehydrateStateOwnedStreams: streamController.rehydrateStateOwnedStreams,
    startStateOwnedAfters: afterTimerController.startStateOwnedAfters,
    startStateOwnedStreams: streamController.startStateOwnedStreams,
    stopStateOwnedAfters: afterTimerController.stopStateOwnedAfters,
    stopStateOwnedStreams: streamController.stopStateOwnedStreams,
  };
}
