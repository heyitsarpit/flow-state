import { Clock, Context, Effect, Exit, Layer, Option } from "effect";

import { duplicateFlowActorIdDiagnostic, missingOwnedChildActorBug } from "../diagnostics.js";
import {
  type FlowInspectionEventInput,
  type FlowInspectionOwner,
  withInspectionOwnership,
} from "../inspection-events.js";
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
import {
  dispatchReadyWork,
  enqueueReadyWork,
  flushReadyWorkNow,
  readyWorkPendingCount,
  startReadyWork,
} from "../ready-work.js";
import { issueFactsFromReceipts } from "../receipt-summary.js";
import { receiptWithCorrelation } from "../receipt-correlation.js";
import type { SelectionSource } from "../shared-contracts.js";
import { FlowAppOwnership } from "./app-ownership.js";
import {
  type OrchestratorActorHandle,
  afterInvokesForState,
  appendNewReceipts,
  canReuseKeepAliveActor,
  childActorId,
  childInvokesForState,
  childSnapshotForDefinition,
  childStatusForActor,
  invokeArgsForSnapshot,
  materializeActorStartSnapshot,
  queryInvokesForState,
  resourceCommandInvokesForState,
  restoreChildActorSnapshot,
  streamInvokesForState,
  toActorSnapshotTree,
  transactionInvokesForState,
} from "./orchestrator-helpers.js";
import { clearIssue, latestIssue, replaceIssue } from "./orchestrator-issues.js";
import { InspectionLog } from "./inspection.js";
import { createResourceController } from "./orchestrator-resources.js";
import { createStreamTimerController } from "./orchestrator-streams-timers.js";
import { createTransactionController } from "./orchestrator-transactions.js";
import { ResourceStore } from "./resource-store.js";
import { FlowRuntimePolicy } from "./runtime-policy.js";
import { TraceLog } from "./trace.js";

type ActorLifecycleEffects = Readonly<{
  readonly flushEffect: Effect.Effect<void>;
  readonly disposeEffect: Effect.Effect<void>;
}>;

type RegisteredFlowActor = OrchestratorActorHandle &
  Pick<SelectionSource<unknown>, "subscribe"> &
  ActorLifecycleEffects;

type ActorForMachine<Machine extends FlowMachine> = FlowActor<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>
>;
type RegisteredActorForMachine<Machine extends FlowMachine> = ActorForMachine<Machine> &
  ActorLifecycleEffects;

type ActorStartOptions<Machine extends FlowMachine = FlowMachine> = FlowActorStartOptions<Machine>;
type FlowInspectionOwnerSeed = Pick<FlowInspectionOwner, "rootActorId" | "appId" | "moduleId">;

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;
type OwnedChildEntry = Readonly<{
  readonly actorId: string;
  readonly actor: RegisteredFlowActor;
  readonly definition: FlowChildDefinition;
  readonly correlationId: string | undefined;
  readonly unsubscribe: () => void;
}>;
type ResourceStoreService = Parameters<(typeof ResourceStore)["of"]>[0];

