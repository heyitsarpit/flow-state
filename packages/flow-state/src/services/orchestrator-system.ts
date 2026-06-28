import { Cause, Clock, Context, Effect, Exit, Layer, Option, Stream } from "effect";

import { applyMachineEventWithMeta, planMachineEvent } from "../machine-transition.js";
import type {
  FlowActor,
  FlowChildDefinition,
  FlowChildSnapshot,
  FlowEvent,
  FlowIssue,
  FlowInvalidationTarget,
  FlowInvokeDescriptor,
  FlowMachine,
  FlowPreviewPatch,
  FlowReceipt,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowSnapshot,
  FlowStreamSnapshot,
  FlowTransactionDefinition,
  FlowTransactionSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../public/types.js";
import { enqueueReadyWork, flushReadyWork } from "../ready-work.js";
import { resourceKeyOf } from "../store/invalidation.js";
import { applyResourcePatch } from "../store/resource-patch.js";
import { controlledStreamSourceOf } from "../testing/controlled-stream.js";
import {
  transactionReceiptIdForInvalidationTarget,
  transactionRefsForInvalidationTarget,
} from "../transaction-invalidation.js";
import { resolveTransactionOutcomeEvent } from "../transaction-outcome.js";
import { FlowAppOwnership } from "./app-ownership.js";
import { ResourceStore } from "./resource-store.js";
import { TraceLog } from "./trace.js";

type AnyFlowActor = FlowActor<unknown, FlowEvent, string>;

type ActorForMachine<Machine extends FlowMachine> = FlowActor<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>
>;

type ActorStartOptions = Readonly<{ readonly id?: string; readonly policy?: string }>;

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type FlowQueryInvoke =
  | Readonly<{ readonly kind: "ensure"; readonly ref: FlowResourceRef }>
  | Readonly<{ readonly kind: "refresh"; readonly ref: FlowResourceRef }>
  | Readonly<{ readonly kind: "observe"; readonly ref: FlowResourceRef }>;
type FlowResourceCommandInvoke =
  | Readonly<{ readonly kind: "patch"; readonly ref: FlowResourceRef; readonly patch: unknown }>
  | Readonly<{ readonly kind: "invalidate"; readonly target: FlowInvalidationTarget }>;

type AnyFlowStreamDefinition = Extract<FlowInvokeDescriptor, { readonly kind: "stream" }>;
type AnyFlowTransactionInvoke = Extract<FlowInvokeDescriptor, { readonly kind: "run" }>;
type AnyFlowTransactionDefinition = FlowTransactionDefinition<
  string,
  any,
  any,
  any,
  any,
  FlowEvent
>;
type ResourceStoreService = Parameters<(typeof ResourceStore)["of"]>[0];
type PreviewOverlayLayer = Readonly<{
  readonly ref: FlowResourceRef;
  readonly patch: FlowPreviewPatch;
  readonly order: number;
  readonly state: "active" | "committed";
}>;
type PreviewOverlay = Readonly<{
  readonly rootSnapshot: FlowResourceSnapshot | undefined;
  readonly layers: ReadonlyArray<PreviewOverlayLayer>;
}>;

function appendNewReceipts(
  previous: ReadonlyArray<FlowReceipt>,
  next: ReadonlyArray<FlowReceipt>,
  appendTrace?: (receipt: FlowReceipt) => void,
): void {
  if (appendTrace === undefined || next.length <= previous.length) {
    return;
  }

  for (const receipt of next.slice(previous.length)) {
    appendTrace(receipt);
  }
}

function canReuseKeepAliveActor<Machine extends FlowMachine>(
  actor: AnyFlowActor | undefined,
  machine: Machine,
  options?: ActorStartOptions,
): boolean {
  return actor !== undefined && options?.policy === "keep-alive" && actor.machine.id === machine.id;
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

function invokeArgsForSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
): Readonly<{
  readonly context: Context;
  readonly value: State;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly resources: FlowSnapshot<Context, State, Event>["resources"];
  readonly transactions: FlowSnapshot<Context, State, Event>["transactions"];
  readonly streams: FlowSnapshot<Context, State, Event>["streams"];
  readonly children: FlowSnapshot<Context, State, Event>["children"];
  readonly receipts: FlowSnapshot<Context, State, Event>["receipts"];
}> {
  return {
    context: snapshot.context,
    value: snapshot.value,
    snapshot,
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    children: snapshot.children,
    receipts: snapshot.receipts,
  };
}

function childInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<FlowChildDefinition> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is FlowChildDefinition => invoke.kind === "child",
  );
}

function queryInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<FlowQueryInvoke> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is FlowQueryInvoke =>
      invoke.kind === "ensure" || invoke.kind === "refresh" || invoke.kind === "observe",
  );
}

function streamInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<AnyFlowStreamDefinition> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is AnyFlowStreamDefinition => invoke.kind === "stream",
  );
}

function transactionInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<AnyFlowTransactionInvoke> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is AnyFlowTransactionInvoke => invoke.kind === "run",
  );
}

function resourceCommandInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<FlowResourceCommandInvoke> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is FlowResourceCommandInvoke =>
      invoke.kind === "patch" || invoke.kind === "invalidate",
  );
}

function childSnapshotForDefinition<State extends string>(
  definition: FlowChildDefinition,
  parentState: State,
  actorId: string,
  state: string = definition.config.machine.config.initial,
  status: FlowChildSnapshot["status"] = "active",
): FlowChildSnapshot {
  const base = {
    id: definition.id,
    actorId,
    status,
    state,
    parentState,
  };

  return Object.freeze(
    definition.config.supervision === undefined
      ? base
      : {
          ...base,
          supervision: definition.config.supervision,
        },
  );
}

function childActorId(parentActorId: string, childId: string): string {
  return `${parentActorId}/${childId}`;
}

function latestIssue(issues: ReadonlyArray<FlowIssue>): FlowIssue | undefined {
  return issues.length === 0 ? undefined : issues[issues.length - 1];
}

function isFinalMachineState<Machine extends FlowMachine>(
  machine: Machine,
  state: string,
): boolean {
  const configuredState = machine.config.states[state as InferMachineState<Machine>];
  return configuredState?.type === "final";
}

