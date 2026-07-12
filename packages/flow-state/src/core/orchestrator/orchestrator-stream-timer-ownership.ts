import { applyAfterTransitionWithMeta } from "../machines/machine-transition.js";
import type {
  FlowAfterDefinition,
  FlowEvent,
  FlowIssue,
  FlowInvokeDescriptor,
  FlowMachine,
  FlowReceipt,
  FlowSnapshot,
  FlowTransitionRuntime,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import { createStreamTimerController } from "./orchestrator-streams-timers.js";
import { timerOutcomeReceiptFacts } from "./stream-timer-inspection-facts.js";
import type { OwnedEffectRunner } from "../runtime/owned-effect-runner.js";

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type StreamTimerOwnershipDeps<Machine extends FlowMachine> = Readonly<{
  readonly actorId: string;
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
  ) => ReadonlyArray<Extract<FlowInvokeDescriptor, { readonly kind: "stream" }>>;
  readonly aftersForState: (
    snapshot: SnapshotForMachine<Machine>,
  ) => ReadonlyArray<FlowAfterDefinition<string, unknown, FlowEvent>>;
  readonly transitionRuntime: FlowTransitionRuntime;
  readonly annotateMachineEventReceipts: (
    previousReceiptCount: number,
    nextSnapshot: SnapshotForMachine<Machine>,
    correlationId: string,
    sourceActorId?: string,
  ) => SnapshotForMachine<Machine>;
  readonly reconcileStateOwnedWork: (
    previous: SnapshotForMachine<Machine>,
    next: SnapshotForMachine<Machine>,
    reentered: boolean,
  ) => SnapshotForMachine<Machine>;
  readonly createCorrelationId: (kind: "event" | "restore") => string;
}>;

export function createStreamTimerOwnershipController<Machine extends FlowMachine>(
  deps: StreamTimerOwnershipDeps<Machine>,
) {
  return createStreamTimerController<Machine>({
    currentSnapshot: deps.currentSnapshot,
    replaceSnapshot: deps.replaceSnapshot,
    currentIssues: deps.currentIssues,
    replaceIssues: deps.replaceIssues,
    dispatchOwnedMachineEvent: deps.dispatchOwnedMachineEvent,
    enqueue: deps.enqueue,
    currentCorrelationId: deps.currentCorrelationId,
    isDisposed: deps.isDisposed,
    now: deps.now,
    runEffect: deps.runEffect,
    invokeArgsForSnapshot: deps.invokeArgsForSnapshot,
    streamsForState: deps.streamsForState,
    aftersForState: deps.aftersForState,
    applyAfterTransition: (current, definition, entry) => {
      const applied = applyAfterTransitionWithMeta(
        Object.freeze({
          ...current,
          timers: {
            ...current.timers,
            [definition.id]: {
              id: definition.id,
              status: "fired",
              generation: entry.generation,
              parentState: entry.parentState,
              startedAt: entry.startedAt,
              dueAt: entry.dueAt,
              endedAt: entry.endedAt,
            },
          },
          receipts: [
            ...current.receipts,
            receiptWithCorrelation(
              {
                type: "timer:fire",
                id: definition.id,
                generation: entry.generation,
                parentState: entry.parentState,
                ...timerOutcomeReceiptFacts(
                  entry.startedAt,
                  entry.dueAt,
                  entry.endedAt,
                  entry.restored,
                ),
              } satisfies FlowReceipt,
              entry.correlationId,
            ),
          ],
        }) as SnapshotForMachine<Machine>,
        definition,
        deps.transitionRuntime,
      );
      return deps.annotateMachineEventReceipts(
        current.receipts.length,
        deps.reconcileStateOwnedWork(
          current,
          applied.snapshot as SnapshotForMachine<Machine>,
          applied.reentered,
        ),
        deps.createCorrelationId("event"),
        deps.actorId,
      );
    },
  });
}
