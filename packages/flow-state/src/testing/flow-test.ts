import { Clock, Effect, Exit, type Layer } from "effect";
import { TestClock } from "effect/testing";

import {
  type ChildLifecycleSpawnReason,
  type ChildLifecycleStopReason,
  childStartReceiptFacts,
  childStopReceiptFacts,
} from "../core/orchestrator/child-lifecycle-inspection-facts.js";
import type {
  FlowAppDefinition,
  FlowChildDefinition,
  FlowChildSnapshot,
  FlowEvent,
  FlowIssue,
  FlowInvokeDescriptor,
  FlowMachine,
  FlowPreviewPatch,
  FlowReceipt,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowRuntime,
  FlowSeededResource,
  FlowSnapshot,
  FlowStartedTestBuilder,
  FlowTestBuilder,
  FlowTestCache,
  FlowTestHarness,
  FlowTestProgressBounds,
  FlowTestStreamSnapshot,
  FlowTimerSnapshot,
  FlowTransactionSnapshot,
  FlowTransitionRuntime,
} from "../core/api/types.js";
import { rejectedWhileRunningTransactionDiagnostic } from "../shared/diagnostics.js";
import {
  afterDefinitionsForState,
  applyAfterTransitionWithMeta,
  applyMachineEventWithMeta,
  canMachineTransition,
  planMachineEvent,
} from "../core/machines/machine-transition.js";
import { annotateNewMachineEventReceipts } from "../core/inspection/inspection-receipts.js";
import {
  dispatchReadyWork,
  enqueueReadyWork,
  flushReadyWork,
  startReadyWork,
} from "../core/scheduling/ready-work.js";
import { issueFactsFromReceipts } from "../core/inspection/receipt-summary.js";
import { applyResourcePatch } from "../core/store/resource-patch.js";
import { createFifoQueue } from "../utils/fifo-queue.js";
import {
  resolveTransactionCommitEffect,
  resolveTransactionInvalidationTargets,
  resolveTransactionParams,
  resolveTransactionPreviewPatches,
} from "../core/transactions/transaction-callbacks.js";
import {
  invalidateTransactionResourceSnapshot,
  transactionReceiptIdForInvalidationTarget,
  transactionRefsForInvalidationTarget,
} from "../core/transactions/transaction-invalidation.js";
import {
  type OrchestratorActorHandle,
  childActorId,
  childInvokesForState,
  childSnapshotForDefinition,
  childStatusForActor,
} from "../core/orchestrator/orchestrator-helpers.js";
import {
  clearIssue,
  interruptIssue,
  replaceIssue,
} from "../core/orchestrator/orchestrator-issues.js";
import {
  resolveFailedTransactionCompletion,
  resolveSuccessTransactionRoute,
  transactionReceiptTypeForLane,
} from "../core/orchestrator/orchestrator-transaction-outcome.js";
import type { UnknownFlowTransactionDefinition } from "../core/orchestrator/orchestrator-transaction-types.js";
import { receiptWithCorrelation } from "../core/inspection/receipt-correlation.js";
import {
  type TransactionInspectionOverlapCause,
  transactionPreviewReceiptFacts,
  transactionRollbackReceiptFacts,
  transactionRoutedEventType,
  transactionTimingFacts,
} from "../core/orchestrator/transaction-inspection-facts.js";
import { createAppDefinition } from "../descriptors/app.js";
import { fixtureResourcesForApp } from "../descriptors/inventory.js";
import { createRuntime } from "../runtime/contract-runtime.js";
import { createFlowTestAfterTimerOwnership } from "./flow-test-after-timer-ownership.js";
import { createFlowModel } from "./flow-model.js";
import { createFlowTestProgressControls } from "./flow-test-progress-controls.js";
import { createFlowTestReadSurface } from "./flow-test-read-surface.js";
import { createFlowTestStreamOwnership } from "./flow-test-stream-ownership.js";

type BuilderState<App extends FlowAppDefinition | undefined = undefined> = Readonly<{
  readonly app?: App;
  readonly resources: ReadonlyArray<FlowSeededResource>;
  readonly fixtures: ReadonlyArray<string>;
}>;

type HarnessSnapshot<Context, Event extends FlowEvent, State extends string> = FlowSnapshot<
  Context,
  State,
  Event
>;

type AnyStreamDefinition = Extract<FlowInvokeDescriptor, { readonly kind: "stream" }>;
type AnyTransactionInvoke = Extract<FlowInvokeDescriptor, { readonly kind: "run" }>;
type HarnessTransactionDefinition = UnknownFlowTransactionDefinition;

