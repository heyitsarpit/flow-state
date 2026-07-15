import { Cause, Effect, Exit } from "effect";

import type {
  AnyFlowMachine,
  FlowIssue,
  FlowInvalidationTarget,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import { createEmptyResourceRecord, toPublicResourceSnapshot } from "../store/resource-snapshot.js";
import { applyResourcePatch } from "../store/resource-patch.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import { clearIssue, issueFromExit, replaceIssue } from "./orchestrator-issues.js";
import {
  resourceFreshnessReceiptsForRefs,
  resourceLookupLifecycleReceipts,
  resourcePlaceholderReceipt,
} from "../../services/resource-lifecycle-receipts.js";
import { applyResourceInvalidationTarget } from "./orchestrator-transaction-invalidation.js";
import type { ResourceStoreService } from "./orchestrator-transaction-types.js";
import {
  resolveResourceQuery,
  routeResourceQueryExit,
  type FlowResourceQueryInvoke,
  type ResolvedResourceQuery,
} from "../resources/resource-query-callbacks.js";

type SnapshotForMachine<Machine extends AnyFlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type FlowResourceCommandInvoke =
  | Readonly<{ readonly kind: "patch"; readonly ref: FlowResourceRef; readonly patch: unknown }>
  | Readonly<{ readonly kind: "invalidate"; readonly target: FlowInvalidationTarget }>;

type EffectRunner = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  onExit?: (exit: Exit.Exit<A, E>) => void,
) => (interruptor?: number) => void;

type SyncExitRunner = <A, E, R>(effect: Effect.Effect<A, E, R>) => Exit.Exit<A, E>;

type ResourceControllerDeps<Machine extends AnyFlowMachine> = Readonly<{
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
  readonly enqueue: (work: () => void) => void;
  readonly dispatchOwnedMachineEvent: (event: InferMachineEvent<Machine>) => void;
  readonly currentCorrelationId: () => string | undefined;
  readonly isDisposed: () => boolean;
  readonly runEffect: EffectRunner;
  readonly runSyncExit: SyncExitRunner;
  readonly resourceStore: ResourceStoreService;
  readonly invokeArgsForSnapshot: (
    snapshot: SnapshotForMachine<Machine>,
  ) => Readonly<Record<string, unknown>>;
  readonly queriesForState: (
    snapshot: SnapshotForMachine<Machine>,
  ) => ReadonlyArray<FlowResourceQueryInvoke<InferMachineEvent<Machine>>>;
  readonly resourceCommandsForState: (
    snapshot: SnapshotForMachine<Machine>,
  ) => ReadonlyArray<FlowResourceCommandInvoke>;
}>;