function createContractActor<Machine extends FlowMachine>(
  machine: Machine,
  id = machine.id,
  createOwnedActor: <ChildMachine extends FlowMachine>(
    machine: ChildMachine,
    id: string,
    owner: FlowInspectionOwnerSeed,
    onDispose?: () => void,
    initialSnapshot?: SnapshotForMachine<ChildMachine>,
  ) => RegisteredActorForMachine<ChildMachine>,
  resourceStore: ResourceStoreService,
  runtimeContext: Context.Context<unknown>,
  inspectionOwner: FlowInspectionOwner,
  onDispose?: () => void,
  appendTrace?: (receipt: FlowReceipt) => void,
  appendInspection?: (event: FlowInspectionEventInput) => void,
  initialSnapshot?: SnapshotForMachine<Machine>,
): RegisteredActorForMachine<Machine> {
  const typedMachine = machine as ActorForMachine<Machine>["machine"];
  let snapshot = (initialSnapshot ??
    typedMachine.getInitialSnapshot()) as SnapshotForMachine<Machine>;
  let issues: ReadonlyArray<FlowIssue> = [];
  const listeners = new Map<number, () => void>();
  const runEffect = Effect.runCallbackWith(runtimeContext);
  const runPromise = Effect.runPromiseWith(runtimeContext);
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
  let activeInspectionCorrelationId: string | undefined;
  let disposed = false;

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

  const appendInspectionReceipt =
    appendInspection === undefined
      ? undefined
      : (receipt: FlowReceipt) => {
          appendInspection(withInspectionOwnership(inspectionOwner, receipt));
        };

  const replaceSnapshot = (
    nextSnapshot: SnapshotForMachine<Machine>,
    notifyListenersAfter = false,
  ) => {
    const previousSnapshot = snapshot;
    appendNewReceipts(previousSnapshot.receipts, nextSnapshot.receipts, appendTrace);
    appendNewReceipts(previousSnapshot.receipts, nextSnapshot.receipts, appendInspectionReceipt);
    snapshot = nextSnapshot;
    if (appendInspection !== undefined && nextSnapshot !== previousSnapshot) {
      let latestEvent: FlowReceipt | undefined;
      for (let index = nextSnapshot.receipts.length - 1; index >= 0; index -= 1) {
        const receipt = nextSnapshot.receipts[index];
        if (receipt?.type === "machine:event") {
          latestEvent = receipt;
          break;
        }
      }

      appendInspection(
        withInspectionOwnership(inspectionOwner, {
          type: "actor:snapshot",
          id,
          snapshot: toActorSnapshotTree(nextSnapshot),
          ...(typeof latestEvent?.eventType === "string"
            ? { eventType: latestEvent.eventType }
            : {}),
          ...(typeof latestEvent?.sourceActorId === "string"
            ? { sourceActorId: latestEvent.sourceActorId }
            : {}),
          ...(typeof latestEvent?.targetActorId === "string"
            ? { targetActorId: latestEvent.targetActorId }
            : {}),
          ...(typeof latestEvent?.correlationId === "string"
            ? { correlationId: latestEvent.correlationId }
            : {}),
        }),
      );
    }
    if (notifyListenersAfter) {
      notifyListeners();
    }
  };

  const appendReceipt = (receipt: FlowReceipt, notifyListenersAfter = false) => {
    replaceSnapshot(
      Object.freeze({
        ...snapshot,
        receipts: [
          ...snapshot.receipts,
          receiptWithCorrelation(receipt, activeInspectionCorrelationId),
        ],
      }),
      notifyListenersAfter,
    );
  };

  const annotateMachineEventReceipts = (
    previousReceiptCount: number,
    nextSnapshot: SnapshotForMachine<Machine>,
    correlationId: string,
    sourceActorId?: string,
  ): SnapshotForMachine<Machine> =>
    annotateNewMachineEventReceipts(nextSnapshot, previousReceiptCount, {
      ...(sourceActorId === undefined ? {} : { sourceActorId }),
      targetActorId: id,
      correlationId,
    }) as SnapshotForMachine<Machine>;

  const dispatchMachineEvent = (event: InferMachineEvent<Machine>, sourceActorId?: string) => {
    if (disposed) {
      return;
    }

    const previousReceiptCount = snapshot.receipts.length;
    const correlationId = `${id}:event:${++nextInspectionCorrelationId}`;
    const nextSnapshot = withInspectionCorrelation(correlationId, () => {
      const plan = planMachineEvent(snapshot, event, transitionRuntime);
      const applied = applyMachineEventWithMeta(plan, transitionRuntime);
      let correlatedSnapshot = reconcileStateOwnedWork(
        snapshot,
        applied.snapshot,
        applied.reentered,
      );
      if (plan.matched && plan.transition.submit !== undefined) {
        correlatedSnapshot = transactionController.start(
          correlatedSnapshot,
          plan.transition.submit,
          {
            parentState: correlatedSnapshot.value,
            trigger: "event",
            event,
            stateOwned: false,
            correlationId,
          },
        );
      }
      return correlatedSnapshot;
    });
    replaceSnapshot(
      annotateMachineEventReceipts(
        previousReceiptCount,
        nextSnapshot,
        correlationId,
        sourceActorId,
      ),
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

  const runDisposeEffect = (actor: RegisteredFlowActor) => {
    Effect.runSync(actor.disposeEffect);
  };

  const resourceController = createResourceController<Machine>({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    currentIssues: () => issues,
    replaceIssues,
    enqueue: (work) => {
      enqueueReadyWork(actor, work);
    },
    currentCorrelationId: () => activeInspectionCorrelationId,
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
    currentCorrelationId: () => activeInspectionCorrelationId,
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
        correlationId: activeInspectionCorrelationId,
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
    currentCorrelationId: () => activeInspectionCorrelationId,
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
            receiptWithCorrelation(
              {
                type: "timer:fire",
                id: definition.id,
                generation: entry.generation,
                parentState: entry.parentState,
                dueAt: entry.dueAt,
                endedAt: entry.endedAt,
              } satisfies FlowReceipt,
              entry.correlationId,
            ),
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
        `${id}:event:${++nextInspectionCorrelationId}`,
        id,
      );
    },
  });

  const attachOwnedChild = <ChildMachine extends FlowMachine>(
    definition: FlowChildDefinition<ChildMachine>,
    actorId: string,
    correlationId?: string,
    initialChildSnapshot?: SnapshotForMachine<ChildMachine>,
  ): OwnedChildEntry => {
    let nextEntry: OwnedChildEntry | undefined;
    const ownedActor = createOwnedActor(
      definition.config.machine,
      actorId,
      {
        rootActorId: inspectionOwner.rootActorId,
        ...(inspectionOwner.appId === undefined ? {} : { appId: inspectionOwner.appId }),
        ...(inspectionOwner.moduleId === undefined ? {} : { moduleId: inspectionOwner.moduleId }),
      },
      () => {
        const currentEntry = ownedChildren.get(definition.id);
        if (currentEntry === undefined || currentEntry !== nextEntry || disposed) {
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
              receiptWithCorrelation(
                {
                  type: "child:stop",
                  id: definition.id,
                  actorId,
                  parentState: priorChild.parentState ?? snapshot.value,
                } satisfies FlowReceipt,
                currentEntry.correlationId,
              ),
            ],
          }),
          true,
        );
      },
      initialChildSnapshot,
    );
    const unsubscribe = ownedActor.subscribe(() => {
      dispatchReadyWork(actor, () => {
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
                ...(childIssue.handled === undefined ? {} : { handled: childIssue.handled }),
                facts: issueFactsFromReceipts(definition.id, {
                  correlationId: currentEntry.correlationId,
                  parentState: currentChild.parentState ?? snapshot.value,
                  receipts: snapshot.receipts,
                  relatedIds: [actorId, ...(childIssue.facts?.relatedIds ?? [])],
                }),
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
                      receiptWithCorrelation(
                        {
                          type: receiptType,
                          id: definition.id,
                          actorId,
                          parentState: currentChild.parentState ?? snapshot.value,
                        } satisfies FlowReceipt,
                        currentEntry.correlationId,
                      ),
                    ]
                  : snapshot.receipts,
            }),
            true,
          );
          runDisposeEffect(currentEntry.actor);
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
                    receiptWithCorrelation(
                      {
                        type: receiptType,
                        id: definition.id,
                        actorId,
                        parentState: currentChild.parentState ?? snapshot.value,
                      } satisfies FlowReceipt,
                      currentEntry.correlationId,
                    ),
                  ]
                : snapshot.receipts,
          }),
          true,
        );
      });
    });

    nextEntry = {
      actorId,
      actor: ownedActor,
      definition,
      correlationId,
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
        entry = attachOwnedChild(definition, ownedActorId, activeInspectionCorrelationId);
        nextReceipts.push({
          type: "child:start",
          id: definition.id,
          actorId: ownedActorId,
          parentState: current.value,
        });
      }
      const ensuredEntry = entry;
      if (ensuredEntry === undefined) {
        throw missingOwnedChildActorBug(definition.id);
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
        runDisposeEffect(ensuredEntry.actor);
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
      runDisposeEffect(entry.actor);
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
        undefined,
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

  let actor!: RegisteredActorForMachine<Machine>;

  const flushEffect = Effect.fn("FlowActor.flush")(() =>
    Effect.suspend(() =>
      Effect.gen(function* () {
        while (true) {
          const entries = yield* Effect.sync(() => {
            flushReadyWorkNow(actor);
            return Array.from(ownedChildren.values());
          });
          yield* Effect.forEach(entries, (entry) => entry.actor.flushEffect, { discard: true });

          const pending = yield* Effect.sync(() => readyWorkPendingCount(actor));
          if (pending === 0) {
            return;
          }
        }
      }),
    ),
  )();

  const disposeEffect = Effect.fn("FlowActor.dispose")(() =>
    Effect.suspend(() => {
      if (disposed) {
        return Effect.yieldNow;
      }

      return Effect.sync(() => {
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
      }).pipe(Effect.andThen(Effect.yieldNow));
    }),
  )();

  actor = {
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

      dispatchReadyWork(actor, () => {
        dispatchMachineEvent(event);
      });
      return actor;
    },
    flushEffect,
    flush: () => runPromise(flushEffect),
    children: () => snapshot.children,
    receipts: () => snapshot.receipts,
    issues: () => issues,
    serialize: () => toActorSnapshotTree(snapshot),
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
      runDisposeEffect(entry.actor);
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
    disposeEffect,
    dispose: () => runPromise(disposeEffect),
  };

  if (initialSnapshot === undefined) {
    appendReceipt({ type: "actor:start", id });
    activateStateOwnedWork();
  } else {
    streamTimerController.rehydrateStateOwnedAfters(snapshot);
    rehydrateStateOwnedChildren(snapshot);
  }
  startReadyWork(actor);

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
              yield* actor.disposeEffect;
            }
            actors.clear();
          }),
      );

      const inspection = yield* InspectionLog;
      const trace = yield* TraceLog;
      // Keep orchestration semantics anchored to the explicit app/runtime policy
      // owner even while live/test behavior still converges on the same paths.
      yield* FlowRuntimePolicy;
      const appOwnership = Option.getOrUndefined(yield* Effect.serviceOption(FlowAppOwnership));
      const resourceStore = yield* ResourceStore;
      const runtimeContext = yield* Effect.context<unknown>();
      const runSync = Effect.runSyncWith(runtimeContext);
      const appendTrace = (receipt: FlowReceipt) => {
        runSync(trace.append(receipt));
      };
      const appendInspection = (event: FlowInspectionEventInput) => {
        runSync(inspection.append(event));
      };

      const createRegisteredActor = <Machine extends FlowMachine>(
        machine: Machine,
        actorId: string,
        options?: ActorStartOptions<Machine>,
        onActorDispose?: () => void,
        ownerSeed: FlowInspectionOwnerSeed = {
          rootActorId: actorId,
        },
        initialSnapshotOverride?: SnapshotForMachine<Machine>,
      ): RegisteredActorForMachine<Machine> => {
        if (registry.has(actorId)) {
          throw duplicateFlowActorIdDiagnostic(actorId, machine.id);
        }

        const machineOwnership = appOwnership?.ownershipFor(machine);
        const inspectionOwner = Object.freeze({
          actorId,
          rootActorId: ownerSeed.rootActorId,
          ...(machineOwnership?.appId === undefined
            ? ownerSeed.appId === undefined
              ? {}
              : { appId: ownerSeed.appId }
            : { appId: machineOwnership.appId }),
          ...(machineOwnership?.moduleId === undefined
            ? ownerSeed.moduleId === undefined
              ? {}
              : { moduleId: ownerSeed.moduleId }
            : { moduleId: machineOwnership.moduleId }),
        }) satisfies FlowInspectionOwner;

        const actor = createContractActor(
          machine,
          actorId,
          (childMachine, childActorId, childOwnerSeed, onChildDispose, initialChildSnapshot) =>
            createRegisteredActor(
              childMachine,
              childActorId,
              undefined,
              onChildDispose,
              childOwnerSeed,
              initialChildSnapshot,
            ),
          resourceStore,
          runtimeContext,
          inspectionOwner,
          () => {
            registry.delete(actorId);
            onActorDispose?.();
          },
          appendTrace,
          appendInspection,
          initialSnapshotOverride ?? materializeActorStartSnapshot(machine, options?.snapshot),
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

            return createRegisteredActor(machine, actorId, options, undefined, {
              rootActorId: actorId,
            });
          }),
      );

      const get = Effect.fn("OrchestratorSystem.get")((id: string) =>
        Effect.sync(() => (registry.get(id) as FlowActor | undefined) ?? null),
      );

      const stop = Effect.fn("OrchestratorSystem.stop")(function* (id: string) {
        const actor = registry.get(id);
        if (actor === undefined) {
          return;
        }

        yield* actor.disposeEffect;
      });

      const stopAll = Effect.fn("OrchestratorSystem.stopAll")(function* () {
        for (const actor of Array.from(registry.values())) {
          yield* actor.disposeEffect;
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
