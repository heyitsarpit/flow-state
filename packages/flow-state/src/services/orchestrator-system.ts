import { Context, Effect, Layer } from "effect";

import { applyMachineEvent, planMachineEvent } from "../machine-transition.js";
import type { FlowActor, FlowEvent, FlowMachine } from "../public/types.js";

function createContractActor<ContextShape, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<ContextShape, Event, State>,
  id = machine.id,
  onDispose?: () => void,
): FlowActor<ContextShape, Event, State> {
  let snapshot = machine.getInitialSnapshot();
  const listeners = new Set<() => void>();
  let disposed = false;

  const notifyListeners = () => {
    for (const listener of Array.from(listeners)) {
      listener();
    }
  };

  const actor: FlowActor<ContextShape, Event, State> = {
    id,
    machine,
    subscribe: (listener) => {
      if (disposed) {
        return () => undefined;
      }

      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    snapshot: () => snapshot,
    send: (event) => {
      if (disposed) {
        return actor;
      }

      snapshot = applyMachineEvent(planMachineEvent(snapshot, event));
      notifyListeners();
      return actor;
    },
    flush: async () => undefined,
    children: () => snapshot.children,
    receipts: () => snapshot.receipts,
    issues: () => [],
    retryChild: () => false,
    dispose: async () => {
      if (disposed) {
        return;
      }

      disposed = true;
      snapshot = {
        ...snapshot,
        receipts: [...snapshot.receipts, { type: "actor:dispose", id }],
      };
      onDispose?.();
      notifyListeners();
      listeners.clear();
    },
  };

  return actor;
}

type AnyFlowActor = FlowActor<unknown, FlowEvent, string>;

export class OrchestratorSystem extends Context.Service<
  OrchestratorSystem,
  {
    readonly start: <ContextShape, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<ContextShape, Event, State>,
      options?: Readonly<{ readonly id?: string; readonly policy?: string }>,
    ) => Effect.Effect<FlowActor<ContextShape, Event, State>>;
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

      const start = Effect.fn("OrchestratorSystem.start")(function* <
        ContextShape,
        Event extends FlowEvent,
        State extends string,
      >(
        machine: FlowMachine<ContextShape, Event, State>,
        options?: Readonly<{ readonly id?: string; readonly policy?: string }>,
      ) {
        void options?.policy;
        const actorId = options?.id ?? machine.id;
        const actor = createContractActor(machine, actorId, () => {
          registry.delete(actorId);
        });
        registry.set(actor.id, actor as AnyFlowActor);
        return actor;
      });

      const get = Effect.fn("OrchestratorSystem.get")(function* (id: string) {
        return registry.get(id) ?? null;
      });

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
