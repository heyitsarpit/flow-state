import type { Exit } from "effect";

import type { FlowMachine, FlowReceipt, FlowTransactionSnapshot } from "../api/types.js";
import { rejectedWhileRunningTransactionDiagnostic } from "../../shared/diagnostics.js";
import { issueFactsFromReceipts } from "../inspection/receipt-summary.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import {
  type TransactionInspectionOverlapCause,
  transactionTimingFacts,
} from "./transaction-inspection-facts.js";
import { clearIssue, replaceIssue } from "./orchestrator-issues.js";
import {
  resolveFailedTransactionIssue,
  transactionReceiptTypeForLane,
} from "./orchestrator-transaction-outcome.js";
import type {
  QueuedTransaction,
  SnapshotForMachine,
  TransactionControllerDeps,
  TransactionPreviewController,
  TransactionStartRegistry,
  UnknownFlowTransactionDefinition,
} from "./orchestrator-transaction-types.js";

export function queueTransaction<Machine extends FlowMachine>(
  registry: TransactionStartRegistry<Machine>,
  current: SnapshotForMachine<Machine>,
  queued: QueuedTransaction<Machine>,
): SnapshotForMachine<Machine> {
  registry.queue(queued);
  return Object.freeze({
    ...current,
    receipts: [
      ...current.receipts,
      receiptWithCorrelation(
        {
          type: "transaction:queue",
          id: queued.definition.id,
          queueKey: queued.concurrencyKey,
          overlapCause: queued.overlapCause,
          parentState: queued.options.parentState,
        } satisfies FlowReceipt,
        queued.options.correlationId,
      ),
    ],
  });
}

export function failPreviewPublication<Machine extends FlowMachine>(
  deps: Pick<TransactionControllerDeps<Machine>, "currentIssues" | "replaceIssues" | "now">,
  current: SnapshotForMachine<Machine>,
  definition: UnknownFlowTransactionDefinition,
  generation: number,
  startedAt: number,
  concurrencyKey: string,
  correlationId: string | undefined,
  exit: Exit.Failure<unknown, unknown>,
): SnapshotForMachine<Machine> {
  const completion = resolveFailedTransactionIssue(definition, exit, {
    correlationId,
    parentState: current.value,
    receipts: current.receipts,
  });
  const failureReceipt = receiptWithCorrelation(
    {
      type: transactionReceiptTypeForLane(completion.lane),
      id: definition.id,
      generation,
      queueKey: concurrencyKey,
      ...transactionTimingFacts(startedAt, deps.now()),
      parentState: current.value,
    } satisfies FlowReceipt,
    correlationId,
  );
  deps.replaceIssues(
    replaceIssue(deps.currentIssues(), {
      ...completion.issue,
      facts: issueFactsFromReceipts(definition.id, {
        correlationId,
        parentState: current.value,
        receipts: [...current.receipts, failureReceipt],
      }),
    }),
  );
  return Object.freeze({
    ...current,
    transactions: {
      ...current.transactions,
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
    },
    receipts: [...current.receipts, failureReceipt],
  }) as SnapshotForMachine<Machine>;
}

export function cancelActiveTransaction<Machine extends FlowMachine>(
  deps: Pick<
    TransactionControllerDeps<Machine>,
    "currentCorrelationId" | "currentIssues" | "replaceIssues" | "now"
  >,
  registry: TransactionStartRegistry<Machine>,
  previewController: Pick<TransactionPreviewController<Machine>, "rollback">,
  current: SnapshotForMachine<Machine>,
  definition: UnknownFlowTransactionDefinition,
  parentState: SnapshotForMachine<Machine>["value"],
): SnapshotForMachine<Machine> {
  const activeTransaction = registry.latestActiveEntry(definition.id);
  if (activeTransaction === undefined) {
    return current;
  }

  registry.replaceActiveEntries(
    definition.id,
    registry
      .activeEntries(definition.id)
      .filter((entry) => entry.generation !== activeTransaction.generation),
  );
  registry.clearQueue(activeTransaction.concurrencyKey);
  activeTransaction.interrupt();
  deps.replaceIssues(clearIssue(deps.currentIssues(), "transaction", definition.id));

  return previewController.rollback(
    Object.freeze({
      ...current,
      transactions: {
        ...current.transactions,
        [definition.id]: {
          id: definition.id,
          status: "interrupt",
        } satisfies FlowTransactionSnapshot,
      },
      receipts: [
        ...current.receipts,
        receiptWithCorrelation(
          {
            type: "transaction:interrupt",
            id: definition.id,
            generation: activeTransaction.generation,
            queueKey: activeTransaction.concurrencyKey,
            overlapCause: "cancel-previous",
            ...transactionTimingFacts(activeTransaction.startedAt, deps.now()),
            parentState,
          } satisfies FlowReceipt,
          deps.currentCorrelationId(),
        ),
      ],
    }) as SnapshotForMachine<Machine>,
    activeTransaction.definition,
    activeTransaction.previewLayers,
    deps.currentCorrelationId(),
    {
      generation: activeTransaction.generation,
      queueKey: activeTransaction.concurrencyKey,
    },
  );
}

export function rejectOverlappingTransaction<Machine extends FlowMachine>(
  deps: Pick<TransactionControllerDeps<Machine>, "currentIssues" | "replaceIssues">,
  registry: Pick<TransactionStartRegistry<Machine>, "activeEntries">,
  current: SnapshotForMachine<Machine>,
  definition: UnknownFlowTransactionDefinition,
  options: Readonly<{
    readonly correlationId: string | undefined;
    readonly parentState: SnapshotForMachine<Machine>["value"];
  }>,
  concurrencyKey: string,
  overlapCause: TransactionInspectionOverlapCause,
): SnapshotForMachine<Machine> {
  const activeAttemptCount = registry.activeEntries(definition.id).length;
  const rejectReceipt = receiptWithCorrelation(
    {
      type: "transaction:reject",
      id: definition.id,
      queueKey: concurrencyKey,
      overlapCause,
      activeAttemptCount,
      parentState: options.parentState,
    } satisfies FlowReceipt,
    options.correlationId,
  );
  deps.replaceIssues(
    replaceIssue(deps.currentIssues(), {
      kind: "failure",
      source: "transaction",
      id: definition.id,
      error: rejectedWhileRunningTransactionDiagnostic({
        transactionId: definition.id,
        concurrency: definition.config.concurrency ?? "reject-while-running",
        parentState: options.parentState,
        activeAttemptCount,
      }),
      facts: issueFactsFromReceipts(definition.id, {
        correlationId: options.correlationId,
        parentState: options.parentState,
        receipts: [...current.receipts, rejectReceipt],
      }),
    }),
  );
  return Object.freeze({
    ...current,
    receipts: [...current.receipts, rejectReceipt],
  });
}
