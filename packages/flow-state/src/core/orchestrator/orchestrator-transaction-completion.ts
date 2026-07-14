import { Exit } from "effect";
import type { Exit as ExitModel } from "effect";

import type { AnyFlowMachine, FlowReceipt, FlowTransactionSnapshot } from "../api/types.js";
import { issueFactsFromReceipts } from "../inspection/receipt-summary.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import {
  transactionRoutedEventType,
  transactionTimingFacts,
  type TransactionInspectionOverlapCause,
} from "./transaction-inspection-facts.js";
import { clearIssue, replaceIssue } from "./orchestrator-issues.js";
import { invalidateTransactionTargets } from "./orchestrator-transaction-invalidation.js";
import {
  resolveFailedTransactionIssue,
  transactionReceiptTypeForLane,
} from "./orchestrator-transaction-outcome.js";
import type {
  ActiveTransactionEntry,
  FlowRuntimeTransactionAttempt,
  QueuedTransaction,
  SnapshotForMachine,
  TransactionControllerDeps,
  TransactionStartOptions,
} from "./orchestrator-transaction-types.js";
import type { FlowRuntimeTransactionSettlement } from "../api/types.js";

type CompletionRegistry<Machine extends AnyFlowMachine> = Readonly<{
  readonly activeEntries: (id: string) => ReadonlyArray<ActiveTransactionEntry<Machine>>;
  readonly replaceActiveEntries: (
    id: string,
    entries: ReadonlyArray<ActiveTransactionEntry<Machine>>,
  ) => void;
  readonly dequeue: (concurrencyKey: string) => QueuedTransaction<Machine> | undefined;
  readonly isSnapshotOwner: (id: string, generation: number) => boolean;
}>;

type PreviewCompletionController<Machine extends AnyFlowMachine> = Readonly<{
  readonly commit: (previewLayers: ActiveTransactionEntry["previewLayers"]) => void;
  readonly rollback: (
    current: SnapshotForMachine<Machine>,
    definition: FlowRuntimeTransactionAttempt<import("../api/types.js").InferMachineEvent<Machine>>,
    previewLayers: ActiveTransactionEntry<Machine>["previewLayers"],
    correlationId: string | undefined,
    attempt: Readonly<{
      readonly generation: number;
      readonly queueKey: string;
    }>,
    options?: Readonly<{
      readonly recordReceipt?: boolean;
    }>,
  ) => SnapshotForMachine<Machine>;
}>;

type RestartResolvedTransaction<Machine extends AnyFlowMachine> = (
  current: SnapshotForMachine<Machine>,
  definition: FlowRuntimeTransactionAttempt<import("../api/types.js").InferMachineEvent<Machine>>,
  options: TransactionStartOptions<Machine>,
  dequeuedOverlapCause?: TransactionInspectionOverlapCause,
) => SnapshotForMachine<Machine>;