type ActiveHarnessChild = Readonly<{
  readonly actorId: string;
  readonly actor: OrchestratorActorHandle &
    Readonly<{
      readonly subscribe: (listener: () => void) => () => void;
    }>;
  readonly definition: FlowChildDefinition;
  readonly correlationId: string | undefined;
  readonly unsubscribe: () => void;
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

const defaultProgressBounds: FlowTestProgressBounds = Object.freeze({
  maxTicks: 20,
  maxFibers: 10,
});

function createIdleSnapshot(id: string): FlowResourceSnapshot {
  return {
    id,
    status: "idle",
    availability: "empty",
    activity: "idle",
    freshness: "fresh",
    isPlaceholderData: false,
  };
}

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

function createCache(resources: ReadonlyArray<FlowSeededResource>): Readonly<{
  readonly byId: Map<string, FlowResourceSnapshot>;
  readonly refsById: Map<string, FlowResourceRef>;
  readonly inspector: FlowTestCache;
}> {
  const byId = new Map<string, FlowResourceSnapshot>();
  const refsById = new Map<string, FlowResourceRef>();
  for (const resource of resources) {
    byId.set(resource.ref.id, createSuccessSnapshot(resource.ref.id, resource.value));
    refsById.set(resource.ref.id, resource.ref);
  }
  return {
    byId,
    refsById,
    inspector: {
      query: (id) => byId.get(id),
    },
  };
}

function normalizeInvokes(
  configured: FlowInvokeDescriptor | ReadonlyArray<FlowInvokeDescriptor> | undefined,
): ReadonlyArray<FlowInvokeDescriptor> {
  if (configured === undefined) {
    return [];
  }

  if (Array.isArray(configured)) {
    return configured;
  }

  return [configured as FlowInvokeDescriptor];
}

function streamInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: HarnessSnapshot<Context, Event, State>,
  value: State = snapshot.value,
): ReadonlyArray<AnyStreamDefinition> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is AnyStreamDefinition => invoke.kind === "stream",
  );
}

function afterInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: HarnessSnapshot<Context, Event, State>,
  value: State = snapshot.value,
) {
  if (value === snapshot.value) {
    return afterDefinitionsForState(snapshot);
  }

  return afterDefinitionsForState(
    Object.freeze({
      ...snapshot,
      value,
    }),
  );
}

function transactionInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: HarnessSnapshot<Context, Event, State>,
  value: State = snapshot.value,
): ReadonlyArray<AnyTransactionInvoke> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is AnyTransactionInvoke => invoke.kind === "run",
  );
}

function invokeArgsForSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: HarnessSnapshot<Context, Event, State>,
): Readonly<{
  readonly context: Context;
  readonly value: State;
  readonly snapshot: HarnessSnapshot<Context, Event, State>;
  readonly resources: HarnessSnapshot<Context, Event, State>["resources"];
  readonly transactions: HarnessSnapshot<Context, Event, State>["transactions"];
  readonly streams: HarnessSnapshot<Context, Event, State>["streams"];
  readonly timers: HarnessSnapshot<Context, Event, State>["timers"];
  readonly children: HarnessSnapshot<Context, Event, State>["children"];
  readonly receipts: HarnessSnapshot<Context, Event, State>["receipts"];
}> {
  return {
    context: snapshot.context,
    value: snapshot.value,
    snapshot,
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    timers: snapshot.timers,
    children: snapshot.children,
    receipts: snapshot.receipts,
  };
}

