import type { Effect, Exit } from "effect";

import type {
  FlowEvent,
  FlowIssue,
  FlowMachine,
  FlowPreviewPatch,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowSnapshot,
  FlowTransactionDefinition,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import type { ResourceStore } from "../runtime/services/resource-store.js";
import type { TransactionInspectionOverlapCause } from "./transaction-inspection-facts.js";

export type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

export type UnknownFlowTransactionDefinition<Event extends FlowEvent = FlowEvent> =
  FlowTransactionDefinition<string, unknown, unknown, unknown, unknown, Event>;

export type ResourceStoreService = Parameters<(typeof ResourceStore)["of"]>[0];

export type PreviewOverlayLayer = Readonly<{
  readonly ref: FlowResourceRef;
  readonly patch: FlowPreviewPatch;
  readonly order: number;
  readonly state: "active" | "committed";
}>;

export type PreviewOverlay = Readonly<{
  readonly rootSnapshot: FlowResourceSnapshot | undefined;
  readonly layers: ReadonlyArray<PreviewOverlayLayer>;
}>;

export type TransactionStartOptions<Machine extends FlowMachine> = Readonly<{
  readonly parentState: InferMachineState<Machine>;
  readonly trigger: "state" | "event";
  readonly event?: InferMachineEvent<Machine>;
  readonly stateOwned: boolean;
  readonly correlationId: string | undefined;
}>;

export type ActiveTransactionEntry = Readonly<{
  readonly definition: UnknownFlowTransactionDefinition;
  readonly concurrencyKey: string;
  readonly generation: number;
  readonly startedAt: number;
  readonly previewLayers: ReadonlyArray<PreviewOverlayLayer>;
  readonly stateOwned: boolean;
  readonly correlationId: string | undefined;
}> & {
  interrupt: (interruptor?: number) => void;
};

export type QueuedTransaction<Machine extends FlowMachine> = Readonly<{
  readonly concurrencyKey: string;
  readonly overlapCause: TransactionInspectionOverlapCause;
  readonly definition: UnknownFlowTransactionDefinition;
  readonly params: unknown;
  readonly options: TransactionStartOptions<Machine>;
}>;

export type TransactionAttempt = Readonly<{
  readonly definition: UnknownFlowTransactionDefinition;
  readonly params: unknown;
}>;

export type EffectRunner = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  onExit?: (exit: Exit.Exit<A, E>) => void,
) => (interruptor?: number) => void;

export type SyncExitRunner = <A, E, R>(effect: Effect.Effect<A, E, R>) => Exit.Exit<A, E>;

export type TransactionControllerDeps<Machine extends FlowMachine> = Readonly<{
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
  readonly runSyncExit: SyncExitRunner;
  readonly resourceStore: ResourceStoreService;
  readonly currentResourceSnapshot: (ref: FlowResourceRef) => FlowResourceSnapshot | undefined;
  readonly syncResourceSnapshots: (
    currentResources: Readonly<Record<string, FlowResourceSnapshot>>,
    refs: ReadonlyArray<FlowResourceRef>,
  ) => Record<string, FlowResourceSnapshot>;
  readonly knownResourceRefs: () => Iterable<FlowResourceRef>;
  readonly invokeArgsForSnapshot: (
    snapshot: SnapshotForMachine<Machine>,
  ) => Record<string, unknown>;
  readonly transactionsForState: (snapshot: SnapshotForMachine<Machine>) => ReadonlyArray<
    Readonly<{
      readonly transaction: UnknownFlowTransactionDefinition;
    }>
  >;
}>;
