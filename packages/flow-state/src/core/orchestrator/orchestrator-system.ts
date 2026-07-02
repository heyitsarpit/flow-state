import { Clock, Context, Effect, Exit, Layer, Option } from "effect";

import { duplicateFlowActorIdDiagnostic } from "../../shared/diagnostics.js";
import {
  type FlowInspectionEventInput,
  type FlowInspectionOwner,
} from "../inspection/inspection-events.js";
import {
  applyAfterTransitionWithMeta,
  applyMachineEventWithMeta,
  planMachineEvent,
} from "../machines/machine-transition.js";
import type {
  FlowActor,
  FlowActorStartOptions,
  FlowIssue,
  FlowMachine,
  FlowReceipt,
  FlowSnapshot,
  FlowTransactionSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import {
  dispatchReadyWork,
  enqueueReadyWork,
  flushReadyWorkNow,
  readyWorkPendingCount,
  startReadyWork,
} from "../scheduling/ready-work.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import { timerOutcomeReceiptFacts } from "./stream-timer-inspection-facts.js";
import type { SelectionSource } from "../../shared/contracts.js";
import { FlowAppOwnership } from "./app-ownership.js";
import type { FlowMachineOwnership } from "./app-ownership.js";
import {
  type OrchestratorActorHandle,
  afterInvokesForState,
  canReuseKeepAliveActor,
  materializeActorStartSnapshot,
  invokeArgsForSnapshot,
  queryInvokesForState,
  resourceCommandInvokesForState,
  streamInvokesForState,
  toActorSnapshotTree,
  transactionInvokesForState,
} from "./orchestrator-helpers.js";
import { clearIssue } from "./orchestrator-issues.js";
import { createOrchestratorInspectionController } from "./orchestrator-inspection.js";
import { InspectionLog } from "../runtime/services/inspection.js";
import { createOwnedChildController } from "./orchestrator-children.js";
import { createResourceController } from "./orchestrator-resources.js";
import { createStreamTimerController } from "./orchestrator-streams-timers.js";
import type { ResourceStoreService } from "./orchestrator-transaction-types.js";
import { createTransactionController } from "./orchestrator-transactions.js";
import { ResourceStore } from "../runtime/services/resource-store.js";
import { FlowRuntimePolicy } from "../runtime/services/runtime-policy.js";
import { TraceLog } from "../runtime/services/trace.js";

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
type FlowInspectionOwnerSeed = Omit<FlowInspectionOwner, "actorId">;

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

function inspectionOwnerSeed(owner: FlowInspectionOwner): FlowInspectionOwnerSeed {
  return Object.freeze({
    rootActorId: owner.rootActorId,
    ...(owner.appId === undefined ? {} : { appId: owner.appId }),
    ...(owner.moduleId === undefined ? {} : { moduleId: owner.moduleId }),
    ...(owner.modulePath === undefined ? {} : { modulePath: owner.modulePath }),
    ...(owner.ownerPath === undefined ? {} : { ownerPath: owner.ownerPath }),
    ...(owner.machineName === undefined ? {} : { machineName: owner.machineName }),
    ...(owner.screens === undefined ? {} : { screens: owner.screens }),
    ...(owner.tags === undefined ? {} : { tags: owner.tags }),
    ...(owner.dependencies === undefined ? {} : { dependencies: owner.dependencies }),
    ...(owner.permissions === undefined ? {} : { permissions: owner.permissions }),
  });
}

function mergeInspectionOwner(
  actorId: string,
  ownerSeed: FlowInspectionOwnerSeed,
  machineOwnership?: FlowMachineOwnership,
): FlowInspectionOwner {
  const appId = machineOwnership?.appId ?? ownerSeed.appId;
  const moduleId = machineOwnership?.moduleId ?? ownerSeed.moduleId;
  const modulePath =
    machineOwnership?.modulePath ??
    ownerSeed.modulePath ??
    (appId === undefined || moduleId === undefined ? undefined : `${appId}/${moduleId}`);
  const ownerPath = machineOwnership?.ownerPath ?? ownerSeed.ownerPath;
  const machineName = machineOwnership?.machineName ?? ownerSeed.machineName;
  const screens = machineOwnership?.screens ?? ownerSeed.screens;
  const tags = machineOwnership?.tags ?? ownerSeed.tags;
  const dependencies = machineOwnership?.dependencies ?? ownerSeed.dependencies;
  const permissions = machineOwnership?.permissions ?? ownerSeed.permissions;

  return Object.freeze({
    actorId,
    rootActorId: ownerSeed.rootActorId,
    ...(appId === undefined ? {} : { appId }),
    ...(moduleId === undefined ? {} : { moduleId }),
    ...(modulePath === undefined ? {} : { modulePath }),
    ...(ownerPath === undefined ? {} : { ownerPath }),
    ...(machineName === undefined ? {} : { machineName }),
    ...(screens === undefined ? {} : { screens }),
    ...(tags === undefined ? {} : { tags }),
    ...(dependencies === undefined ? {} : { dependencies }),
    ...(permissions === undefined ? {} : { permissions }),
  });
}

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
  let nextListenerId = 0;
  let disposed = false;

  const notifyListeners = () => {
    for (const listener of Array.from(listeners.values())) {
      listener();
    }
  };

  const inspectionController = createOrchestratorInspectionController<Machine>({
    actorId: id,
    inspectionOwner,
    currentSnapshot: () => snapshot,
    replaceCurrentSnapshot: (nextSnapshot) => {
      snapshot = nextSnapshot;
    },
    notifyListeners,
    appendTrace,
    appendInspection,
  });
  const replaceSnapshot = inspectionController.replaceSnapshot;
  const appendReceipt = inspectionController.appendReceipt;
  const appendRestoreFacts = inspectionController.appendRestoreFacts;
  const annotateMachineEventReceipts = inspectionController.annotateMachineEventReceipts;

  const dispatchMachineEvent = (event: InferMachineEvent<Machine>, sourceActorId?: string) => {
    if (disposed) {
      return;
    }

    const previousReceiptCount = snapshot.receipts.length;
    const correlationId = inspectionController.createCorrelationId("event");
    const nextSnapshot = inspectionController.withInspectionCorrelation(correlationId, () => {
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

  const replaceIssues = (nextIssues: ReadonlyArray<FlowIssue>, notifyListenersAfter = false) => {
    issues = nextIssues;
    if (notifyListenersAfter) {
      notifyListeners();
    }
  };

  const runDisposeEffect = (actor: RegisteredFlowActor) => {
    Effect.runSync(actor.disposeEffect);
  };
  const ownedActorOwnerSeed = inspectionOwnerSeed(inspectionOwner);
  let actor!: RegisteredActorForMachine<Machine>;

  const childController = createOwnedChildController<Machine>({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    currentIssues: () => issues,
    replaceIssues,
    createOwnedActor: (childMachine, childActorId, onChildDispose, initialChildSnapshot) =>
      createOwnedActor(
        childMachine,
        childActorId,
        ownedActorOwnerSeed,
        onChildDispose,
        initialChildSnapshot,
      ),
    parentActorId: id,
    ownerPath: inspectionOwner.ownerPath,
    currentCorrelationId: () => inspectionController.currentCorrelationId(),
    isDisposed: () => disposed,
    dispatch: (work) => {
      dispatchReadyWork(actor, work);
    },
    runDisposeEffect,
  });

  const resourceController = createResourceController<Machine>({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    currentIssues: () => issues,
    replaceIssues,
    enqueue: (work) => {
      enqueueReadyWork(actor, work);
    },
    currentCorrelationId: () => inspectionController.currentCorrelationId(),
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
    currentCorrelationId: () => inspectionController.currentCorrelationId(),
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
        correlationId: inspectionController.currentCorrelationId(),
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
    currentCorrelationId: () => inspectionController.currentCorrelationId(),
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
                ...timerOutcomeReceiptFacts(
                  entry.startedAt,
                  entry.dueAt,
                  entry.endedAt,
                  entry.restored,
                ),
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
        inspectionController.createCorrelationId("event"),
        id,
      );
    },
  });

  const reconcileStateOwnedWork = (
    previous: SnapshotForMachine<Machine>,
    next: SnapshotForMachine<Machine>,
    reentered: boolean,
  ): SnapshotForMachine<Machine> => {
    if (previous.value === next.value && !reentered) {
      return next;
    }

    return childController.startStateOwnedChildren(
      streamTimerController.startStateOwnedStreams(
        streamTimerController.startStateOwnedAfters(
          startStateOwnedTransactions(
            resourceController.startStateOwnedResourceCommands(
              resourceController.startStateOwnedQueries(
                childController.stopStateOwnedChildren(
                  streamTimerController.stopStateOwnedStreams(
                    streamTimerController.stopStateOwnedAfters(
                      transactionController.interrupt(
                        resourceController.stopStateOwnedQueries(next),
                        "state-owned",
                        previous.value,
                        previous,
                      ),
                      previous,
                      "state-exit",
                    ),
                    previous.value,
                    true,
                    previous,
                    "state-exit",
                  ),
                  false,
                  "state-exit",
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
      childController.startStateOwnedChildren(
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

  const flushEffect = Effect.fn("FlowActor.flush")(() =>
    Effect.suspend(() =>
      Effect.gen(function* () {
        while (true) {
          const entries = yield* Effect.sync(() => {
            flushReadyWorkNow(actor);
            return childController.ownedEntries();
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
        const stoppedChildrenSnapshot = childController.stopStateOwnedChildren(
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
          "parent-dispose",
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
    retryChild: (childId) => childController.retryChild(childId),
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
    const restoreCorrelationId = inspectionController.createCorrelationId("restore");
    const restoredSnapshot = inspectionController.withInspectionCorrelation(
      restoreCorrelationId,
      () => {
        let next = appendRestoreFacts(snapshot, restoreCorrelationId);
        next = streamTimerController.rehydrateStateOwnedAfters(next);
        next = streamTimerController.rehydrateStateOwnedStreams(next);
        next = transactionController.interrupt(next, "all", next.value, next);
        return next;
      },
    );

    replaceSnapshot(restoredSnapshot, true);
    childController.rehydrateStateOwnedChildren(restoredSnapshot);
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
        const inspectionOwner = mergeInspectionOwner(actorId, ownerSeed, machineOwnership);

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
