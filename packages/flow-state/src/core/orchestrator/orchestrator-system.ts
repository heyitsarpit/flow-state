import { Clock, Context, Effect, Exit, Layer, Option } from "effect";

import {
  type FlowInspectionEventInput,
  type FlowInspectionOwner,
} from "../inspection/inspection-events.js";
import { applyMachineEventWithMeta, planMachineEvent } from "../machines/machine-transition.js";
import type {
  FlowActor,
  FlowActorStartOptions,
  FlowIssue,
  FlowMachine,
  FlowReceipt,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import { FlowAppOwnership } from "./app-ownership.js";
import type { FlowMachineOwnership } from "./app-ownership.js";
import {
  afterInvokesForState,
  invokeArgsForSnapshot,
  queryInvokesForState,
  resourceCommandInvokesForState,
  streamInvokesForState,
  transactionInvokesForState,
} from "./orchestrator-helpers.js";
import { createOrchestratorActorLifecycle } from "./orchestrator-actor-lifecycle.js";
import { createOrchestratorInspectionController } from "./orchestrator-inspection.js";
import { InspectionLog } from "../runtime/services/inspection.js";
import { createOwnedChildController } from "./orchestrator-children.js";
import { createOrchestratorRegistry } from "./orchestrator-registry.js";
import { createResourceController } from "./orchestrator-resources.js";
import { createStreamTimerOwnershipController } from "./orchestrator-stream-timer-ownership.js";
import { createTransactionOwnershipController } from "./orchestrator-transaction-ownership.js";
import type { ResourceStoreService } from "./orchestrator-transaction-types.js";
import { ResourceStore } from "../runtime/services/resource-store.js";
import { FlowRuntimePolicy } from "../runtime/services/runtime-policy.js";
import { TraceLog } from "../runtime/services/trace.js";

type ActorLifecycleEffects = Readonly<{
  readonly flushEffect: Effect.Effect<void>;
  readonly disposeEffect: Effect.Effect<void>;
}>;

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
  const runEffect = Effect.runCallbackWith(runtimeContext);
  const runPromise = Effect.runPromiseWith(runtimeContext);
  const runSyncExit = Effect.runSyncExitWith(runtimeContext);
  const transitionRuntime = Object.freeze({
    now: () => {
      const exit = runSyncExit(Clock.currentTimeMillis);
      return Exit.isSuccess(exit) ? exit.value : 0;
    },
  });
  const actorLifecycle = createOrchestratorActorLifecycle<Machine>({
    actorId: id,
    machine: typedMachine,
    currentSnapshot: () => snapshot,
    currentIssues: () => issues,
    runPromise,
  });

  const inspectionController = createOrchestratorInspectionController<Machine>({
    actorId: id,
    inspectionOwner,
    currentSnapshot: () => snapshot,
    replaceCurrentSnapshot: (nextSnapshot) => {
      snapshot = nextSnapshot;
    },
    notifyListeners: actorLifecycle.notifyListeners,
    appendTrace,
    appendInspection,
  });
  const replaceSnapshot = inspectionController.replaceSnapshot;
  const appendReceipt = inspectionController.appendReceipt;
  const appendRestoreFacts = inspectionController.appendRestoreFacts;
  const annotateMachineEventReceipts = inspectionController.annotateMachineEventReceipts;

  const dispatchMachineEvent = (event: InferMachineEvent<Machine>, sourceActorId?: string) => {
    if (actorLifecycle.isDisposed()) {
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
      actorLifecycle.notifyListeners();
    }
  };

  const runDisposeEffect = (actor: Readonly<{ readonly disposeEffect: Effect.Effect<void> }>) => {
    Effect.runSync(actor.disposeEffect);
  };
  const ownedActorOwnerSeed = inspectionOwnerSeed(inspectionOwner);

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
    isDisposed: actorLifecycle.isDisposed,
    dispatch: actorLifecycle.dispatch,
    runDisposeEffect,
  });

  const resourceController = createResourceController<Machine>({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    currentIssues: () => issues,
    replaceIssues,
    enqueue: actorLifecycle.enqueue,
    currentCorrelationId: () => inspectionController.currentCorrelationId(),
    isDisposed: actorLifecycle.isDisposed,
    runEffect: (effect, onExit) => runEffect(effect, onExit === undefined ? undefined : { onExit }),
    runSyncExit,
    resourceStore,
    queriesForState: (current) => queryInvokesForState(current),
    resourceCommandsForState: (current) => resourceCommandInvokesForState(current),
  });

  const transactionController = createTransactionOwnershipController<Machine>({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    currentIssues: () => issues,
    replaceIssues,
    dispatchOwnedMachineEvent,
    enqueue: actorLifecycle.enqueue,
    currentCorrelationId: () => inspectionController.currentCorrelationId(),
    isDisposed: actorLifecycle.isDisposed,
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

  const streamTimerController = createStreamTimerOwnershipController<Machine>({
    actorId: id,
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    currentIssues: () => issues,
    replaceIssues,
    dispatchOwnedMachineEvent,
    enqueue: actorLifecycle.enqueue,
    currentCorrelationId: () => inspectionController.currentCorrelationId(),
    isDisposed: actorLifecycle.isDisposed,
    now: transitionRuntime.now,
    runEffect: (effect, onExit) => runEffect(effect, onExit === undefined ? undefined : { onExit }),
    invokeArgsForSnapshot: (current) => invokeArgsForSnapshot(current),
    streamsForState: (current) => streamInvokesForState(current),
    aftersForState: (current) => afterInvokesForState(current),
    transitionRuntime,
    annotateMachineEventReceipts,
    reconcileStateOwnedWork: (previous, next, reentered) =>
      reconcileStateOwnedWork(previous, next, reentered),
    createCorrelationId: (kind) => inspectionController.createCorrelationId(kind),
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
          transactionController.startStateOwnedTransactions(
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
            transactionController.startStateOwnedTransactions(
              resourceController.startStateOwnedResourceCommands(
                resourceController.startStateOwnedQueries(snapshot),
              ),
            ),
          ),
        ),
      ),
    );
  };

  const restoreStateOwnedWork = () => {
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
  };

  return actorLifecycle.createActor({
    dispatchMachineEvent,
    replaceSnapshot,
    appendReceipt,
    buildDisposedSnapshot: () => {
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
      return Object.freeze({
        ...stoppedChildrenSnapshot,
        resources: finalResources,
      });
    },
    activateStateOwnedWork,
    restoreStateOwnedWork,
    initialSnapshotProvided: initialSnapshot !== undefined,
    ownedChildActors: () => childController.ownedEntries().map((entry) => entry.actor),
    retryChild: (childId) => childController.retryChild(childId),
    retryTransaction: (transactionId) => transactionController.retryTransaction(transactionId),
    resetTransaction: (transactionId) => transactionController.resetTransaction(transactionId),
    onDispose,
  });
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
>()("flow-state/OrchestratorSystem") {
  static readonly layer = Layer.effect(
    OrchestratorSystem,
    Effect.gen(function* () {
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
      const registry = yield* Effect.acquireRelease(
        Effect.sync(() =>
          createOrchestratorRegistry({
            actorIdFor: (machine, options) =>
              options?.id ?? appOwnership?.actorIdFor(machine) ?? machine.id,
            inspectionOwnerFor: (machine, actorId, ownerSeed) =>
              mergeInspectionOwner(actorId, ownerSeed, appOwnership?.ownershipFor(machine)),
            createActor: (
              machine,
              actorId,
              createOwnedActor,
              inspectionOwner,
              onDispose,
              initialSnapshot,
            ) =>
              createContractActor(
                machine,
                actorId,
                createOwnedActor,
                resourceStore,
                runtimeContext,
                inspectionOwner,
                onDispose,
                appendTrace,
                appendInspection,
                initialSnapshot,
              ),
          }),
        ),
        (controller) => controller.stopAll,
      );

      return OrchestratorSystem.of({
        start: registry.start,
        get: registry.get,
        stop: registry.stop,
        stopAll: registry.stopAll,
      });
    }),
  );
}
