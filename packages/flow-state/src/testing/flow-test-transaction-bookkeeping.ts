import { Effect, Exit } from "effect";

import type {
  FlowEvent,
  FlowIssue,
  FlowInvokeDescriptor,
  FlowPreviewPatch,
  FlowReceipt,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowRuntime,
  FlowSnapshot,
  FlowTransactionSnapshot,
} from "../core/api/types.js";
import { issueFactsFromReceipts } from "../core/inspection/receipt-summary.js";
import { receiptWithCorrelation } from "../core/inspection/receipt-correlation.js";
import {
  clearIssue,
  interruptIssue,
  replaceIssue,
} from "../core/orchestrator/orchestrator-issues.js";
import {
  resolveFailedTransactionIssue,
  resolveFailedTransactionRoute,
  resolveSuccessTransactionRoute,
  transactionReceiptTypeForLane,
} from "../core/orchestrator/orchestrator-transaction-outcome.js";
import type { UnknownFlowTransactionDefinition } from "../core/orchestrator/orchestrator-transaction-types.js";
import {
  type TransactionInspectionOverlapCause,
  transactionPreviewReceiptFacts,
  transactionRollbackReceiptFacts,
  transactionRoutedEventType,
  transactionTimingFacts,
} from "../core/orchestrator/transaction-inspection-facts.js";
import {
  invalidateTransactionResourceSnapshot,
  transactionReceiptIdForInvalidationTarget,
  transactionRefsForInvalidationTarget,
} from "../core/transactions/transaction-invalidation.js";
import { resourceKeyOf } from "../core/store/invalidation.js";
import {
  resolveTransactionCommitEffect,
  resolveTransactionInvalidationTargets,
  resolveTransactionParams,
  resolveTransactionPreviewPatches,
  runtimeTransactionDefinition,
} from "../core/transactions/transaction-callbacks.js";
import { ownedEffectHandleFromFiber } from "../core/runtime/owned-effect-runner.js";
import { applyResourcePatch } from "../core/store/resource-patch.js";
import {
  rejectedWhileRunningTransactionDiagnostic,
  serializeQueueCapacityExceededDiagnostic,
} from "../shared/diagnostics.js";
import { serializeQueueCapacity } from "../core/orchestrator/orchestrator-transaction-concurrency.js";
import { createFifoQueue } from "../utils/fifo-queue.js";

type HarnessSnapshot<Context, Event extends FlowEvent, State extends string> = FlowSnapshot<
  Context,
  State,
  Event
>;

type AnyTransactionInvoke = Extract<FlowInvokeDescriptor, { readonly kind: "run" }>;
type HarnessTransactionDefinition = UnknownFlowTransactionDefinition;

type HarnessInvokeArgs<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly context: Context;
  readonly value: State;
  readonly snapshot: HarnessSnapshot<Context, Event, State>;
  readonly resources: HarnessSnapshot<Context, Event, State>["resources"];
  readonly transactions: HarnessSnapshot<Context, Event, State>["transactions"];
  readonly streams: HarnessSnapshot<Context, Event, State>["streams"];
  readonly timers: HarnessSnapshot<Context, Event, State>["timers"];
  readonly children: HarnessSnapshot<Context, Event, State>["children"];
  readonly receipts: HarnessSnapshot<Context, Event, State>["receipts"];
}>;

type TransactionStartOptions<Event extends FlowEvent, State extends string> = Readonly<{
  readonly event?: Event;
  readonly parentState: State;
  readonly stateOwned: boolean;
  readonly trigger: "state" | "event";
  readonly correlationId: string | undefined;
}>;

type QueuedHarnessTransaction<Event extends FlowEvent, State extends string> = Readonly<{
  readonly concurrencyKey: string;
  readonly overlapCause: TransactionInspectionOverlapCause;
  readonly definition: HarnessTransactionDefinition;
  readonly params: unknown;
  readonly options: TransactionStartOptions<Event, State>;
  readonly correlationId: string | undefined;
}>;

type LatestHarnessTransactionAttempt = Readonly<{
  readonly definition: HarnessTransactionDefinition;
  readonly params: unknown;
}>;

type HarnessPreviewLayer = Readonly<{
  readonly ref: FlowResourceRef;
  readonly patch: FlowPreviewPatch;
  readonly order: number;
  readonly state: "active" | "committed";
}>;

type HarnessPreviewOverlay = Readonly<{
  readonly rootSnapshot: FlowResourceSnapshot | undefined;
  readonly layers: ReadonlyArray<HarnessPreviewLayer>;
}>;

