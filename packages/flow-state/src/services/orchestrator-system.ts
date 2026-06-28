import { Clock, Context, Effect, Exit, Layer, Option } from "effect";

import {
  applyAfterTransitionWithMeta,
  applyMachineEventWithMeta,
  planMachineEvent,
} from "../machine-transition.js";
import { annotateNewMachineEventReceipts } from "../inspection-receipts.js";
import type {
  FlowActor,
  FlowActorStartOptions,
  FlowChildDefinition,
  FlowChildSnapshot,
  FlowIssue,
  FlowMachine,
  FlowReceipt,
  FlowSnapshot,
  FlowTransactionSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../public/types.js";
import { enqueueReadyWork, flushReadyWork } from "../ready-work.js";
import { FlowAppOwnership } from "./app-ownership.js";
import {
  afterInvokesForState,
  appendNewReceipts,
  canReuseKeepAliveActor,
  childActorId,
  type OrchestratorActorHandle,
  childInvokesForState,
  childSnapshotForDefinition,
  childStatusForActor,
  invokeArgsForSnapshot,
  queryInvokesForState,
  resourceCommandInvokesForState,
  restoreChildActorSnapshot,
  streamInvokesForState,
  transactionInvokesForState,
} from "./orchestrator-helpers.js";
import { clearIssue, latestIssue, replaceIssue } from "./orchestrator-issues.js";
import { createResourceController } from "./orchestrator-resources.js";
import { createStreamTimerController } from "./orchestrator-streams-timers.js";
import { createTransactionController } from "./orchestrator-transactions.js";
import { ResourceStore } from "./resource-store.js";
import { TraceLog } from "./trace.js";

type RegisteredFlowActor = FlowActor<any, any, any>;

type ActorForMachine<Machine extends FlowMachine> = FlowActor<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>
>;

type ActorStartOptions<Machine extends FlowMachine = FlowMachine> = FlowActorStartOptions<Machine>;

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;
type OwnedChildEntry = Readonly<{
  readonly actorId: string;
  readonly actor: OrchestratorActorHandle;
  readonly definition: FlowChildDefinition;
  readonly unsubscribe: () => void;
}>;
type ResourceStoreService = Parameters<(typeof ResourceStore)["of"]>[0];

function createContractActor<Machine extends FlowMachine>(
  machine: Machine,
  id = machine.id,
  createOwnedActor: <ChildMachine extends FlowMachine>(
    machine: ChildMachine,
    id: string,
    onDispose?: () => void,
    initialSnapshot?: SnapshotForMachine<ChildMachine>,
  ) => ActorForMachine<ChildMachine>,
  resourceStore: ResourceStoreService,
  runtimeContext: Context.Context<any>,
  onDispose?: () => void,
  appendTrace?: (receipt: FlowReceipt) => void,
  initialSnapshot?: SnapshotForMachine<Machine>,
): ActorForMachine<Machine> {
  const typedMachine = machine as ActorForMachine<Machine>["machine"];
  let snapshot = (initialSnapshot ??
    typedMachine.getInitialSnapshot()) as SnapshotForMachine<Machine>;
  let issues: ReadonlyArray<FlowIssue> = [];
  const listeners = new Map<number, () => void>();
  const runEffect = Effect.runCallbackWith(runtimeContext);
  const runSyncExit = Effect.runSyncExitWith(runtimeContext);
  const transitionRuntime = Object.freeze({
    now: () => {
      const exit = runSyncExit(Clock.currentTimeMillis);
      return Exit.isSuccess(exit) ? exit.value : 0;
    },
  });
  const ownedChildren = new Map<string, OwnedChildEntry>();
  let nextListenerId = 0;
  let nextInspectionCorrelationId = 0;
  let disposed = false;

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

  const annotateMachineEventReceipts = (
    previousReceiptCount: number,
    nextSnapshot: SnapshotForMachine<Machine>,
    sourceActorId?: string,
  ): SnapshotForMachine<Machine> =>
    annotateNewMachineEventReceipts(nextSnapshot, previousReceiptCount, {
      ...(sourceActorId === undefined ? {} : { sourceActorId }),
      targetActorId: id,
      correlationId: `${id}:event:${++nextInspectionCorrelationId}`,
    }) as SnapshotForMachine<Machine>;

  const dispatchMachineEvent = (event: InferMachineEvent<Machine>, sourceActorId?: string) => {
    if (disposed) {
      return;
    }

    const previousReceiptCount = snapshot.receipts.length;
    const plan = planMachineEvent(snapshot, event, transitionRuntime);
    const applied = applyMachineEventWithMeta(plan, transitionRuntime);
    let nextSnapshot = reconcileStateOwnedWork(snapshot, applied.snapshot, applied.reentered);
    if (plan.matched && plan.transition.submit !== undefined) {
      nextSnapshot = transactionController.start(nextSnapshot, plan.transition.submit, {
        parentState: nextSnapshot.value,
        trigger: "event",
        event,
        stateOwned: false,
      });
    }
    replaceSnapshot(
      annotateMachineEventReceipts(previousReceiptCount, nextSnapshot, sourceActorId),
      true,
    );
  };

  const dispatchOwnedMachineEvent = (event: InferMachineEvent<Machine>) => {
    dispatchMachineEvent(event, id);
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

  const resourceController = createResourceController<Machine>({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    currentIssues: () => issues,
    replaceIssues,
    enqueue: (work) => {
      enqueueReadyWork(actor, work);
    },
    isDisposed: () => disposed,
    runEffect: (effect, onExit) => runEffect(effect, onExit === undefined ? undefined : { onExit }),
    runSyncExit,
    resourceStore,
    queriesForState: (current) => queryInvokesForState(current),
    resourceCommandsForState: (current) => resourceCommandInvokesForState(current),
  });

  const transactionController = createTransactionController<Machine>({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    currentIssues: () => issues,
    replaceIssues,
    dispatchOwnedMachineEvent,
    enqueue: (work) => {
      enqueueReadyWork(actor, work);
    },
    isDisposed: () => disposed,
    now: transitionRuntime.now,
    runEffect: (effect, onExit) => runEffect(effect, onExit === undefined ? undefined : { onExit }),
    runSyncExit,
    resourceStore,
    currentResourceSnapshot: resourceController.currentResourceSnapshot,
    syncResourceSnapshots: resourceController.syncResourceSnapshots,
    knownResourceRefs: resourceController.knownResourceRefs,
    invokeArgsForSnapshot: (current) => invokeArgsForSnapshot(current),
    transactionsForState: (current) => transactionInvokesForState(current),
  });

  const startStateOwnedTransactions = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = transactionInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let next = current;
    for (const definition of definitions) {
      next = transactionController.start(next, definition.transaction, {
        parentState: current.value,
        trigger: "state",
        stateOwned: true,
      });
    }

    return next;
  };

  const streamTimerController = createStreamTimerController<Machine>({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    currentIssues: () => issues,
    replaceIssues,
    dispatchOwnedMachineEvent,
    enqueue: (work) => {
      enqueueReadyWork(actor, work);
    },
    isDisposed: () => disposed,
    now: transitionRuntime.now,
    runEffect: (effect, onExit) => runEffect(effect, onExit === undefined ? undefined : { onExit }),
    invokeArgsForSnapshot: (current) => invokeArgsForSnapshot(current),
    streamsForState: (current) => streamInvokesForState(current),
    aftersForState: (current) => afterInvokesForState(current),
    applyAfterTransition: (current, definition, entry) => {
      const applied = applyAfterTransitionWithMeta(
        Object.freeze({
          ...current,
          timers: {
            ...current.timers,
            [definition.id]: {
              id: definition.id,
              status: "fired",
              generation: entry.generation,
              parentState: entry.parentState,
              startedAt: entry.startedAt,
              dueAt: entry.dueAt,
              endedAt: entry.endedAt,
            },
          },
          receipts: [
            ...current.receipts,
            {
              type: "timer:fire",
              id: definition.id,
              generation: entry.generation,
              parentState: entry.parentState,
              dueAt: entry.dueAt,
              endedAt: entry.endedAt,
            } satisfies FlowReceipt,
          ],
        }) as SnapshotForMachine<Machine>,
        definition,
        transitionRuntime,
      );
      return annotateMachineEventReceipts(
        current.receipts.length,
        reconcileStateOwnedWork(
          current,
          applied.snapshot as SnapshotForMachine<Machine>,
          applied.reentered,
        ),
        id,
      );
    },
  });

  const attachOwnedChild = <ChildMachine extends FlowMachine>(
    definition: FlowChildDefinition<ChildMachine>,
    actorId: string,
    initialChildSnapshot?: SnapshotForMachine<ChildMachine>,
  ): OwnedChildEntry => {
    let nextEntry: OwnedChildEntry | undefined;
    const ownedActor = createOwnedActor(
      definition.config.machine,
      actorId,
      () => {
        const currentEntry = ownedChildren.get(definition.id);
        if (currentEntry !== nextEntry || disposed) {
          return;
        }

        ownedChildren.delete(definition.id);
        replaceIssues(clearIssue(issues, "child", definition.id));
        const priorChild =
          snapshot.children[definition.id] ??
          childSnapshotForDefinition(definition, snapshot.value, actorId);
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
                actorId,
                parentState: priorChild.parentState ?? snapshot.value,
              } satisfies FlowReceipt,
            ],
          }),
          true,
        );
      },
      initialChildSnapshot,
    );
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
      const childActorSnapshot = currentEntry.actor.snapshot();
      const nextStatus = childStatusForActor(currentEntry.actor);
      const nextChild = childSnapshotForDefinition(
        definition,
        currentChild.parentState ?? snapshot.value,
        actorId,
        String(childActorSnapshot.value),
        nextStatus,
        childActorSnapshot,
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
                      actorId,
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
                    actorId,
                    parentState: currentChild.parentState ?? snapshot.value,
                  } satisfies FlowReceipt,
                ]
              : snapshot.receipts,
        }),
        true,
      );
    });

    nextEntry = {
      actorId,
      actor: ownedActor,
      definition,
      unsubscribe,
    };
    ownedChildren.set(definition.id, nextEntry);
    return nextEntry;
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
        entry = attachOwnedChild(definition, ownedActorId);
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

      const childActorSnapshot = ensuredEntry.actor.snapshot();
      nextChildren[definition.id] = childSnapshotForDefinition(
        definition,
        current.value,
        ensuredEntry.actorId,
        String(childActorSnapshot.value),
        nextStatus,
        childActorSnapshot,
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

  const rehydrateStateOwnedChildren = (current: SnapshotForMachine<Machine>) => {
    for (const definition of childInvokesForState(current)) {
      const child = current.children[definition.id];
      if (child?.status !== "active" || ownedChildren.has(definition.id)) {
        continue;
      }

      attachOwnedChild(
        definition,
        child.actorId ?? childActorId(id, definition.id),
        restoreChildActorSnapshot(definition, child),
      );
    }
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
      streamTimerController.startStateOwnedStreams(
        streamTimerController.startStateOwnedAfters(
          startStateOwnedTransactions(
            resourceController.startStateOwnedResourceCommands(
              resourceController.startStateOwnedQueries(
                stopStateOwnedChildren(
                  streamTimerController.stopStateOwnedStreams(
                    streamTimerController.stopStateOwnedAfters(
                      transactionController.interrupt(
                        resourceController.stopStateOwnedQueries(next),
                        "state-owned",
                        previous.value,
                        previous,
                      ),
                      previous,
                    ),
                    previous.value,
                    true,
                    previous,
                  ),
                  false,
                ),
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
        streamTimerController.startStateOwnedStreams(
          streamTimerController.startStateOwnedAfters(
            startStateOwnedTransactions(
              resourceController.startStateOwnedResourceCommands(
                resourceController.startStateOwnedQueries(snapshot),
              ),
            ),
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

      dispatchMachineEvent(event);
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

      const nextSnapshot = transactionController.retry(transactionId);
      if (nextSnapshot === undefined) {
        return false;
      }

      replaceSnapshot(nextSnapshot, true);
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
        streamTimerController.stopStateOwnedStreams(
          streamTimerController.stopStateOwnedAfters(
            transactionController.interrupt(
              resourceController.stopStateOwnedQueries(snapshot),
              "all",
            ),
          ),
          snapshot.value,
        ),
        true,
      );
      const finalResources = resourceController.syncResourceSnapshots(
        stoppedChildrenSnapshot.resources,
        Array.from(resourceController.knownResourceRefs()),
      );
      replaceSnapshot(
        Object.freeze({
          ...stoppedChildrenSnapshot,
          resources: finalResources,
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

  if (initialSnapshot === undefined) {
    appendReceipt({ type: "actor:start", id });
    activateStateOwnedWork();
  } else {
    rehydrateStateOwnedChildren(snapshot);
  }

  return actor;
}

export class OrchestratorSystem extends Context.Service<
  OrchestratorSystem,
  {
    readonly start: <Machine extends FlowMachine>(
      machine: Machine,
      options?: ActorStartOptions<Machine>,
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
        Effect.sync(() => new Map<string, RegisteredFlowActor>()),
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
        options?: ActorStartOptions<Machine>,
        onActorDispose?: () => void,
      ): ActorForMachine<Machine> => {
        if (registry.has(actorId)) {
          throw new Error(`Actor with id '${actorId}' already exists`);
        }

        const actor = createContractActor(
          machine,
          actorId,
          (childMachine, childActorId, onChildDispose) =>
            createRegisteredActor(childMachine, childActorId, undefined, onChildDispose),
          resourceStore,
          runtimeContext,
          () => {
            registry.delete(actorId);
            onActorDispose?.();
          },
          appendTrace,
          options?.snapshot,
        );
        registry.set(actor.id, actor);
        return actor;
      };

      const start = Effect.fn("OrchestratorSystem.start")(
        <Machine extends FlowMachine>(machine: Machine, options?: ActorStartOptions<Machine>) =>
          Effect.sync(() => {
            const actorId = options?.id ?? appOwnership?.actorIdFor(machine) ?? machine.id;
            const existingActor = registry.get(actorId);
            if (canReuseKeepAliveActor(existingActor, machine, options)) {
              // Reattachment is keyed by the stable actor id plus machine id; the
              // generic actor shape is re-established from the caller's machine contract.
              return existingActor;
            }

            return createRegisteredActor(machine, actorId, options);
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
