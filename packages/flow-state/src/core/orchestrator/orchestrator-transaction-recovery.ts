import type { FlowMachine, FlowReceipt, FlowTransactionSnapshot } from "../api/types.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import { transactionTimingFacts } from "./transaction-inspection-facts.js";
import { replaceIssue } from "./orchestrator-issues.js";
import type {
  ActiveTransactionEntry,
  SnapshotForMachine,
  TransactionAttempt,
  TransactionControllerDeps,
} from "./orchestrator-transaction-types.js";
import { interruptIssue } from "./orchestrator-issues.js";

type RecoveryRegistry = Readonly<{
  activeIds: () => ReadonlyArray<string>;
  activeEntriesById: () => ReadonlyArray<readonly [string, ReadonlyArray<ActiveTransactionEntry>]>;
  activeEntries: (id: string) => ReadonlyArray<ActiveTransactionEntry>;
  replaceActiveEntries: (id: string, entries: ReadonlyArray<ActiveTransactionEntry>) => void;
  clearQueue: (concurrencyKey: string) => void;
  isSnapshotOwner: (id: string, generation: number) => boolean;
}>;

type PreviewRollbackController<Machine extends FlowMachine> = Readonly<{
  rollback: (
    current: SnapshotForMachine<Machine>,
    definition: ActiveTransactionEntry["definition"],
    previewLayers: ActiveTransactionEntry["previewLayers"],
    correlationId: string | undefined,
    attempt: Readonly<{
      readonly generation: number;
      readonly queueKey: string;
    }>,
  ) => SnapshotForMachine<Machine>;
}>;

type RetryStarter<Machine extends FlowMachine> = (
  current: SnapshotForMachine<Machine>,
  attempt: TransactionAttempt,
) => SnapshotForMachine<Machine>;

export function interruptTransactions<Machine extends FlowMachine>(
  deps: Pick<
    TransactionControllerDeps<Machine>,
    "currentIssues" | "replaceIssues" | "currentCorrelationId" | "now" | "transactionsForState"
  >,
  registry: RecoveryRegistry,
  previewController: PreviewRollbackController<Machine>,
  current: SnapshotForMachine<Machine>,
  scope: "state-owned" | "all",
  parentState: SnapshotForMachine<Machine>["value"] = current.value,
  ownershipSnapshot: SnapshotForMachine<Machine> = current,
): SnapshotForMachine<Machine> {
  const activeTransactionIds =
    scope === "all"
      ? registry.activeIds()
      : registry
          .activeEntriesById()
          .filter(([, entries]) => entries.some((entry) => entry.stateOwned))
          .map(([id]) => id);
  const restoredTransactionIds =
    scope === "all"
      ? Object.entries(current.transactions)
          .filter(
            ([transactionId, snapshot]) =>
              snapshot.status === "pending" && registry.activeEntries(transactionId).length === 0,
          )
          .map(([transactionId]) => transactionId)
      : deps
          .transactionsForState(ownershipSnapshot)
          .map(({ transaction }) => transaction.id)
          .filter(
            (transactionId) =>
              current.transactions[transactionId]?.status === "pending" &&
              registry.activeEntries(transactionId).length === 0,
          );
  const transactionIds = Array.from(new Set([...activeTransactionIds, ...restoredTransactionIds]));
  if (transactionIds.length === 0) {
    return current;
  }

  let next = current;
  let nextIssues = deps.currentIssues();

  for (const transactionId of transactionIds) {
    const matchingEntries = registry
      .activeEntries(transactionId)
      .filter((entry) => (scope === "all" ? true : entry.stateOwned));
    if (matchingEntries.length === 0) {
      if (current.transactions[transactionId]?.status !== "pending") {
        continue;
      }

      nextIssues = replaceIssue(
        nextIssues,
        interruptIssue("transaction", transactionId, {
          parentState,
          receipts: next.receipts,
        }),
      );
      next = Object.freeze({
        ...next,
        transactions: {
          ...next.transactions,
          [transactionId]: {
            id: transactionId,
            status: "interrupt",
          } satisfies FlowTransactionSnapshot,
        },
        receipts: [
          ...next.receipts,
          receiptWithCorrelation(
            {
              type: "transaction:interrupt",
              id: transactionId,
              parentState,
            } satisfies FlowReceipt,
            deps.currentCorrelationId(),
          ),
        ],
      });
      continue;
    }

    registry.replaceActiveEntries(
      transactionId,
      registry.activeEntries(transactionId).filter((entry) => !matchingEntries.includes(entry)),
    );

    for (const entry of matchingEntries) {
      registry.clearQueue(entry.concurrencyKey);
      entry.interrupt();

      if (registry.isSnapshotOwner(transactionId, entry.generation)) {
        nextIssues = replaceIssue(
          nextIssues,
          interruptIssue("transaction", transactionId, {
            correlationId: entry.correlationId,
            parentState,
            receipts: next.receipts,
          }),
        );
        next = Object.freeze({
          ...next,
          transactions: {
            ...next.transactions,
            [transactionId]: {
              id: transactionId,
              status: "interrupt",
            } satisfies FlowTransactionSnapshot,
          },
          receipts: [
            ...next.receipts,
            receiptWithCorrelation(
              {
                type: "transaction:interrupt",
                id: transactionId,
                generation: entry.generation,
                queueKey: entry.concurrencyKey,
                ...transactionTimingFacts(entry.startedAt, deps.now()),
                parentState,
              } satisfies FlowReceipt,
              deps.currentCorrelationId(),
            ),
          ],
        });
      } else {
        next = Object.freeze({
          ...next,
          receipts: [
            ...next.receipts,
            receiptWithCorrelation(
              {
                type: "transaction:interrupt",
                id: transactionId,
                generation: entry.generation,
                queueKey: entry.concurrencyKey,
                ...transactionTimingFacts(entry.startedAt, deps.now()),
                parentState,
              } satisfies FlowReceipt,
              deps.currentCorrelationId(),
            ),
          ],
        });
      }

      next = previewController.rollback(
        next,
        entry.definition,
        entry.previewLayers,
        deps.currentCorrelationId(),
        {
          generation: entry.generation,
          queueKey: entry.concurrencyKey,
        },
      );
    }
  }

  deps.replaceIssues(nextIssues);
  return next;
}

export function retryTransaction<Machine extends FlowMachine>(
  current: SnapshotForMachine<Machine>,
  transactionId: string,
  attempt: TransactionAttempt | undefined,
  startAttempt: RetryStarter<Machine>,
): SnapshotForMachine<Machine> | undefined {
  const transaction = current.transactions[transactionId];
  if (
    transaction === undefined ||
    attempt === undefined ||
    (transaction.status !== "failure" && transaction.status !== "interrupt")
  ) {
    return undefined;
  }

  return startAttempt(
    Object.freeze({
      ...current,
      receipts: [
        ...current.receipts,
        {
          type: "transaction:retry",
          id: transactionId,
          parentState: current.value,
        } satisfies FlowReceipt,
      ],
    }) as SnapshotForMachine<Machine>,
    attempt,
  );
}
