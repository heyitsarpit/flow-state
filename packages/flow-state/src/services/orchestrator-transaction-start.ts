import type { FlowMachine, FlowReceipt, FlowTransactionSnapshot } from "../core/api/types.js";
import { rejectedWhileRunningTransactionDiagnostic } from "../diagnostics.js";
import { issueFactsFromReceipts } from "../core/inspection/receipt-summary.js";
import { receiptWithCorrelation } from "../core/inspection/receipt-correlation.js";
import {
  type TransactionInspectionOverlapCause,
  transactionTimingFacts,
} from "../transaction-inspection-facts.js";
import {
  resolveTransactionCommitEffect,
  resolveTransactionParams,
} from "../core/transactions/transaction-callbacks.js";
import { clearIssue, replaceIssue } from "./orchestrator-issues.js";
import { createTransactionCompletionHandler } from "./orchestrator-transaction-completion.js";
import { transactionConcurrencyKey } from "./orchestrator-transaction-concurrency.js";
import type {
  ActiveTransactionEntry,
  QueuedTransaction,
  SnapshotForMachine,
  TransactionAttempt,
  TransactionControllerDeps,
  TransactionStartOptions,
  UnknownFlowTransactionDefinition,
} from "./orchestrator-transaction-types.js";

type StartRegistry<Machine extends FlowMachine> = Readonly<{
  readonly activeEntries: (id: string) => ReadonlyArray<ActiveTransactionEntry>;
  readonly replaceActiveEntries: (
    id: string,
    entries: ReadonlyArray<ActiveTransactionEntry>,
  ) => void;
  readonly latestActiveEntry: (id: string) => ActiveTransactionEntry | undefined;
  readonly activeEntriesInConcurrencyKey: (
    concurrencyKey: string,
  ) => ReadonlyArray<ActiveTransactionEntry>;
  readonly beginAttempt: (
    definition: QueuedTransaction<Machine>["definition"],
    params: unknown,
  ) => Readonly<{
    readonly concurrencyKey: string;
    readonly generation: number;
  }>;
  readonly queue: (queued: QueuedTransaction<Machine>) => void;
  readonly dequeue: (concurrencyKey: string) => QueuedTransaction<Machine> | undefined;
  readonly clearQueue: (concurrencyKey: string) => void;
  readonly isSnapshotOwner: (id: string, generation: number) => boolean;
}>;

type PreviewController<Machine extends FlowMachine> = Readonly<{
  readonly apply: (
    current: SnapshotForMachine<Machine>,
    definition: UnknownFlowTransactionDefinition,
    params: unknown,
    correlationId: string | undefined,
    attempt: Readonly<{
      readonly generation: number;
      readonly queueKey: string;
    }>,
  ) => Readonly<{
    readonly snapshot: SnapshotForMachine<Machine>;
    readonly previewLayers: ActiveTransactionEntry["previewLayers"];
  }>;
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

export function createTransactionStarter<Machine extends FlowMachine>(
  deps: TransactionControllerDeps<Machine>,
  registry: StartRegistry<Machine>,
  previewController: PreviewController<Machine>,
) {
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
            queueKey: queued.concurrencyKey,
            overlapCause: queued.overlapCause,
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
  };

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
    };
    registry.replaceActiveEntries(definition.id, [...registry.activeEntries(definition.id), entry]);

    entry.interrupt = deps.runEffect(resolveTransactionCommitEffect(definition, params), (exit) =>
      completionHandler.handleExit(definition, params, generation, exit),
    );

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
        return queueTransaction(current, {
          concurrencyKey,
          overlapCause: "active-attempt",
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

      const rejectReceipt = receiptWithCorrelation(
        {
          type: "transaction:reject",
          id: definition.id,
          queueKey: concurrencyKey,
          overlapCause: "reject-while-running",
          activeAttemptCount: registry.activeEntries(definition.id).length,
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
            activeAttemptCount: registry.activeEntries(definition.id).length,
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

    if (
      definition.config.concurrency === "serialize" &&
      registry.activeEntriesInConcurrencyKey(concurrencyKey).length > 0
    ) {
      return queueTransaction(current, {
        concurrencyKey,
        overlapCause: "serialize-scope",
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

  return {
    start,
    restartLatestAttempt,
  } as const;
}
