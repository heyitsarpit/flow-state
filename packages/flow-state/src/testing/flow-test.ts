import { Clock, Effect, Exit, type Layer, Stream } from "effect";
import { TestClock } from "effect/testing";

import {
  type ChildLifecycleSpawnReason,
  type ChildLifecycleStopReason,
  childStartReceiptFacts,
  childStopReceiptFacts,
} from "../child-lifecycle-inspection-facts.js";
import type {
  FlowAppDefinition,
  FlowChildDefinition,
  FlowChildSnapshot,
  FlowEvent,
  FlowIssue,
  FlowIssueSummary,
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
  FlowStreamSnapshot,
  FlowTestBuilder,
  FlowTestCache,
  FlowTestHarness,
  FlowTestProgressBounds,
  FlowTestPendingWork,
  FlowTestStreamSnapshot,
  FlowTestTimers,
  FlowTestTransactions,
  FlowTimerSnapshot,
  FlowTransactionSnapshot,
  FlowTransitionRuntime,
} from "../core/api/types.js";
import { createDelayedWorkPlan } from "../core/scheduling/delayed-work.js";
import { rejectedWhileRunningTransactionDiagnostic } from "../diagnostics.js";
import {
  afterDefinitionsForState,
  applyAfterTransitionWithMeta,
  applyMachineEventWithMeta,
  canMachineTransition,
  planMachineEvent,
} from "../machine-transition.js";
import { annotateNewMachineEventReceipts } from "../core/inspection/inspection-receipts.js";
import {
  dispatchReadyWork,
  enqueueReadyWork,
  flushReadyWork,
  readyWorkPendingCount,
  startReadyWork,
} from "../core/scheduling/ready-work.js";
import { issueFactsFromReceipts } from "../core/inspection/receipt-summary.js";
import { summarizeReceipts } from "../core/inspection/receipt-summary.js";
import { applyResourcePatch } from "../store/resource-patch.js";
import { createFifoQueue } from "../fifo-queue.js";
import { captureTrace } from "../core/inspection/inspect.js";
import {
  resolveTransactionCommitEffect,
  resolveTransactionInvalidationTargets,
  resolveTransactionParams,
  resolveTransactionPreviewPatches,
} from "../transaction-callbacks.js";
import {
  invalidateTransactionResourceSnapshot,
  transactionReceiptIdForInvalidationTarget,
  transactionRefsForInvalidationTarget,
} from "../transaction-invalidation.js";
import {
  resolveStreamParams,
  resolveStreamRouteEventWithDiagnostics,
  resolveStreamSubscription,
} from "../stream-callbacks.js";
import { receiptWithCorrelation } from "../core/inspection/receipt-correlation.js";
import { createAppDefinition } from "../descriptors/app.js";
import { fixtureResourcesForApp } from "../descriptors/inventory.js";
import { createRuntime } from "../runtime/contract-runtime.js";
import { createTraceActorHierarchy } from "../trace-actor-hierarchy.js";
import {
  type OrchestratorActorHandle,
  childActorId,
  childInvokesForState,
  childSnapshotForDefinition,
  childStatusForActor,
} from "../services/orchestrator-helpers.js";
import { interruptIssue, issueFromExit } from "../services/orchestrator-issues.js";
import {
  resolveFailedTransactionCompletion,
  resolveSuccessTransactionRoute,
  transactionReceiptTypeForLane,
} from "../services/orchestrator-transaction-outcome.js";
import type { UnknownFlowTransactionDefinition } from "../services/orchestrator-transaction-types.js";
import { controlledStreamSourceOf } from "../controlled-stream-source.js";
import { createTraceReport } from "../core/inspection/trace-report.js";
import {
  type StreamTimerInterruptReason,
  streamReceiptFacts,
  timerOutcomeReceiptFacts,
  timerScheduleReceiptFacts,
} from "../stream-timer-inspection-facts.js";
import {
  type TransactionInspectionOverlapCause,
  transactionPreviewReceiptFacts,
  transactionRollbackReceiptFacts,
  transactionRoutedEventType,
  transactionTimingFacts,
} from "../transaction-inspection-facts.js";
import { createFlowModel } from "./flow-model.js";
import { createChildSummary, createChildTree } from "./child-inspection.js";
import {
  createPendingWorkSnapshot,
  createSettleBoundsError,
  createTestControlBoundsError,
} from "./pending-work.js";

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

