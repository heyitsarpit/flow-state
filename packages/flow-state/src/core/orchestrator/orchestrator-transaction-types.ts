import type { Effect, Exit } from "effect";

import type {
  AnyFlowMachine,
  FlowIssue,
  FlowPreviewPatch,
  FlowRuntimeTransactionAttempt,
  FlowRuntimeTransactionDefinition,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import type { ResourceStore } from "../runtime/services/resource-store.js";
import type { OwnedEffectHandle } from "../runtime/owned-effect-runner.js";
import type { TransactionInspectionOverlapCause } from "./transaction-inspection-facts.js";

export type {
  FlowRuntimeTransactionAttempt,
  FlowRuntimeTransactionDefinition,
} from "../api/types.js";

export type SnapshotForMachine<Machine extends AnyFlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

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

export type TransactionStartOptions<Machine extends AnyFlowMachine> = Readonly<{
  readonly parentState: InferMachineState<Machine>;
  readonly trigger: "state" | "event";
  readonly event?: InferMachineEvent<Machine>;
  readonly stateOwned: boolean;
  readonly correlationId: string | undefined;
}>;

export type TransactionInterruptReason = "dispose" | "restore" | "state-exit";

export type ActiveTransactionEntry<Machine extends AnyFlowMachine = AnyFlowMachine> = Readonly<{
  readonly attempt: FlowRuntimeTransactionAttempt<InferMachineEvent<Machine>>;
  readonly concurrencyKey: string;
  readonly generation: number;
  readonly startedAt: number;
  readonly previewLayers: ReadonlyArray<PreviewOverlayLayer>;
  readonly stateOwned: boolean;
  readonly correlationId: string | undefined;
}> & {
  interrupt: (interruptor?: number) => void;
  awaitExit: Effect.Effect<void, unknown>;
};

export type QueuedTransaction<Machine extends AnyFlowMachine> = Readonly<{
  readonly concurrencyKey: string;
  readonly overlapCause: TransactionInspectionOverlapCause;
  readonly attempt: FlowRuntimeTransactionAttempt<InferMachineEvent<Machine>>;
  readonly options: TransactionStartOptions<Machine>;
}>;

export type TransactionStartRegistry<Machine extends AnyFlowMachine> = Readonly<{
  readonly activeEntries: (id: string) => ReadonlyArray<ActiveTransactionEntry<Machine>>;
  readonly replaceActiveEntries: (
    id: string,
    entries: ReadonlyArray<ActiveTransactionEntry<Machine>>,
  ) => void;
  readonly latestActiveEntry: (id: string) => ActiveTransactionEntry<Machine> | undefined;
  readonly activeEntriesInConcurrencyKey: (
    concurrencyKey: string,
  ) => ReadonlyArray<ActiveTransactionEntry<Machine>>;
  readonly beginAttempt: (
    attempt: QueuedTransaction<Machine>["attempt"],
  ) => Readonly<{ readonly concurrencyKey: string; readonly generation: number }>;
  readonly queue: (queued: QueuedTransaction<Machine>) => void;
  readonly queueSize: (concurrencyKey: string) => number;
  readonly dequeue: (concurrencyKey: string) => QueuedTransaction<Machine> | undefined;
  readonly clearQueue: (concurrencyKey: string) => void;
  readonly isSnapshotOwner: (id: string, generation: number) => boolean;
}>;

export type TransactionPreviewController<Machine extends AnyFlowMachine> = Readonly<{
  readonly apply: (
    current: SnapshotForMachine<Machine>,
    attemptDefinition: FlowRuntimeTransactionAttempt<InferMachineEvent<Machine>>,
    correlationId: string | undefined,
    attempt: Readonly<{ readonly generation: number; readonly queueKey: string }>,
  ) => Readonly<{
    readonly snapshot: SnapshotForMachine<Machine>;
    readonly previewLayers: ActiveTransactionEntry<Machine>["previewLayers"];
    readonly previewFailure: Exit.Failure<unknown, unknown> | undefined;
  }>;
  readonly commit: (previewLayers: ActiveTransactionEntry<Machine>["previewLayers"]) => void;
  readonly rollback: (
    current: SnapshotForMachine<Machine>,
    attemptDefinition: FlowRuntimeTransactionAttempt<InferMachineEvent<Machine>>,
    previewLayers: ActiveTransactionEntry<Machine>["previewLayers"],
    correlationId: string | undefined,
    attempt: Readonly<{ readonly generation: number; readonly queueKey: string }>,
  ) => SnapshotForMachine<Machine>;
}>;

export type TransactionAttempt<Machine extends AnyFlowMachine = AnyFlowMachine> =
  FlowRuntimeTransactionAttempt<InferMachineEvent<Machine>>;

export type EffectRunner = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  onExit?: (exit: Exit.Exit<A, E>) => void,
) => OwnedEffectHandle;

export type SyncExitRunner = <A, E, R>(effect: Effect.Effect<A, E, R>) => Exit.Exit<A, E>;

export type TransactionControllerDeps<Machine extends AnyFlowMachine> = Readonly<{
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
      readonly transaction: FlowRuntimeTransactionDefinition<InferMachineEvent<Machine>>;
    }>
  >;
}>;
