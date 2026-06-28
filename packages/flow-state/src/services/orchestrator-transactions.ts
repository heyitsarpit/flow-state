import { Cause, Effect, Exit } from "effect";

import type {
  FlowEvent,
  FlowIssue,
  FlowInvalidationTarget,
  FlowMachine,
  FlowPreviewPatch,
  FlowReceipt,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowSnapshot,
  FlowTransactionDefinition,
  FlowTransactionSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../public/types.js";
import { applyResourcePatch } from "../store/resource-patch.js";
import {
  transactionReceiptIdForInvalidationTarget,
  transactionRefsForInvalidationTarget,
} from "../transaction-invalidation.js";
import { resolveTransactionOutcomeEvent } from "../transaction-outcome.js";
import { clearIssue, issueFromExit, replaceIssue } from "./orchestrator-issues.js";
import type { ResourceStore } from "./resource-store.js";

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

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

type TransactionStartOptions<Machine extends FlowMachine> = Readonly<{
  readonly parentState: InferMachineState<Machine>;
  readonly trigger: "state" | "event";
  readonly event?: InferMachineEvent<Machine>;
  readonly stateOwned: boolean;
}>;

type ActiveTransactionEntry = Readonly<{
  readonly definition: AnyFlowTransactionDefinition;
  readonly concurrencyKey: string;
  readonly generation: number;
  readonly previewLayers: ReadonlyArray<PreviewOverlayLayer>;
  readonly stateOwned: boolean;
}> & {
  interrupt: (interruptor?: number) => void;
};

type QueuedTransaction<Machine extends FlowMachine> = Readonly<{
  readonly concurrencyKey: string;
  readonly definition: AnyFlowTransactionDefinition;
  readonly params: unknown;
  readonly options: TransactionStartOptions<Machine>;
}>;

type EffectRunner = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  onExit?: (exit: Exit.Exit<A, E>) => void,
) => (interruptor?: number) => void;

type SyncExitRunner = <A, E, R>(effect: Effect.Effect<A, E, R>) => Exit.Exit<A, E>;

type TransactionControllerDeps<Machine extends FlowMachine> = Readonly<{
  readonly currentSnapshot: () => SnapshotForMachine<Machine>;
  readonly replaceSnapshot: (
    next: SnapshotForMachine<Machine>,
    notifyListenersAfter?: boolean,
  ) => void;
  readonly currentIssues: () => ReadonlyArray<FlowIssue>;
  readonly replaceIssues: (
    nextIssues: ReadonlyArray<FlowIssue>,
    notifyListenersAfter?: boolean,
  ) => void;
  readonly dispatchOwnedMachineEvent: (event: InferMachineEvent<Machine>) => void;
  readonly enqueue: (work: () => void) => void;
  readonly isDisposed: () => boolean;
  readonly now: () => number;
  readonly runEffect: EffectRunner;
  readonly runSyncExit: SyncExitRunner;
  readonly resourceStore: ResourceStoreService;
  readonly currentResourceSnapshot: (ref: FlowResourceRef) => FlowResourceSnapshot | undefined;
  readonly syncResourceSnapshots: (
    currentResources: Readonly<Record<string, FlowResourceSnapshot>>,
    refs: ReadonlyArray<FlowResourceRef>,
  ) => Record<string, FlowResourceSnapshot>;
  readonly knownResourceRefs: () => Iterable<FlowResourceRef>;
  readonly invokeArgsForSnapshot: (
    snapshot: SnapshotForMachine<Machine>,
  ) => Record<string, unknown>;
}>;