function createHarness<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  app: FlowAppDefinition | undefined,
  resources: ReadonlyArray<FlowSeededResource>,
  input?: Partial<Context>,
): FlowStartedTestBuilder<Context, Event, State> {
  type TransactionStartOptions = Readonly<{
    readonly event?: Event;
    readonly parentState: State;
    readonly stateOwned: boolean;
    readonly trigger: "state" | "event";
    readonly correlationId: string | undefined;
  }>;
  type QueuedHarnessTransaction = Readonly<{
    readonly concurrencyKey: string;
    readonly overlapCause: TransactionInspectionOverlapCause;
    readonly definition: HarnessTransactionDefinition;
    readonly params: unknown;
    readonly options: TransactionStartOptions;
    readonly correlationId: string | undefined;
  }>;
  type LatestHarnessTransactionAttempt = Readonly<{
    readonly definition: HarnessTransactionDefinition;
    readonly params: unknown;
  }>;

  const cacheState = createCache(resources);
  const cache = cacheState.inspector;
  const knownResourceRefs = cacheState.refsById;
  const ownedChildren = new Map<string, ActiveHarnessChild>();
  const activeTransactions = new Map<string, ReadonlyArray<ActiveHarnessTransaction>>();
  const queuedTransactions = new Map<
    string,
    ReturnType<typeof createFifoQueue<QueuedHarnessTransaction>>
  >();
  const latestTransactionAttempts = new Map<string, LatestHarnessTransactionAttempt>();
  const transactionGenerations = new Map<string, number>();
  const transactionSnapshotOwners = new Map<string, number>();
  const previewOverlays = new Map<string, HarnessPreviewOverlay>();
  let nextPreviewLayerOrder = 0;
  let providedLayers: ReadonlyArray<Layer.Any> = [];
  let customClock = false;
  let clockNow = () => 0;
  let runtime: FlowRuntime<never, unknown> | undefined;
  let transactions: Readonly<Record<string, FlowTransactionSnapshot>> = {};
  let issues: ReadonlyArray<FlowIssue> = [];
  let childSnapshots: Readonly<Record<string, FlowChildSnapshot>> = {};
  let streamSnapshots: Readonly<Record<string, FlowTestStreamSnapshot>> = {};
  let timerSnapshots: Readonly<Record<string, FlowTimerSnapshot>> = {};
  const transitionRuntime: FlowTransitionRuntime = Object.freeze({
    now: () => clockNow(),
  });
  let activeInspectionCorrelationId: string | undefined;

  const withInspectionCorrelation = <Value>(
    correlationId: string | undefined,
    work: () => Value,
  ): Value => {
    const previous = activeInspectionCorrelationId;
    activeInspectionCorrelationId = correlationId;
    try {
      return work();
    } finally {
      activeInspectionCorrelationId = previous;
    }
  };

  const ensureRuntime = () => {
    if (runtime !== undefined) {
      return runtime;
    }

    const runtimeApp = app ?? createAppDefinition({ modules: [] as const });
    runtime = createRuntime(
      runtimeApp.layer({
        store: {
          kind: "store",
          mode: "test",
        },
        orchestrators: {
          kind: "orchestrators",
          mode: "test",
        },
        services: [...providedLayers, TestClock.layer()],
      }),
    );
    if (!customClock) {
      clockNow = () => runtime!.managedRuntime.runSync(Clock.currentTimeMillis);
    }
    runtime.resources.seedResources(resources);
    return runtime;
  };

  const currentRuntimeTimeMillis = (effectRuntime = ensureRuntime()) =>
    effectRuntime.managedRuntime.runSync(Clock.currentTimeMillis);

  const materializeResources = () =>
    Object.fromEntries(
      Array.from(knownResourceRefs.entries()).map(([id]) => [
        id,
        cache.query(id) ?? createIdleSnapshot(id),
      ]),
    );

  const materializeSnapshot = (
    base: HarnessSnapshot<Context, Event, State>,
  ): HarnessSnapshot<Context, Event, State> =>
    Object.freeze({
      ...base,
      resources: materializeResources(),
      transactions,
      streams: streamSnapshots,
      timers: timerSnapshots,
      children: childSnapshots,
    });

  const applyInput = (
    base: HarnessSnapshot<Context, Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
    if (input === undefined) {
      return base;
    }

    return Object.freeze({
      ...base,
      context: Object.freeze({
        ...(base.context as Record<string, unknown>),
        ...(input as Record<string, unknown>),
      }) as Context,
    });
  };

  let snapshot = materializeSnapshot(
    applyInput(machine.getInitialSnapshot() as HarnessSnapshot<Context, Event, State>),
  );
  let nextInspectionCorrelationId = 0;

  const replaceSnapshot = (next: HarnessSnapshot<Context, Event, State>) => {
    snapshot = materializeSnapshot(next);
  };

  const annotateMachineEventReceipts = (
    previousReceiptCount: number,
    nextSnapshot: HarnessSnapshot<Context, Event, State>,
    correlationId: string,
    sourceActorId?: string,
  ): HarnessSnapshot<Context, Event, State> =>
    annotateNewMachineEventReceipts(nextSnapshot, previousReceiptCount, {
      ...(sourceActorId === undefined ? {} : { sourceActorId }),
      targetActorId: machine.id,
      correlationId,
    }) as HarnessSnapshot<Context, Event, State>;

  const dispatchMachineEvent = (event: Event, sourceActorId?: string) => {
    const previousReceiptCount = snapshot.receipts.length;
    const correlationId = `${machine.id}:event:${++nextInspectionCorrelationId}`;
    const next = withInspectionCorrelation(correlationId, () => {
      const plan = planMachineEvent(snapshot, event, transitionRuntime);
      const applied = applyMachineEventWithMeta(plan, transitionRuntime);
      let correlatedSnapshot = reconcileStateOwnedWork(
        snapshot,
        applied.snapshot,
        applied.reentered,
      );
      if (plan.matched && plan.transition.submit !== undefined) {
        correlatedSnapshot = startTransaction(correlatedSnapshot, plan.transition.submit, {
          event,
          parentState: correlatedSnapshot.value,
          stateOwned: false,
          trigger: "event",
          correlationId,
        });
      }
      return correlatedSnapshot;
    });
    replaceSnapshot(
      annotateMachineEventReceipts(previousReceiptCount, next, correlationId, sourceActorId),
    );
    return harness;
  };

  const dispatchOwnedMachineEvent = (event: Event) => dispatchMachineEvent(event, machine.id);

  const replaceStreamSnapshots = (next: Readonly<Record<string, FlowTestStreamSnapshot>>) => {
    streamSnapshots = next;
  };

  const replaceChildSnapshot = (
    id: string,
    snapshotForId: FlowChildSnapshot,
  ): Readonly<Record<string, FlowChildSnapshot>> =>
    Object.freeze({
      ...childSnapshots,
      [id]: snapshotForId,
    });

  const removeChildSnapshot = (id: string): Readonly<Record<string, FlowChildSnapshot>> => {
    const { [id]: _removed, ...rest } = childSnapshots;
    return Object.freeze(rest);
  };

  const appendReceipt = (
    current: HarnessSnapshot<Context, Event, State>,
    receipt: FlowReceipt,
  ): HarnessSnapshot<Context, Event, State> =>
    Object.freeze({
      ...current,
      receipts: [
        ...current.receipts,
        receiptWithCorrelation(receipt, activeInspectionCorrelationId),
      ],
    });

  const streamOwnership = createFlowTestStreamOwnership({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    materializeSnapshot,
    currentStreamSnapshots: () => streamSnapshots,
    replaceStreamSnapshots,
    currentIssues: () => issues,
    replaceIssues: (nextIssues) => {
      issues = nextIssues;
    },
    appendReceipt,
    streamInvokesForState,
    invokeArgsForSnapshot,
    dispatchOwnedMachineEvent,
    enqueue: (work) => {
      enqueueReadyWork(harness, work);
    },
    withInspectionCorrelation,
    currentCorrelationId: () => activeInspectionCorrelationId,
  });

  const { activeStreamIds, startStateOwnedStreams, stopStateOwnedStreams } = streamOwnership;

  const afterTimerOwnership = createFlowTestAfterTimerOwnership({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    materializeSnapshot,
    currentTimerSnapshots: () => timerSnapshots,
    replaceTimerSnapshots: (nextTimerSnapshots) => {
      timerSnapshots = nextTimerSnapshots;
    },
    appendReceipt,
    afterInvokesForState,
    enqueue: (work) => {
      enqueueReadyWork(harness, work);
    },
    currentCorrelationId: () => activeInspectionCorrelationId,
    withInspectionCorrelation,
    now: () => currentRuntimeTimeMillis(),
    runEffect: (effect, onExit) =>
      ensureRuntime().managedRuntime.runCallback(
        effect,
        onExit === undefined ? undefined : { onExit },
      ),
    applyAfterTransition: (current, definition) =>
      applyAfterTransitionWithMeta(current, definition, transitionRuntime),
    finalizeAppliedTransition: (current, applied) =>
      annotateMachineEventReceipts(
        current.receipts.length,
        reconcileStateOwnedWork(current, applied.snapshot, applied.reentered),
        `${machine.id}:event:${++nextInspectionCorrelationId}`,
        machine.id,
      ),
  });

  const { activeAfterEntries, startStateOwnedAfters, stopStateOwnedAfters } = afterTimerOwnership;

  const replaceTransactionSnapshot = (nextSnapshot: FlowTransactionSnapshot) => {
    transactions = Object.freeze({
      ...transactions,
      [nextSnapshot.id]: nextSnapshot,
    });
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
    refId: string,
    nextSnapshot: FlowResourceSnapshot | undefined,
  ) => {
    if (nextSnapshot === undefined) {
      cacheState.byId.delete(refId);
      return;
    }

    cacheState.byId.set(refId, nextSnapshot);
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
  }> => {
    const previewPatches = resolveTransactionPreviewPatches(definition, params);
    if (previewPatches.length === 0) {
      return {
        snapshot: current,
        previewLayers: [],
      };
    }

    let next = current;
    const previewLayers: Array<HarnessPreviewLayer> = [];

    for (const [index, previewPatch] of previewPatches.entries()) {
      knownResourceRefs.set(previewPatch.ref.id, previewPatch.ref);
      const previousSnapshot = cache.query(previewPatch.ref.id);
      const overlay = previewOverlays.get(previewPatch.ref.id);
      const previewLayer = Object.freeze({
        ref: previewPatch.ref,
        patch: previewPatch,
        order: nextPreviewLayerOrder,
        state: "active" as const,
      });
      nextPreviewLayerOrder += 1;
      previewOverlays.set(
        previewPatch.ref.id,
        Object.freeze({
          rootSnapshot: overlay?.rootSnapshot ?? previousSnapshot,
          layers: [...(overlay?.layers ?? []), previewLayer],
        }),
      );
      previewLayers.push(previewLayer);

      setCachedResourceSnapshot(
        previewPatch.ref.id,
        applyPreviewPatchSnapshot(previewPatch.ref, previousSnapshot, previewPatch),
      );

      next = appendReceipt(next, {
        type: "transaction:preview-patch",
        id: definition.id,
        ...transactionPreviewReceiptFacts(generation, queueKey, [previewLayer])[0],
        previewIndex: index + 1,
        previewCount: previewPatches.length,
        parentState: current.value,
      });
    }

    return {
      snapshot: materializeSnapshot(next),
      previewLayers,
    };
  };

  const commitTransactionPreviewLayers = (previewLayers: ReadonlyArray<HarnessPreviewLayer>) => {
    if (previewLayers.length === 0) {
      return;
    }

    const targetOrders = new Set(previewLayers.map((layer) => layer.order));
    const touchedRefIds = new Set(previewLayers.map((layer) => layer.ref.id));

    for (const refId of touchedRefIds) {
      const overlay = previewOverlays.get(refId);
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
        previewOverlays.delete(refId);
        continue;
      }

      previewOverlays.set(
        refId,
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
    const touchedRefIds = new Set(previewLayers.map((layer) => layer.ref.id));

    for (const receiptFacts of transactionRollbackReceiptFacts(
      generation,
      queueKey,
      previewLayers,
    )) {
      next = appendReceipt(next, {
        type: "transaction:rollback",
        id: definition.id,
        ...receiptFacts,
        parentState: current.value,
      });
    }

    for (const refId of touchedRefIds) {
      const overlay = previewOverlays.get(refId);
      if (overlay === undefined) {
        continue;
      }

      const remainingLayers = overlay.layers.filter((layer) => !removedOrders.has(layer.order));
      if (remainingLayers.length === 0) {
        previewOverlays.delete(refId);
        setCachedResourceSnapshot(refId, overlay.rootSnapshot);
        continue;
      }

      previewOverlays.set(
        refId,
        Object.freeze({
          rootSnapshot: overlay.rootSnapshot,
          layers: remainingLayers,
        }),
      );
      setCachedResourceSnapshot(refId, replayPreviewOverlay(overlay.rootSnapshot, remainingLayers));
    }

    return materializeSnapshot(next);
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
    const invalidatedAt = clockNow();

    for (const target of targets) {
      let count = 0;

      for (const ref of transactionRefsForInvalidationTarget(knownResourceRefs.values(), target)) {
        const cached = cacheState.byId.get(ref.id);
        if (cached === undefined || cached.freshness === "invalidated") {
          continue;
        }

        cacheState.byId.set(ref.id, invalidateTransactionResourceSnapshot(cached, invalidatedAt));
        count += 1;
      }

      next = appendReceipt(next, {
        type: "resource:invalidate",
        id: transactionReceiptIdForInvalidationTarget(target),
        count,
        parentState: current.value,
      });
    }

    return materializeSnapshot(next);
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
        next = appendReceipt(next, {
          type: "transaction:interrupt",
          id: transactionId,
          generation: activeTransaction.generation,
          queueKey: activeTransaction.concurrencyKey,
          ...transactionTimingFacts(activeTransaction.startedAt, currentRuntimeTimeMillis()),
          parentState,
        });
        if (transactionSnapshotOwners.get(transactionId) === activeTransaction.generation) {
          issues = replaceIssue(
            issues,
            interruptIssue("transaction", transactionId, {
              correlationId: activeTransaction.correlationId,
              parentState,
              receipts: next.receipts,
            }),
          );
        }
        next = rollbackTransactionPreviewPatches(
          materializeSnapshot(next),
          activeTransaction.definition,
          activeTransaction.previewLayers,
          activeTransaction.generation,
          activeTransaction.concurrencyKey,
        );
      }
    }

    return materializeSnapshot(next);
  };

  const queueTransaction = (
    current: HarnessSnapshot<Context, Event, State>,
    queued: QueuedHarnessTransaction,
  ): HarnessSnapshot<Context, Event, State> => {
    const existing =
      queuedTransactions.get(queued.concurrencyKey) ?? createFifoQueue<QueuedHarnessTransaction>();
    existing.enqueue(queued);
    queuedTransactions.set(queued.concurrencyKey, existing);
    return withInspectionCorrelation(queued.correlationId, () =>
      appendReceipt(current, {
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
    queued: QueuedHarnessTransaction,
  ): HarnessSnapshot<Context, Event, State> => {
    return queueTransaction(current, {
      ...queued,
      correlationId: queued.correlationId ?? activeInspectionCorrelationId,
    });
  };

  const dequeueTransaction = (concurrencyKey: string): QueuedHarnessTransaction | undefined => {
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
    issues = clearIssue(issues, "transaction", definition.id);
    replaceTransactionSnapshot({
      id: definition.id,
      status: "interrupt",
    });
    return rollbackTransactionPreviewPatches(
      appendReceipt(current, {
        type: "transaction:interrupt",
        id: definition.id,
        generation: activeTransaction.generation,
        queueKey: activeTransaction.concurrencyKey,
        overlapCause: "cancel-previous",
        ...transactionTimingFacts(activeTransaction.startedAt, currentRuntimeTimeMillis()),
        parentState,
      }),
      activeTransaction.definition,
      activeTransaction.previewLayers,
      activeTransaction.generation,
      activeTransaction.concurrencyKey,
    );
  };

  const startResolvedTransaction = (
    current: HarnessSnapshot<Context, Event, State>,
    definition: HarnessTransactionDefinition,
    params: unknown,
    options: TransactionStartOptions,
    dequeuedOverlapCause?: TransactionInspectionOverlapCause,
  ): HarnessSnapshot<Context, Event, State> => {
    const generation = (transactionGenerations.get(definition.id) ?? 0) + 1;
    const concurrencyKey = transactionConcurrencyKey(definition);
    const startedAt = currentRuntimeTimeMillis();
    latestTransactionAttempts.set(definition.id, {
      definition,
      params,
    });
    transactionGenerations.set(definition.id, generation);
    transactionSnapshotOwners.set(definition.id, generation);
    issues = clearIssue(issues, "transaction", definition.id);
    replaceTransactionSnapshot({
      id: definition.id,
      status: "pending",
    });
    const correlationId = options.correlationId;
    const preview = withInspectionCorrelation(correlationId, () => {
      let next = materializeSnapshot(current);
      if (dequeuedOverlapCause !== undefined) {
        next = appendReceipt(next, {
          type: "transaction:dequeue",
          id: definition.id,
          queueKey: concurrencyKey,
          overlapCause: dequeuedOverlapCause,
          parentState: options.parentState,
        });
      }

      next = appendReceipt(next, {
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
    let next = preview.snapshot;

    const effectRuntime = ensureRuntime();
    const interrupt = effectRuntime.managedRuntime.runCallback(
      // The harness runtime existentially hides whichever provided layers were installed.
      resolveTransactionCommitEffect(definition, params) as Effect.Effect<unknown, unknown, never>,
      {
        onExit: (exit) => {
          enqueueReadyWork(harness, () => {
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

              replaceSnapshot(
                startResolvedTransaction(
                  snapshot,
                  queued.definition,
                  queued.params,
                  {
                    ...queued.options,
                    parentState: snapshot.value,
                  },
                  queued.overlapCause,
                ),
              );
            };

            if (Exit.isSuccess(exit)) {
              withInspectionCorrelation(activeTransaction.correlationId, () => {
                commitTransactionPreviewLayers(activeTransaction.previewLayers);
                const routedEvent = resolveSuccessTransactionRoute(definition, exit.value) as
                  | Event
                  | undefined;
                const completedAt = currentRuntimeTimeMillis(effectRuntime);
                if (isSnapshotOwner) {
                  replaceTransactionSnapshot({
                    id: definition.id,
                    status: "success",
                    value: exit.value,
                  });
                  issues = clearIssue(issues, "transaction", definition.id);
                }
                const successSnapshot = appendReceipt(snapshot, {
                  type: "transaction:success",
                  id: definition.id,
                  generation,
                  queueKey: activeTransaction.concurrencyKey,
                  ...transactionTimingFacts(activeTransaction.startedAt, completedAt),
                  ...(transactionRoutedEventType(routedEvent) === undefined
                    ? {}
                    : { routedEventType: transactionRoutedEventType(routedEvent) }),
                  parentState: snapshot.value,
                });
                replaceSnapshot(invalidateTransactionTargets(successSnapshot, definition, params));
                resumeQueuedTransaction();
                if (routedEvent !== undefined && isSnapshotOwner) {
                  dispatchOwnedMachineEvent(routedEvent);
                }
              });
              return;
            }

            const completion = resolveFailedTransactionCompletion(definition, exit, {
              correlationId: activeTransaction.correlationId,
              parentState: snapshot.value,
              receipts: snapshot.receipts,
            });
            const completedAt = currentRuntimeTimeMillis(effectRuntime);
            const failureReceipt = receiptWithCorrelation(
              {
                type: transactionReceiptTypeForLane(completion.lane),
                id: definition.id,
                generation,
                queueKey: activeTransaction.concurrencyKey,
                ...transactionTimingFacts(activeTransaction.startedAt, completedAt),
                ...(transactionRoutedEventType(completion.routedEvent) === undefined
                  ? {}
                  : { routedEventType: transactionRoutedEventType(completion.routedEvent) }),
                parentState: snapshot.value,
              },
              activeTransaction.correlationId,
            );
            if (isSnapshotOwner) {
              issues = replaceIssue(issues, {
                ...completion.issue,
                handled: completion.routedEvent !== undefined,
                facts: issueFactsFromReceipts(definition.id, {
                  correlationId: activeTransaction.correlationId,
                  parentState: snapshot.value,
                  receipts: [...snapshot.receipts, failureReceipt],
                }),
              });
              replaceTransactionSnapshot({
                id: definition.id,
                status: completion.lane === "interrupt" ? "interrupt" : "failure",
                ...(completion.issue.error === undefined ? {} : { error: completion.issue.error }),
              });
            }
            withInspectionCorrelation(activeTransaction.correlationId, () => {
              replaceSnapshot(
                rollbackTransactionPreviewPatches(
                  appendReceipt(snapshot, {
                    ...failureReceipt,
                  }),
                  definition,
                  activeTransaction.previewLayers,
                  generation,
                  activeTransaction.concurrencyKey,
                ),
              );
              resumeQueuedTransaction();
              if (completion.routedEvent !== undefined && isSnapshotOwner) {
                dispatchOwnedMachineEvent(completion.routedEvent as Event);
              }
            });
          });
        },
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
    options: TransactionStartOptions,
  ): HarnessSnapshot<Context, Event, State> => {
    const concurrencyKey = transactionConcurrencyKey(definition);

    if (activeTransactionEntries(definition.id).length > 0) {
      if (definition.config.concurrency === "serialize") {
        return queueQueuedTransaction(current, {
          concurrencyKey,
          overlapCause: "active-attempt",
          definition,
          params,
          options,
          correlationId: options.correlationId,
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

      const next = appendReceipt(current, {
        type: "transaction:reject",
        id: definition.id,
        queueKey: concurrencyKey,
        overlapCause: "reject-while-running",
        activeAttemptCount: activeTransactionEntries(definition.id).length,
        parentState: options.parentState,
      });
      issues = replaceIssue(issues, {
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
      });
      return next;
    }

    if (
      definition.config.concurrency === "serialize" &&
      activeTransactionsInConcurrencyKey(concurrencyKey).length > 0
    ) {
      return queueQueuedTransaction(current, {
        concurrencyKey,
        overlapCause: "serialize-scope",
        definition,
        params,
        options,
        correlationId: options.correlationId,
      });
    }

    return startResolvedTransaction(current, definition, params, options);
  };

  const startTransaction = (
    current: HarnessSnapshot<Context, Event, State>,
    definition: HarnessTransactionDefinition,
    options: TransactionStartOptions,
  ): HarnessSnapshot<Context, Event, State> => {
    const paramsSource = {
      ...invokeArgsForSnapshot(current),
      event: options.event,
    };
    const params = resolveTransactionParams(definition, paramsSource) ?? undefined;
    if (params === null) {
      return current;
    }

    return startResolvedTransactionWithConcurrency(current, definition, params, {
      ...options,
      correlationId: options.correlationId ?? activeInspectionCorrelationId,
    });
  };

  const startStateOwnedTransactions = (
    current: HarnessSnapshot<Context, Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
    const definitions = transactionInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let next = current;
    for (const definition of definitions) {
      next = startTransaction(next, definition.transaction, {
        parentState: current.value,
        stateOwned: true,
        trigger: "state",
        correlationId: activeInspectionCorrelationId,
      });
    }

    return next;
  };

  const attachOwnedChild = <ChildMachine extends FlowMachine>(
    definition: FlowChildDefinition<ChildMachine>,
    actorId: string,
  ): ActiveHarnessChild => {
    const actor = ensureRuntime().createActor(definition.config.machine, { id: actorId });
    const unsubscribe = actor.subscribe(() => {
      dispatchReadyWork(harness, () => {
        const active = ownedChildren.get(definition.id);
        if (active === undefined || active.actor !== actor) {
          return;
        }

        childSnapshots = replaceChildSnapshot(
          definition.id,
          childSnapshotForDefinition(
            definition,
            snapshot.value,
            actorId,
            String(actor.snapshot().value),
            childStatusForActor(actor),
            actor.snapshot(),
          ),
        );
        replaceSnapshot(
          materializeSnapshot(
            Object.freeze({
              ...snapshot,
              children: childSnapshots,
            }),
          ),
        );
      });
    });

    return {
      actorId,
      actor,
      definition,
      correlationId: undefined,
      unsubscribe,
    };
  };

  const startStateOwnedChildren = (
    current: HarnessSnapshot<Context, Event, State>,
    spawnReason: ChildLifecycleSpawnReason = "state-entry",
  ): HarnessSnapshot<Context, Event, State> => {
    const definitions = childInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let next = current;

    for (const definition of definitions) {
      let entry = ownedChildren.get(definition.id);
      let created = false;
      if (entry === undefined) {
        entry = attachOwnedChild(definition, childActorId(machine.id, definition.id));
        ownedChildren.set(definition.id, entry);
        created = true;
      }

      const childActorSnapshot = entry.actor.snapshot();
      if (created) {
        next = appendReceipt(next, {
          type: "child:start",
          id: definition.id,
          ...childStartReceiptFacts(definition, entry.actorId, spawnReason, {
            parentState: current.value,
            state: String(childActorSnapshot.value),
          }),
        });
      }

      childSnapshots = replaceChildSnapshot(
        definition.id,
        childSnapshotForDefinition(
          definition,
          current.value,
          entry.actorId,
          String(childActorSnapshot.value),
          childStatusForActor(entry.actor),
          childActorSnapshot,
        ),
      );
    }

    return materializeSnapshot(
      Object.freeze({
        ...next,
        children: childSnapshots,
      }),
    );
  };

  const stopStateOwnedChildren = (
    current: HarnessSnapshot<Context, Event, State>,
    stopReason: ChildLifecycleStopReason = "state-exit",
  ): HarnessSnapshot<Context, Event, State> => {
    if (ownedChildren.size === 0) {
      if (Object.keys(childSnapshots).length === 0) {
        return current;
      }

      childSnapshots = {};
      return materializeSnapshot(
        Object.freeze({
          ...current,
          children: childSnapshots,
        }),
      );
    }

    let next = current;

    for (const [definitionId, entry] of Array.from(ownedChildren.entries())) {
      const priorChild =
        childSnapshots[definitionId] ??
        childSnapshotForDefinition(entry.definition, current.value, entry.actorId);

      ownedChildren.delete(definitionId);
      entry.unsubscribe();
      childSnapshots = removeChildSnapshot(definitionId);
      void entry.actor.dispose();
      next = appendReceipt(next, {
        type: "child:stop",
        id: definitionId,
        ...childStopReceiptFacts(entry.definition, entry.actorId, stopReason, {
          parentState: priorChild.parentState ?? current.value,
          state: priorChild.state,
          supervision: priorChild.supervision,
        }),
      });
    }

    return materializeSnapshot(
      Object.freeze({
        ...next,
        children: childSnapshots,
      }),
    );
  };

  const reconcileStateOwnedWork = (
    previous: HarnessSnapshot<Context, Event, State>,
    next: HarnessSnapshot<Context, Event, State>,
    reentered: boolean,
  ): HarnessSnapshot<Context, Event, State> => {
    if (previous.value === next.value && !reentered) {
      return materializeSnapshot(next);
    }

    return startStateOwnedChildren(
      startStateOwnedStreams(
        startStateOwnedAfters(
          startStateOwnedTransactions(
            stopStateOwnedChildren(
              stopStateOwnedStreams(
                stopStateOwnedAfters(
                  interruptTransactions(next, "state-owned", previous.value),
                  "state-exit",
                ),
                previous.value,
                "state-exit",
              ),
            ),
          ),
        ),
      ),
    );
  };

  const progressControls = createFlowTestProgressControls({
    currentHarness: () => harness,
    currentSnapshot: () => snapshot,
    ensureRuntime,
    currentRuntimeTimeMillis,
    activeTransactionIds: () =>
      Array.from(activeTransactions.entries())
        .filter(([, entries]) => entries.length > 0)
        .map(([id]) => id),
    activeTransactionFiberCount: () =>
      Array.from(activeTransactions.values()).reduce((count, entries) => count + entries.length, 0),
    activeStreamIds,
    activeAfterEntries,
    defaultProgressBounds,
  });

  const { pendingWorkSnapshot, advance, advanceToNextTimer, waitForProgress, settle } =
    progressControls;

  const readSurface = createFlowTestReadSurface({
    currentSnapshot: () => snapshot,
    currentIssues: () => issues,
    currentTransactions: () => transactions,
    currentTimerSnapshots: () => timerSnapshots,
    currentStreamSnapshots: () => streamSnapshots,
    cache,
  });

  const harness: FlowTestHarness<Context, Event, State> = {
    state: () => snapshot.value,
    context: () => snapshot.context,
    snapshot: () => snapshot,
    send: (event) => {
      dispatchReadyWork(harness, () => {
        dispatchMachineEvent(event);
      });
      return harness;
    },
    sendAll: (events) => {
      for (const event of events) {
        harness.send(event);
      }
      return harness;
    },
    can: (event) => canMachineTransition(snapshot, event, transitionRuntime),
    children: () => snapshot.children,
    ...readSurface,
    pendingWork: () => pendingWorkSnapshot(),
    retryTransaction: (id) => {
      const transaction = transactions[id];
      const attempt = latestTransactionAttempts.get(id);
      if (
        transaction === undefined ||
        attempt === undefined ||
        (transaction.status !== "failure" && transaction.status !== "interrupt")
      ) {
        return false;
      }

      replaceSnapshot(
        startResolvedTransactionWithConcurrency(
          appendReceipt(snapshot, {
            type: "transaction:retry",
            id,
            parentState: snapshot.value,
          }),
          attempt.definition,
          attempt.params,
          {
            parentState: snapshot.value,
            trigger: "event",
            stateOwned: false,
            correlationId: undefined,
          },
        ),
      );
      return true;
    },
    resetTransaction: (id) => {
      const transaction = transactions[id];
      if (
        transaction === undefined ||
        transaction.status === "idle" ||
        transaction.status === "pending"
      ) {
        return false;
      }

      issues = clearIssue(issues, "transaction", id);
      replaceTransactionSnapshot({
        id,
        status: "idle",
      });
      replaceSnapshot(
        appendReceipt(materializeSnapshot(snapshot), {
          type: "transaction:reset",
          id,
          parentState: snapshot.value,
        }),
      );
      return true;
    },
    flush: () => flushReadyWork(harness),
    advance,
    advanceToNextTimer: () => advanceToNextTimer(),
    advanceUntilIdle: (bounds) =>
      waitForProgress(
        "advanceUntilIdle",
        () => {
          const pending = pendingWorkSnapshot();
          return pending.ready === 0 && pending.nextAfterMillis === undefined;
        },
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
      ),
    until: (predicate, bounds) =>
      waitForProgress(
        "until",
        () => predicate(harness),
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
        "predicate",
      ),
    untilState: (target, bounds) =>
      waitForProgress(
        "untilState",
        () =>
          typeof target === "function"
            ? target(snapshot.value, snapshot)
            : snapshot.value === target,
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
        typeof target === "function" ? "state predicate" : `state '${target}'`,
      ),
    untilReceipt: (predicate, bounds) =>
      waitForProgress(
        "untilReceipt",
        () => snapshot.receipts.some((receipt) => predicate(receipt, snapshot.receipts)),
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
        "receipt predicate",
      ),
    untilIssue: (predicate, bounds) =>
      waitForProgress(
        "untilIssue",
        () => issues.some((issue) => predicate(issue, issues)),
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
        "issue predicate",
      ),
    settle,
  };

  replaceSnapshot(
    startStateOwnedChildren(
      startStateOwnedStreams(startStateOwnedAfters(startStateOwnedTransactions(snapshot))),
    ),
  );
  startReadyWork(harness);

  const started: FlowStartedTestBuilder<Context, Event, State> = Object.assign(harness, {
    provide: (service: Layer.Any) => {
      providedLayers = [...providedLayers, service];
      return started;
    },
    clock: (now: () => number) => {
      customClock = true;
      clockNow = now;
      return started;
    },
    start: () => harness,
  });

  return started;
}

export function createFlowTestBuilder<App extends FlowAppDefinition | undefined = undefined>(
  state: BuilderState<App> = { resources: [], fixtures: [] } as BuilderState<App>,
): FlowTestBuilder<App> {
  return {
    app: <NextApp extends FlowAppDefinition>(app: NextApp) =>
      createFlowTestBuilder<NextApp>({
        ...state,
        app,
      }),
    seedResources: (resources: ReadonlyArray<FlowSeededResource>) =>
      createFlowTestBuilder<App>({
        ...state,
        resources,
      }),
    seedModuleFixtures: (fixture: string) =>
      createFlowTestBuilder<App>({
        ...state,
        fixtures: [...state.fixtures, fixture],
      }),
    start: <Context, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<Context, Event, State>,
      options?: Readonly<{ readonly input?: Partial<Context> }>,
    ) => {
      const fixtureResources =
        state.app === undefined
          ? []
          : state.fixtures.flatMap((fixture) => fixtureResourcesForApp(state.app!, fixture));

      return createHarness(
        machine,
        state.app,
        [...fixtureResources, ...state.resources],
        options?.input,
      );
    },
    model: <Context, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<Context, Event, State>,
      options?: Readonly<{ readonly input?: Partial<Context> }>,
    ) => {
      const fixtureResources =
        state.app === undefined
          ? []
          : state.fixtures.flatMap((fixture) => fixtureResourcesForApp(state.app!, fixture));

      return createFlowModel(machine, [...fixtureResources, ...state.resources], options?.input);
    },
  } as unknown as FlowTestBuilder<App>;
}

type LegacyFlowTestApi = {
  <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
  ): FlowStartedTestBuilder<Context, Event, State>;
};

export const flowTest = (<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
) => createFlowTestBuilder().start(machine)) as LegacyFlowTestApi;