type ActiveHarnessTransaction = Readonly<{
  readonly definition: HarnessTransactionDefinition;
  readonly concurrencyKey: string;
  readonly generation: number;
  readonly startedAt: number;
  readonly previewLayers: ReadonlyArray<HarnessPreviewLayer>;
  readonly stateOwned: boolean;
  readonly correlationId: string | undefined;
  readonly interrupt: (interruptor?: number) => void;
}>;

type FlowTestTransactionBookkeepingDeps<
  Context,
  Event extends FlowEvent,
  State extends string,
> = Readonly<{
  readonly currentSnapshot: () => HarnessSnapshot<Context, Event, State>;
  readonly replaceSnapshot: (next: HarnessSnapshot<Context, Event, State>) => void;
  readonly materializeSnapshot: (
    base: HarnessSnapshot<Context, Event, State>,
  ) => HarnessSnapshot<Context, Event, State>;
  readonly currentIssues: () => ReadonlyArray<FlowIssue>;
  readonly replaceIssues: (next: ReadonlyArray<FlowIssue>) => void;
  readonly currentTransactions: () => Readonly<Record<string, FlowTransactionSnapshot>>;
  readonly replaceTransactions: (next: Readonly<Record<string, FlowTransactionSnapshot>>) => void;
  readonly appendReceipt: (
    current: HarnessSnapshot<Context, Event, State>,
    receipt: FlowReceipt,
  ) => HarnessSnapshot<Context, Event, State>;
  readonly currentCorrelationId: () => string | undefined;
  readonly withInspectionCorrelation: <Value>(
    correlationId: string | undefined,
    work: () => Value,
  ) => Value;
  readonly ensureRuntime: () => FlowRuntime<never, unknown>;
  readonly currentRuntimeTimeMillis: (effectRuntime?: FlowRuntime<never, unknown>) => number;
  readonly clockNow: () => number;
  readonly cacheByKey: Map<string, FlowResourceSnapshot>;
  readonly knownResourceRefsByKey: Map<string, FlowResourceRef>;
  readonly rememberResourceRef: (ref: FlowResourceRef) => string;
  readonly invokeArgsForSnapshot: (
    snapshot: HarnessSnapshot<Context, Event, State>,
  ) => HarnessInvokeArgs<Context, Event, State>;
  readonly transactionInvokesForState: (
    snapshot: HarnessSnapshot<Context, Event, State>,
  ) => ReadonlyArray<AnyTransactionInvoke>;
  readonly dispatchOwnedMachineEvent: (event: Event) => void;
  readonly enqueue: (work: () => void) => void;
}>;

function createSuccessSnapshot(id: string, value: unknown): FlowResourceSnapshot {
  return {
    id,
    status: "success",
    availability: "value",
    activity: "idle",
    freshness: "fresh",
    value,
    isPlaceholderData: false,
  };
}

export function createFlowTestTransactionBookkeeping<
  Context,
  Event extends FlowEvent,
  State extends string,
