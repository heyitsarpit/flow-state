import { Effect } from "effect";

import type { FlowMachine, FlowReceipt, FlowTransactionSnapshot } from "../api/types.js";
import { rejectedWhileRunningTransactionDiagnostic } from "../../shared/diagnostics.js";
import { issueFactsFromReceipts } from "../inspection/receipt-summary.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import {
  type TransactionInspectionOverlapCause,
  transactionTimingFacts,
} from "./transaction-inspection-facts.js";
import {
  resolveTransactionCommitEffect,
  resolveTransactionParams,
} from "../transactions/transaction-callbacks.js";
import { clearIssue, replaceIssue } from "./orchestrator-issues.js";
import { createTransactionCompletionHandler } from "./orchestrator-transaction-completion.js";
import { transactionConcurrencyKey } from "./orchestrator-transaction-concurrency.js";
import {
  resolveFailedTransactionIssue,
  transactionReceiptTypeForLane,
} from "./orchestrator-transaction-outcome.js";
import { queueOrRejectSerializedTransaction } from "./orchestrator-transaction-serialize-admission.js";
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
  ) => Readonly<{ readonly concurrencyKey: string; readonly generation: number }>;
  readonly queue: (queued: QueuedTransaction<Machine>) => void;
  readonly queueSize: (concurrencyKey: string) => number;
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
    attempt: Readonly<{ readonly generation: number; readonly queueKey: string }>,
  ) => Readonly<{
    readonly snapshot: SnapshotForMachine<Machine>;
    readonly previewLayers: ActiveTransactionEntry["previewLayers"];
    readonly previewFailure: import("effect").Exit.Failure<unknown, unknown> | undefined;
  }>;
  readonly commit: (previewLayers: ActiveTransactionEntry["previewLayers"]) => void;
  readonly rollback: (
    current: SnapshotForMachine<Machine>,
    definition: UnknownFlowTransactionDefinition,
    previewLayers: ActiveTransactionEntry["previewLayers"],
    correlationId: string | undefined,
    attempt: Readonly<{ readonly generation: number; readonly queueKey: string }>,
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
  const failPreviewPublication = (
    current: SnapshotForMachine<Machine>,
    definition: UnknownFlowTransactionDefinition,
    generation: number,
    startedAt: number,
    concurrencyKey: string,
    correlationId: string | undefined,
    exit: import("effect").Exit.Failure<unknown, unknown>,
  ): SnapshotForMachine<Machine> => {
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
    if (preview.previewFailure !== undefined) {
      return failPreviewPublication(
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
            queue: queueTransaction,
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
      return queueOrRejectSerializedTransaction(
        {
          currentIssues: deps.currentIssues,
          replaceIssues: deps.replaceIssues,
          activeAttemptCount: (queueKey) => registry.activeEntriesInConcurrencyKey(queueKey).length,
          queuedAttemptCount: registry.queueSize,
          queue: queueTransaction,
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
