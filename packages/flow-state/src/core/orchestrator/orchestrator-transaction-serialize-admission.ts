import type { FlowIssue, FlowMachine, FlowReceipt } from "../api/types.js";
import { serializeQueueCapacityExceededDiagnostic } from "../../shared/diagnostics.js";
import { issueFactsFromReceipts } from "../inspection/receipt-summary.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import { serializeQueueCapacity } from "./orchestrator-transaction-concurrency.js";
import { replaceIssue } from "./orchestrator-issues.js";
import type {
  QueuedTransaction,
  SnapshotForMachine,
  TransactionStartOptions,
  UnknownFlowTransactionDefinition,
} from "./orchestrator-transaction-types.js";
import type { TransactionInspectionOverlapCause } from "./transaction-inspection-facts.js";

type SerializeAdmissionDeps<Machine extends FlowMachine> = Readonly<{
  readonly currentIssues: () => ReadonlyArray<FlowIssue>;
  readonly replaceIssues: (nextIssues: ReadonlyArray<FlowIssue>) => void;
  readonly activeAttemptCount: (concurrencyKey: string) => number;
  readonly queuedAttemptCount: (concurrencyKey: string) => number;
  readonly queue: (
    current: SnapshotForMachine<Machine>,
    queued: QueuedTransaction<Machine>,
  ) => SnapshotForMachine<Machine>;
}>;

export function queueOrRejectSerializedTransaction<Machine extends FlowMachine>(
  deps: SerializeAdmissionDeps<Machine>,
  current: SnapshotForMachine<Machine>,
  definition: UnknownFlowTransactionDefinition,
  params: unknown,
  options: TransactionStartOptions<Machine>,
  concurrencyKey: string,
  overlapCause: TransactionInspectionOverlapCause,
): SnapshotForMachine<Machine> {
  const queueCapacity = serializeQueueCapacity(definition);
  const queuedAttemptCount = deps.queuedAttemptCount(concurrencyKey);
  if (queuedAttemptCount < queueCapacity) {
    return deps.queue(current, {
      concurrencyKey,
      overlapCause,
      definition,
      params,
      options,
    });
  }

  const activeAttemptCount = deps.activeAttemptCount(concurrencyKey);
  const rejectReceipt = receiptWithCorrelation(
    {
      type: "transaction:reject",
      id: definition.id,
      queueKey: concurrencyKey,
      overlapCause,
      activeAttemptCount,
      queuedAttemptCount,
      queueCapacity,
      parentState: options.parentState,
    } satisfies FlowReceipt,
    options.correlationId,
  );
  deps.replaceIssues(
    replaceIssue(deps.currentIssues(), {
      kind: "failure",
      source: "transaction",
      id: definition.id,
      error: serializeQueueCapacityExceededDiagnostic({
        transactionId: definition.id,
        queueKey: concurrencyKey,
        parentState: options.parentState,
        activeAttemptCount,
        queuedAttemptCount,
        queueCapacity,
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
