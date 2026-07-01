import { Effect, Exit } from "effect";

import type {
  FlowIssue,
  FlowInvalidationTarget,
  FlowMachine,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import { resourceKeyOf } from "../../store/invalidation.js";
import { applyResourcePatch } from "../../store/resource-patch.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import { clearIssue, issueFromExit, replaceIssue } from "./orchestrator-issues.js";
import {
  resourceFreshnessReceiptsForRefs,
  resourceLookupLifecycleReceipts,
  resourcePlaceholderReceipt,
} from "../../services/resource-lifecycle-receipts.js";
import { applyResourceInvalidationTarget } from "./orchestrator-transaction-invalidation.js";
import type { ResourceStoreService } from "./orchestrator-transaction-types.js";

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

type EffectRunner = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  onExit?: (exit: Exit.Exit<A, E>) => void,
) => (interruptor?: number) => void;

type SyncExitRunner = <A, E, R>(effect: Effect.Effect<A, E, R>) => Exit.Exit<A, E>;

type ResourceControllerDeps<Machine extends FlowMachine> = Readonly<{
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
  readonly currentCorrelationId: () => string | undefined;
  readonly isDisposed: () => boolean;
  readonly runEffect: EffectRunner;
  readonly runSyncExit: SyncExitRunner;
  readonly resourceStore: ResourceStoreService;
  readonly queriesForState: (
    snapshot: SnapshotForMachine<Machine>,
  ) => ReadonlyArray<FlowQueryInvoke>;
  readonly resourceCommandsForState: (
    snapshot: SnapshotForMachine<Machine>,
  ) => ReadonlyArray<FlowResourceCommandInvoke>;
}>;

export function createResourceController<Machine extends FlowMachine>(
  deps: ResourceControllerDeps<Machine>,
) {
  const ownedQueries = new Map<
    string,
    {
      readonly kind: FlowQueryInvoke["kind"];
      readonly ref: FlowResourceRef;
      cancelLookup: (interruptor?: number) => void;
      releaseObservation: () => void;
    }
  >();
  const knownResourceRefs = new Map<string, FlowResourceRef>();

  const rememberResourceRef = (ref: FlowResourceRef) => {
    knownResourceRefs.set(resourceKeyOf(ref), ref);
  };

  const currentResourceSnapshot = (ref: FlowResourceRef): FlowResourceSnapshot | undefined => {
    const exit = deps.runSyncExit(deps.resourceStore.get(ref));
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
    const current = deps.currentSnapshot();
    deps.replaceSnapshot(
      Object.freeze({
        ...current,
        resources: {
          ...current.resources,
          [ref.id]: nextResource,
        },
      }),
      notifyListenersAfter,
    );
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

  const startStateOwnedQueries = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = deps.queriesForState(current);
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
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "query:start",
            id: definition.ref.id,
            mode: definition.kind,
            parentState: current.value,
          },
          deps.currentCorrelationId(),
        ),
      );
      if (seededSnapshot?.isPlaceholderData) {
        nextReceipts.push(
          resourcePlaceholderReceipt(
            definition.ref.id,
            definition.kind,
            current.value,
            deps.currentCorrelationId(),
          ),
        );
      }

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
        deps.runEffect(
          deps.resourceStore.subscribe(definition.ref, (nextResource: FlowResourceSnapshot) => {
            deps.enqueue(() => {
              if (deps.isDisposed() || ownedQueries.get(key) !== entry) {
                return;
              }

              updateResourceSnapshot(definition.ref, nextResource, true);
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
              const issue = issueFromExit("resource", definition.ref.id, exit, {
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
        definition.kind === "refresh"
          ? deps.resourceStore.refresh(definition.ref)
          : deps.resourceStore.ensure(definition.ref);

      entry.cancelLookup = deps.runEffect(lookup, (exit) => {
        deps.enqueue(() => {
          if (deps.isDisposed()) {
            return;
          }

          if (definition.kind === "observe" && ownedQueries.get(key) !== entry) {
            return;
          }

          const previousResource = deps.currentSnapshot().resources[definition.ref.id];
          updateResourceSnapshot(definition.ref, currentResourceSnapshot(definition.ref), true);
          const synchronizedSnapshot = deps.currentSnapshot();
          const nextResource = synchronizedSnapshot.resources[definition.ref.id];
          const lifecycleReceipts = resourceLookupLifecycleReceipts(
            definition.ref.id,
            definition.kind,
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
          const issue = issueFromExit("resource", definition.ref.id, exit, {
            correlationId: deps.currentCorrelationId(),
            parentState: currentSnapshot.value,
            receipts: currentSnapshot.receipts,
          });
          deps.replaceIssues(
            issue === undefined
              ? clearIssue(deps.currentIssues(), "resource", definition.ref.id)
              : replaceIssue(deps.currentIssues(), issue),
            true,
          );

          if (definition.kind !== "observe") {
            ownedQueries.delete(key);
          }
        });
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
    knownResourceRefs: () => knownResourceRefs.values(),
    startStateOwnedQueries,
    stopStateOwnedQueries,
    startStateOwnedResourceCommands,
  };
}
