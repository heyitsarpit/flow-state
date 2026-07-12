import type { Effect } from "effect";

import type { FlowMachine } from "../api/types.js";
import { createTransactionConcurrency } from "./orchestrator-transaction-concurrency.js";
import { createTransactionPreviewController } from "./orchestrator-transaction-preview.js";
import { interruptTransactions, retryTransaction } from "./orchestrator-transaction-recovery.js";
import { createTransactionStarter } from "./orchestrator-transaction-start.js";
import type {
  SnapshotForMachine,
  TransactionControllerDeps,
  TransactionInterruptReason,
} from "./orchestrator-transaction-types.js";

export function createTransactionController<Machine extends FlowMachine>(
  deps: TransactionControllerDeps<Machine>,
) {
  const registry = createTransactionConcurrency<Machine>();
  const previewController = createTransactionPreviewController(deps);
  const starter = createTransactionStarter(deps, registry, previewController);
  const interruptedFinalizers: Array<Effect.Effect<void, unknown>> = [];

  const interrupt = (
    current: ReturnType<TransactionControllerDeps<Machine>["currentSnapshot"]>,
    scope: "state-owned" | "all",
    parentState: ReturnType<
      TransactionControllerDeps<Machine>["currentSnapshot"]
    >["value"] = current.value,
    ownershipSnapshot: ReturnType<TransactionControllerDeps<Machine>["currentSnapshot"]> = current,
    interruptReason: TransactionInterruptReason = "state-exit",
  ): ReturnType<TransactionControllerDeps<Machine>["currentSnapshot"]> =>
    interruptTransactions(
      deps,
      registry,
      previewController,
      interruptedFinalizers,
      current,
      scope,
      parentState,
      ownershipSnapshot,
      interruptReason,
    );

  const retry = (transactionId: string): SnapshotForMachine<Machine> | undefined =>
    retryTransaction(
      deps.currentSnapshot(),
      transactionId,
      registry.latestAttempt(transactionId),
      starter.restartLatestAttempt,
    );

  return {
    drainInterruptedFinalizers: () => interruptedFinalizers.splice(0),
    start: starter.start,
    interrupt,
    retry,
  };
}
