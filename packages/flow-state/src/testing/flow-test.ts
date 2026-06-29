import { Cause, Clock, Effect, Exit, type Layer, Stream } from "effect";
import * as Duration from "effect/Duration";
import { TestClock } from "effect/testing";

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
  FlowStreamSnapshot,
  FlowTestBuilder,
  FlowTestCache,
  FlowTestHarness,
  FlowTestPendingWork,
  FlowTestStreamSnapshot,
  FlowTestTimers,
  FlowTestTransactions,
  FlowTimerSnapshot,
  FlowTransactionSnapshot,
  FlowTransitionRuntime,
} from "../public/types.js";
import {
  afterDefinitionsForState,
  applyAfterTransitionWithMeta,
  applyMachineEventWithMeta,
  canMachineTransition,
  planMachineEvent,
} from "../machine-transition.js";
import { annotateNewMachineEventReceipts } from "../inspection-receipts.js";
import { enqueueReadyWork, flushReadyWork, readyWorkPendingCount } from "../ready-work.js";
import { applyResourcePatch } from "../store/resource-patch.js";
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
import { resolveStreamRouteEvent } from "../stream-route.js";
import { resolveTransactionOutcomeEvent } from "../transaction-outcome.js";
import { receiptWithCorrelation } from "../receipt-correlation.js";
import { createAppDefinition } from "../descriptors/app.js";
import { fixtureResourcesForApp } from "../descriptors/inventory.js";
import { createRuntime } from "../runtime/contract-runtime.js";
import {
  type OrchestratorActorHandle,
  childActorId,
  childInvokesForState,
  childSnapshotForDefinition,
  childStatusForActor,
} from "../services/orchestrator-helpers.js";
import type { UnknownFlowTransactionDefinition } from "../services/orchestrator-transaction-types.js";
import { controlledStreamSourceOf } from "./controlled-stream.js";
import { createFlowModel } from "./flow-model.js";
import { createPendingWorkSnapshot, createSettleBoundsError } from "./pending-work.js";

type BuilderState = Readonly<{
  readonly app?: FlowAppDefinition;
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
  readonly startedAt: number;
  readonly dueAt: number;
  readonly correlationId: string | undefined;
  readonly interrupt: () => void;
}>;