>(deps: FlowTestTransactionBookkeepingDeps<Context, Event, State>) {
  const activeTransactions = new Map<string, ReadonlyArray<ActiveHarnessTransaction>>();
  const queuedTransactions = new Map<
    string,
    ReturnType<typeof createFifoQueue<QueuedHarnessTransaction<Event, State>>>
  >();
  const latestTransactionAttempts = new Map<string, LatestHarnessTransactionAttempt>();
  const transactionGenerations = new Map<string, number>();
  const transactionSnapshotOwners = new Map<string, number>();
  const previewOverlays = new Map<string, HarnessPreviewOverlay>();
  let nextPreviewLayerOrder = 0;

  const replaceTransactionSnapshot = (nextSnapshot: FlowTransactionSnapshot) => {
    deps.replaceTransactions(
      Object.freeze({
        ...deps.currentTransactions(),
        [nextSnapshot.id]: nextSnapshot,
      }),
    );
  };
  const activeTransactionEntries = (id: string): ReadonlyArray<ActiveHarnessTransaction> =>
    activeTransactions.get(id) ?? [];
  const replaceActiveTransactionEntries = (
    id: string,
    entries: ReadonlyArray<ActiveHarnessTransaction>,
  ) => {
    if (entries.length === 0) {
      activeTransactions.delete(id);
      return;
    }

    activeTransactions.set(id, entries);
  };
  const latestActiveTransaction = (id: string): ActiveHarnessTransaction | undefined => {
    const entries = activeTransactionEntries(id);
    return entries.length === 0 ? undefined : entries[entries.length - 1];
  };
  const activeTransactionsInConcurrencyKey = (
    concurrencyKey: string,
  ): ReadonlyArray<ActiveHarnessTransaction> =>
    Array.from(activeTransactions.values()).flatMap((entries) =>
      entries.filter((entry) => entry.concurrencyKey === concurrencyKey),
    );
  const transactionConcurrencyKey = (definition: HarnessTransactionDefinition): string =>
    definition.config.concurrency === "serialize"
      ? (definition.config.scope?.id ?? definition.id)
      : definition.id;
  const applyPreviewPatchSnapshot = (
    ref: FlowResourceRef,
    baseSnapshot: FlowResourceSnapshot | undefined,
    patch: FlowPreviewPatch,
  ): FlowResourceSnapshot => {
    const previousValue = baseSnapshot?.value;
    const nextValue =
      "replace" in patch ? patch.replace : applyResourcePatch(previousValue, patch.patch);
    return Object.freeze({
      ...createSuccessSnapshot(ref.id, nextValue),
      ...(previousValue === undefined ? {} : { previousValue }),
    });
  };
  const setCachedResourceSnapshot = (
    ref: FlowResourceRef,
    nextSnapshot: FlowResourceSnapshot | undefined,
  ) => {
    const refKey = deps.rememberResourceRef(ref);
    if (nextSnapshot === undefined) {
      deps.cacheByKey.delete(refKey);
      return;
    }

    deps.cacheByKey.set(refKey, nextSnapshot);
  };
  const replayPreviewOverlay = (
    rootSnapshot: FlowResourceSnapshot | undefined,
    layers: ReadonlyArray<HarnessPreviewLayer>,
  ): FlowResourceSnapshot | undefined => {
    let nextSnapshot = rootSnapshot;
    for (const layer of layers) {
      nextSnapshot = applyPreviewPatchSnapshot(layer.ref, nextSnapshot, layer.patch);
    }
    return nextSnapshot;
  };
  const applyTransactionPreviewPatches = (
    current: HarnessSnapshot<Context, Event, State>,
    definition: HarnessTransactionDefinition,
    params: unknown,
    generation: number,
    queueKey: string,
  ): Readonly<{
    readonly snapshot: HarnessSnapshot<Context, Event, State>;
    readonly previewLayers: ReadonlyArray<HarnessPreviewLayer>;
    readonly previewFailure: Exit.Failure<unknown, unknown> | undefined;
  }> => {
    const previewPatches = resolveTransactionPreviewPatches(definition, params);
    if (previewPatches.length === 0) {
      return {
        snapshot: current,
        previewLayers: [],
        previewFailure: undefined,
      };
    }

    let stagedNextPreviewLayerOrder = nextPreviewLayerOrder;
    const stagedOverlays = new Map<string, HarnessPreviewOverlay>();
    const stagedSnapshots = new Map<string, FlowResourceSnapshot | undefined>();
    const touchedRefs = new Map<string, FlowResourceRef>();
    const previewLayers: Array<HarnessPreviewLayer> = [];
    const stageExit = Effect.runSyncExit(
      Effect.sync(() => {
        for (const previewPatch of previewPatches) {
          const refKey = deps.rememberResourceRef(previewPatch.ref);
          const previousSnapshot = stagedSnapshots.get(refKey) ?? deps.cacheByKey.get(refKey);
          const overlay = stagedOverlays.get(refKey) ?? previewOverlays.get(refKey);
          const previewLayer = Object.freeze({
            ref: previewPatch.ref,
            patch: previewPatch,
            order: stagedNextPreviewLayerOrder,
            state: "active" as const,
          });
          stagedNextPreviewLayerOrder += 1;
          stagedOverlays.set(
            refKey,
            Object.freeze({
              rootSnapshot: overlay?.rootSnapshot ?? previousSnapshot,
              layers: [...(overlay?.layers ?? []), previewLayer],
            }),
          );
          touchedRefs.set(refKey, previewPatch.ref);
          stagedSnapshots.set(
            refKey,
            applyPreviewPatchSnapshot(previewPatch.ref, previousSnapshot, previewPatch),
          );
          previewLayers.push(previewLayer);
        }
      }),
    );
    if (Exit.isFailure(stageExit)) {
      return {
        snapshot: current,
        previewLayers: [],
        previewFailure: stageExit,
      };
    }

    nextPreviewLayerOrder = stagedNextPreviewLayerOrder;
    for (const [refKey, overlay] of stagedOverlays.entries()) {
      previewOverlays.set(refKey, overlay);
    }
    for (const [refKey, ref] of touchedRefs.entries()) {
      setCachedResourceSnapshot(ref, stagedSnapshots.get(refKey));
    }

    let next = current;
    for (const [index, previewLayer] of previewLayers.entries()) {
      next = deps.appendReceipt(next, {
        type: "transaction:preview-patch",
        id: definition.id,
        ...transactionPreviewReceiptFacts(generation, queueKey, [previewLayer])[0],
        previewIndex: index + 1,
        previewCount: previewPatches.length,
        parentState: current.value,
      });
    }

    return {
      snapshot: deps.materializeSnapshot(next),
      previewLayers,
      previewFailure: undefined,
    };
  };
  const commitTransactionPreviewLayers = (previewLayers: ReadonlyArray<HarnessPreviewLayer>) => {
    if (previewLayers.length === 0) {
      return;
    }

    const targetOrders = new Set(previewLayers.map((layer) => layer.order));
    const touchedRefKeys = new Set(previewLayers.map((layer) => resourceKeyOf(layer.ref)));

    for (const refKey of touchedRefKeys) {
      const overlay = previewOverlays.get(refKey);
      if (overlay === undefined) {
        continue;
      }

      const nextLayers = overlay.layers.map((layer) =>
        targetOrders.has(layer.order)
          ? Object.freeze({
              ...layer,
              state: "committed" as const,
            })
          : layer,
      );

      if (nextLayers.every((layer) => layer.state === "committed")) {
        previewOverlays.delete(refKey);
        continue;
      }

      previewOverlays.set(
        refKey,
        Object.freeze({
          rootSnapshot: overlay.rootSnapshot,
          layers: nextLayers,
        }),
      );
    }
  };
  const rollbackTransactionPreviewPatches = (
    current: HarnessSnapshot<Context, Event, State>,
    definition: HarnessTransactionDefinition,
    previewLayers: ReadonlyArray<HarnessPreviewLayer>,
    generation: number,
    queueKey: string,
  ): HarnessSnapshot<Context, Event, State> => {
    if (previewLayers.length === 0) {
      return current;
    }

    let next = current;
    const removedOrders = new Set(previewLayers.map((layer) => layer.order));
    const touchedRefs = new Map(
      previewLayers.map((layer) => [resourceKeyOf(layer.ref), layer.ref]),
    );

    for (const receiptFacts of transactionRollbackReceiptFacts(
      generation,
      queueKey,
      previewLayers,
    )) {
      next = deps.appendReceipt(next, {
        type: "transaction:rollback",
        id: definition.id,
        ...receiptFacts,
        parentState: current.value,
      });
    }

    for (const [refKey, ref] of touchedRefs) {
      const overlay = previewOverlays.get(refKey);
      if (overlay === undefined) {
        continue;
      }

      const remainingLayers = overlay.layers.filter((layer) => !removedOrders.has(layer.order));
      if (remainingLayers.length === 0) {
        previewOverlays.delete(refKey);
        setCachedResourceSnapshot(ref, overlay.rootSnapshot);
        continue;
      }

      previewOverlays.set(
        refKey,
        Object.freeze({
          rootSnapshot: overlay.rootSnapshot,
          layers: remainingLayers,
        }),
      );
      setCachedResourceSnapshot(ref, replayPreviewOverlay(overlay.rootSnapshot, remainingLayers));
    }

    return deps.materializeSnapshot(next);
  };
  const invalidateTransactionTargets = (
    current: HarnessSnapshot<Context, Event, State>,
    definition: HarnessTransactionDefinition,
    params: unknown,
  ): HarnessSnapshot<Context, Event, State> => {
    const targets = resolveTransactionInvalidationTargets(definition, params);
    if (targets.length === 0) {
      return current;
    }

    let next = current;
    const invalidatedAt = deps.clockNow();

    for (const target of targets) {
      let count = 0;

      for (const ref of transactionRefsForInvalidationTarget(
        deps.knownResourceRefsByKey.values(),
        target,
      )) {
        const refKey = resourceKeyOf(ref);
        const cached = deps.cacheByKey.get(refKey);
        if (cached === undefined || cached.freshness === "invalidated") {
          continue;
        }

        deps.cacheByKey.set(refKey, invalidateTransactionResourceSnapshot(cached, invalidatedAt));
        count += 1;
      }

      next = deps.appendReceipt(next, {
        type: "resource:invalidate",
        id: transactionReceiptIdForInvalidationTarget(target),
        count,
        parentState: current.value,
      });
    }

    return deps.materializeSnapshot(next);
  };
  const interruptTransactions = (
    current: HarnessSnapshot<Context, Event, State>,
    scope: "state-owned" | "all",
    parentState: State = current.value,
  ): HarnessSnapshot<Context, Event, State> => {
    const transactionIds =
      scope === "all"
        ? Array.from(activeTransactions.keys())
        : Array.from(activeTransactions.entries())
            .filter(([, entries]) => entries.some((entry) => entry.stateOwned))
            .map(([id]) => id);
    if (transactionIds.length === 0) {
      return current;
    }

    let next = current;
    for (const transactionId of transactionIds) {
      const matchingTransactions = activeTransactionEntries(transactionId).filter((entry) =>
        scope === "all" ? true : entry.stateOwned,
      );
      if (matchingTransactions.length === 0) {
        continue;
      }

      replaceActiveTransactionEntries(
        transactionId,
        activeTransactionEntries(transactionId).filter(
          (entry) => !matchingTransactions.includes(entry),
        ),
      );

      for (const activeTransaction of matchingTransactions) {
        queuedTransactions.delete(activeTransaction.concurrencyKey);
        activeTransaction.interrupt();
        if (transactionSnapshotOwners.get(transactionId) === activeTransaction.generation) {
          replaceTransactionSnapshot({
            id: transactionId,
            status: "interrupt",
          });
        }
        next = deps.appendReceipt(next, {
          type: "transaction:interrupt",
          id: transactionId,
          generation: activeTransaction.generation,
          queueKey: activeTransaction.concurrencyKey,
          ...transactionTimingFacts(activeTransaction.startedAt, deps.currentRuntimeTimeMillis()),
          parentState,
        });
        if (transactionSnapshotOwners.get(transactionId) === activeTransaction.generation) {
          deps.replaceIssues(
            replaceIssue(
              deps.currentIssues(),
              interruptIssue("transaction", transactionId, {
                correlationId: activeTransaction.correlationId,
                parentState,
                receipts: next.receipts,
              }),
            ),
          );
        }
        next = rollbackTransactionPreviewPatches(
          deps.materializeSnapshot(next),
          activeTransaction.definition,
          activeTransaction.previewLayers,
          activeTransaction.generation,
          activeTransaction.concurrencyKey,
        );
      }
    }

    return deps.materializeSnapshot(next);
  };
  const queueTransaction = (
    current: HarnessSnapshot<Context, Event, State>,
    queued: QueuedHarnessTransaction<Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
    const existing =
      queuedTransactions.get(queued.concurrencyKey) ??
      createFifoQueue<QueuedHarnessTransaction<Event, State>>();
    existing.enqueue(queued);
    queuedTransactions.set(queued.concurrencyKey, existing);
    return deps.withInspectionCorrelation(queued.correlationId, () =>
      deps.appendReceipt(current, {
        type: "transaction:queue",
        id: queued.definition.id,
        queueKey: queued.concurrencyKey,
        overlapCause: queued.overlapCause,
        parentState: queued.options.parentState,
      }),
    );
  };
  const queueQueuedTransaction = (
    current: HarnessSnapshot<Context, Event, State>,
    queued: QueuedHarnessTransaction<Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
    return queueTransaction(current, {
      ...queued,
      correlationId: queued.correlationId ?? deps.currentCorrelationId(),
    });
  };

  const dequeueTransaction = (
    concurrencyKey: string,
  ): QueuedHarnessTransaction<Event, State> | undefined => {
    const queued = queuedTransactions.get(concurrencyKey);
    if (queued === undefined) {
      return undefined;
    }

    const nextQueued = queued.dequeue();
    if (queued.size() === 0) {
      queuedTransactions.delete(concurrencyKey);
    }
    return nextQueued;
  };

  const queuedTransactionCount = (concurrencyKey: string): number =>
    queuedTransactions.get(concurrencyKey)?.size() ?? 0;

  const cancelActiveTransaction = (
    current: HarnessSnapshot<Context, Event, State>,
    definition: HarnessTransactionDefinition,
    parentState: State,
  ): HarnessSnapshot<Context, Event, State> => {
    const activeTransaction = latestActiveTransaction(definition.id);
    if (activeTransaction === undefined) {
      return current;
    }

    replaceActiveTransactionEntries(
      definition.id,
      activeTransactionEntries(definition.id).filter(
        (entry) => entry.generation !== activeTransaction.generation,
      ),
    );
    queuedTransactions.delete(activeTransaction.concurrencyKey);
    activeTransaction.interrupt();
    deps.replaceIssues(clearIssue(deps.currentIssues(), "transaction", definition.id));
    replaceTransactionSnapshot({
      id: definition.id,
      status: "interrupt",
    });
    return rollbackTransactionPreviewPatches(
      deps.appendReceipt(current, {
        type: "transaction:interrupt",
        id: definition.id,
        generation: activeTransaction.generation,
        queueKey: activeTransaction.concurrencyKey,
        overlapCause: "cancel-previous",
        ...transactionTimingFacts(activeTransaction.startedAt, deps.currentRuntimeTimeMillis()),
        parentState,
      }),
      activeTransaction.definition,
      activeTransaction.previewLayers,
      activeTransaction.generation,
      activeTransaction.concurrencyKey,
    );
  };
  const failPreviewPublication = (
    current: HarnessSnapshot<Context, Event, State>,
    definition: HarnessTransactionDefinition,
    generation: number,
    startedAt: number,
    queueKey: string,
    correlationId: string | undefined,
    exit: Exit.Failure<unknown, unknown>,
  ): HarnessSnapshot<Context, Event, State> => {
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
        queueKey,
        ...transactionTimingFacts(startedAt, deps.currentRuntimeTimeMillis()),
        parentState: current.value,
      },
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
    replaceTransactionSnapshot(
      completion.lane === "interrupt"
        ? {
            id: definition.id,
            status: "interrupt",
          }
        : completion.lane === "failure"
          ? {
              id: definition.id,
              status: "failure",
              error: completion.issue.error,
            }
          : {
              id: definition.id,
              status: "defect",
            },
    );
    return deps.appendReceipt(deps.materializeSnapshot(current), failureReceipt);
  };

  const startResolvedTransaction = (
    current: HarnessSnapshot<Context, Event, State>,
    definition: HarnessTransactionDefinition,
    params: unknown,
    options: TransactionStartOptions<Event, State>,
    dequeuedOverlapCause?: TransactionInspectionOverlapCause,
  ): HarnessSnapshot<Context, Event, State> => {
    const generation = (transactionGenerations.get(definition.id) ?? 0) + 1;
    const concurrencyKey = transactionConcurrencyKey(definition);
    const startedAt = deps.currentRuntimeTimeMillis();
    latestTransactionAttempts.set(definition.id, {
      definition,
      params,
    });
    transactionGenerations.set(definition.id, generation);
    transactionSnapshotOwners.set(definition.id, generation);
    deps.replaceIssues(clearIssue(deps.currentIssues(), "transaction", definition.id));
    replaceTransactionSnapshot({
      id: definition.id,
      status: "pending",
    });
    const correlationId = options.correlationId;
    const preview = deps.withInspectionCorrelation(correlationId, () => {
      let next = deps.materializeSnapshot(current);
      if (dequeuedOverlapCause !== undefined) {
        next = deps.appendReceipt(next, {
          type: "transaction:dequeue",
          id: definition.id,
          queueKey: concurrencyKey,
          overlapCause: dequeuedOverlapCause,
          parentState: options.parentState,
        });
      }

      next = deps.appendReceipt(next, {
        type: "transaction:start",
        id: definition.id,
        generation,
        trigger: options.trigger,
        queueKey: concurrencyKey,
        startedAt,
        parentState: options.parentState,
      });
      return applyTransactionPreviewPatches(next, definition, params, generation, concurrencyKey);
    });
    if (preview.previewFailure !== undefined) {
      return failPreviewPublication(
        preview.snapshot,
        definition,
        generation,
        startedAt,
        concurrencyKey,
        correlationId,
        preview.previewFailure,
      );
    }
    const next = preview.snapshot;

    const effectRuntime = deps.ensureRuntime();
    const interrupt = ownedEffectHandleFromFiber(
      effectRuntime.managedRuntime.runFork(
        resolveTransactionCommitEffect(definition, params) as Effect.Effect<
          unknown,
          unknown,
          never
        >,
      ),
      (exit) => {
        deps.enqueue(() => {
          const activeTransaction = activeTransactionEntries(definition.id).find(
            (entry) => entry.generation === generation,
          );
          if (activeTransaction === undefined) {
            return;
          }

          replaceActiveTransactionEntries(
            definition.id,
            activeTransactionEntries(definition.id).filter(
              (entry) => entry.generation !== generation,
            ),
          );
          const isSnapshotOwner = transactionSnapshotOwners.get(definition.id) === generation;

          const resumeQueuedTransaction = () => {
            const queued = dequeueTransaction(activeTransaction.concurrencyKey);
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
                queued.overlapCause,
              ),
            );
          };

          if (Exit.isSuccess(exit)) {
            deps.withInspectionCorrelation(activeTransaction.correlationId, () => {
              commitTransactionPreviewLayers(activeTransaction.previewLayers);
              const completedAt = deps.currentRuntimeTimeMillis(effectRuntime);
              if (!isSnapshotOwner) {
                return;
              }
              const routedEvent = resolveSuccessTransactionRoute(definition, exit.value) as
                | Event
                | undefined;
              replaceTransactionSnapshot({
                id: definition.id,
                status: "success",
                value: exit.value,
              });
              deps.replaceIssues(clearIssue(deps.currentIssues(), "transaction", definition.id));
              const currentSnapshot = deps.currentSnapshot();
              const successSnapshot = deps.appendReceipt(currentSnapshot, {
                type: "transaction:success",
                id: definition.id,
                generation,
                queueKey: activeTransaction.concurrencyKey,
                ...transactionTimingFacts(activeTransaction.startedAt, completedAt),
                ...(transactionRoutedEventType(routedEvent) === undefined
                  ? {}
                  : { routedEventType: transactionRoutedEventType(routedEvent) }),
                parentState: currentSnapshot.value,
              });
              deps.replaceSnapshot(
                invalidateTransactionTargets(successSnapshot, definition, params),
              );
              resumeQueuedTransaction();
              if (routedEvent !== undefined) {
                deps.dispatchOwnedMachineEvent(routedEvent);
              }
            });
            return;
          }

          const currentSnapshot = deps.currentSnapshot();
          const completion = resolveFailedTransactionIssue(definition, exit, {
            correlationId: activeTransaction.correlationId,
            parentState: currentSnapshot.value,
            receipts: currentSnapshot.receipts,
          });
          const routedEvent = !isSnapshotOwner
            ? undefined
            : (resolveFailedTransactionRoute(definition, exit, completion) as Event | undefined);
          const completedAt = deps.currentRuntimeTimeMillis(effectRuntime);
          const failureReceipt = !isSnapshotOwner
            ? undefined
            : receiptWithCorrelation(
                {
                  type: transactionReceiptTypeForLane(completion.lane),
                  id: definition.id,
                  generation,
                  queueKey: activeTransaction.concurrencyKey,
                  ...transactionTimingFacts(activeTransaction.startedAt, completedAt),
                  ...(transactionRoutedEventType(routedEvent) === undefined
                    ? {}
                    : { routedEventType: transactionRoutedEventType(routedEvent) }),
                  parentState: currentSnapshot.value,
                },
                activeTransaction.correlationId,
              );
          if (failureReceipt !== undefined) {
            deps.replaceIssues(
              replaceIssue(deps.currentIssues(), {
                ...completion.issue,
                handled: routedEvent !== undefined,
                facts: issueFactsFromReceipts(definition.id, {
                  correlationId: activeTransaction.correlationId,
                  parentState: currentSnapshot.value,
                  receipts: [...currentSnapshot.receipts, failureReceipt],
                }),
              }),
            );
            replaceTransactionSnapshot(
              completion.lane === "interrupt"
                ? {
                    id: definition.id,
                    status: "interrupt",
                  }
                : completion.lane === "failure"
                  ? {
                      id: definition.id,
                      status: "failure",
                      error: completion.issue.error,
                    }
                  : {
                      id: definition.id,
                      status: "defect",
                    },
            );
          }
          deps.withInspectionCorrelation(activeTransaction.correlationId, () => {
            deps.replaceSnapshot(
              rollbackTransactionPreviewPatches(
                failureReceipt === undefined
                  ? deps.currentSnapshot()
                  : deps.appendReceipt(deps.currentSnapshot(), failureReceipt),
                definition,
                activeTransaction.previewLayers,
                generation,
                activeTransaction.concurrencyKey,
              ),
            );
            resumeQueuedTransaction();
            if (routedEvent !== undefined) {
              deps.dispatchOwnedMachineEvent(routedEvent);
            }
          });
        });
      },
    );

    activeTransactions.set(definition.id, [
      ...activeTransactionEntries(definition.id),
      {
        definition,
        concurrencyKey,
        generation,
        startedAt,
        previewLayers: preview.previewLayers,
        interrupt,
        stateOwned: options.stateOwned,
        correlationId,
      },
    ]);

    return next;
  };

  const startResolvedTransactionWithConcurrency = (
    current: HarnessSnapshot<Context, Event, State>,
    definition: HarnessTransactionDefinition,
    params: unknown,
    options: TransactionStartOptions<Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
    const concurrencyKey = transactionConcurrencyKey(definition);

    const queueOrRejectSerializedTransaction = (
      overlapCause: TransactionInspectionOverlapCause,
    ): HarnessSnapshot<Context, Event, State> => {
      const queueCapacity = serializeQueueCapacity(definition);
      const queuedAttemptCount = queuedTransactionCount(concurrencyKey);
      if (queuedAttemptCount < queueCapacity) {
        return queueQueuedTransaction(current, {
          concurrencyKey,
          overlapCause,
          definition,
          params,
          options,
          correlationId: options.correlationId,
        });
      }

      const activeAttemptCount = activeTransactionsInConcurrencyKey(concurrencyKey).length;
      const next = deps.appendReceipt(current, {
        type: "transaction:reject",
        id: definition.id,
        queueKey: concurrencyKey,
        overlapCause,
        activeAttemptCount,
        queuedAttemptCount,
        queueCapacity,
        parentState: options.parentState,
      });
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
            receipts: next.receipts,
          }),
        }),
      );
      return next;
    };

    if (activeTransactionEntries(definition.id).length > 0) {
      if (definition.config.concurrency === "serialize") {
        return queueOrRejectSerializedTransaction("active-attempt");
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

      const next = deps.appendReceipt(current, {
        type: "transaction:reject",
        id: definition.id,
        queueKey: concurrencyKey,
        overlapCause: "reject-while-running",
        activeAttemptCount: activeTransactionEntries(definition.id).length,
        parentState: options.parentState,
      });
      deps.replaceIssues(
        replaceIssue(deps.currentIssues(), {
          kind: "failure",
          source: "transaction",
          id: definition.id,
          error: rejectedWhileRunningTransactionDiagnostic({
            transactionId: definition.id,
            concurrency: definition.config.concurrency ?? "reject-while-running",
            parentState: options.parentState,
            activeAttemptCount: activeTransactionEntries(definition.id).length,
          }),
          facts: issueFactsFromReceipts(definition.id, {
            correlationId: options.correlationId,
            parentState: options.parentState,
            receipts: next.receipts,
          }),
        }),
      );
      return next;
    }

    if (
      definition.config.concurrency === "serialize" &&
      activeTransactionsInConcurrencyKey(concurrencyKey).length > 0
    ) {
      return queueOrRejectSerializedTransaction("serialize-scope");
    }

    return startResolvedTransaction(current, definition, params, options);
  };

  const startTransaction = (
    current: HarnessSnapshot<Context, Event, State>,
    definition: HarnessTransactionDefinition,
    options: TransactionStartOptions<Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
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

  const startStateOwnedTransactions = (
    current: HarnessSnapshot<Context, Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
    const definitions = deps.transactionInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let next = current;
    for (const definition of definitions) {
      next = startTransaction(next, runtimeTransactionDefinition(definition.transaction), {
        parentState: current.value,
        stateOwned: true,
        trigger: "state",
        correlationId: deps.currentCorrelationId(),
      });
    }

    return next;
  };

  const retryTransaction = (id: string) => {
    const transaction = deps.currentTransactions()[id];
    const attempt = latestTransactionAttempts.get(id);
    if (
      transaction === undefined ||
      attempt === undefined ||
      (transaction.status !== "failure" && transaction.status !== "interrupt")
    ) {
      return false;
    }

    const currentSnapshot = deps.currentSnapshot();
    deps.replaceSnapshot(
      startResolvedTransactionWithConcurrency(
        deps.appendReceipt(currentSnapshot, {
          type: "transaction:retry",
          id,
          parentState: currentSnapshot.value,
        }),
        attempt.definition,
        attempt.params,
        {
          parentState: currentSnapshot.value,
          trigger: "event",
          stateOwned: false,
          correlationId: undefined,
        },
      ),
    );
    return true;
  };

  const resetTransaction = (id: string) => {
    const transaction = deps.currentTransactions()[id];
    if (
      transaction === undefined ||
      transaction.status === "idle" ||
      transaction.status === "pending"
    ) {
      return false;
    }

    deps.replaceIssues(clearIssue(deps.currentIssues(), "transaction", id));
    replaceTransactionSnapshot({
      id,
      status: "idle",
    });
    deps.replaceSnapshot(
      deps.appendReceipt(deps.materializeSnapshot(deps.currentSnapshot()), {
        type: "transaction:reset",
        id,
        parentState: deps.currentSnapshot().value,
      }),
    );
    return true;
  };

  return Object.freeze({
    currentTransactions: deps.currentTransactions,
    activeTransactionIds: () =>
      Array.from(activeTransactions.entries())
        .filter(([, entries]) => entries.length > 0)
        .map(([id]) => id),
    activeTransactionFiberCount: () =>
      Array.from(activeTransactions.values()).reduce((count, entries) => count + entries.length, 0),
    startTransaction,
    startStateOwnedTransactions,
    interruptTransactions,
    retryTransaction,
    resetTransaction,
  });
}