function childStatusForActor(actor: AnyFlowActor): FlowChildSnapshot["status"] {
  const issues = actor.issues();
  const issue = latestIssue(issues);
  if (issue === undefined) {
    return isFinalMachineState(actor.machine, String(actor.snapshot().value))
      ? "success"
      : "active";
  }

  if (issue.kind === "interrupt") {
    return "interrupt";
  }

  return "failure";
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

function createContractActor<Machine extends FlowMachine>(
  machine: Machine,
  id = machine.id,
  createOwnedActor: <ChildMachine extends FlowMachine>(
    machine: ChildMachine,
    id: string,
    onDispose?: () => void,
  ) => ActorForMachine<ChildMachine>,
  resourceStore: ResourceStoreService,
  runtimeContext: Context.Context<any>,
  onDispose?: () => void,
  appendTrace?: (receipt: FlowReceipt) => void,
): ActorForMachine<Machine> {
  const typedMachine = machine as ActorForMachine<Machine>["machine"];
  let snapshot = typedMachine.getInitialSnapshot() as SnapshotForMachine<Machine>;
  let issues: ReadonlyArray<FlowIssue> = [];
  const listeners = new Map<number, () => void>();
  const runEffect = Effect.runCallbackWith(runtimeContext);
  const runSyncExit = Effect.runSyncExitWith(runtimeContext);
  const transitionRuntime = Object.freeze({
    now: () => {
      const exit = runSyncExit(Clock.currentTimeMillis);
      return Exit.isSuccess(exit) ? exit.value : Date.now();
    },
  });
  const ownedChildren = new Map<
    string,
    {
      readonly actorId: string;
      readonly actor: AnyFlowActor;
      readonly definition: FlowChildDefinition;
      readonly unsubscribe: () => void;
    }
  >();
  const ownedQueries = new Map<
    string,
    {
      readonly kind: FlowQueryInvoke["kind"];
      readonly ref: FlowResourceRef;
      cancelLookup: (interruptor?: number) => void;
      releaseObservation: () => void;
    }
  >();
  const ownedStreams = new Map<
    string,
    {
      readonly definition: AnyFlowStreamDefinition;
      readonly generation: number;
      interrupt: (interruptor?: number) => void;
    }
  >();
  const activeTransactions = new Map<
    string,
    ReadonlyArray<{
      readonly definition: AnyFlowTransactionDefinition;
      readonly concurrencyKey: string;
      readonly generation: number;
      readonly previewLayers: ReadonlyArray<PreviewOverlayLayer>;
      readonly stateOwned: boolean;
      interrupt: (interruptor?: number) => void;
    }>
  >();
  const queuedTransactions = new Map<
    string,
    ReadonlyArray<
      Readonly<{
        readonly concurrencyKey: string;
        readonly definition: AnyFlowTransactionDefinition;
        readonly params: unknown;
        readonly options: Readonly<{
          readonly parentState: InferMachineState<Machine>;
          readonly trigger: "state" | "event";
          readonly event?: InferMachineEvent<Machine>;
          readonly stateOwned: boolean;
        }>;
      }>
    >
  >();
  const latestTransactionAttempts = new Map<
    string,
    Readonly<{
      readonly definition: AnyFlowTransactionDefinition;
      readonly params: unknown;
    }>
  >();
  const transactionGenerations = new Map<string, number>();
  const transactionSnapshotOwners = new Map<string, number>();
  const previewOverlays = new Map<string, PreviewOverlay>();
  const knownResourceRefs = new Map<string, FlowResourceRef>();
  const streamGenerations = new Map<string, number>();
  let nextListenerId = 0;
  let nextPreviewLayerOrder = 0;
  let disposed = false;

  const rememberResourceRef = (ref: FlowResourceRef) => {
    knownResourceRefs.set(resourceKeyOf(ref), ref);
  };

  const replaceSnapshot = (
    nextSnapshot: SnapshotForMachine<Machine>,
    notifyListenersAfter = false,
  ) => {
    appendNewReceipts(snapshot.receipts, nextSnapshot.receipts, appendTrace);
    snapshot = nextSnapshot;
    if (notifyListenersAfter) {
      notifyListeners();
    }
  };

  const appendReceipt = (receipt: FlowReceipt, notifyListenersAfter = false) => {
    replaceSnapshot(
      Object.freeze({
        ...snapshot,
        receipts: [...snapshot.receipts, receipt],
      }),
      notifyListenersAfter,
    );
  };

  const notifyListeners = () => {
    for (const listener of Array.from(listeners.values())) {
      listener();
    }
  };

  const replaceIssues = (nextIssues: ReadonlyArray<FlowIssue>, notifyListenersAfter = false) => {
    issues = nextIssues;
    if (notifyListenersAfter) {
      notifyListeners();
    }
  };

  const activeTransactionEntries = (
    id: string,
  ): ReadonlyArray<{
    readonly definition: AnyFlowTransactionDefinition;
    readonly concurrencyKey: string;
    readonly generation: number;
    readonly previewLayers: ReadonlyArray<PreviewOverlayLayer>;
    readonly stateOwned: boolean;
    interrupt: (interruptor?: number) => void;
  }> => activeTransactions.get(id) ?? [];

  const replaceActiveTransactionEntries = (
    id: string,
    entries: ReadonlyArray<{
      readonly definition: AnyFlowTransactionDefinition;
      readonly concurrencyKey: string;
      readonly generation: number;
      readonly previewLayers: ReadonlyArray<PreviewOverlayLayer>;
      readonly stateOwned: boolean;
      interrupt: (interruptor?: number) => void;
    }>,
  ) => {
    if (entries.length === 0) {
      activeTransactions.delete(id);
      return;
    }

    activeTransactions.set(id, entries);
  };

  const latestActiveTransaction = (
    id: string,
  ):
    | {
        readonly definition: AnyFlowTransactionDefinition;
        readonly concurrencyKey: string;
        readonly generation: number;
        readonly previewLayers: ReadonlyArray<PreviewOverlayLayer>;
        readonly stateOwned: boolean;
        interrupt: (interruptor?: number) => void;
      }
    | undefined => {
    const entries = activeTransactionEntries(id);
    return entries.length === 0 ? undefined : entries[entries.length - 1];
  };

  const activeTransactionsInConcurrencyKey = (
    concurrencyKey: string,
  ): ReadonlyArray<{
    readonly definition: AnyFlowTransactionDefinition;
    readonly concurrencyKey: string;
    readonly generation: number;
    readonly previewLayers: ReadonlyArray<PreviewOverlayLayer>;
    readonly stateOwned: boolean;
    interrupt: (interruptor?: number) => void;
  }> =>
    Array.from(activeTransactions.values()).flatMap((entries) =>
      entries.filter((entry) => entry.concurrencyKey === concurrencyKey),
    );

  const transactionConcurrencyKey = (definition: AnyFlowTransactionDefinition): string =>
    definition.config.concurrency === "serialize"
      ? (definition.config.scope?.id ?? definition.id)
      : definition.id;

  const currentResourceSnapshot = (ref: FlowResourceRef): FlowResourceSnapshot | undefined => {
    const exit = runSyncExit(resourceStore.get(ref));
    return Exit.isSuccess(exit) ? exit.value : undefined;
  };

  const updateResourceSnapshot = (
    ref: FlowResourceRef,
    nextResource: FlowResourceSnapshot | undefined,
    notifyListenersAfter = false,
  ) => {
    if (nextResource === undefined) {
      return;
    }

    rememberResourceRef(ref);

    replaceSnapshot(
      Object.freeze({
        ...snapshot,
        resources: {
          ...snapshot.resources,
          [ref.id]: nextResource,
        },
      }),
      notifyListenersAfter,
    );
  };

  const applyPreviewPatchSnapshot = (
    ref: FlowResourceRef,
    baseSnapshot: FlowResourceSnapshot | undefined,
    patch: FlowPreviewPatch,
    updatedAt: number,
  ): FlowResourceSnapshot => {
    const previousValue = baseSnapshot?.value;
    const nextValue =
      "replace" in patch ? patch.replace : applyResourcePatch(previousValue, patch.patch);
    return Object.freeze({
      id: ref.id,
      status: "success" as const,
      availability: "value" as const,
      activity: "idle" as const,
      freshness: "fresh" as const,
      value: nextValue,
      ...(previousValue === undefined ? {} : { previousValue }),
      updatedAt,
      isPlaceholderData: false,
    });
  };

  const replayPreviewOverlay = (
    rootSnapshot: FlowResourceSnapshot | undefined,
    layers: ReadonlyArray<PreviewOverlayLayer>,
    updatedAt: number,
  ): FlowResourceSnapshot | undefined => {
    let nextSnapshot = rootSnapshot;
    for (const layer of layers) {
      nextSnapshot = applyPreviewPatchSnapshot(layer.ref, nextSnapshot, layer.patch, updatedAt);
    }
    return nextSnapshot;
  };

  const startStateOwnedQueries = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = queryInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    const nextResources: Record<string, FlowResourceSnapshot> = {
      ...current.resources,
    };
    const nextReceipts = [...current.receipts];
    let changed = false;

    for (const definition of definitions) {
      const key = `${definition.kind}:${definition.ref.id}`;
      if (ownedQueries.has(key)) {
        continue;
      }

      changed = true;
      const seededSnapshot = currentResourceSnapshot(definition.ref);
      if (seededSnapshot !== undefined) {
        rememberResourceRef(definition.ref);
        nextResources[definition.ref.id] = seededSnapshot;
      }
      nextReceipts.push({
        type: "query:start",
        id: definition.ref.id,
        mode: definition.kind,
        parentState: current.value,
      });

      const entry: {
        readonly kind: FlowQueryInvoke["kind"];
        readonly ref: FlowResourceRef;
        cancelLookup: (interruptor?: number) => void;
        releaseObservation: () => void;
      } = {
        kind: definition.kind,
        ref: definition.ref,
        cancelLookup: () => {},
        releaseObservation: () => {},
      };
      ownedQueries.set(key, entry);

      if (definition.kind === "observe") {
        runEffect(
          resourceStore.subscribe(definition.ref, (nextResource: FlowResourceSnapshot) => {
            enqueueReadyWork(actor, () => {
              if (disposed || ownedQueries.get(key) !== entry) {
                return;
              }

              updateResourceSnapshot(definition.ref, nextResource, true);
            });
          }),
          {
            onExit: (exit) => {
              if (Exit.isSuccess(exit)) {
                entry.releaseObservation = exit.value;
                return;
              }

              enqueueReadyWork(actor, () => {
                if (disposed || ownedQueries.get(key) !== entry) {
                  return;
                }

                const issue = issueFromExit("resource", definition.ref.id, exit);
                if (issue !== undefined) {
                  replaceIssues(replaceIssue(issues, issue), true);
                }
              });
            },
          },
        );
      }

      const lookup =
        definition.kind === "refresh"
          ? resourceStore.refresh(definition.ref)
          : resourceStore.ensure(definition.ref);

      entry.cancelLookup = runEffect(lookup, {
        onExit: (exit) => {
          enqueueReadyWork(actor, () => {
            if (disposed) {
              return;
            }

            if (definition.kind === "observe" && ownedQueries.get(key) !== entry) {
              return;
            }

            updateResourceSnapshot(definition.ref, currentResourceSnapshot(definition.ref), true);
            const issue = issueFromExit("resource", definition.ref.id, exit);
            replaceIssues(
              issue === undefined
                ? clearIssue(issues, "resource", definition.ref.id)
                : replaceIssue(issues, issue),
              true,
            );

            if (definition.kind !== "observe") {
              ownedQueries.delete(key);
            }
          });
        },
      });
    }

    if (!changed) {
      return current;
    }

    return Object.freeze({
      ...current,
      resources: nextResources,
      receipts: nextReceipts,
    });
  };

  const stopStateOwnedQueries = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    if (ownedQueries.size === 0) {
      return current;
    }

    for (const [key, entry] of Array.from(ownedQueries.entries())) {
      ownedQueries.delete(key);
      entry.cancelLookup();
      entry.releaseObservation();
    }

    return current;
  };

  const syncResourceSnapshots = (
    currentResources: Readonly<Record<string, FlowResourceSnapshot>>,
    refs: ReadonlyArray<FlowResourceRef>,
  ): Record<string, FlowResourceSnapshot> => {
    const nextResources: Record<string, FlowResourceSnapshot> = {
      ...currentResources,
    };

    for (const ref of refs) {
      rememberResourceRef(ref);
      const nextResource = currentResourceSnapshot(ref);
      if (nextResource !== undefined) {
        nextResources[ref.id] = nextResource;
      }
    }

    return nextResources;
  };

  const applyTransactionPreviewPatches = (
    current: SnapshotForMachine<Machine>,
    definition: AnyFlowTransactionDefinition,
    params: unknown,
  ): Readonly<{
    readonly snapshot: SnapshotForMachine<Machine>;
    readonly previewLayers: ReadonlyArray<PreviewOverlayLayer>;
  }> => {
    const previewPatches = definition.config.preview?.apply({ params } as never) ?? [];
    if (previewPatches.length === 0) {
      return {
        snapshot: current,
        previewLayers: [],
      };
    }

    let nextResources = current.resources;
    const nextReceipts = [...current.receipts];
    let nextIssues = issues;
    const previewLayers: Array<PreviewOverlayLayer> = [];

    for (const previewPatch of previewPatches) {
      const previousSnapshot = currentResourceSnapshot(previewPatch.ref);
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

      const exit = runSyncExit(
        resourceStore.patch(previewPatch.ref, (currentValue) =>
          "replace" in previewPatch
            ? (previewPatch.replace as never)
            : applyResourcePatch(currentValue, previewPatch.patch),
        ),
      );
      nextResources = syncResourceSnapshots(nextResources, [previewPatch.ref]);

      const issue = issueFromExit("resource", previewPatch.ref.id, exit);
      nextIssues =
        issue === undefined
          ? clearIssue(nextIssues, "resource", previewPatch.ref.id)
          : replaceIssue(nextIssues, issue);

      if (Exit.isSuccess(exit)) {
        nextReceipts.push({
          type: "transaction:preview-patch",
          id: definition.id,
          refId: previewPatch.ref.id,
          parentState: current.value,
        });
      }
    }

    replaceIssues(nextIssues);

    return {
      snapshot: Object.freeze({
        ...current,
        resources: nextResources,
        receipts: nextReceipts,
      }),
      previewLayers,
    };
  };

  const commitTransactionPreviewLayers = (previewLayers: ReadonlyArray<PreviewOverlayLayer>) => {
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
    current: SnapshotForMachine<Machine>,
    definition: AnyFlowTransactionDefinition,
    previewLayers: ReadonlyArray<PreviewOverlayLayer>,
  ): SnapshotForMachine<Machine> => {
    if (previewLayers.length === 0) {
      return current;
    }

    let nextResources = current.resources;
    const nextReceipts = [
      ...current.receipts,
      ...[...previewLayers].reverse().map(
        (previewLayer) =>
          ({
            type: "transaction:rollback",
            id: definition.id,
            refId: previewLayer.ref.id,
            parentState: current.value,
          }) satisfies FlowReceipt,
      ),
    ];
    let nextIssues = issues;
    const removedOrders = new Set(previewLayers.map((layer) => layer.order));
    const touchedRefIds = new Set(previewLayers.map((layer) => layer.ref.id));

    for (const refId of touchedRefIds) {
      const overlay = previewOverlays.get(refId);
      if (overlay === undefined) {
        continue;
      }

      const ref =
        knownResourceRefs.get(refId) ?? previewLayers.find((layer) => layer.ref.id === refId)?.ref;
      if (ref === undefined) {
        continue;
      }

      const remainingLayers = overlay.layers.filter((layer) => !removedOrders.has(layer.order));
      if (remainingLayers.length === 0) {
        previewOverlays.delete(refId);
        const priorSnapshot = overlay.rootSnapshot;
        if (priorSnapshot?.updatedAt === undefined) {
          continue;
        }

        const exit = runSyncExit(
          resourceStore.hydrate([
            {
              ref,
              snapshot: priorSnapshot,
            },
          ]),
        );
        nextResources = syncResourceSnapshots(nextResources, [ref]);

        const issue = issueFromExit("resource", refId, exit);
        nextIssues =
          issue === undefined
            ? clearIssue(nextIssues, "resource", refId)
            : replaceIssue(nextIssues, issue);
        continue;
      }

      previewOverlays.set(
        refId,
        Object.freeze({
          rootSnapshot: overlay.rootSnapshot,
          layers: remainingLayers,
        }),
      );

      const replayedSnapshot = replayPreviewOverlay(
        overlay.rootSnapshot,
        remainingLayers,
        transitionRuntime.now(),
      );
      if (replayedSnapshot?.updatedAt === undefined) {
        continue;
      }

      const exit = runSyncExit(
        resourceStore.hydrate([
          {
            ref,
            snapshot: replayedSnapshot,
          },
        ]),
      );
      nextResources = syncResourceSnapshots(nextResources, [ref]);

      const issue = issueFromExit("resource", refId, exit);
      nextIssues =
        issue === undefined
          ? clearIssue(nextIssues, "resource", refId)
          : replaceIssue(nextIssues, issue);
    }

    replaceIssues(nextIssues);

    return Object.freeze({
      ...current,
      resources: nextResources,
      receipts: nextReceipts,
    });
  };

  const invalidateTransactionTargets = (
    current: SnapshotForMachine<Machine>,
    definition: AnyFlowTransactionDefinition,
    params: unknown,
  ): SnapshotForMachine<Machine> => {
    const configuredTargets = definition.config.invalidates;
    if (configuredTargets === undefined) {
      return current;
    }

    let targets: ReadonlyArray<FlowInvalidationTarget>;
    if (Array.isArray(configuredTargets)) {
      targets = configuredTargets;
    } else {
      targets = (
        configuredTargets as (args: {
          readonly params: unknown;
        }) => ReadonlyArray<FlowInvalidationTarget>
      )({ params });
    }
    if (targets.length === 0) {
      return current;
    }

    let nextResources = current.resources;
    const nextReceipts = [...current.receipts];
    let nextIssues = issues;

    for (const target of targets) {
      const exit = runSyncExit(resourceStore.invalidate(target));
      const targetId = transactionReceiptIdForInvalidationTarget(target);
      nextResources = syncResourceSnapshots(
        nextResources,
        transactionRefsForInvalidationTarget(knownResourceRefs.values(), target),
      );

      const issue = issueFromExit("resource", targetId, exit);
      nextIssues =
        issue === undefined
          ? clearIssue(nextIssues, "resource", targetId)
          : replaceIssue(nextIssues, issue);

      if (Exit.isSuccess(exit)) {
        nextReceipts.push({
          type: "resource:invalidate",
          id: targetId,
          count: exit.value,
          parentState: current.value,
        });
      }
    }

    replaceIssues(nextIssues);

    return Object.freeze({
      ...current,
      resources: nextResources,
      receipts: nextReceipts,
    });
  };

  const interruptTransactions = (
    current: SnapshotForMachine<Machine>,
    scope: "state-owned" | "all",
    parentState: InferMachineState<Machine> = current.value,
  ): SnapshotForMachine<Machine> => {
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
    let nextIssues = issues;

    for (const transactionId of transactionIds) {
      const matchingEntries = activeTransactionEntries(transactionId).filter((entry) =>
        scope === "all" ? true : entry.stateOwned,
      );
      if (matchingEntries.length === 0) {
        continue;
      }

      replaceActiveTransactionEntries(
        transactionId,
        activeTransactionEntries(transactionId).filter((entry) => !matchingEntries.includes(entry)),
      );

      for (const entry of matchingEntries) {
        queuedTransactions.delete(entry.concurrencyKey);
        entry.interrupt();
        if (transactionSnapshotOwners.get(transactionId) === entry.generation) {
          nextIssues = replaceIssue(nextIssues, {
            kind: "interrupt",
            source: "transaction",
            id: transactionId,
          });
          next = Object.freeze({
            ...next,
            transactions: {
              ...next.transactions,
              [transactionId]: {
                id: transactionId,
                status: "interrupt",
              },
            },
            receipts: [
              ...next.receipts,
              {
                type: "transaction:interrupt",
                id: transactionId,
                generation: entry.generation,
                parentState,
              } satisfies FlowReceipt,
            ],
          });
        } else {
          next = Object.freeze({
            ...next,
            receipts: [
              ...next.receipts,
              {
                type: "transaction:interrupt",
                id: transactionId,
                generation: entry.generation,
                parentState,
              } satisfies FlowReceipt,
            ],
          });
        }
        next = rollbackTransactionPreviewPatches(next, entry.definition, entry.previewLayers);
      }
    }

    replaceIssues(nextIssues);
    return next;
  };

  const queueTransaction = (
    current: SnapshotForMachine<Machine>,
    queued: Readonly<{
      readonly concurrencyKey: string;
      readonly definition: AnyFlowTransactionDefinition;
      readonly params: unknown;
      readonly options: Readonly<{
        readonly parentState: InferMachineState<Machine>;
        readonly trigger: "state" | "event";
        readonly event?: InferMachineEvent<Machine>;
        readonly stateOwned: boolean;
      }>;
    }>,
  ): SnapshotForMachine<Machine> => {
    const existing = queuedTransactions.get(queued.concurrencyKey) ?? [];
    queuedTransactions.set(queued.concurrencyKey, [...existing, queued]);
    return Object.freeze({
      ...current,
      receipts: [
        ...current.receipts,
        {
          type: "transaction:queue",
          id: queued.definition.id,
          parentState: queued.options.parentState,
        } satisfies FlowReceipt,
      ],
    });
  };

  const dequeueTransaction = (
    concurrencyKey: string,
  ):
    | Readonly<{
        readonly concurrencyKey: string;
        readonly definition: AnyFlowTransactionDefinition;
        readonly params: unknown;
        readonly options: Readonly<{
          readonly parentState: InferMachineState<Machine>;
          readonly trigger: "state" | "event";
          readonly event?: InferMachineEvent<Machine>;
          readonly stateOwned: boolean;
        }>;
      }>
    | undefined => {
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
    current: SnapshotForMachine<Machine>,
    definition: AnyFlowTransactionDefinition,
    parentState: InferMachineState<Machine>,
  ): SnapshotForMachine<Machine> => {
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
    replaceIssues(clearIssue(issues, "transaction", definition.id));
    return rollbackTransactionPreviewPatches(
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
          {
            type: "transaction:interrupt",
            id: definition.id,
            generation: activeTransaction.generation,
            parentState,
          } satisfies FlowReceipt,
        ],
      }) as SnapshotForMachine<Machine>,
      activeTransaction.definition,
      activeTransaction.previewLayers,
    );
  };

  const startResolvedTransaction = (
    current: SnapshotForMachine<Machine>,
    definition: AnyFlowTransactionDefinition,
    params: unknown,
    options: Readonly<{
      readonly parentState: InferMachineState<Machine>;
      readonly trigger: "state" | "event";
      readonly event?: InferMachineEvent<Machine>;
      readonly stateOwned: boolean;
    }>,
    dequeued: boolean = false,
  ): SnapshotForMachine<Machine> => {
    const generation = (transactionGenerations.get(definition.id) ?? 0) + 1;
    const concurrencyKey = transactionConcurrencyKey(definition);
    latestTransactionAttempts.set(definition.id, {
      definition,
      params,
    });
    transactionGenerations.set(definition.id, generation);
    transactionSnapshotOwners.set(definition.id, generation);
    replaceIssues(clearIssue(issues, "transaction", definition.id));
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
              {
                type: "transaction:dequeue",
                id: definition.id,
                parentState: options.parentState,
              } satisfies FlowReceipt,
            ] as const)
          : []),
        {
          type: "transaction:start",
          id: definition.id,
          generation,
          trigger: options.trigger,
          parentState: options.parentState,
        } satisfies FlowReceipt,
      ],
    }) as SnapshotForMachine<Machine>;

    const preview = applyTransactionPreviewPatches(next, definition, params);
    next = preview.snapshot;

    const entry: {
      readonly definition: AnyFlowTransactionDefinition;
      readonly concurrencyKey: string;
      readonly generation: number;
      readonly previewLayers: ReadonlyArray<PreviewOverlayLayer>;
      readonly stateOwned: boolean;
      interrupt: (interruptor?: number) => void;
    } = {
      definition,
      concurrencyKey,
      generation,
      previewLayers: preview.previewLayers,
      stateOwned: options.stateOwned,
      interrupt: () => {},
    };

    activeTransactions.set(definition.id, [...activeTransactionEntries(definition.id), entry]);

    entry.interrupt = runEffect(definition.config.commit(params as never), {
      onExit: (exit) => {
        enqueueReadyWork(actor, () => {
          const activeTransaction = activeTransactionEntries(definition.id).find(
            (candidate) => candidate.generation === generation,
          );
          if (disposed || activeTransaction === undefined) {
            return;
          }

          replaceActiveTransactionEntries(
            definition.id,
            activeTransactionEntries(definition.id).filter(
              (candidate) => candidate.generation !== generation,
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
              true,
            );
          };

          if (Exit.isSuccess(exit)) {
            commitTransactionPreviewLayers(activeTransaction.previewLayers);
            const nextSnapshot = Object.freeze({
              ...snapshot,
              transactions: isSnapshotOwner
                ? {
                    ...snapshot.transactions,
                    [definition.id]: {
                      id: definition.id,
                      status: "success",
                      value: exit.value,
                    } satisfies FlowTransactionSnapshot,
                  }
                : snapshot.transactions,
              receipts: [
                ...snapshot.receipts,
                {
                  type: "transaction:success",
                  id: definition.id,
                  generation,
                  parentState: snapshot.value,
                } satisfies FlowReceipt,
              ],
            }) as SnapshotForMachine<Machine>;
            if (isSnapshotOwner) {
              replaceIssues(clearIssue(issues, "transaction", definition.id));
            }
            const invalidatedSnapshot = invalidateTransactionTargets(
              nextSnapshot,
              definition,
              params,
            );
            replaceSnapshot(invalidatedSnapshot, true);
            resumeQueuedTransaction();
            const routedEvent = resolveTransactionOutcomeEvent(
              definition.config.routes as any,
              "success",
              {
                value: exit.value,
              } as any,
            );
            if (routedEvent !== undefined && isSnapshotOwner) {
              actor.send(routedEvent as InferMachineEvent<Machine>);
            }
            return;
          }

          const lane: "interrupt" | "failure" | "defect" = Cause.hasInterruptsOnly(exit.cause)
            ? "interrupt"
            : exit.cause.reasons.find(Cause.isFailReason) !== undefined
              ? "failure"
              : "defect";
          const issue = issueFromExit("transaction", definition.id, exit);
          const routedEvent =
            lane === "failure"
              ? resolveTransactionOutcomeEvent(definition.config.routes as any, "failure", {
                  error: issue?.error,
                } as any)
              : lane === "interrupt"
                ? resolveTransactionOutcomeEvent(definition.config.routes as any, "interrupt", {})
                : resolveTransactionOutcomeEvent(definition.config.routes as any, "defect", {
                    cause: issue?.cause ?? exit.cause,
                  } as any);
          if (isSnapshotOwner) {
            replaceIssues(
              issue === undefined
                ? clearIssue(issues, "transaction", definition.id)
                : replaceIssue(issues, {
                    ...issue,
                    handled: routedEvent !== undefined,
                  }),
            );
          }
          const nextSnapshot = rollbackTransactionPreviewPatches(
            Object.freeze({
              ...snapshot,
              transactions: isSnapshotOwner
                ? {
                    ...snapshot.transactions,
                    [definition.id]: {
                      id: definition.id,
                      status: lane === "interrupt" ? "interrupt" : "failure",
                      ...(issue?.error === undefined ? {} : { error: issue.error }),
                    } satisfies FlowTransactionSnapshot,
                  }
                : snapshot.transactions,
              receipts: [
                ...snapshot.receipts,
                {
                  type:
                    lane === "interrupt"
                      ? "transaction:interrupt"
                      : lane === "defect"
                        ? "transaction:defect"
                        : "transaction:failure",
                  id: definition.id,
                  generation,
                  parentState: snapshot.value,
                } satisfies FlowReceipt,
              ],
            }) as SnapshotForMachine<Machine>,
            definition,
            activeTransaction.previewLayers,
          );
          replaceSnapshot(nextSnapshot, true);
          resumeQueuedTransaction();
          if (routedEvent !== undefined && isSnapshotOwner) {
            actor.send(routedEvent as InferMachineEvent<Machine>);
          }
        });
      },
    });

    return next;
  };

  const startResolvedTransactionWithConcurrency = (
    current: SnapshotForMachine<Machine>,
    definition: AnyFlowTransactionDefinition,
    params: unknown,
    options: Readonly<{
      readonly parentState: InferMachineState<Machine>;
      readonly trigger: "state" | "event";
      readonly event?: InferMachineEvent<Machine>;
      readonly stateOwned: boolean;
    }>,
  ): SnapshotForMachine<Machine> => {
    const concurrencyKey = transactionConcurrencyKey(definition);

    if (activeTransactionEntries(definition.id).length > 0) {
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
      activeTransactionsInConcurrencyKey(concurrencyKey).length > 0
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

  const startTransaction = (
    current: SnapshotForMachine<Machine>,
    definition: AnyFlowTransactionDefinition,
    options: Readonly<{
      readonly parentState: InferMachineState<Machine>;
      readonly trigger: "state" | "event";
      readonly event?: InferMachineEvent<Machine>;
      readonly stateOwned: boolean;
    }>,
  ): SnapshotForMachine<Machine> => {
    const paramsSource = {
      ...invokeArgsForSnapshot(current),
      event: options.event,
    };
    const params = definition.config.params?.(paramsSource as never) ?? undefined;
    if (params === null) {
      return current;
    }

    return startResolvedTransactionWithConcurrency(current, definition, params, options);
  };

  const startStateOwnedResourceCommands = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = resourceCommandInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let nextResources: Record<string, FlowResourceSnapshot> = {
      ...current.resources,
    };
    const nextReceipts = [...current.receipts];
    let nextIssues = issues;

    for (const definition of definitions) {
      if (definition.kind === "patch") {
        const exit = runSyncExit(
          resourceStore.patch(definition.ref, (currentValue) =>
            applyResourcePatch(currentValue, definition.patch),
          ),
        );
        nextResources = syncResourceSnapshots(nextResources, [definition.ref]);
        const issue = issueFromExit("resource", definition.ref.id, exit);
        nextIssues =
          issue === undefined
            ? clearIssue(nextIssues, "resource", definition.ref.id)
            : replaceIssue(nextIssues, issue);
        if (Exit.isSuccess(exit)) {
          nextReceipts.push({
            type: "resource:patch",
            id: definition.ref.id,
            parentState: current.value,
          });
        }
        continue;
      }

      const exit = runSyncExit(resourceStore.invalidate(definition.target));
      const targetId = transactionReceiptIdForInvalidationTarget(definition.target);
      nextResources = syncResourceSnapshots(
        nextResources,
        transactionRefsForInvalidationTarget(knownResourceRefs.values(), definition.target),
      );
      const issue = issueFromExit("resource", targetId, exit);
      nextIssues =
        issue === undefined
          ? clearIssue(nextIssues, "resource", targetId)
          : replaceIssue(nextIssues, issue);
      if (Exit.isSuccess(exit)) {
        nextReceipts.push({
          type: "resource:invalidate",
          id: targetId,
          count: exit.value,
          parentState: current.value,
        });
      }
    }

    replaceIssues(nextIssues);

    return Object.freeze({
      ...current,
      resources: nextResources,
      receipts: nextReceipts,
    });
  };

  const startStateOwnedTransactions = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = transactionInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let next = current;
    for (const definition of definitions) {
      next = startTransaction(next, definition.transaction, {
        parentState: current.value,
        trigger: "state",
        stateOwned: true,
      });
    }

    return next;
  };

  const startStateOwnedStreams = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = streamInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    const nextStreams: Record<string, FlowStreamSnapshot> = {
      ...current.streams,
    };
    const nextReceipts = [...current.receipts];
    let nextIssues = issues;
    let changed = false;

    for (const definition of definitions) {
      if (ownedStreams.has(definition.id)) {
        continue;
      }

      changed = true;
      const generation = (streamGenerations.get(definition.id) ?? 0) + 1;
      streamGenerations.set(definition.id, generation);
      nextStreams[definition.id] = {
        id: definition.id,
        status: "running",
        generation,
        emitted: 0,
      };
      nextReceipts.push({
        type: "stream:start",
        id: definition.id,
        generation,
        parentState: current.value,
      });
      nextIssues = clearIssue(nextIssues, "stream", definition.id);

      const entry: {
        readonly definition: AnyFlowStreamDefinition;
        readonly generation: number;
        interrupt: (interruptor?: number) => void;
      } = {
        definition,
        generation,
        interrupt: () => {},
      };
      ownedStreams.set(definition.id, entry);
      const params = definition.config.params?.(invokeArgsForSnapshot(current));
      const stream = definition.config.subscribe({ params } as never);
      const applyStreamValue = (value: unknown) => {
        enqueueReadyWork(actor, () => {
          if (disposed || ownedStreams.get(definition.id) !== entry) {
            return;
          }

          replaceSnapshot(
            Object.freeze({
              ...snapshot,
              streams: {
                ...snapshot.streams,
                [definition.id]: {
                  id: definition.id,
                  status: "running",
                  generation,
                  emitted: (snapshot.streams[definition.id]?.emitted ?? 0) + 1,
                  value,
                },
              },
            }),
            true,
          );

          const routedValue = definition.config.routes?.value?.(value as never);
          if (routedValue !== undefined) {
            actor.send(routedValue as InferMachineEvent<Machine>);
          }
        });
      };
      const finishStream = (exit: Exit.Exit<unknown, unknown>) => {
        enqueueReadyWork(actor, () => {
          if (disposed || ownedStreams.get(definition.id) !== entry) {
            return;
          }

          ownedStreams.delete(definition.id);
          const issue = issueFromExit("stream", definition.id, exit);
          const status: FlowStreamSnapshot["status"] = Exit.isSuccess(exit)
            ? "success"
            : issue?.kind === "interrupt"
              ? "interrupt"
              : "failure";
          replaceIssues(
            issue === undefined
              ? clearIssue(issues, "stream", definition.id)
              : replaceIssue(issues, issue),
          );
          replaceSnapshot(
            Object.freeze({
              ...snapshot,
              streams: {
                ...snapshot.streams,
                [definition.id]: {
                  id: definition.id,
                  status,
                  generation,
                  emitted: snapshot.streams[definition.id]?.emitted ?? 0,
                  value: snapshot.streams[definition.id]?.value,
                  error: issue?.error,
                },
              },
              receipts: [
                ...snapshot.receipts,
                {
                  type: `stream:${status === "success" ? "done" : issue?.kind === "interrupt" ? "interrupt" : issue?.kind === "defect" ? "defect" : "failure"}`,
                  id: definition.id,
                  generation,
                } satisfies FlowReceipt,
              ],
            }),
            true,
          );

          const routedEvent = Exit.isSuccess(exit)
            ? definition.config.routes?.done?.()
            : issue?.kind === "interrupt"
              ? definition.config.routes?.interrupt?.()
              : issue?.kind === "failure"
                ? definition.config.routes?.failure?.(issue.error as never)
                : undefined;
          if (routedEvent !== undefined) {
            actor.send(routedEvent as InferMachineEvent<Machine>);
          }
        });
      };
      const controlledStreamSource = controlledStreamSourceOf(stream);

      if (controlledStreamSource !== undefined) {
        const unsubscribe = controlledStreamSource.subscribe({
          onValue: applyStreamValue,
          onFailure: (error) => {
            finishStream(Exit.fail(error));
          },
          onDone: () => {
            finishStream(Exit.void);
          },
        });
        entry.interrupt = () => {
          unsubscribe();
        };
        continue;
      }

      entry.interrupt = runEffect(
        Stream.runForEach(stream, (value) => Effect.sync(() => applyStreamValue(value))),
        {
          onExit: finishStream,
        },
      );
    }

    if (!changed) {
      return current;
    }

    replaceIssues(nextIssues);

    return Object.freeze({
      ...current,
      streams: nextStreams,
      receipts: nextReceipts,
    });
  };

  const stopStateOwnedStreams = (
    current: SnapshotForMachine<Machine>,
    parentState: InferMachineState<Machine> = current.value,
  ): SnapshotForMachine<Machine> => {
    if (ownedStreams.size === 0) {
      return current;
    }

    const nextStreams: Record<string, FlowStreamSnapshot> = {
      ...current.streams,
    };
    const nextReceipts = [...current.receipts];
    let nextIssues = issues;

    for (const [streamId, entry] of Array.from(ownedStreams.entries())) {
      ownedStreams.delete(streamId);
      entry.interrupt();
      const priorStream = current.streams[streamId];
      nextStreams[streamId] = {
        id: streamId,
        status: "interrupt",
        generation: entry.generation,
        ...(priorStream?.emitted === undefined ? {} : { emitted: priorStream.emitted }),
        value: priorStream?.value,
      };
      nextReceipts.push({
        type: "stream:interrupt",
        id: streamId,
        generation: entry.generation,
        parentState,
      });
      nextIssues = replaceIssue(nextIssues, {
        kind: "interrupt",
        source: "stream",
        id: streamId,
      });
    }

    replaceIssues(nextIssues);
    return Object.freeze({
      ...current,
      streams: nextStreams,
      receipts: nextReceipts,
    });
  };

  const startStateOwnedChildren = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = childInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    const nextChildren: Record<string, FlowChildSnapshot> = {
      ...current.children,
    };
    const nextReceipts = [...current.receipts];

    for (const definition of definitions) {
      let entry = ownedChildren.get(definition.id);
      if (entry === undefined) {
        const ownedActorId = childActorId(id, definition.id);
        let nextEntry:
          | {
              readonly actorId: string;
              readonly actor: AnyFlowActor;
              readonly definition: FlowChildDefinition;
              readonly unsubscribe: () => void;
            }
          | undefined;
        const ownedActor = createOwnedActor(definition.config.machine, ownedActorId, () => {
          const currentEntry = ownedChildren.get(definition.id);
          if (currentEntry !== nextEntry || disposed) {
            return;
          }

          ownedChildren.delete(definition.id);
          replaceIssues(clearIssue(issues, "child", definition.id));
          const priorChild =
            snapshot.children[definition.id] ??
            childSnapshotForDefinition(definition, snapshot.value, ownedActorId);
          const { [definition.id]: _removedChild, ...remainingChildren } = snapshot.children;

          replaceSnapshot(
            Object.freeze({
              ...snapshot,
              children: remainingChildren,
              receipts: [
                ...snapshot.receipts,
                {
                  type: "child:stop",
                  id: definition.id,
                  actorId: ownedActorId,
                  parentState: priorChild.parentState ?? snapshot.value,
                } satisfies FlowReceipt,
              ],
            }),
            true,
          );
        });
        const unsubscribe = ownedActor.subscribe(() => {
          if (disposed) {
            return;
          }

          const currentEntry = ownedChildren.get(definition.id);
          if (currentEntry === undefined || currentEntry !== nextEntry) {
            return;
          }

          const currentChild = snapshot.children[definition.id];
          if (currentChild === undefined) {
            return;
          }

          const childIssue = latestIssue(currentEntry.actor.issues());
          const nextStatus = childStatusForActor(currentEntry.actor);
          const nextChild = childSnapshotForDefinition(
            definition,
            currentChild.parentState ?? snapshot.value,
            ownedActorId,
            String(currentEntry.actor.snapshot().value),
            nextStatus,
          );
          const nextChildIssues =
            childIssue === undefined
              ? clearIssue(issues, "child", definition.id)
              : replaceIssue(issues, {
                  kind: childIssue.kind,
                  source: "child",
                  id: definition.id,
                  error: childIssue.error,
                  cause: childIssue.cause,
                });
          const receiptType =
            nextStatus === "success"
              ? "child:success"
              : childIssue?.kind === "interrupt"
                ? "child:interrupt"
                : childIssue?.kind === "defect"
                  ? "child:defect"
                  : childIssue?.kind === "failure"
                    ? "child:failure"
                    : undefined;
          replaceIssues(nextChildIssues);
          if (nextStatus === "success") {
            ownedChildren.delete(definition.id);
            currentEntry.unsubscribe();
            const { [definition.id]: _removedChild, ...remainingChildren } = snapshot.children;
            replaceSnapshot(
              Object.freeze({
                ...snapshot,
                children: remainingChildren,
                receipts:
                  receiptType !== undefined && currentChild.status !== nextStatus
                    ? [
                        ...snapshot.receipts,
                        {
                          type: receiptType,
                          id: definition.id,
                          actorId: ownedActorId,
                          parentState: currentChild.parentState ?? snapshot.value,
                        } satisfies FlowReceipt,
                      ]
                    : snapshot.receipts,
              }),
              true,
            );
            void currentEntry.actor.dispose();
            return;
          }

          replaceSnapshot(
            Object.freeze({
              ...snapshot,
              children: {
                ...snapshot.children,
                [definition.id]: nextChild,
              },
              receipts:
                receiptType !== undefined && currentChild.status !== nextStatus
                  ? [
                      ...snapshot.receipts,
                      {
                        type: receiptType,
                        id: definition.id,
                        actorId: ownedActorId,
                        parentState: currentChild.parentState ?? snapshot.value,
                      } satisfies FlowReceipt,
                    ]
                  : snapshot.receipts,
            }),
            true,
          );
        });
        nextEntry = {
          actorId: ownedActorId,
          actor: ownedActor as AnyFlowActor,
          definition,
          unsubscribe,
        };
        ownedChildren.set(definition.id, nextEntry);
        entry = ownedChildren.get(definition.id);
        nextReceipts.push({
          type: "child:start",
          id: definition.id,
          actorId: ownedActorId,
          parentState: current.value,
        });
      }
      const ensuredEntry = entry;
      if (ensuredEntry === undefined) {
        throw new Error(`Missing owned child actor for ${definition.id}`);
      }

      const nextStatus = childStatusForActor(ensuredEntry.actor);
      if (nextStatus === "success") {
        ownedChildren.delete(definition.id);
        ensuredEntry.unsubscribe();
        nextReceipts.push({
          type: "child:success",
          id: definition.id,
          actorId: ensuredEntry.actorId,
          parentState: current.value,
        });
        void ensuredEntry.actor.dispose();
        continue;
      }

      nextChildren[definition.id] = childSnapshotForDefinition(
        definition,
        current.value,
        ensuredEntry.actorId,
        String(ensuredEntry.actor.snapshot().value),
        nextStatus,
      );
    }

    return Object.freeze({
      ...current,
      children: nextChildren,
      receipts: nextReceipts,
    });
  };

  const stopStateOwnedChildren = (
    current: SnapshotForMachine<Machine>,
    retainStopped: boolean,
  ): SnapshotForMachine<Machine> => {
    if (ownedChildren.size === 0) {
      return retainStopped || Object.keys(current.children).length === 0
        ? current
        : Object.freeze({
            ...current,
            children: {},
          });
    }

    const nextChildren: Record<string, FlowChildSnapshot> = retainStopped
      ? { ...current.children }
      : {};
    const nextReceipts = [...current.receipts];
    let nextIssues = issues;

    for (const [definitionId, entry] of Array.from(ownedChildren.entries())) {
      const priorChild =
        current.children[definitionId] ??
        childSnapshotForDefinition(entry.definition, current.value, entry.actorId);

      ownedChildren.delete(definitionId);
      entry.unsubscribe();
      void entry.actor.dispose();
      nextIssues = clearIssue(nextIssues, "child", definitionId);
      nextReceipts.push({
        type: "child:stop",
        id: definitionId,
        actorId: entry.actorId,
        parentState: priorChild.parentState ?? current.value,
      });

      if (retainStopped) {
        nextChildren[definitionId] = Object.freeze({
          ...priorChild,
          status: "stopped" as const,
        });
      }
    }

    replaceIssues(nextIssues);
    return Object.freeze({
      ...current,
      children: nextChildren,
      receipts: nextReceipts,
    });
  };

  const reconcileStateOwnedWork = (
    previous: SnapshotForMachine<Machine>,
    next: SnapshotForMachine<Machine>,
    reentered: boolean,
  ): SnapshotForMachine<Machine> => {
    if (previous.value === next.value && !reentered) {
      return next;
    }

    return startStateOwnedChildren(
      startStateOwnedStreams(
        startStateOwnedTransactions(
          startStateOwnedResourceCommands(
            startStateOwnedQueries(
              stopStateOwnedChildren(
                stopStateOwnedStreams(
                  interruptTransactions(stopStateOwnedQueries(next), "state-owned", previous.value),
                  previous.value,
                ),
                false,
              ),
            ),
          ),
        ),
      ),
    );
  };

  const activateStateOwnedWork = () => {
    replaceSnapshot(
      startStateOwnedChildren(
        startStateOwnedStreams(
          startStateOwnedTransactions(
            startStateOwnedResourceCommands(startStateOwnedQueries(snapshot)),
          ),
        ),
      ),
    );
  };

  const actor: ActorForMachine<Machine> = {
    id,
    machine: typedMachine,
    subscribe: (listener) => {
      if (disposed) {
        return () => undefined;
      }

      const wasDetached = listeners.size === 0;
      const listenerId = nextListenerId++;
      listeners.set(listenerId, listener);
      if (wasDetached) {
        appendReceipt({ type: "actor:subscribe", id });
      }

      let active = true;
      return () => {
        if (!active) {
          return;
        }

        active = false;
        listeners.delete(listenerId);
        if (!disposed && listeners.size === 0) {
          appendReceipt({ type: "actor:unsubscribe", id });
        }
      };
    },
    getSnapshot: () => snapshot,
    snapshot: () => snapshot,
    send: (event) => {
      if (disposed) {
        return actor;
      }

      const plan = planMachineEvent(snapshot, event, transitionRuntime);
      const applied = applyMachineEventWithMeta(plan, transitionRuntime);
      let nextSnapshot = reconcileStateOwnedWork(snapshot, applied.snapshot, applied.reentered);
      if (plan.matched && plan.transition.submit !== undefined) {
        nextSnapshot = startTransaction(nextSnapshot, plan.transition.submit, {
          parentState: nextSnapshot.value,
          trigger: "event",
          event,
          stateOwned: false,
        });
      }
      replaceSnapshot(nextSnapshot, true);
      return actor;
    },
    flush: async () => {
      await flushReadyWork(actor);
      for (const entry of Array.from(ownedChildren.values())) {
        await entry.actor.flush();
      }
    },
    children: () => snapshot.children,
    receipts: () => snapshot.receipts,
    issues: () => issues,
    retryChild: (childId) => {
      if (disposed) {
        return false;
      }

      const entry = ownedChildren.get(childId);
      const child = snapshot.children[childId];
      if (entry === undefined || child?.status !== "failure") {
        return false;
      }

      ownedChildren.delete(childId);
      entry.unsubscribe();
      void entry.actor.dispose();
      replaceIssues(clearIssue(issues, "child", childId));
      replaceSnapshot(
        startStateOwnedChildren(
          Object.freeze({
            ...snapshot,
            receipts: [
              ...snapshot.receipts,
              {
                type: "child:retry",
                id: childId,
                actorId: entry.actorId,
                parentState: child.parentState ?? snapshot.value,
              } satisfies FlowReceipt,
            ],
          }),
        ),
        true,
      );
      return true;
    },
    retryTransaction: (transactionId) => {
      if (disposed) {
        return false;
      }

      const transaction = snapshot.transactions[transactionId];
      const attempt = latestTransactionAttempts.get(transactionId);
      if (
        transaction === undefined ||
        attempt === undefined ||
        (transaction.status !== "failure" && transaction.status !== "interrupt")
      ) {
        return false;
      }

      replaceSnapshot(
        startResolvedTransactionWithConcurrency(
          Object.freeze({
            ...snapshot,
            receipts: [
              ...snapshot.receipts,
              {
                type: "transaction:retry",
                id: transactionId,
                parentState: snapshot.value,
              } satisfies FlowReceipt,
            ],
          }) as SnapshotForMachine<Machine>,
          attempt.definition,
          attempt.params,
          {
            parentState: snapshot.value,
            trigger: "event",
            stateOwned: false,
          },
        ),
        true,
      );
      return true;
    },
    resetTransaction: (transactionId) => {
      if (disposed) {
        return false;
      }

      const transaction = snapshot.transactions[transactionId];
      if (
        transaction === undefined ||
        transaction.status === "idle" ||
        transaction.status === "pending"
      ) {
        return false;
      }

      replaceIssues(clearIssue(issues, "transaction", transactionId));
      replaceSnapshot(
        Object.freeze({
          ...snapshot,
          transactions: {
            ...snapshot.transactions,
            [transactionId]: {
              id: transactionId,
              status: "idle",
            } satisfies FlowTransactionSnapshot,
          },
          receipts: [
            ...snapshot.receipts,
            {
              type: "transaction:reset",
              id: transactionId,
              parentState: snapshot.value,
            } satisfies FlowReceipt,
          ],
        }) as SnapshotForMachine<Machine>,
        true,
      );
      return true;
    },
    dispose: async () => {
      if (disposed) {
        return;
      }

      disposed = true;
      const stoppedChildrenSnapshot = stopStateOwnedChildren(
        stopStateOwnedStreams(
          interruptTransactions(stopStateOwnedQueries(snapshot), "all"),
          snapshot.value,
        ),
        true,
      );
      replaceSnapshot(
        Object.freeze({
          ...stoppedChildrenSnapshot,
          receipts: [
            ...stoppedChildrenSnapshot.receipts,
            { type: "actor:dispose", id } satisfies FlowReceipt,
          ],
        }),
      );
      onDispose?.();
      notifyListeners();
      listeners.clear();
    },
  };

  appendReceipt({ type: "actor:start", id });
  activateStateOwnedWork();

  return actor;
}