export function createTransactionController<Machine extends FlowMachine>(
  deps: TransactionControllerDeps<Machine>,
) {
  const activeTransactions = new Map<string, ReadonlyArray<ActiveTransactionEntry>>();
  const queuedTransactions = new Map<string, ReadonlyArray<QueuedTransaction<Machine>>>();
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
  let nextPreviewLayerOrder = 0;

  const activeTransactionEntries = (id: string): ReadonlyArray<ActiveTransactionEntry> =>
    activeTransactions.get(id) ?? [];

  const replaceActiveTransactionEntries = (
    id: string,
    entries: ReadonlyArray<ActiveTransactionEntry>,
  ) => {
    if (entries.length === 0) {
      activeTransactions.delete(id);
      return;
    }

    activeTransactions.set(id, entries);
  };

  const latestActiveTransaction = (id: string): ActiveTransactionEntry | undefined => {
    const entries = activeTransactionEntries(id);
    return entries.length === 0 ? undefined : entries[entries.length - 1];
  };

  const activeTransactionsInConcurrencyKey = (
    concurrencyKey: string,
  ): ReadonlyArray<ActiveTransactionEntry> =>
    Array.from(activeTransactions.values()).flatMap((entries) =>
      entries.filter((entry) => entry.concurrencyKey === concurrencyKey),
    );

  const transactionConcurrencyKey = (definition: AnyFlowTransactionDefinition): string =>
    definition.config.concurrency === "serialize"
      ? (definition.config.scope?.id ?? definition.id)
      : definition.id;

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
    let nextIssues = deps.currentIssues();
    const previewLayers: Array<PreviewOverlayLayer> = [];

    for (const previewPatch of previewPatches) {
      const previousSnapshot = deps.currentResourceSnapshot(previewPatch.ref);
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

      const exit = deps.runSyncExit(
        deps.resourceStore.patch(previewPatch.ref, (currentValue) =>
          "replace" in previewPatch
            ? (previewPatch.replace as never)
            : applyResourcePatch(currentValue, previewPatch.patch),
        ),
      );
      nextResources = deps.syncResourceSnapshots(nextResources, [previewPatch.ref]);

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

    deps.replaceIssues(nextIssues);

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
    let nextIssues = deps.currentIssues();
    const removedOrders = new Set(previewLayers.map((layer) => layer.order));
    const touchedRefIds = new Set(previewLayers.map((layer) => layer.ref.id));

    for (const refId of touchedRefIds) {
      const overlay = previewOverlays.get(refId);
      if (overlay === undefined) {
        continue;
      }

      const ref =
        Array.from(deps.knownResourceRefs()).find((resourceRef) => resourceRef.id === refId) ??
        previewLayers.find((layer) => layer.ref.id === refId)?.ref;
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

        const exit = deps.runSyncExit(
          deps.resourceStore.hydrate([
            {
              ref,
              snapshot: priorSnapshot,
            },
          ]),
        );
        nextResources = deps.syncResourceSnapshots(nextResources, [ref]);

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
        deps.now(),
      );
      if (replayedSnapshot?.updatedAt === undefined) {
        continue;
      }

      const exit = deps.runSyncExit(
        deps.resourceStore.hydrate([
          {
            ref,
            snapshot: replayedSnapshot,
          },
        ]),
      );
      nextResources = deps.syncResourceSnapshots(nextResources, [ref]);

      const issue = issueFromExit("resource", refId, exit);
      nextIssues =
        issue === undefined
          ? clearIssue(nextIssues, "resource", refId)
          : replaceIssue(nextIssues, issue);
    }

    deps.replaceIssues(nextIssues);

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
    let nextIssues = deps.currentIssues();

    for (const target of targets) {
      const exit = deps.runSyncExit(deps.resourceStore.invalidate(target));
      const targetId = transactionReceiptIdForInvalidationTarget(target);
      nextResources = deps.syncResourceSnapshots(
        nextResources,
        transactionRefsForInvalidationTarget(deps.knownResourceRefs(), target),
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

    deps.replaceIssues(nextIssues);

    return Object.freeze({
      ...current,
      resources: nextResources,
      receipts: nextReceipts,
    });
  };

  const queueTransaction = (
    current: SnapshotForMachine<Machine>,
    queued: QueuedTransaction<Machine>,
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

  const dequeueTransaction = (concurrencyKey: string): QueuedTransaction<Machine> | undefined => {
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
    deps.replaceIssues(clearIssue(deps.currentIssues(), "transaction", definition.id));
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
    options: TransactionStartOptions<Machine>,
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

    const entry: ActiveTransactionEntry = {
      definition,
      concurrencyKey,
      generation,
      previewLayers: preview.previewLayers,
      stateOwned: options.stateOwned,
      interrupt: () => {},
    };

    replaceActiveTransactionEntries(definition.id, [
      ...activeTransactionEntries(definition.id),
      entry,
    ]);

    entry.interrupt = deps.runEffect(definition.config.commit(params as never), (exit) => {
      deps.enqueue(() => {
        const activeTransaction = activeTransactionEntries(definition.id).find(
          (candidate) => candidate.generation === generation,
        );
        if (deps.isDisposed() || activeTransaction === undefined) {
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

        if (Exit.isSuccess(exit)) {
          commitTransactionPreviewLayers(activeTransaction.previewLayers);
          const nextSnapshot = Object.freeze({
            ...deps.currentSnapshot(),
            transactions: isSnapshotOwner
              ? {
                  ...deps.currentSnapshot().transactions,
                  [definition.id]: {
                    id: definition.id,
                    status: "success",
                    value: exit.value,
                  } satisfies FlowTransactionSnapshot,
                }
              : deps.currentSnapshot().transactions,
            receipts: [
              ...deps.currentSnapshot().receipts,
              {
                type: "transaction:success",
                id: definition.id,
                generation,
                parentState: deps.currentSnapshot().value,
              } satisfies FlowReceipt,
            ],
          }) as SnapshotForMachine<Machine>;
          if (isSnapshotOwner) {
            deps.replaceIssues(clearIssue(deps.currentIssues(), "transaction", definition.id));
          }
          const invalidatedSnapshot = invalidateTransactionTargets(
            nextSnapshot,
            definition,
            params,
          );
          deps.replaceSnapshot(invalidatedSnapshot, true);
          resumeQueuedTransaction();
          const routedEvent = resolveTransactionOutcomeEvent(definition.config.routes, "success", {
            value: exit.value,
          });
          if (routedEvent !== undefined && isSnapshotOwner) {
            deps.dispatchOwnedMachineEvent(routedEvent as InferMachineEvent<Machine>);
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
            ? resolveTransactionOutcomeEvent(definition.config.routes, "failure", {
                error: issue?.error,
              })
            : lane === "interrupt"
              ? resolveTransactionOutcomeEvent(definition.config.routes, "interrupt", {})
              : resolveTransactionOutcomeEvent(definition.config.routes, "defect", {
                  cause: issue?.cause ?? exit.cause,
                });
        if (isSnapshotOwner) {
          deps.replaceIssues(
            issue === undefined
              ? clearIssue(deps.currentIssues(), "transaction", definition.id)
              : replaceIssue(deps.currentIssues(), {
                  ...issue,
                  handled: routedEvent !== undefined,
                }),
          );
        }
        const latestSnapshot = deps.currentSnapshot();
        const nextSnapshot = rollbackTransactionPreviewPatches(
          Object.freeze({
            ...latestSnapshot,
            transactions: isSnapshotOwner
              ? {
                  ...latestSnapshot.transactions,
                  [definition.id]: {
                    id: definition.id,
                    status: lane === "interrupt" ? "interrupt" : "failure",
                    ...(issue?.error === undefined ? {} : { error: issue.error }),
                  } satisfies FlowTransactionSnapshot,
                }
              : latestSnapshot.transactions,
            receipts: [
              ...latestSnapshot.receipts,
              {
                type:
                  lane === "interrupt"
                    ? "transaction:interrupt"
                    : lane === "defect"
                      ? "transaction:defect"
                      : "transaction:failure",
                id: definition.id,
                generation,
                parentState: latestSnapshot.value,
              } satisfies FlowReceipt,
            ],
          }) as SnapshotForMachine<Machine>,
          definition,
          activeTransaction.previewLayers,
        );
        deps.replaceSnapshot(nextSnapshot, true);
        resumeQueuedTransaction();
        if (routedEvent !== undefined && isSnapshotOwner) {
          deps.dispatchOwnedMachineEvent(routedEvent as InferMachineEvent<Machine>);
        }
      });
    });

    return next;
  };

  const startResolvedTransactionWithConcurrency = (
    current: SnapshotForMachine<Machine>,
    definition: AnyFlowTransactionDefinition,
    params: unknown,
    options: TransactionStartOptions<Machine>,
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

  const start = (
    current: SnapshotForMachine<Machine>,
    definition: AnyFlowTransactionDefinition,
    options: TransactionStartOptions<Machine>,
  ): SnapshotForMachine<Machine> => {
    const paramsSource = {
      ...deps.invokeArgsForSnapshot(current),
      event: options.event,
    };
    const params = definition.config.params?.(paramsSource as never) ?? undefined;
    if (params === null) {
      return current;
    }

    return startResolvedTransactionWithConcurrency(current, definition, params, options);
  };

  const interrupt = (
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
    let nextIssues = deps.currentIssues();

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

    deps.replaceIssues(nextIssues);
    return next;
  };

  const retry = (transactionId: string): SnapshotForMachine<Machine> | undefined => {
    const current = deps.currentSnapshot();
    const transaction = current.transactions[transactionId];
    const attempt = latestTransactionAttempts.get(transactionId);
    if (
      transaction === undefined ||
      attempt === undefined ||
      (transaction.status !== "failure" && transaction.status !== "interrupt")
    ) {
      return undefined;
    }

    return startResolvedTransactionWithConcurrency(
      Object.freeze({
        ...current,
        receipts: [
          ...current.receipts,
          {
            type: "transaction:retry",
            id: transactionId,
            parentState: current.value,
          } satisfies FlowReceipt,
        ],
      }) as SnapshotForMachine<Machine>,
      attempt.definition,
      attempt.params,
      {
        parentState: current.value,
        trigger: "event",
        stateOwned: false,
      },
    );
  };

  return {
    start,
    interrupt,
    retry,
  };
}