export function createTransactionCompletionHandler<Machine extends AnyFlowMachine>(
  deps: Pick<
    TransactionControllerDeps<Machine>,
    | "currentSnapshot"
    | "replaceSnapshot"
    | "currentIssues"
    | "replaceIssues"
    | "dispatchOwnedMachineEvent"
    | "enqueue"
    | "isDisposed"
    | "now"
    | "runSyncExit"
    | "resourceStore"
    | "syncResourceSnapshots"
    | "knownResourceRefs"
  >,
  registry: CompletionRegistry<Machine>,
  previewController: PreviewCompletionController<Machine>,
  restartResolvedTransaction: RestartResolvedTransaction<Machine>,
) {
  const resumeQueuedTransaction = (activeTransaction: ActiveTransactionEntry<Machine>) => {
    const queued = registry.dequeue(activeTransaction.concurrencyKey);
    if (queued === undefined) {
      return;
    }

    const latestSnapshot = deps.currentSnapshot();
    deps.replaceSnapshot(
      restartResolvedTransaction(
        latestSnapshot,
        queued.attempt,
        {
          ...queued.options,
          parentState: latestSnapshot.value,
        },
        queued.overlapCause,
      ),
      true,
    );
  };

  const handleSettlement = (
    definition: FlowRuntimeTransactionAttempt<import("../api/types.js").InferMachineEvent<Machine>>,
    generation: number,
    settlement: FlowRuntimeTransactionSettlement<
      import("../api/types.js").InferMachineEvent<Machine>
    >,
  ) => {
    deps.enqueue(() => {
      const exit: ExitModel.Exit<unknown, unknown> = settlement.exit;
      const activeTransaction = registry
        .activeEntries(definition.id)
        .find((candidate) => candidate.generation === generation);
      if (deps.isDisposed() || activeTransaction === undefined) {
        return;
      }

      registry.replaceActiveEntries(
        definition.id,
        registry
          .activeEntries(definition.id)
          .filter((candidate) => candidate.generation !== generation),
      );

      const isSnapshotOwner = registry.isSnapshotOwner(definition.id, generation);
      if (Exit.isSuccess(exit)) {
        const completedAt = deps.now();
        if (!isSnapshotOwner) {
          const hasNewerActiveAttempt = registry
            .activeEntries(definition.id)
            .some((candidate) => candidate.generation > generation);
          if (hasNewerActiveAttempt) {
            previewController.commit(activeTransaction.previewLayers);
            return;
          }
          const latestSnapshot = deps.currentSnapshot();
          deps.replaceSnapshot(
            previewController.rollback(
              latestSnapshot,
              definition,
              activeTransaction.previewLayers,
              activeTransaction.correlationId,
              {
                generation,
                queueKey: activeTransaction.concurrencyKey,
              },
              { recordReceipt: false },
            ),
            true,
          );
          return;
        }
        previewController.commit(activeTransaction.previewLayers);
        const routedEvent = settlement.route();

        const latestSnapshot = deps.currentSnapshot();
        const successSnapshot = Object.freeze({
          ...latestSnapshot,
          transactions: {
            ...latestSnapshot.transactions,
            [definition.id]: {
              id: definition.id,
              status: "success",
              value: exit.value,
            } satisfies FlowTransactionSnapshot,
          },
          receipts: [
            ...latestSnapshot.receipts,
            receiptWithCorrelation(
              {
                type: "transaction:success",
                id: definition.id,
                generation,
                queueKey: activeTransaction.concurrencyKey,
                ...transactionTimingFacts(activeTransaction.startedAt, completedAt),
                ...(transactionRoutedEventType(routedEvent) === undefined
                  ? {}
                  : { routedEventType: transactionRoutedEventType(routedEvent) }),
                parentState: latestSnapshot.value,
              } satisfies FlowReceipt,
              activeTransaction.correlationId,
            ),
          ],
        }) as SnapshotForMachine<Machine>;

        deps.replaceIssues(clearIssue(deps.currentIssues(), "transaction", definition.id));

        deps.replaceSnapshot(
          invalidateTransactionTargets(
            deps,
            successSnapshot,
            definition,
            activeTransaction.correlationId,
          ),
          true,
        );
        resumeQueuedTransaction(activeTransaction);

        if (routedEvent !== undefined) {
          deps.dispatchOwnedMachineEvent(routedEvent);
        }
        return;
      }

      const latestSnapshot = deps.currentSnapshot();
      const completion = resolveFailedTransactionIssue(definition, exit, {
        correlationId: activeTransaction.correlationId,
        parentState: latestSnapshot.value,
        receipts: latestSnapshot.receipts,
      });
      const routedEvent = !isSnapshotOwner ? undefined : settlement.route();
      const completedAt = deps.now();
      const failureReceipt = !isSnapshotOwner
        ? undefined
        : receiptWithCorrelation(
            {
              type: transactionReceiptTypeForLane(completion.lane),
              id: definition.id,
              generation,
              queueKey: activeTransaction.concurrencyKey,
              ...transactionTimingFacts(activeTransaction.startedAt, completedAt),
              ...(transactionRoutedEventType(routedEvent) === undefined
                ? {}
                : { routedEventType: transactionRoutedEventType(routedEvent) }),
              parentState: latestSnapshot.value,
            } satisfies FlowReceipt,
            activeTransaction.correlationId,
          );
      if (failureReceipt !== undefined) {
        deps.replaceIssues(
          replaceIssue(deps.currentIssues(), {
            ...completion.issue,
            handled: routedEvent !== undefined,
            facts: issueFactsFromReceipts(completion.issue.id, {
              correlationId: activeTransaction.correlationId,
              parentState: latestSnapshot.value,
              receipts: [...latestSnapshot.receipts, failureReceipt],
            }),
          }),
        );
      }

      const failedSnapshot = previewController.rollback(
        Object.freeze({
          ...latestSnapshot,
          transactions: isSnapshotOwner
            ? {
                ...latestSnapshot.transactions,
                [definition.id]:
                  completion.lane === "interrupt"
                    ? ({
                        id: definition.id,
                        status: "interrupt",
                      } satisfies FlowTransactionSnapshot)
                    : completion.lane === "failure"
                      ? ({
                          id: definition.id,
                          status: "failure",
                          error: completion.issue.error,
                        } satisfies FlowTransactionSnapshot)
                      : ({
                          id: definition.id,
                          status: "defect",
                        } satisfies FlowTransactionSnapshot),
              }
            : latestSnapshot.transactions,
          receipts:
            failureReceipt === undefined
              ? latestSnapshot.receipts
              : [...latestSnapshot.receipts, failureReceipt],
        }) as SnapshotForMachine<Machine>,
        definition,
        activeTransaction.previewLayers,
        activeTransaction.correlationId,
        {
          generation,
          queueKey: activeTransaction.concurrencyKey,
        },
      );
      deps.replaceSnapshot(failedSnapshot, true);
      resumeQueuedTransaction(activeTransaction);

      if (routedEvent !== undefined) {
        deps.dispatchOwnedMachineEvent(routedEvent);
      }
    });
  };

  return {
    handleSettlement,
  } as const;
}