export class OrchestratorSystem extends Context.Service<
  OrchestratorSystem,
  {
    readonly start: <Machine extends FlowMachine>(
      machine: Machine,
      options?: ActorStartOptions,
    ) => Effect.Effect<
      FlowActor<
        InferMachineContext<Machine>,
        InferMachineEvent<Machine>,
        InferMachineState<Machine>
      >
    >;
    readonly get: (id: string) => Effect.Effect<FlowActor | null>;
    readonly stop: (id: string) => Effect.Effect<void>;
    readonly stopAll: Effect.Effect<void>;
  }
>()("@flow-state/core/OrchestratorSystem") {
  static readonly layer = Layer.effect(
    OrchestratorSystem,
    Effect.gen(function* () {
      const registry = yield* Effect.acquireRelease(
        Effect.sync(() => new Map<string, AnyFlowActor>()),
        (actors) =>
          Effect.gen(function* () {
            for (const actor of Array.from(actors.values())) {
              yield* Effect.promise(() => actor.dispose());
            }
            actors.clear();
          }),
      );

      const trace = yield* TraceLog;
      const appOwnership = Option.getOrUndefined(yield* Effect.serviceOption(FlowAppOwnership));
      const resourceStore = yield* ResourceStore;
      const runtimeContext = yield* Effect.context<any>();
      const appendTrace = (receipt: FlowReceipt) => {
        Effect.runSync(trace.append(receipt));
      };

      const createRegisteredActor = <Machine extends FlowMachine>(
        machine: Machine,
        actorId: string,
        onActorDispose?: () => void,
      ): ActorForMachine<Machine> => {
        if (registry.has(actorId)) {
          throw new Error(`Actor with id '${actorId}' already exists`);
        }

        const actor = createContractActor(
          machine,
          actorId,
          createRegisteredActor,
          resourceStore,
          runtimeContext,
          () => {
            registry.delete(actorId);
            onActorDispose?.();
          },
          appendTrace,
        );
        registry.set(actor.id, actor as unknown as AnyFlowActor);
        return actor;
      };

      const start = Effect.fn("OrchestratorSystem.start")(
        <Machine extends FlowMachine>(machine: Machine, options?: ActorStartOptions) =>
          Effect.sync(() => {
            const actorId = options?.id ?? appOwnership?.actorIdFor(machine) ?? machine.id;
            const existingActor = registry.get(actorId);
            if (canReuseKeepAliveActor(existingActor, machine, options)) {
              // Reattachment is keyed by the stable actor id plus machine id; the
              // generic actor shape is re-established from the caller's machine contract.
              return existingActor as unknown as ActorForMachine<Machine>;
            }

            return createRegisteredActor(machine, actorId);
          }),
      );

      const get = Effect.fn("OrchestratorSystem.get")((id: string) =>
        Effect.sync(() => registry.get(id) ?? null),
      );

      const stop = Effect.fn("OrchestratorSystem.stop")(function* (id: string) {
        const actor = registry.get(id);
        if (actor === undefined) {
          return;
        }

        yield* Effect.promise(() => actor.dispose());
      });

      const stopAll = Effect.fn("OrchestratorSystem.stopAll")(function* () {
        for (const actor of Array.from(registry.values())) {
          yield* Effect.promise(() => actor.dispose());
        }
        registry.clear();
      })();

      return OrchestratorSystem.of({
        start,
        get,
        stop,
        stopAll,
      });
    }),
  );
}