type ActiveHarnessStream = Readonly<{
  readonly definition: AnyStreamDefinition;
  readonly generation: number;
  readonly restored: boolean;
  readonly correlationId: string | undefined;
  readonly unsubscribe: () => void;
}>;

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

type ActiveHarnessAfter = Readonly<{
  readonly generation: number;
  readonly parentState: string;
  readonly restored: boolean;
  readonly startedAt: number;
  readonly dueAt: number;
  readonly correlationId: string | undefined;
  readonly interrupt: () => void;
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

function replaceIssue(
  issues: ReadonlyArray<FlowIssue>,
  nextIssue: FlowIssue,
): ReadonlyArray<FlowIssue> {
  return Object.freeze([
    ...issues.filter((issue) => !(issue.source === nextIssue.source && issue.id === nextIssue.id)),
    nextIssue,
  ]);
}

function clearIssue(
  issues: ReadonlyArray<FlowIssue>,
  source: FlowIssue["source"],
  id: string,
): ReadonlyArray<FlowIssue> {
  return Object.freeze(issues.filter((issue) => !(issue.source === source && issue.id === id)));
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
  const activeAfters = new Map<string, ActiveHarnessAfter>();
  const ownedChildren = new Map<string, ActiveHarnessChild>();
  const activeStreams = new Map<string, ActiveHarnessStream>();
  const activeTransactions = new Map<string, ReadonlyArray<ActiveHarnessTransaction>>();
  const queuedTransactions = new Map<
    string,
    ReturnType<typeof createFifoQueue<QueuedHarnessTransaction>>
  >();
  const latestTransactionAttempts = new Map<string, LatestHarnessTransactionAttempt>();
  const streamGenerations = new Map<string, number>();
  const timerGenerations = new Map<string, number>();
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

  const replaceStreamSnapshot = (
    id: string,
    snapshotForId: FlowTestStreamSnapshot,
  ): Readonly<Record<string, FlowTestStreamSnapshot>> =>
    Object.freeze({
      ...streamSnapshots,
      [id]: snapshotForId,
    });

  const replaceTimerSnapshot = (
    id: string,
    snapshotForId: FlowTimerSnapshot,
  ): Readonly<Record<string, FlowTimerSnapshot>> =>
    Object.freeze({
      ...timerSnapshots,
      [id]: snapshotForId,
    });

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

  const startStateOwnedAfters = (
    current: HarnessSnapshot<Context, Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
    const definitions = afterInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    const effectRuntime = ensureRuntime();
    let next = current;

    for (const definition of definitions) {
      if (activeAfters.has(definition.id)) {
        continue;
      }

      const plan = createDelayedWorkPlan(definition.config.delay, () =>
        currentRuntimeTimeMillis(effectRuntime),
      );
      const generation = (timerGenerations.get(definition.id) ?? 0) + 1;
      timerGenerations.set(definition.id, generation);
      timerSnapshots = replaceTimerSnapshot(definition.id, {
        id: definition.id,
        status: "scheduled",
        generation,
        parentState: current.value,
        startedAt: plan.startedAt,
        dueAt: plan.dueAt,
      });
      next = appendReceipt(next, {
        type: "timer:start",
        id: definition.id,
        generation,
        parentState: current.value,
        ...timerScheduleReceiptFacts(plan.startedAt, plan.dueAt, false),
      });

      const entry: {
        readonly generation: number;
        readonly parentState: string;
        readonly restored: boolean;
        readonly startedAt: number;
        readonly dueAt: number;
        readonly correlationId: string | undefined;
        interrupt: () => void;
      } = {
        generation,
        parentState: current.value,
        restored: false,
        startedAt: plan.startedAt,
        dueAt: plan.dueAt,
        correlationId: activeInspectionCorrelationId,
        interrupt: () => {},
      };
      activeAfters.set(definition.id, entry);
      entry.interrupt = plan.run(
        (effect, onExit) =>
          effectRuntime.managedRuntime.runCallback(
            effect,
            onExit === undefined ? undefined : { onExit },
          ),
        (exit) => {
          enqueueReadyWork(harness, () => {
            const active = activeAfters.get(definition.id);
            if (active === undefined || active !== entry || !Exit.isSuccess(exit)) {
              return;
            }

            withInspectionCorrelation(entry.correlationId, () => {
              activeAfters.delete(definition.id);
              const endedAt = currentRuntimeTimeMillis(effectRuntime);
              timerSnapshots = replaceTimerSnapshot(definition.id, {
                id: definition.id,
                status: "fired",
                generation,
                parentState: entry.parentState,
                startedAt: entry.startedAt,
                dueAt: entry.dueAt,
                endedAt,
              });
              const applied = applyAfterTransitionWithMeta(
                appendReceipt(snapshot, {
                  type: "timer:fire",
                  id: definition.id,
                  generation,
                  parentState: entry.parentState,
                  ...timerOutcomeReceiptFacts(
                    entry.startedAt,
                    entry.dueAt,
                    endedAt,
                    entry.restored,
                  ),
                }),
                definition,
                transitionRuntime,
              );
              replaceSnapshot(
                annotateMachineEventReceipts(
                  snapshot.receipts.length,
                  reconcileStateOwnedWork(snapshot, applied.snapshot, applied.reentered),
                  `${machine.id}:event:${++nextInspectionCorrelationId}`,
                  machine.id,
                ),
              );
            });
          });
        },
      );
    }

    return materializeSnapshot(next);
  };

  const startStateOwnedStreams = (
    current: HarnessSnapshot<Context, Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
    const definitions = streamInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let next = current;

    for (const definition of definitions) {
      if (activeStreams.has(definition.id)) {
        continue;
      }

      const generation = (streamGenerations.get(definition.id) ?? 0) + 1;
      streamGenerations.set(definition.id, generation);
      issues = clearIssue(issues, "stream", definition.id);
      streamSnapshots = replaceStreamSnapshot(definition.id, {
        id: definition.id,
        status: "running",
        generation,
        emitted: 0,
      });
      next = appendReceipt(next, {
        type: "stream:start",
        id: definition.id,
        generation,
        parentState: current.value,
        ...streamReceiptFacts(undefined, false),
      });

      const params = resolveStreamParams(definition, invokeArgsForSnapshot(current));
      const stream = resolveStreamSubscription(definition, params);

      const applyStreamValue = (value: unknown) => {
        enqueueReadyWork(harness, () => {
          const active = activeStreams.get(definition.id);
          if (active === undefined || active.generation !== generation) {
            return;
          }

          const previous = streamSnapshots[definition.id];
          streamSnapshots = replaceStreamSnapshot(definition.id, {
            id: definition.id,
            status: "running",
            generation,
            emitted: (previous?.emitted ?? 0) + 1,
            value,
          });
          replaceSnapshot(snapshot);

          const routedValue = resolveStreamRouteEventWithDiagnostics(definition, "value", value);
          if (routedValue !== undefined) {
            dispatchOwnedMachineEvent(routedValue as Event);
          }
        });
      };

      const finishStream = (exit: Exit.Exit<unknown, unknown>) => {
        enqueueReadyWork(harness, () => {
          const active = activeStreams.get(definition.id);
          if (active === undefined || active.generation !== generation) {
            return;
          }

          withInspectionCorrelation(active.correlationId, () => {
            activeStreams.delete(definition.id);
            const issue = issueFromExit("stream", definition.id, exit, {
              correlationId: active.correlationId,
              parentState: snapshot.value,
              receipts: snapshot.receipts,
            });
            issues =
              issue === undefined
                ? clearIssue(issues, "stream", definition.id)
                : replaceIssue(issues, issue);

            const previous = streamSnapshots[definition.id];
            const status: FlowStreamSnapshot["status"] = Exit.isSuccess(exit)
              ? "success"
              : issue?.kind === "interrupt"
                ? "interrupt"
                : "failure";
            streamSnapshots = replaceStreamSnapshot(definition.id, {
              id: definition.id,
              status,
              generation,
              emitted: previous?.emitted ?? 0,
              value: previous?.value,
              error: issue?.error,
            });

            replaceSnapshot(
              appendReceipt(snapshot, {
                type:
                  status === "success"
                    ? "stream:done"
                    : issue?.kind === "interrupt"
                      ? "stream:interrupt"
                      : issue?.kind === "defect"
                        ? "stream:defect"
                        : "stream:failure",
                id: definition.id,
                generation,
                ...streamReceiptFacts(previous, active.restored),
              }),
            );

            const routedEvent = Exit.isSuccess(exit)
              ? resolveStreamRouteEventWithDiagnostics(definition, "done")
              : issue?.kind === "interrupt"
                ? resolveStreamRouteEventWithDiagnostics(definition, "interrupt")
                : issue?.kind === "failure"
                  ? resolveStreamRouteEventWithDiagnostics(definition, "failure", issue.error)
                  : issue?.kind === "defect"
                    ? resolveStreamRouteEventWithDiagnostics(definition, "defect", issue.cause)
                    : undefined;
            if (routedEvent !== undefined) {
              dispatchOwnedMachineEvent(routedEvent as Event);
            }
          });
        });
      };

      const controlledStreamSource = controlledStreamSourceOf(stream);
      if (controlledStreamSource !== undefined) {
        activeStreams.set(definition.id, {
          definition,
          generation,
          restored: false,
          correlationId: activeInspectionCorrelationId,
          unsubscribe: controlledStreamSource.subscribe({
            onValue: applyStreamValue,
            onFailure: (error) => {
              finishStream(Exit.fail(error));
            },
            onDone: () => {
              finishStream(Exit.void);
            },
          }),
        });
        continue;
      }

      const interrupt = Effect.runCallback(
        Stream.runForEach(stream as Stream.Stream<unknown, unknown, never>, (value) =>
          Effect.sync(() => {
            applyStreamValue(value);
          }),
        ),
        {
          onExit: finishStream,
        },
      );

      activeStreams.set(definition.id, {
        definition,
        generation,
        restored: false,
        correlationId: activeInspectionCorrelationId,
        unsubscribe: () => {
          interrupt();
        },
      });
    }

    return materializeSnapshot(next);
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

  const stopStateOwnedAfters = (
    current: HarnessSnapshot<Context, Event, State>,
    interruptReason: StreamTimerInterruptReason = "dispose",
  ): HarnessSnapshot<Context, Event, State> => {
    if (activeAfters.size === 0) {
      return current;
    }

    const effectRuntime = ensureRuntime();
    let next = current;

    for (const [afterId, active] of Array.from(activeAfters.entries())) {
      activeAfters.delete(afterId);
      active.interrupt();
      const endedAt = currentRuntimeTimeMillis(effectRuntime);
      timerSnapshots = replaceTimerSnapshot(afterId, {
        id: afterId,
        status: "interrupt",
        generation: active.generation,
        parentState: active.parentState,
        startedAt: active.startedAt,
        dueAt: active.dueAt,
        endedAt,
      });
      next = appendReceipt(next, {
        type: "timer:interrupt",
        id: afterId,
        generation: active.generation,
        parentState: active.parentState,
        interruptReason,
        ...timerOutcomeReceiptFacts(active.startedAt, active.dueAt, endedAt, active.restored),
      });
    }

    return materializeSnapshot(next);
  };

  const stopStateOwnedStreams = (
    current: HarnessSnapshot<Context, Event, State>,
    parentState: State = current.value,
    interruptReason: StreamTimerInterruptReason = "state-exit",
  ): HarnessSnapshot<Context, Event, State> => {
    if (activeStreams.size === 0) {
      return current;
    }

    let next = current;

    for (const [streamId, active] of Array.from(activeStreams.entries())) {
      activeStreams.delete(streamId);
      active.unsubscribe();

      const previous = streamSnapshots[streamId];
      streamSnapshots = replaceStreamSnapshot(streamId, {
        id: streamId,
        status: "interrupt",
        generation: active.generation,
        emitted: previous?.emitted ?? 0,
        value: previous?.value,
      });
      next = appendReceipt(next, {
        type: "stream:interrupt",
        id: streamId,
        generation: active.generation,
        parentState,
        interruptReason,
        ...streamReceiptFacts(previous, active.restored),
      });
      issues = replaceIssue(
        issues,
        interruptIssue("stream", streamId, {
          correlationId: active.correlationId,
          parentState,
          receipts: next.receipts,
        }),
      );

      const routedInterrupt = resolveStreamRouteEventWithDiagnostics(
        active.definition,
        "interrupt",
      );
      if (routedInterrupt !== undefined) {
        enqueueReadyWork(harness, () => {
          const latest = streamSnapshots[streamId];
          if (latest?.status !== "interrupt" || latest.generation !== active.generation) {
            return;
          }

          dispatchOwnedMachineEvent(routedInterrupt as Event);
        });
      }
    }

    return materializeSnapshot(next);
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

  const streamInspector = Object.freeze({
    all: () => streamSnapshots,
    running: (id: string) => {
      const stream = streamSnapshots[id];
      return stream?.status === "running" ? stream : undefined;
    },
    cancelled: (id: string) => {
      const stream = streamSnapshots[id];
      return stream?.status === "interrupt" ? stream : undefined;
    },
    events: (id: string) =>
      snapshot.receipts.filter(
        (receipt) => receipt.id === id && receipt.type.startsWith("stream:"),
      ),
  });

  const timerInspector: FlowTestTimers = Object.freeze({
    all: () => timerSnapshots,
    get: (id: string) => timerSnapshots[id],
    active: (id: string) => {
      const timer = timerSnapshots[id];
      return timer?.status === "scheduled" ? timer : undefined;
    },
    fired: (id: string) => {
      const timer = timerSnapshots[id];
      return timer?.status === "fired" ? timer : undefined;
    },
    cancelled: (id: string) => {
      const timer = timerSnapshots[id];
      return timer?.status === "interrupt" ? timer : undefined;
    },
    events: (id: string) =>
      snapshot.receipts.filter((receipt) => receipt.id === id && receipt.type.startsWith("timer:")),
  });

  const pendingWorkSnapshot = (effectRuntime = ensureRuntime()): FlowTestPendingWork => {
    const ready = readyWorkPendingCount(harness);
    const transactionIds = Array.from(activeTransactions.entries())
      .filter(([, entries]) => entries.length > 0)
      .map(([id]) => id);
    const streamIds = Array.from(activeStreams.keys());
    const afterEntries = Array.from(activeAfters.entries()).map(([id, entry]) => ({
      id,
      dueAt: entry.dueAt,
      ...(entry.parentState === undefined ? {} : { parentState: entry.parentState }),
    }));
    const activeFibers =
      afterEntries.length +
      streamIds.length +
      Array.from(activeTransactions.values()).reduce((count, entries) => count + entries.length, 0);
    const now = afterEntries.length === 0 ? undefined : currentRuntimeTimeMillis(effectRuntime);
    return createPendingWorkSnapshot({
      machineId: snapshot.machine.id,
      ready,
      activeFibers,
      timers: afterEntries,
      streams: streamIds,
      transactions: transactionIds,
      children: snapshot.children,
      ...(now === undefined ? {} : { now }),
    });
  };

  const flushHarnessTurn = async () => {
    await flushReadyWork(harness);
    await Promise.resolve();
    await flushReadyWork(harness);
  };

  const normalizeProgressBounds = (
    bounds: FlowTestProgressBounds | undefined,
  ): FlowTestProgressBounds => bounds ?? defaultProgressBounds;

  const advanceToNextTimer = async (effectRuntime = ensureRuntime()) => {
    await flushHarnessTurn();
    const pending = pendingWorkSnapshot(effectRuntime);
    if (pending.nextAfterMillis === undefined) {
      return false;
    }

    await effectRuntime.managedRuntime.runPromise(TestClock.adjust(pending.nextAfterMillis));
    await flushReadyWork(harness);
    return true;
  };

  const waitForProgress = async (
    method: "advanceUntilIdle" | "until" | "untilState" | "untilReceipt" | "untilIssue",
    matches: () => boolean,
    isIdle: (pending: FlowTestPendingWork) => boolean,
    bounds?: FlowTestProgressBounds,
    awaiting?: string,
  ) => {
    if (matches()) {
      return;
    }

    const effectRuntime = ensureRuntime();
    const resolvedBounds = normalizeProgressBounds(bounds);

    for (let tick = 0; tick < resolvedBounds.maxTicks; tick += 1) {
      await flushHarnessTurn();

      if (matches()) {
        return;
      }

      const pending = pendingWorkSnapshot(effectRuntime);
      if (pending.activeFibers > resolvedBounds.maxFibers) {
        throw createTestControlBoundsError({
          method,
          kind: "maxFibers",
          bounds: resolvedBounds,
          pending,
          ...(awaiting === undefined ? {} : { awaiting }),
        });
      }
      if (isIdle(pending)) {
        break;
      }
      if (pending.nextAfterMillis !== undefined) {
        await effectRuntime.managedRuntime.runPromise(TestClock.adjust(pending.nextAfterMillis));
        continue;
      }

      await Promise.resolve();
    }

    await flushHarnessTurn();
    if (matches()) {
      return;
    }

    const pending = pendingWorkSnapshot(effectRuntime);
    if (pending.activeFibers > resolvedBounds.maxFibers) {
      throw createTestControlBoundsError({
        method,
        kind: "maxFibers",
        bounds: resolvedBounds,
        pending,
        ...(awaiting === undefined ? {} : { awaiting }),
      });
    }

    throw createTestControlBoundsError({
      method,
      kind: "maxTicks",
      bounds: resolvedBounds,
      pending,
      ...(awaiting === undefined ? {} : { awaiting }),
    });
  };

  const traceForCorrelation = (correlationId: string) => {
    const receipts = snapshot.receipts.filter((receipt) => receipt.correlationId === correlationId);
    if (receipts.length === 0) {
      return undefined;
    }

    return Object.freeze({
      kind: "trace" as const,
      snapshot,
      actorHierarchy: createTraceActorHierarchy(snapshot),
      receipts: Object.freeze([...receipts]),
      report: createTraceReport(receipts, snapshot),
      options: Object.freeze({
        correlationId,
      }),
    });
  };

  const transactionInspector: FlowTestTransactions = Object.freeze({
    all: () => transactions,
    get: (id) => transactions[id],
    events: (id) =>
      snapshot.receipts.filter(
        (receipt) => receipt.id === id && receipt.type.startsWith("transaction:"),
      ),
    previewPatches: (id) =>
      snapshot.receipts.filter(
        (receipt) => receipt.id === id && receipt.type === "transaction:preview-patch",
      ),
    rollbacks: (id) =>
      snapshot.receipts.filter(
        (receipt) => receipt.id === id && receipt.type === "transaction:rollback",
      ),
    queued: (id) =>
      snapshot.receipts.filter(
        (receipt) => receipt.id === id && receipt.type === "transaction:queue",
      ),
  });

  const summarizeIssue = (issue: FlowIssue): FlowIssueSummary => {
    const facts = issueFactsFromReceipts(issue.id, {
      receipts: snapshot.receipts,
      ...(issue.facts?.correlationId === undefined
        ? {}
        : { correlationId: issue.facts.correlationId }),
      ...(issue.facts?.parentState === undefined ? {} : { parentState: issue.facts.parentState }),
      ...(issue.facts?.relatedIds === undefined ? {} : { relatedIds: issue.facts.relatedIds }),
    });
    return Object.freeze({
      kind: issue.kind,
      source: issue.source,
      id: issue.id,
      receiptTypes: facts.receiptTypes,
      relatedIds: facts.relatedIds,
      ...(facts.correlationId === undefined ? {} : { correlationId: facts.correlationId }),
      ...(facts.parentState === undefined ? {} : { parentState: facts.parentState }),
    });
  };

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
    childTree: () => createChildTree(snapshot.children),
    childSummary: () => createChildSummary(snapshot.children, snapshot.receipts),
    cache: () => cache,
    transactions: () => transactionInspector,
    timers: () => timerInspector,
    receipts: () => snapshot.receipts,
    receiptSummary: () => summarizeReceipts(snapshot.receipts),
    streams: () => streamInspector,
    issues: () => issues,
    issueSummary: () => Object.freeze(issues.map((issue) => summarizeIssue(issue))),
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
    advance: async (duration) => {
      const effectRuntime = ensureRuntime();
      await effectRuntime.managedRuntime.runPromise(TestClock.adjust(duration));
      await flushReadyWork(harness);
    },
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
    trace: (options) => captureTrace(snapshot, options),
    captureTrace: (options) => captureTrace(snapshot, options),
    traceFor: (correlationId) => traceForCorrelation(correlationId),
    settle: async (bounds) => {
      const effectRuntime = ensureRuntime();

      for (let tick = 0; tick < bounds.maxTicks; tick += 1) {
        await flushHarnessTurn();

        const pending = pendingWorkSnapshot(effectRuntime);
        if (pending.activeFibers > bounds.maxFibers) {
          throw createSettleBoundsError("maxFibers", bounds, pending);
        }
        if (pending.ready === 0 && pending.activeFibers === 0 && pending.children.length === 0) {
          return;
        }

        if (pending.nextAfterMillis !== undefined) {
          await effectRuntime.managedRuntime.runPromise(TestClock.adjust(pending.nextAfterMillis));
          continue;
        }

        await Promise.resolve();
      }

      await flushHarnessTurn();
      const pending = pendingWorkSnapshot(effectRuntime);
      if (pending.activeFibers > bounds.maxFibers) {
        throw createSettleBoundsError("maxFibers", bounds, pending);
      }
      if (pending.ready === 0 && pending.activeFibers === 0 && pending.children.length === 0) {
        return;
      }

      throw createSettleBoundsError("maxTicks", bounds, pending);
    },
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
