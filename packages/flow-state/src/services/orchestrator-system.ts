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

function appendStateOwnedChildren<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
): FlowSnapshot<Context, State, Event> {
  const definitions = childInvokesForState(snapshot);
  if (definitions.length === 0) {
    return snapshot;
  }

  const nextChildren: Record<string, FlowChildSnapshot> = {
    ...snapshot.children,
  };
  const nextReceipts = [...snapshot.receipts];

  for (const definition of definitions) {
    nextChildren[definition.id] = childSnapshotForDefinition(definition, snapshot.value);
    nextReceipts.push({
      type: "child:start",
      id: definition.id,
      parentState: snapshot.value,
    });
  }

  return Object.freeze({
    ...snapshot,
    children: nextChildren,
    receipts: nextReceipts,
  });
}

function stopStateOwnedChildren<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  retainStopped: boolean,
): FlowSnapshot<Context, State, Event> {
  const activeChildren = Object.values(snapshot.children).filter(
    (child) => child.status === "active",
  );
  if (activeChildren.length === 0) {
    return retainStopped
      ? snapshot
      : Object.freeze({
          ...snapshot,
          children: {},
        });
  }

  const nextChildren: Record<string, FlowChildSnapshot> = retainStopped
    ? { ...snapshot.children }
    : {};
  const nextReceipts = [...snapshot.receipts];

  for (const child of activeChildren) {
    nextReceipts.push({
      type: "child:stop",
      id: child.id,
      parentState: child.parentState ?? snapshot.value,
    });
    if (retainStopped) {
      nextChildren[child.id] = Object.freeze({
        ...child,
        status: "stopped" as const,
      });
    }
  }

  return Object.freeze({
    ...snapshot,
    children: nextChildren,
    receipts: nextReceipts,
  });
}

function reconcileStateOwnedChildren<Context, Event extends FlowEvent, State extends string>(
  previous: FlowSnapshot<Context, State, Event>,
  next: FlowSnapshot<Context, State, Event>,
): FlowSnapshot<Context, State, Event> {
  if (previous.value === next.value) {
    return next;
  }

  return appendStateOwnedChildren(stopStateOwnedChildren(next, false));
}

function createContractActor<Machine extends FlowMachine>(
  machine: Machine,
  id = machine.id,
  onDispose?: () => void,
  appendTrace?: (receipt: FlowReceipt) => void,
): ActorForMachine<Machine> {
  const typedMachine = machine as ActorForMachine<Machine>["machine"];
  let snapshot = typedMachine.getInitialSnapshot() as SnapshotForMachine<Machine>;
  const listeners = new Map<number, () => void>();
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

  const activateStateOwnedChildren = () => {
    replaceSnapshot(appendStateOwnedChildren(snapshot));
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
    flush: () => flushReadyWork(actor),
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

type AnyFlowActor = FlowActor<unknown, FlowEvent, string>;

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
      const start = Effect.fn("OrchestratorSystem.start")(
        <Machine extends FlowMachine>(
          machine: Machine,
          options?: Readonly<{ readonly id?: string; readonly policy?: string }>,
        ) =>
          Effect.sync(() => {
            void options?.policy;
            const actorId = options?.id ?? machine.id;
            if (registry.has(actorId)) {
              throw new Error(`Actor with id '${actorId}' already exists`);
            }
            const actor = createContractActor(
              machine,
              actorId,
              () => {
                registry.delete(actorId);
              },
              (receipt) => {
                Effect.runSync(trace.append(receipt));
              },
            );
            registry.set(actor.id, actor as unknown as AnyFlowActor);
            return actor;
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