export function createResourceController<Machine extends AnyFlowMachine>(
  deps: ResourceControllerDeps<Machine>,
) {
  const ownedQueries = new Map<
    string,
    {
      readonly kind: FlowResourceQueryInvoke["kind"];
      readonly ref: FlowResourceRef;
      readonly routes: ResolvedResourceQuery<InferMachineEvent<Machine>>["routes"];
      cancelLookup: (interruptor?: number) => void;
      releaseObservation: () => void;
    }
  >();
  const knownResourceRefs = new Map<string, FlowResourceRef>();
  const resourceSnapshotKeys = new Map<string, string>();
  const descriptorSnapshotOwners = new Map<string, string>();
  let nextResourceSnapshotKey = 0;

  const rememberResourceRef = (ref: FlowResourceRef) => {
    knownResourceRefs.set(deps.resourceStore.resourceKeyOf(ref), ref);
  };

  const nextOpaqueResourceSnapshotKey = (): string => {
    nextResourceSnapshotKey += 1;
    return `resource:${nextResourceSnapshotKey}`;
  };

  const ensureResourceSnapshotSlot = (
    ref: FlowResourceRef,
    currentResources: Readonly<Record<string, FlowResourceSnapshot>>,
  ): Readonly<{
    readonly key: string;
    readonly resources: Record<string, FlowResourceSnapshot>;
  }> => {
    const instanceKey = deps.resourceStore.resourceKeyOf(ref);
    const existingKey = resourceSnapshotKeys.get(instanceKey);
    const descriptorOwner = descriptorSnapshotOwners.get(ref.id);
    if (existingKey === ref.id && descriptorOwner === instanceKey) {
      return {
        key: existingKey,
        resources: { ...currentResources },
      };
    }

    const nextResources = { ...currentResources };
    if (descriptorOwner === undefined || descriptorOwner === instanceKey) {
      if (existingKey !== undefined && existingKey !== ref.id) {
        const existingSnapshot = nextResources[existingKey];
        if (existingSnapshot !== undefined) nextResources[ref.id] = existingSnapshot;
        delete nextResources[existingKey];
      }
      descriptorSnapshotOwners.set(ref.id, instanceKey);
      resourceSnapshotKeys.set(instanceKey, ref.id);
      return {
        key: ref.id,
        resources: nextResources,
      };
    }

    const descriptorOwnerKey = resourceSnapshotKeys.get(descriptorOwner);
    let reusedExistingForOwner = false;
    if (descriptorOwnerKey === ref.id) {
      const promotedKey = existingKey ?? nextOpaqueResourceSnapshotKey();
      reusedExistingForOwner = existingKey !== undefined;
      resourceSnapshotKeys.set(descriptorOwner, promotedKey);
      const descriptorSnapshot = nextResources[ref.id];
      if (descriptorSnapshot !== undefined) {
        nextResources[promotedKey] = descriptorSnapshot;
        delete nextResources[ref.id];
      }
    }

    if (existingKey !== undefined) {
      const existingSnapshot = currentResources[existingKey];
      if (existingSnapshot !== undefined) nextResources[ref.id] = existingSnapshot;
      if (existingKey !== ref.id && !reusedExistingForOwner) delete nextResources[existingKey];
    }
    descriptorSnapshotOwners.set(ref.id, instanceKey);
    resourceSnapshotKeys.set(instanceKey, ref.id);
    return {
      key: ref.id,
      resources: nextResources,
    };
  };

  const resourceSnapshotKeyOf = (ref: FlowResourceRef): string =>
    resourceSnapshotKeys.get(deps.resourceStore.resourceKeyOf(ref)) ?? ref.id;

  const currentResourceSnapshot = (ref: FlowResourceRef): FlowResourceSnapshot | undefined => {
    const exit = deps.runSyncExit(deps.resourceStore.get(ref));
    return Exit.isSuccess(exit) ? (exit.value ?? undefined) : undefined;
  };

  const inertPlaceholderSnapshot = (ref: FlowResourceRef): FlowResourceSnapshot | undefined => {
    const snapshot = toPublicResourceSnapshot(0, createEmptyResourceRecord(ref));
    return snapshot.isPlaceholderData ? snapshot : undefined;
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
    const current = deps.currentSnapshot();
    const slot = ensureResourceSnapshotSlot(ref, current.resources);
    deps.replaceSnapshot(
      Object.freeze({
        ...current,
        resources: {
          ...slot.resources,
          [slot.key]: nextResource,
        },
      }),
      notifyListenersAfter,
    );
  };

  const syncResourceSnapshots = (
    currentResources: Readonly<Record<string, FlowResourceSnapshot>>,
    refs: ReadonlyArray<FlowResourceRef>,
  ): Record<string, FlowResourceSnapshot> => {
    let nextResources: Record<string, FlowResourceSnapshot> = {
      ...currentResources,
    };

    for (const ref of refs) {
      rememberResourceRef(ref);
      const nextResource = currentResourceSnapshot(ref);
      if (nextResource !== undefined) {
        const slot = ensureResourceSnapshotSlot(ref, nextResources);
        nextResources = slot.resources;
        nextResources[slot.key] = nextResource;
      }
    }

    return nextResources;
  };

  const removeResourceSnapshot = (
    currentResources: Readonly<Record<string, FlowResourceSnapshot>>,
    ref: FlowResourceRef,
  ): Record<string, FlowResourceSnapshot> => {
    const instanceKey = deps.resourceStore.resourceKeyOf(ref);
    const snapshotKey = resourceSnapshotKeys.get(instanceKey) ?? ref.id;
    const nextResources = { ...currentResources };
    delete nextResources[snapshotKey];
    resourceSnapshotKeys.delete(instanceKey);
    knownResourceRefs.delete(instanceKey);
    if (descriptorSnapshotOwners.get(ref.id) === instanceKey) {
      descriptorSnapshotOwners.delete(ref.id);
    }
    return nextResources;
  };

  const startStateOwnedQueries = (
    current: SnapshotForMachine<Machine>,
    enteringEvent?: InferMachineEvent<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = deps.queriesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let nextResources: Record<string, FlowResourceSnapshot> = {
      ...current.resources,
    };
    const nextReceipts = [...current.receipts];
    let nextIssues = deps.currentIssues();
    let changed = false;

    for (const definition of definitions) {
      let query: ResolvedResourceQuery<InferMachineEvent<Machine>> | null;
      try {
        query = resolveResourceQuery(definition, {
          ...deps.invokeArgsForSnapshot(current),
          event: enteringEvent,
        });
      } catch (cause) {
        const resourceId = "resource" in definition ? definition.resource.id : definition.ref.id;
        const issue = issueFromExit("resource", resourceId, Exit.die(cause), {
          correlationId: deps.currentCorrelationId(),
          parentState: current.value,
          receipts: nextReceipts,
        });
        if (issue !== undefined) nextIssues = replaceIssue(nextIssues, issue);
        continue;
      }
      if (query === null) continue;

      const key = `${query.kind}:${deps.resourceStore.resourceKeyOf(query.ref)}`;
      if (ownedQueries.has(key)) {
        continue;
      }

      changed = true;
      const seededSnapshot =
        currentResourceSnapshot(query.ref) ?? inertPlaceholderSnapshot(query.ref);
      if (seededSnapshot !== undefined) {
        rememberResourceRef(query.ref);
        const slot = ensureResourceSnapshotSlot(query.ref, nextResources);
        nextResources = slot.resources;
        nextResources[slot.key] = seededSnapshot;
      }
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "resource:start",
            id: query.ref.id,
            mode: query.kind,
            parentState: current.value,
          },
          deps.currentCorrelationId(),
        ),
      );
      if (seededSnapshot?.isPlaceholderData) {
        nextReceipts.push(
          resourcePlaceholderReceipt(
            query.ref.id,
            query.kind,
            current.value,
            deps.currentCorrelationId(),
          ),
        );
      }

      const entry: {
        readonly kind: FlowResourceQueryInvoke["kind"];
        readonly ref: FlowResourceRef;
        readonly routes: ResolvedResourceQuery<InferMachineEvent<Machine>>["routes"];
        cancelLookup: (interruptor?: number) => void;
        releaseObservation: () => void;
      } = {
        kind: query.kind,
        ref: query.ref,
        routes: query.routes,
        cancelLookup: () => {},
        releaseObservation: () => {},
      };
      ownedQueries.set(key, entry);

      if (query.kind === "observe") {
        deps.runEffect(
          deps.resourceStore.subscribe(query.ref, (nextResource: FlowResourceSnapshot) => {
            deps.enqueue(() => {
              if (deps.isDisposed() || ownedQueries.get(key) !== entry) {
                return;
              }

              updateResourceSnapshot(query.ref, nextResource, true);
            });
          }),
          (exit) => {
            if (Exit.isSuccess(exit)) {
              entry.releaseObservation = exit.value;
              return;
            }

            deps.enqueue(() => {
              if (deps.isDisposed() || ownedQueries.get(key) !== entry) {
                return;
              }

              const currentSnapshot = deps.currentSnapshot();
              const issue = issueFromExit("resource", query.ref.id, exit, {
                correlationId: deps.currentCorrelationId(),
                parentState: currentSnapshot.value,
                receipts: currentSnapshot.receipts,
              });
              if (issue !== undefined) {
                deps.replaceIssues(replaceIssue(deps.currentIssues(), issue), true);
              }
            });
          },
        );
      }

      const lookup =
        query.kind === "refresh"
          ? deps.resourceStore.refresh(query.ref)
          : deps.resourceStore.ensure(query.ref);

      entry.cancelLookup = deps.runEffect(lookup, (exit) => {
        deps.enqueue(() => {
          if (deps.isDisposed()) {
            return;
          }

          const stillOwned = ownedQueries.get(key) === entry;
          if (!stillOwned && (Exit.isSuccess(exit) || !Cause.hasInterruptsOnly(exit.cause))) {
            return;
          }

          const previousResource =
            deps.currentSnapshot().resources[resourceSnapshotKeyOf(query.ref)];
          updateResourceSnapshot(query.ref, currentResourceSnapshot(query.ref), true);
          const synchronizedSnapshot = deps.currentSnapshot();
          const nextResource = synchronizedSnapshot.resources[resourceSnapshotKeyOf(query.ref)];
          const lifecycleReceipts = resourceLookupLifecycleReceipts(
            query.ref.id,
            query.kind,
            synchronizedSnapshot.value,
            previousResource,
            nextResource,
            exit,
            deps.currentCorrelationId(),
          );
          if (lifecycleReceipts.length > 0) {
            deps.replaceSnapshot(
              Object.freeze({
                ...synchronizedSnapshot,
                receipts: [...synchronizedSnapshot.receipts, ...lifecycleReceipts],
              }),
              true,
            );
          }

          const currentSnapshot = deps.currentSnapshot();
          const issue = issueFromExit("resource", query.ref.id, exit, {
            correlationId: deps.currentCorrelationId(),
            parentState: currentSnapshot.value,
            receipts: currentSnapshot.receipts,
          });
          deps.replaceIssues(
            issue === undefined
              ? clearIssue(deps.currentIssues(), "resource", query.ref.id)
              : replaceIssue(deps.currentIssues(), issue),
            true,
          );

          if (query.kind !== "observe" && stillOwned) {
            ownedQueries.delete(key);
          }

          if (stillOwned) {
            try {
              const routedEvent = routeResourceQueryExit(query, exit);
              if (routedEvent !== undefined) deps.dispatchOwnedMachineEvent(routedEvent);
            } catch (cause) {
              const routeIssue = issueFromExit("resource", query.ref.id, Exit.die(cause), {
                correlationId: deps.currentCorrelationId(),
                parentState: currentSnapshot.value,
                receipts: currentSnapshot.receipts,
              });
              if (routeIssue !== undefined) {
                deps.replaceIssues(replaceIssue(deps.currentIssues(), routeIssue), true);
              }
            }
          }
        });
      });
    }

    if (!changed) {
      deps.replaceIssues(nextIssues);
      return current;
    }

    deps.replaceIssues(nextIssues);

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

  const startStateOwnedResourceCommands = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = deps.resourceCommandsForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let nextResources: Record<string, FlowResourceSnapshot> = {
      ...current.resources,
    };
    const nextReceipts = [...current.receipts];
    let nextIssues = deps.currentIssues();

    for (const definition of definitions) {
      if (definition.kind === "patch") {
        const exit = deps.runSyncExit(
          deps.resourceStore.patch(definition.ref, (currentValue) =>
            applyResourcePatch(currentValue, definition.patch),
          ),
        );
        nextResources = syncResourceSnapshots(nextResources, [definition.ref]);
        const issue = issueFromExit("resource", definition.ref.id, exit, {
          correlationId: deps.currentCorrelationId(),
          parentState: current.value,
          receipts: current.receipts,
        });
        nextIssues =
          issue === undefined
            ? clearIssue(nextIssues, "resource", definition.ref.id)
            : replaceIssue(nextIssues, issue);
        if (Exit.isSuccess(exit)) {
          nextReceipts.push(
            receiptWithCorrelation(
              {
                type: "resource:patch",
                id: definition.ref.id,
                parentState: current.value,
              },
              deps.currentCorrelationId(),
            ),
          );
          nextReceipts.push(
            ...resourceFreshnessReceiptsForRefs(
              [definition.ref],
              current.resources,
              nextResources,
              current.value,
              "patch",
              deps.currentCorrelationId(),
              resourceSnapshotKeyOf,
            ),
          );
        }
        continue;
      }

      const invalidation = applyResourceInvalidationTarget(
        {
          runSyncExit: deps.runSyncExit,
          resourceStore: deps.resourceStore,
          syncResourceSnapshots,
          knownResourceRefs: () => knownResourceRefs.values(),
          resourceSnapshotKeyOf,
        },
        {
          current,
          currentResources: nextResources,
          currentIssues: nextIssues,
          target: definition.target,
          reason: "command",
          correlationId: deps.currentCorrelationId(),
        },
      );
      nextResources = invalidation.resources;
      nextIssues = invalidation.issues;
      nextReceipts.push(...invalidation.receipts);
    }

    deps.replaceIssues(nextIssues);

    return Object.freeze({
      ...current,
      resources: nextResources,
      receipts: nextReceipts,
    });
  };

  return {
    currentResourceSnapshot,
    updateResourceSnapshot,
    syncResourceSnapshots,
    removeResourceSnapshot,
    knownResourceRefs: () => knownResourceRefs.values(),
    startStateOwnedQueries,
    stopStateOwnedQueries,
    startStateOwnedResourceCommands,
  };
}
