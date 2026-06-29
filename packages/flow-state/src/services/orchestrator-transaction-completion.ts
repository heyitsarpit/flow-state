import { Exit } from "effect";
import type { Exit as ExitModel } from "effect";

import type { FlowMachine, FlowReceipt, FlowTransactionSnapshot } from "../public/types.js";
import { receiptWithCorrelation } from "../receipt-correlation.js";
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
  ) => SnapshotForMachine<Machine>;
}>;

type RestartResolvedTransaction<Machine extends FlowMachine> = (
  current: SnapshotForMachine<Machine>,
  definition: UnknownFlowTransactionDefinition,
  params: unknown,
  options: TransactionStartOptions<Machine>,
  dequeued?: boolean,
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
        true,
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

        const latestSnapshot = deps.currentSnapshot();
        const successSnapshot = Object.freeze({
          ...latestSnapshot,
          transactions: isSnapshotOwner
            ? {
                ...latestSnapshot.transactions,
                [definition.id]: {
                  id: definition.id,
                  status: "success",
                  value: exit.value,
                } satisfies FlowTransactionSnapshot,
              }
            : latestSnapshot.transactions,
          receipts: [
            ...latestSnapshot.receipts,
            receiptWithCorrelation(
              {
                type: "transaction:success",
                id: definition.id,
                generation,
                parentState: latestSnapshot.value,
              } satisfies FlowReceipt,
              activeTransaction.correlationId,
            ),
          ],
        }) as SnapshotForMachine<Machine>;

        if (isSnapshotOwner) {
          deps.replaceIssues(clearIssue(deps.currentIssues(), "transaction", definition.id));
        }

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

        const routedEvent = resolveSuccessTransactionRoute<Machine>(definition, exit.value);
        if (routedEvent !== undefined && isSnapshotOwner) {
          deps.dispatchOwnedMachineEvent(routedEvent);
        }
        return;
      }

      const completion = resolveFailedTransactionCompletion<Machine>(definition, exit);
      if (isSnapshotOwner) {
        deps.replaceIssues(
          replaceIssue(deps.currentIssues(), {
            ...completion.issue,
            handled: completion.routedEvent !== undefined,
          }),
        );
      }

      const latestSnapshot = deps.currentSnapshot();
      const failedSnapshot = previewController.rollback(
        Object.freeze({
          ...latestSnapshot,
          transactions: isSnapshotOwner
            ? {
                ...latestSnapshot.transactions,
                [definition.id]: {
                  id: definition.id,
                  status: completion.lane === "interrupt" ? "interrupt" : "failure",
                  ...(completion.issue.error === undefined
                    ? {}
                    : { error: completion.issue.error }),
                } satisfies FlowTransactionSnapshot,
              }
            : latestSnapshot.transactions,
          receipts: [
            ...latestSnapshot.receipts,
            receiptWithCorrelation(
              {
                type: transactionReceiptTypeForLane(completion.lane),
                id: definition.id,
                generation,
                parentState: latestSnapshot.value,
              } satisfies FlowReceipt,
              activeTransaction.correlationId,
            ),
          ],
        }) as SnapshotForMachine<Machine>,
        definition,
        activeTransaction.previewLayers,
        activeTransaction.correlationId,
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
