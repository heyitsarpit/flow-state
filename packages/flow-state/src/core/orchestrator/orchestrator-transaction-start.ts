import { Effect } from "effect";

import type { AnyFlowMachine, FlowReceipt } from "../api/types.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import { type TransactionInspectionOverlapCause } from "./transaction-inspection-facts.js";
import {
  resolveTransactionCommitEffect,
  resolveTransactionParams,
} from "../transactions/transaction-callbacks.js";
import { clearIssue } from "./orchestrator-issues.js";
import { createTransactionCompletionHandler } from "./orchestrator-transaction-completion.js";
import { transactionConcurrencyKey } from "./orchestrator-transaction-concurrency.js";
import {
  cancelActiveTransaction,
  failPreviewPublication,
  queueTransaction,
  rejectOverlappingTransaction,
} from "./orchestrator-transaction-start-overlap.js";
import { queueOrRejectSerializedTransaction } from "./orchestrator-transaction-serialize-admission.js";
import type {
  ActiveTransactionEntry,
  SnapshotForMachine,
  TransactionAttempt,
  TransactionControllerDeps,
  TransactionPreviewController,
  TransactionStartRegistry,
  TransactionStartOptions,
  UnknownFlowTransactionDefinition,
} from "./orchestrator-transaction-types.js";

export function createTransactionStarter<Machine extends AnyFlowMachine>(
  deps: TransactionControllerDeps<Machine>,
  registry: TransactionStartRegistry<Machine>,
  previewController: TransactionPreviewController<Machine>,
) {
  function startResolvedTransaction(
    current: SnapshotForMachine<Machine>,
    definition: UnknownFlowTransactionDefinition,
    params: unknown,
    options: TransactionStartOptions<Machine>,
    dequeuedOverlapCause?: TransactionInspectionOverlapCause,
  ): SnapshotForMachine<Machine> {
    const { concurrencyKey, generation } = registry.beginAttempt(definition, params);
    const startedAt = deps.now();
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
        ...(dequeuedOverlapCause !== undefined
          ? ([
              receiptWithCorrelation(
                {
                  type: "transaction:dequeue",
                  id: definition.id,
                  queueKey: concurrencyKey,
                  overlapCause: dequeuedOverlapCause,
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
            queueKey: concurrencyKey,
            startedAt,
            parentState: options.parentState,
          } satisfies FlowReceipt,
          options.correlationId,
        ),
      ],
    }) as SnapshotForMachine<Machine>;

    const preview = previewController.apply(next, definition, params, options.correlationId, {
      generation,
      queueKey: concurrencyKey,
    });
    if (preview.previewFailure !== undefined) {
      return failPreviewPublication(
        deps,
        preview.snapshot,
        definition,
        generation,
        startedAt,
        concurrencyKey,
        options.correlationId,
        preview.previewFailure,
      );
    }
    next = preview.snapshot;
    const entry: ActiveTransactionEntry = {
      definition,
      concurrencyKey,
      generation,
      startedAt,
      previewLayers: preview.previewLayers,
      stateOwned: options.stateOwned,
      correlationId: options.correlationId,
      interrupt: () => {},
      awaitExit: Effect.void,
    };
    registry.replaceActiveEntries(definition.id, [...registry.activeEntries(definition.id), entry]);

    const handle = deps.runEffect(resolveTransactionCommitEffect(definition, params), (exit) =>
      completionHandler.handleExit(definition, params, generation, exit),
    );
    entry.interrupt = handle;
    entry.awaitExit = handle.awaitExit;
    return next;
  }
  const completionHandler = createTransactionCompletionHandler(
    deps,
    registry,
    previewController,
    startResolvedTransaction,
  );
  const startResolvedTransactionWithConcurrency = (
    current: SnapshotForMachine<Machine>,
    definition: UnknownFlowTransactionDefinition,
    params: unknown,
    options: TransactionStartOptions<Machine>,
  ): SnapshotForMachine<Machine> => {
    const concurrencyKey = transactionConcurrencyKey(definition);
    if (registry.activeEntries(definition.id).length > 0) {
      if (definition.config.concurrency === "serialize") {
        return queueOrRejectSerializedTransaction(
          {
            currentIssues: deps.currentIssues,
            replaceIssues: deps.replaceIssues,
            activeAttemptCount: (queueKey) =>
              registry.activeEntriesInConcurrencyKey(queueKey).length,
            queuedAttemptCount: registry.queueSize,
            queue: (snapshot, queued) => queueTransaction(registry, snapshot, queued),
          },
          current,
          definition,
          params,
          options,
          concurrencyKey,
          "active-attempt",
        );
      }
      if (definition.config.concurrency === "cancel-previous") {
        return startResolvedTransaction(
          cancelActiveTransaction(
            deps,
            registry,
            previewController,
            current,
            definition,
            options.parentState,
          ),
          definition,
          params,
          options,
        );
      }

      if (definition.config.concurrency === "allow") {
        return startResolvedTransaction(current, definition, params, options);
      }
      return rejectOverlappingTransaction(
        deps,
        registry,
        current,
        definition,
        options,
        concurrencyKey,
        "reject-while-running",
      );
    }
    if (
      definition.config.concurrency === "serialize" &&
      registry.activeEntriesInConcurrencyKey(concurrencyKey).length > 0
    ) {
      return queueOrRejectSerializedTransaction(
        {
          currentIssues: deps.currentIssues,
          replaceIssues: deps.replaceIssues,
          activeAttemptCount: (queueKey) => registry.activeEntriesInConcurrencyKey(queueKey).length,
          queuedAttemptCount: registry.queueSize,
          queue: (snapshot, queued) => queueTransaction(registry, snapshot, queued),
        },
        current,
        definition,
        params,
        options,
        concurrencyKey,
        "serialize-scope",
      );
    }
    return startResolvedTransaction(current, definition, params, options);
  };
  const start = (
    current: SnapshotForMachine<Machine>,
    definition: UnknownFlowTransactionDefinition,
    options: TransactionStartOptions<Machine>,
  ): SnapshotForMachine<Machine> => {
    const paramsSource = { ...deps.invokeArgsForSnapshot(current), event: options.event };
    const params = resolveTransactionParams(definition, paramsSource) ?? undefined;
    if (params === null) {
      return current;
    }
    return startResolvedTransactionWithConcurrency(current, definition, params, {
      ...options,
      correlationId: options.correlationId ?? deps.currentCorrelationId(),
    });
  };
  const restartLatestAttempt = (
    current: SnapshotForMachine<Machine>,
    attempt: TransactionAttempt,
  ): SnapshotForMachine<Machine> =>
    startResolvedTransactionWithConcurrency(current, attempt.definition, attempt.params, {
      parentState: current.value,
      trigger: "event",
      stateOwned: false,
      correlationId: undefined,
    });
  return { start, restartLatestAttempt } as const;
}
