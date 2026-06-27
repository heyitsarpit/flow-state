import { Context, Effect, Layer } from "effect";

import { applyMachineEvent, planMachineEvent } from "../machine-transition.js";
import type {
  FlowActor,
  FlowEvent,
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

  const appendReceipt = (receipt: FlowReceipt, notifyListenersAfter = false) => {
    const nextSnapshot = Object.freeze({
      ...snapshot,
      receipts: [...snapshot.receipts, receipt],
    });
    appendNewReceipts(snapshot.receipts, nextSnapshot.receipts, appendTrace);
    snapshot = nextSnapshot;
    if (notifyListenersAfter) {
      notifyListeners();
    }
  };

  const notifyListeners = () => {
    for (const listener of Array.from(listeners.values())) {
      listener();
    }
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

      const nextSnapshot = applyMachineEvent(planMachineEvent(snapshot, event));
      appendNewReceipts(snapshot.receipts, nextSnapshot.receipts, appendTrace);
      snapshot = nextSnapshot;
      notifyListeners();
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
      appendReceipt({ type: "actor:dispose", id });
      onDispose?.();
      notifyListeners();
      listeners.clear();
    },
  };

  appendReceipt({ type: "actor:start", id });

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