type ActiveHarnessTransaction = Readonly<{
  readonly definition: HarnessTransactionDefinition;
  readonly concurrencyKey: string;
  readonly generation: number;
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

function issueFromExit(
  source: FlowIssue["source"],
  id: string,
  exit: Exit.Exit<unknown, unknown>,
): FlowIssue | undefined {
  if (Exit.isSuccess(exit)) {
    return undefined;
  }

  if (Cause.hasInterruptsOnly(exit.cause)) {
    return {
      kind: "interrupt",
      source,
      id,
      cause: exit.cause,
    };
  }

  const failReason = exit.cause.reasons.find(Cause.isFailReason);
  if (failReason !== undefined) {
    return {
      kind: "failure",
      source,
      id,
      error: failReason.error,
      cause: exit.cause,
    };
  }

  return {
    kind: "defect",
    source,
    id,
    cause: exit.cause,
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
  const queuedTransactions = new Map<string, ReadonlyArray<QueuedHarnessTransaction>>();
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

    for (const previewPatch of previewPatches) {
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
        refId: previewPatch.ref.id,
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
  ): HarnessSnapshot<Context, Event, State> => {
    if (previewLayers.length === 0) {
      return current;
    }

    let next = current;
    const removedOrders = new Set(previewLayers.map((layer) => layer.order));
    const touchedRefIds = new Set(previewLayers.map((layer) => layer.ref.id));

    for (const previewLayer of [...previewLayers].reverse()) {
      next = appendReceipt(next, {
        type: "transaction:rollback",
        id: definition.id,
        refId: previewLayer.ref.id,
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
          issues = replaceIssue(issues, {
            kind: "interrupt",
            source: "transaction",
            id: transactionId,
          });
          replaceTransactionSnapshot({
            id: transactionId,
            status: "interrupt",
          });
        }
        next = appendReceipt(next, {
          type: "transaction:interrupt",
          id: transactionId,
          generation: activeTransaction.generation,
          parentState,
        });
        next = rollbackTransactionPreviewPatches(
          materializeSnapshot(next),
          activeTransaction.definition,
          activeTransaction.previewLayers,
        );
      }
    }

    return materializeSnapshot(next);
  };

  const queueTransaction = (
    current: HarnessSnapshot<Context, Event, State>,
    queued: QueuedHarnessTransaction,
  ): HarnessSnapshot<Context, Event, State> => {
    const existing = queuedTransactions.get(queued.concurrencyKey) ?? [];
    queuedTransactions.set(queued.concurrencyKey, [...existing, queued]);
    return withInspectionCorrelation(queued.correlationId, () =>
      appendReceipt(current, {
        type: "transaction:queue",
        id: queued.definition.id,
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
    if (queued === undefined || queued.length === 0) {
      return undefined;
    }

    const [nextQueued, ...rest] = queued;
    if (rest.length === 0) {
      queuedTransactions.delete(concurrencyKey);
    } else {
      queuedTransactions.set(concurrencyKey, rest);
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
        parentState,
      }),
      activeTransaction.definition,
      activeTransaction.previewLayers,
    );
  };

  const startResolvedTransaction = (
    current: HarnessSnapshot<Context, Event, State>,
    definition: HarnessTransactionDefinition,
    params: unknown,
    options: TransactionStartOptions,
    dequeued: boolean = false,
  ): HarnessSnapshot<Context, Event, State> => {
    const generation = (transactionGenerations.get(definition.id) ?? 0) + 1;
    const concurrencyKey = transactionConcurrencyKey(definition);
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
      if (dequeued) {
        next = appendReceipt(next, {
          type: "transaction:dequeue",
          id: definition.id,
          parentState: options.parentState,
        });
      }

      next = appendReceipt(next, {
        type: "transaction:start",
        id: definition.id,
        generation,
        trigger: options.trigger,
        parentState: options.parentState,
      });
      return applyTransactionPreviewPatches(next, definition, params);
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
                  true,
                ),
              );
            };

            if (Exit.isSuccess(exit)) {
              withInspectionCorrelation(activeTransaction.correlationId, () => {
                commitTransactionPreviewLayers(activeTransaction.previewLayers);
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
                  parentState: snapshot.value,
                });
                replaceSnapshot(invalidateTransactionTargets(successSnapshot, definition, params));
                resumeQueuedTransaction();
                const routedEvent = resolveTransactionOutcomeEvent(
                  definition.config.routes,
                  "success",
                  {
                    value: exit.value,
                  },
                );
                if (routedEvent !== undefined && isSnapshotOwner) {
                  dispatchOwnedMachineEvent(routedEvent as Event);
                }
              });
              return;
            }

            const issue = issueFromExit("transaction", definition.id, exit);
            const lane: "interrupt" | "failure" | "defect" = Cause.hasInterruptsOnly(exit.cause)
              ? "interrupt"
              : exit.cause.reasons.find(Cause.isFailReason) !== undefined
                ? "failure"
                : "defect";
            const routedEvent =
              lane === "failure"
                ? resolveTransactionOutcomeEvent(definition.config.routes, "failure", {
                    error: issue?.error,
                  })
                : lane === "interrupt"
                  ? resolveTransactionOutcomeEvent(definition.config.routes, "interrupt", {})
                  : resolveTransactionOutcomeEvent(definition.config.routes, "defect", {
                      cause: issue?.cause ?? exit.cause,
                    });
            if (isSnapshotOwner) {
              issues =
                issue === undefined
                  ? clearIssue(issues, "transaction", definition.id)
                  : replaceIssue(issues, {
                      ...issue,
                      handled: routedEvent !== undefined,
                    });
              replaceTransactionSnapshot({
                id: definition.id,
                status: lane === "interrupt" ? "interrupt" : "failure",
                ...(issue?.error === undefined ? {} : { error: issue.error }),
              });
            }
            withInspectionCorrelation(activeTransaction.correlationId, () => {
              replaceSnapshot(
                rollbackTransactionPreviewPatches(
                  appendReceipt(snapshot, {
                    type:
                      lane === "interrupt"
                        ? "transaction:interrupt"
                        : lane === "defect"
                          ? "transaction:defect"
                          : "transaction:failure",
                    id: definition.id,
                    generation,
                    parentState: snapshot.value,
                  }),
                  definition,
                  activeTransaction.previewLayers,
                ),
              );
              resumeQueuedTransaction();
              if (routedEvent !== undefined && isSnapshotOwner) {
                dispatchOwnedMachineEvent(routedEvent as Event);
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

      return appendReceipt(current, {
        type: "transaction:reject",
        id: definition.id,
        parentState: options.parentState,
      });
    }

    if (
      definition.config.concurrency === "serialize" &&
      activeTransactionsInConcurrencyKey(concurrencyKey).length > 0
    ) {
      return queueQueuedTransaction(current, {
        concurrencyKey,
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

      const startedAt = currentRuntimeTimeMillis(effectRuntime);
      const generation = (timerGenerations.get(definition.id) ?? 0) + 1;
      const dueAt =
        startedAt + Duration.toMillis(Duration.fromInputUnsafe(definition.config.delay));
      timerGenerations.set(definition.id, generation);
      timerSnapshots = replaceTimerSnapshot(definition.id, {
        id: definition.id,
        status: "scheduled",
        generation,
        parentState: current.value,
        startedAt,
        dueAt,
      });
      next = appendReceipt(next, {
        type: "timer:start",
        id: definition.id,
        generation,
        parentState: current.value,
        dueAt,
      });

      const entry: {
        readonly generation: number;
        readonly parentState: string;
        readonly startedAt: number;
        readonly dueAt: number;
        readonly correlationId: string | undefined;
        interrupt: () => void;
      } = {
        generation,
        parentState: current.value,
        startedAt,
        dueAt,
        correlationId: activeInspectionCorrelationId,
        interrupt: () => {},
      };
      activeAfters.set(definition.id, entry);
      entry.interrupt = effectRuntime.managedRuntime.runCallback(
        Effect.sleep(definition.config.delay),
        {
          onExit: (exit) => {
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
                    dueAt: entry.dueAt,
                    endedAt,
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
      });

      const params = definition.config.params?.(invokeArgsForSnapshot(current));
      const stream = definition.config.subscribe({ params });

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

          const routedValue = resolveStreamRouteEvent(definition.config.routes, "value", value);
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
            const issue = issueFromExit("stream", definition.id, exit);
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
              }),
            );

            const routedEvent = Exit.isSuccess(exit)
              ? resolveStreamRouteEvent(definition.config.routes, "done")
              : issue?.kind === "interrupt"
                ? resolveStreamRouteEvent(definition.config.routes, "interrupt")
                : issue?.kind === "failure"
                  ? resolveStreamRouteEvent(definition.config.routes, "failure", issue.error)
                  : issue?.kind === "defect"
                    ? resolveStreamRouteEvent(definition.config.routes, "defect", issue.cause)
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
      enqueueReadyWork(harness, () => {
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
  ): HarnessSnapshot<Context, Event, State> => {
    const definitions = childInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let next = current;

    for (const definition of definitions) {
      let entry = ownedChildren.get(definition.id);
      if (entry === undefined) {
        entry = attachOwnedChild(definition, childActorId(machine.id, definition.id));
        ownedChildren.set(definition.id, entry);
        next = appendReceipt(next, {
          type: "child:start",
          id: definition.id,
          actorId: entry.actorId,
          parentState: current.value,
        });
      }

      childSnapshots = replaceChildSnapshot(
        definition.id,
        childSnapshotForDefinition(
          definition,
          current.value,
          entry.actorId,
          String(entry.actor.snapshot().value),
          childStatusForActor(entry.actor),
          entry.actor.snapshot(),
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
        actorId: entry.actorId,
        parentState: priorChild.parentState ?? current.value,
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
        dueAt: active.dueAt,
        endedAt,
      });
    }

    return materializeSnapshot(next);
  };

  const stopStateOwnedStreams = (
    current: HarnessSnapshot<Context, Event, State>,
    parentState: State = current.value,
  ): HarnessSnapshot<Context, Event, State> => {
    if (activeStreams.size === 0) {
      return current;
    }

    let next = current;

    for (const [streamId, active] of Array.from(activeStreams.entries())) {
      activeStreams.delete(streamId);
      active.unsubscribe();
      issues = replaceIssue(issues, {
        kind: "interrupt",
        source: "stream",
        id: streamId,
      });

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
      });

      const routedInterrupt = active.definition.config.routes?.interrupt?.();
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
                stopStateOwnedAfters(interruptTransactions(next, "state-owned", previous.value)),
                previous.value,
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

  const harness: FlowTestHarness<Context, Event, State> = {
    state: () => snapshot.value,
    context: () => snapshot.context,
    snapshot: () => snapshot,
    send: (event) => dispatchMachineEvent(event),
    can: (event) => canMachineTransition(snapshot, event, transitionRuntime),
    cache: () => cache,
    transactions: () => transactionInspector,
    timers: () => timerInspector,
    receipts: () => snapshot.receipts,
    streams: () => streamInspector,
    issues: () => issues,
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

  const started: FlowStartedTestBuilder<Context, Event, State> = Object.assign(harness, {
    provide: (service: unknown) => {
      providedLayers = [...providedLayers, service as Layer.Any];
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

function createBuilder(state: BuilderState = { resources: [], fixtures: [] }): FlowTestBuilder {
  return {
    app: (app) =>
      createBuilder({
        ...state,
        app,
      }),
    seedResources: (resources) =>
      createBuilder({
        ...state,
        resources,
      }),
    seedModuleFixtures: (fixture) =>
      createBuilder({
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
  };
}

export const flowTest = Object.assign(
  ((machine?: FlowMachine): FlowTestBuilder | FlowStartedTestBuilder => {
    const builder = createBuilder();
    return machine === undefined ? builder : builder.start(machine);
  }) as {
    (): FlowTestBuilder;
    <Context, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<Context, Event, State>,
    ): FlowStartedTestBuilder<Context, Event, State>;
  } & FlowTestBuilder,
  createBuilder(),
  {
    app: (app: FlowAppDefinition) => createBuilder().app(app),
    model: <Context, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<Context, Event, State>,
      options?: Readonly<{ readonly input?: Partial<Context> }>,
    ) => createBuilder().model(machine, options),
  },
);
