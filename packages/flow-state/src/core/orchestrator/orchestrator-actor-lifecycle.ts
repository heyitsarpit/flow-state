import { Cause, Effect, Exit } from "effect";

import type {
  FlowActor,
  FlowIssue,
  FlowMachine,
  FlowReceipt,
  FlowSnapshot,
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
import { toActorSnapshotTree } from "./orchestrator-helpers.js";

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

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type OrchestratorActorLifecycleDeps<Machine extends FlowMachine> = Readonly<{
  readonly actorId: string;
  readonly machine: ActorForMachine<Machine>["machine"];
  readonly currentSnapshot: () => SnapshotForMachine<Machine>;
  readonly currentIssues: () => ReadonlyArray<FlowIssue>;
  readonly runPromise: <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>;
}>;

type OrchestratorActorAssemblyDeps<Machine extends FlowMachine> = Readonly<{
  readonly dispatchMachineEvent: (event: InferMachineEvent<Machine>) => void;
  readonly replaceSnapshot: (
    next: SnapshotForMachine<Machine>,
    notifyListenersAfter?: boolean,
  ) => void;
  readonly appendReceipt: (receipt: FlowReceipt) => void;
  readonly buildDisposedSnapshot: () => SnapshotForMachine<Machine>;
  readonly ownedWorkFinalizers: () => ReadonlyArray<Effect.Effect<void>>;
  readonly activateStateOwnedWork: () => void;
  readonly restoreStateOwnedWork: () => void;
  readonly initialSnapshotProvided: boolean;
  readonly ownedChildActors: () => ReadonlyArray<ActorLifecycleEffects>;
  readonly retryChild: (childId: string) => boolean;
  readonly retryTransaction: (transactionId: string) => boolean;
  readonly resetTransaction: (transactionId: string) => boolean;
  readonly onDispose: (() => void) | undefined;
}>;

export function createOrchestratorActorLifecycle<Machine extends FlowMachine>(
  deps: OrchestratorActorLifecycleDeps<Machine>,
) {
  const listeners = new Map<number, () => void>();
  let nextListenerId = 0;
  let disposed = false;
  let disposePromise: Promise<void> | undefined;
  let actor!: RegisteredActorForMachine<Machine>;

  const notifyListeners = () => {
    for (const listener of Array.from(listeners.values())) {
      listener();
    }
  };

  const dispatch = (work: () => void) => {
    if (disposed) {
      return;
    }

    dispatchReadyWork(actor, work);
  };

  const enqueue = (work: () => void) => {
    if (disposed) {
      return;
    }

    enqueueReadyWork(actor, work);
  };

  const createActor = (assembly: OrchestratorActorAssemblyDeps<Machine>) => {
    const flushEffect = Effect.fn("FlowActor.flush")(() =>
      Effect.suspend(() =>
        Effect.gen(function* () {
          while (true) {
            const childActors = yield* Effect.sync(() => {
              flushReadyWorkNow(actor);
              return assembly.ownedChildActors();
            });
            yield* Effect.forEach(childActors, (childActor) => childActor.flushEffect, {
              discard: true,
            });

            const pending = yield* Effect.sync(() => readyWorkPendingCount(actor));
            if (pending === 0) {
              return;
            }
          }
        }),
      ),
    )();

    const disposeProgram = Effect.fn("FlowActor.disposeProgram")(() =>
      Effect.gen(function* () {
        const disposeState = yield* Effect.sync(() => {
          disposed = true;
          const ownedChildActors = assembly.ownedChildActors();
          const stoppedSnapshot = assembly.buildDisposedSnapshot();
          assembly.replaceSnapshot(
            Object.freeze({
              ...stoppedSnapshot,
              receipts: [
                ...stoppedSnapshot.receipts,
                { type: "actor:dispose", id: deps.actorId } satisfies FlowReceipt,
              ],
            }),
          );
          notifyListeners();
          listeners.clear();
          return {
            childActors: ownedChildActors,
            ownedWorkFinalizers: assembly.ownedWorkFinalizers(),
          };
        });

        const childFinalizerExits = yield* Effect.forEach(disposeState.childActors, (childActor) =>
          Effect.exit(childActor.disposeEffect),
        );
        const ownedWorkFinalizerExits = yield* Effect.forEach(
          disposeState.ownedWorkFinalizers,
          (finalizer) => Effect.exit(finalizer),
        );
        yield* Effect.sync(() => {
          assembly.onDispose?.();
        });
        const childFinalizerCause = [...childFinalizerExits, ...ownedWorkFinalizerExits]
          .filter(Exit.isFailure)
          .map((exit) => exit.cause)
          .reduce<Cause.Cause<unknown>>((left, right) => Cause.combine(left, right), Cause.empty);
        if (childFinalizerCause.reasons.length > 0) {
          yield* Effect.failCause(childFinalizerCause);
        }
      }),
    )();

    const disposeEffect = Effect.fn("FlowActor.dispose")(() =>
      Effect.promise(() => {
        disposePromise ??= deps.runPromise(disposeProgram);
        return disposePromise;
      }),
    )();

    const getSnapshot = () => deps.currentSnapshot();

    actor = {
      id: deps.actorId,
      machine: deps.machine,
      subscribe: (listener) => {
        if (disposed) {
          return () => undefined;
        }

        const wasDetached = listeners.size === 0;
        const listenerId = nextListenerId++;
        listeners.set(listenerId, listener);
        if (wasDetached) {
          assembly.appendReceipt({ type: "actor:subscribe", id: deps.actorId });
        }

        let active = true;
        return () => {
          if (!active) {
            return;
          }

          active = false;
          listeners.delete(listenerId);
          if (!disposed && listeners.size === 0) {
            assembly.appendReceipt({ type: "actor:unsubscribe", id: deps.actorId });
          }
        };
      },
      getSnapshot,
      snapshot: getSnapshot,
      send: (event) => {
        if (disposed) {
          return actor;
        }

        dispatch(() => {
          assembly.dispatchMachineEvent(event);
        });
        return actor;
      },
      flushEffect,
      flush: () => deps.runPromise(flushEffect),
      children: () => deps.currentSnapshot().children,
      receipts: () => deps.currentSnapshot().receipts,
      issues: () => deps.currentIssues(),
      serialize: () => toActorSnapshotTree(deps.currentSnapshot()),
      retryChild: (childId) => assembly.retryChild(childId),
      retryTransaction: (transactionId) => assembly.retryTransaction(transactionId),
      resetTransaction: (transactionId) => assembly.resetTransaction(transactionId),
      disposeEffect,
      dispose: () => deps.runPromise(disposeEffect),
    };

    if (assembly.initialSnapshotProvided) {
      assembly.restoreStateOwnedWork();
    } else {
      assembly.appendReceipt({ type: "actor:start", id: deps.actorId });
      assembly.activateStateOwnedWork();
    }
    startReadyWork(actor);

    return actor;
  };

  return {
    notifyListeners,
    dispatch,
    enqueue,
    isDisposed: () => disposed,
    createActor,
  };
}
