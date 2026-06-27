import { Context, Effect, Layer } from "effect";

import { applyMachineEvent, planMachineEvent } from "../machine-transition.js";
import type {
  FlowActor,
  FlowChildDefinition,
  FlowChildSnapshot,
  FlowEvent,
  FlowInvokeDescriptor,
  FlowMachine,
  FlowReceipt,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../public/types.js";
import { flushReadyWork } from "../ready-work.js";
import { TraceLog } from "./trace.js";

type AnyFlowActor = FlowActor<unknown, FlowEvent, string>;

type ActorForMachine<Machine extends FlowMachine> = FlowActor<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>
>;

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

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

function childInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<FlowChildDefinition> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is FlowChildDefinition => invoke.kind === "child",
  );
}

function childSnapshotForDefinition<State extends string>(
  definition: FlowChildDefinition,
  parentState: State,
): FlowChildSnapshot {
  const base = {
    id: definition.id,
    status: "active" as const,
    state: definition.config.machine.config.initial,
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

function createContractActor<Machine extends FlowMachine>(
  machine: Machine,
  id = machine.id,
  createOwnedActor: <ChildMachine extends FlowMachine>(
    machine: ChildMachine,
    id: string,
    onDispose?: () => void,
  ) => ActorForMachine<ChildMachine>,
  onDispose?: () => void,
  appendTrace?: (receipt: FlowReceipt) => void,
): ActorForMachine<Machine> {
  const typedMachine = machine as ActorForMachine<Machine>["machine"];
  let snapshot = typedMachine.getInitialSnapshot() as SnapshotForMachine<Machine>;
  const listeners = new Map<number, () => void>();
  const ownedChildren = new Map<
    string,
    Readonly<{
      readonly actorId: string;
      readonly actor: AnyFlowActor;
      readonly definition: FlowChildDefinition;
    }>
  >();
  let nextListenerId = 0;
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

  const notifyListeners = () => {
    for (const listener of Array.from(listeners.values())) {
      listener();
    }
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
      const existing = ownedChildren.get(definition.id);
      if (existing === undefined) {
        const ownedActorId = childActorId(id, definition.id);
        const ownedActor = createOwnedActor(definition.config.machine, ownedActorId, () => {
          if (!ownedChildren.has(definition.id) || disposed) {
            return;
          }

          ownedChildren.delete(definition.id);
          const priorChild =
            snapshot.children[definition.id] ??
            childSnapshotForDefinition(definition, snapshot.value);
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
        ownedChildren.set(definition.id, {
          actorId: ownedActorId,
          actor: ownedActor as AnyFlowActor,
          definition,
        });
        nextReceipts.push({
          type: "child:start",
          id: definition.id,
          actorId: ownedActorId,
          parentState: current.value,
        });
      }

      nextChildren[definition.id] = childSnapshotForDefinition(definition, current.value);
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

    for (const [definitionId, entry] of Array.from(ownedChildren.entries())) {
      const priorChild =
        current.children[definitionId] ??
        childSnapshotForDefinition(entry.definition, current.value);

      ownedChildren.delete(definitionId);
      void entry.actor.dispose();
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

    return Object.freeze({
      ...current,
      children: nextChildren,
      receipts: nextReceipts,
    });
  };

  const reconcileStateOwnedChildren = (
    previous: SnapshotForMachine<Machine>,
    next: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    if (previous.value === next.value) {
      return next;
    }

    return startStateOwnedChildren(stopStateOwnedChildren(next, false));
  };

  const activateStateOwnedChildren = () => {
    replaceSnapshot(startStateOwnedChildren(snapshot));
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

      replaceSnapshot(
        reconcileStateOwnedChildren(snapshot, applyMachineEvent(planMachineEvent(snapshot, event))),
        true,
      );
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
    issues: () => [],
    retryChild: () => false,
    dispose: async () => {
      if (disposed) {
        return;
      }

      disposed = true;
      const stoppedChildrenSnapshot = stopStateOwnedChildren(snapshot, true);
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
  activateStateOwnedChildren();

  return actor;
}

export class OrchestratorSystem extends Context.Service<
  OrchestratorSystem,
  {
    readonly start: <Machine extends FlowMachine>(
      machine: Machine,
      options?: Readonly<{ readonly id?: string; readonly policy?: string }>,
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
        <Machine extends FlowMachine>(
          machine: Machine,
          options?: Readonly<{ readonly id?: string; readonly policy?: string }>,
        ) =>
          Effect.sync(() => {
            void options?.policy;
            return createRegisteredActor(machine, options?.id ?? machine.id);
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
