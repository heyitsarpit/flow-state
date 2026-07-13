import { Exit } from "effect";
import type { Exit as ExitModel } from "effect";

import type { FlowMachine, FlowReceipt, FlowTransactionSnapshot } from "../api/types.js";
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
  resolveFailedTransactionCompletion,
  resolveSuccessTransactionRoute,
  transactionReceiptTypeForLane,
} from "./orchestrator-transaction-outcome.js";
import type {
  ActiveTransactionEntry,
  QueuedTransaction,
  SnapshotForMachine,
  TransactionControllerDeps,
  TransactionStartOptions,
  UnknownFlowTransactionDefinition,
} from "./orchestrator-transaction-types.js";

type CompletionRegistry<Machine extends FlowMachine> = Readonly<{
  readonly activeEntries: (id: string) => ReadonlyArray<ActiveTransactionEntry>;
  readonly replaceActiveEntries: (
    id: string,
    entries: ReadonlyArray<ActiveTransactionEntry>,
  ) => void;
  readonly dequeue: (concurrencyKey: string) => QueuedTransaction<Machine> | undefined;
  readonly isSnapshotOwner: (id: string, generation: number) => boolean;
}>;

type PreviewCompletionController<Machine extends FlowMachine> = Readonly<{
  readonly commit: (previewLayers: ActiveTransactionEntry["previewLayers"]) => void;
  readonly rollback: (
    current: SnapshotForMachine<Machine>,
    definition: UnknownFlowTransactionDefinition,
    previewLayers: ActiveTransactionEntry["previewLayers"],
    correlationId: string | undefined,
    attempt: Readonly<{
      readonly generation: number;
      readonly queueKey: string;
    }>,
  ) => SnapshotForMachine<Machine>;
}>;

type RestartResolvedTransaction<Machine extends FlowMachine> = (
  current: SnapshotForMachine<Machine>,
  definition: UnknownFlowTransactionDefinition,
  params: unknown,
  options: TransactionStartOptions<Machine>,
  dequeuedOverlapCause?: TransactionInspectionOverlapCause,
) => SnapshotForMachine<Machine>;

export function createTransactionCompletionHandler<Machine extends FlowMachine>(
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
  const resumeQueuedTransaction = (activeTransaction: ActiveTransactionEntry) => {
    const queued = registry.dequeue(activeTransaction.concurrencyKey);
    if (queued === undefined) {
      return;
    }

    const latestSnapshot = deps.currentSnapshot();
    deps.replaceSnapshot(
      restartResolvedTransaction(
        latestSnapshot,
        queued.definition,
        queued.params,
        {
          ...queued.options,
          parentState: latestSnapshot.value,
        },
        queued.overlapCause,
      ),
      true,
    );
  };

  const handleExit = (
    definition: UnknownFlowTransactionDefinition,
    params: unknown,
    generation: number,
    exit: ExitModel.Exit<unknown, unknown>,
  ) => {
    deps.enqueue(() => {
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
        previewController.commit(activeTransaction.previewLayers);
        const routedEvent = resolveSuccessTransactionRoute<Machine>(definition, exit.value);
        const completedAt = deps.now();
        if (!isSnapshotOwner) {
          return;
        }

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
            params,
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
      const completion = resolveFailedTransactionCompletion<Machine>(definition, exit, {
        correlationId: activeTransaction.correlationId,
        parentState: latestSnapshot.value,
        receipts: latestSnapshot.receipts,
      });
      const completedAt = deps.now();
      const failureReceipt = receiptWithCorrelation(
        {
          type: transactionReceiptTypeForLane(completion.lane),
          id: definition.id,
          generation,
          queueKey: activeTransaction.concurrencyKey,
          ...transactionTimingFacts(activeTransaction.startedAt, completedAt),
          ...(transactionRoutedEventType(completion.routedEvent) === undefined
            ? {}
            : { routedEventType: transactionRoutedEventType(completion.routedEvent) }),
          parentState: latestSnapshot.value,
        } satisfies FlowReceipt,
        activeTransaction.correlationId,
      );
      if (isSnapshotOwner) {
        deps.replaceIssues(
          replaceIssue(deps.currentIssues(), {
            ...completion.issue,
            handled: completion.routedEvent !== undefined,
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
                    : ({
                        id: definition.id,
                        status: "failure",
                        ...(completion.issue.error === undefined
                          ? {}
                          : { error: completion.issue.error }),
                      } satisfies FlowTransactionSnapshot),
              }
            : latestSnapshot.transactions,
          receipts: [...latestSnapshot.receipts, failureReceipt],
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

      if (completion.routedEvent !== undefined && isSnapshotOwner) {
        deps.dispatchOwnedMachineEvent(completion.routedEvent);
      }
    });
  };

  return {
    handleExit,
  } as const;
}
