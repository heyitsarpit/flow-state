import { Effect } from "effect";

import type { AnyFlowMachine, FlowReceipt } from "../api/types.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import { type TransactionInspectionOverlapCause } from "./transaction-inspection-facts.js";
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
  FlowRuntimeTransactionAttempt,
  FlowRuntimeTransactionDefinition,
  SnapshotForMachine,
  TransactionAttempt,
  TransactionControllerDeps,
  TransactionPreviewController,
  TransactionStartRegistry,
  TransactionStartOptions,
} from "./orchestrator-transaction-types.js";

export function createTransactionStarter<Machine extends AnyFlowMachine>(
  deps: TransactionControllerDeps<Machine>,
  registry: TransactionStartRegistry<Machine>,
  previewController: TransactionPreviewController<Machine>,
) {
  function startResolvedTransaction(
    current: SnapshotForMachine<Machine>,
    definition: FlowRuntimeTransactionAttempt<import("../api/types.js").InferMachineEvent<Machine>>,
    options: TransactionStartOptions<Machine>,
    dequeuedOverlapCause?: TransactionInspectionOverlapCause,
  ): SnapshotForMachine<Machine> {
    const { concurrencyKey, generation } = registry.beginAttempt(definition);
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

    const preview = previewController.apply(next, definition, options.correlationId, {
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
    const entry: ActiveTransactionEntry<Machine> = {
      attempt: definition,
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

    const handle = definition.runCommit(deps.runEffect, (settlement) =>
      completionHandler.handleSettlement(definition, generation, settlement),
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
    definition: FlowRuntimeTransactionAttempt<import("../api/types.js").InferMachineEvent<Machine>>,
    options: TransactionStartOptions<Machine>,
  ): SnapshotForMachine<Machine> => {
    const concurrencyKey = transactionConcurrencyKey(definition);
    if (registry.activeEntries(definition.id).length > 0) {
      if (definition.concurrency === "serialize") {
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
          options,
          concurrencyKey,
          "active-attempt",
        );
      }
      if (definition.concurrency === "cancel-previous") {
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
          options,
        );
      }

      if (definition.concurrency === "allow") {
        return startResolvedTransaction(current, definition, options);
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
      definition.concurrency === "serialize" &&
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
        options,
        concurrencyKey,
        "serialize-scope",
      );
    }
    return startResolvedTransaction(current, definition, options);
  };
  const start = (
    current: SnapshotForMachine<Machine>,
    definition: FlowRuntimeTransactionDefinition<
      import("../api/types.js").InferMachineEvent<Machine>
    >,
    options: TransactionStartOptions<Machine>,
  ): SnapshotForMachine<Machine> => {
    const paramsSource = { ...deps.invokeArgsForSnapshot(current), event: options.event };
    const attempt = definition.prepare(paramsSource);
    if (attempt === null) {
      return current;
    }
    if (attempt === undefined) {
      return current;
    }
    return startResolvedTransactionWithConcurrency(current, attempt, {
      ...options,
      correlationId: options.correlationId ?? deps.currentCorrelationId(),
    });
  };
  const restartLatestAttempt = (
    current: SnapshotForMachine<Machine>,
    attempt: TransactionAttempt<Machine>,
  ): SnapshotForMachine<Machine> =>
    startResolvedTransactionWithConcurrency(current, attempt, {
      parentState: current.value,
      trigger: "event",
      stateOwned: false,
      correlationId: undefined,
    });
  return { start, restartLatestAttempt } as const;
}
