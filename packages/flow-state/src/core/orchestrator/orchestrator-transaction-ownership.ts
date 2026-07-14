import type { AnyFlowMachine, FlowReceipt, FlowTransactionSnapshot } from "../api/types.js";
import { clearIssue } from "./orchestrator-issues.js";
import { createTransactionController } from "./orchestrator-transactions.js";
import type {
  SnapshotForMachine,
  TransactionControllerDeps,
} from "./orchestrator-transaction-types.js";

export function createTransactionOwnershipController<Machine extends AnyFlowMachine>(
  deps: TransactionControllerDeps<Machine>,
) {
  const transactionController = createTransactionController(deps);

  const startStateOwnedTransactions = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = deps.transactionsForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let next = current;
    for (const definition of definitions) {
      next = transactionController.start(next, definition.transaction, {
        parentState: current.value,
        trigger: "state",
        stateOwned: true,
        correlationId: deps.currentCorrelationId(),
      });
    }

    return next;
  };

  const retryTransaction = (transactionId: string): boolean => {
    if (deps.isDisposed()) {
      return false;
    }

    const nextSnapshot = transactionController.retry(transactionId);
    if (nextSnapshot === undefined) {
      return false;
    }

    deps.replaceSnapshot(nextSnapshot, true);
    return true;
  };

  const resetTransaction = (transactionId: string): boolean => {
    if (deps.isDisposed()) {
      return false;
    }

    const snapshot = deps.currentSnapshot();
    const transaction = snapshot.transactions[transactionId];
    if (
      transaction === undefined ||
      transaction.status === "idle" ||
      transaction.status === "pending"
    ) {
      return false;
    }

    deps.replaceIssues(clearIssue(deps.currentIssues(), "transaction", transactionId));
    deps.replaceSnapshot(
      Object.freeze({
        ...snapshot,
        transactions: {
          ...snapshot.transactions,
          [transactionId]: {
            id: transactionId,
            status: "idle",
          } satisfies FlowTransactionSnapshot,
        },
        receipts: [
          ...snapshot.receipts,
          {
            type: "transaction:reset",
            id: transactionId,
            parentState: snapshot.value,
          } satisfies FlowReceipt,
        ],
      }) as SnapshotForMachine<Machine>,
      true,
    );
    return true;
  };

  return {
    drainInterruptedFinalizers: transactionController.drainInterruptedFinalizers,
    start: transactionController.start,
    interrupt: transactionController.interrupt,
    startStateOwnedTransactions,
    retryTransaction,
    resetTransaction,
  };
}
