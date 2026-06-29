import { Exit } from "effect";
import type { FlowMachine, FlowReceipt, FlowTransactionSnapshot } from "../public/types.js";
import { receiptWithCorrelation } from "../receipt-correlation.js";
import {
  resolveTransactionCommitEffect,
  resolveTransactionParams,
} from "../transaction-callbacks.js";
import { clearIssue, replaceIssue } from "./orchestrator-issues.js";
import {
  createTransactionConcurrency,
  transactionConcurrencyKey,
} from "./orchestrator-transaction-concurrency.js";
import { invalidateTransactionTargets } from "./orchestrator-transaction-invalidation.js";
import {
  resolveFailedTransactionCompletion,
  resolveSuccessTransactionRoute,
  transactionReceiptTypeForLane,
} from "./orchestrator-transaction-outcome.js";
import { createTransactionPreviewController } from "./orchestrator-transaction-preview.js";
import { interruptTransactions, retryTransaction } from "./orchestrator-transaction-recovery.js";
import type {
  ActiveTransactionEntry,
  QueuedTransaction,
  SnapshotForMachine,
  TransactionControllerDeps,
  TransactionStartOptions,
  UnknownFlowTransactionDefinition,
} from "./orchestrator-transaction-types.js";

export function createTransactionController<Machine extends FlowMachine>(
  deps: TransactionControllerDeps<Machine>,
) {
  const registry = createTransactionConcurrency<Machine>();
  const previewController = createTransactionPreviewController(deps);

  const queueTransaction = (
    current: SnapshotForMachine<Machine>,
    queued: QueuedTransaction<Machine>,
  ): SnapshotForMachine<Machine> => {
    registry.queue(queued);
    return Object.freeze({
      ...current,
      receipts: [
        ...current.receipts,
        receiptWithCorrelation(
          {
            type: "transaction:queue",
            id: queued.definition.id,
            parentState: queued.options.parentState,
          } satisfies FlowReceipt,
          queued.options.correlationId,
        ),
      ],
    });
  };

  const cancelActiveTransaction = (
    current: SnapshotForMachine<Machine>,
    definition: UnknownFlowTransactionDefinition,
    parentState: SnapshotForMachine<Machine>["value"],
  ): SnapshotForMachine<Machine> => {
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
              parentState,
            } satisfies FlowReceipt,
            deps.currentCorrelationId(),
          ),
        ],
      }) as SnapshotForMachine<Machine>,
      activeTransaction.definition,
      activeTransaction.previewLayers,
      deps.currentCorrelationId(),
    );
  };

  const startResolvedTransaction = (
    current: SnapshotForMachine<Machine>,
    definition: UnknownFlowTransactionDefinition,
    params: unknown,
    options: TransactionStartOptions<Machine>,
    dequeued = false,
  ): SnapshotForMachine<Machine> => {
    const { concurrencyKey, generation } = registry.beginAttempt(definition, params);
    deps.replaceIssues(clearIssue(deps.currentIssues(), "transaction", definition.id));

    let next = Object.freeze({
      ...current,
      transactions: {
        ...current.transactions,
        [definition.id]: {
          id: definition.id,
          status: "pending" as const,
        },
      },
      receipts: [
        ...current.receipts,
        ...(dequeued
          ? ([
              receiptWithCorrelation(
                {
                  type: "transaction:dequeue",
                  id: definition.id,
                  parentState: options.parentState,
                } satisfies FlowReceipt,
                options.correlationId,
              ),
            ] as const)
          : []),
        receiptWithCorrelation(
          {
            type: "transaction:start",
            id: definition.id,
            generation,
            trigger: options.trigger,
            parentState: options.parentState,
          } satisfies FlowReceipt,
          options.correlationId,
        ),
      ],
    }) as SnapshotForMachine<Machine>;

    const preview = previewController.apply(next, definition, params, options.correlationId);
    next = preview.snapshot;

    const entry: ActiveTransactionEntry = {
      definition,
      concurrencyKey,
      generation,
      previewLayers: preview.previewLayers,
      stateOwned: options.stateOwned,
      correlationId: options.correlationId,
      interrupt: () => {},
    };

    registry.replaceActiveEntries(definition.id, [...registry.activeEntries(definition.id), entry]);

    entry.interrupt = deps.runEffect(resolveTransactionCommitEffect(definition, params), (exit) => {
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

        const resumeQueuedTransaction = () => {
          const queued = registry.dequeue(activeTransaction.concurrencyKey);
          if (queued === undefined) {
            return;
          }

          const latestSnapshot = deps.currentSnapshot();
          deps.replaceSnapshot(
            startResolvedTransaction(
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
          resumeQueuedTransaction();

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
        resumeQueuedTransaction();

        if (completion.routedEvent !== undefined && isSnapshotOwner) {
          deps.dispatchOwnedMachineEvent(completion.routedEvent);
        }
      });
    });

    return next;
  };

  const startResolvedTransactionWithConcurrency = (
    current: SnapshotForMachine<Machine>,
    definition: UnknownFlowTransactionDefinition,
    params: unknown,
    options: TransactionStartOptions<Machine>,
  ): SnapshotForMachine<Machine> => {
    const concurrencyKey = transactionConcurrencyKey(definition);

    if (registry.activeEntries(definition.id).length > 0) {
      if (definition.config.concurrency === "serialize") {
        return queueTransaction(current, {
          concurrencyKey,
          definition,
          params,
          options,
        });
      }

      if (definition.config.concurrency === "cancel-previous") {
        return startResolvedTransaction(
          cancelActiveTransaction(current, definition, options.parentState),
          definition,
          params,
          options,
        );
      }

      if (definition.config.concurrency === "allow") {
        return startResolvedTransaction(current, definition, params, options);
      }

      return Object.freeze({
        ...current,
        receipts: [
          ...current.receipts,
          {
            type: "transaction:reject",
            id: definition.id,
            parentState: options.parentState,
          } satisfies FlowReceipt,
        ],
      });
    }

    if (
      definition.config.concurrency === "serialize" &&
      registry.activeEntriesInConcurrencyKey(concurrencyKey).length > 0
    ) {
      return queueTransaction(current, {
        concurrencyKey,
        definition,
        params,
        options,
      });
    }

    return startResolvedTransaction(current, definition, params, options);
  };

  const start = (
    current: SnapshotForMachine<Machine>,
    definition: UnknownFlowTransactionDefinition,
    options: TransactionStartOptions<Machine>,
  ): SnapshotForMachine<Machine> => {
    const paramsSource = {
      ...deps.invokeArgsForSnapshot(current),
      event: options.event,
    };
    const params = resolveTransactionParams(definition, paramsSource) ?? undefined;
    if (params === null) {
      return current;
    }

    return startResolvedTransactionWithConcurrency(current, definition, params, {
      ...options,
      correlationId: options.correlationId ?? deps.currentCorrelationId(),
    });
  };

  const interrupt = (
    current: SnapshotForMachine<Machine>,
    scope: "state-owned" | "all",
    parentState: SnapshotForMachine<Machine>["value"] = current.value,
    ownershipSnapshot: SnapshotForMachine<Machine> = current,
  ): SnapshotForMachine<Machine> =>
    interruptTransactions(
      deps,
      registry,
      previewController,
      current,
      scope,
      parentState,
      ownershipSnapshot,
    );

  const retry = (transactionId: string): SnapshotForMachine<Machine> | undefined =>
    retryTransaction(
      deps.currentSnapshot(),
      transactionId,
      registry.latestAttempt(transactionId),
      (current, attempt) =>
        startResolvedTransactionWithConcurrency(current, attempt.definition, attempt.params, {
          parentState: current.value,
          trigger: "event",
          stateOwned: false,
          correlationId: undefined,
        }),
    );

  return {
    start,
    interrupt,
    retry,
  };
}
