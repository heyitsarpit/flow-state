import type {
  FlowActor,
  FlowChildSnapshot,
  FlowEvent,
  FlowIssue,
  FlowMachine,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowRuntime,
  FlowRuntimeOrchestrators,
  FlowRuntimeResources,
  FlowSeededResource,
  FlowSnapshot,
} from "../public/types.js";

function createContractActor<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  id = machine.id,
): FlowActor<Context, Event, State> {
  let snapshot = machine.getInitialSnapshot() as FlowSnapshot<Context, State, Event>;
  const listeners = new Set<() => void>();
  const receipts: FlowIssue[] = [];
  const children: Readonly<Record<string, FlowChildSnapshot>> = {};

  const actor: FlowActor<Context, Event, State> = {
    id,
    machine,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    snapshot: () => snapshot,
    send: (_event) => {
      for (const listener of listeners) {
        listener();
      }
      return actor;
    },
    flush: async () => undefined,
    children: () => children,
    receipts: () => [],
    issues: () => receipts,
    retryChild: () => false,
    dispose: async () => {
      snapshot = {
        ...snapshot,
        receipts: [...snapshot.receipts, { type: "actor:dispose", id }],
      };
      for (const listener of listeners) {
        listener();
      }
    },
  };

  return actor;
}

function toRefKey(ref: FlowResourceRef): string {
  return `${ref.id}:${JSON.stringify(ref.params)}`;
}

function createSuccessSnapshot(id: string, value: unknown): FlowResourceSnapshot {
  return {
    id,
    status: "success",
    availability: "value",
    activity: "idle",
    freshness: "fresh",
    value,
    isPlaceholderData: false,
  };
}

function createContractResources(): FlowRuntimeResources {
  const snapshots = new Map<string, FlowResourceSnapshot>();
  const listeners = new Map<string, Set<(snapshot: FlowResourceSnapshot) => void>>();

  const notify = (ref: FlowResourceRef, snapshot: FlowResourceSnapshot): void => {
    const refListeners = listeners.get(toRefKey(ref));
    if (refListeners === undefined) {
      return;
    }
    for (const listener of refListeners) {
      listener(snapshot);
    }
  };

  return {
    seedResources: (resources: ReadonlyArray<FlowSeededResource>) => {
      for (const seeded of resources) {
        const snapshot = createSuccessSnapshot(seeded.ref.id, seeded.value);
        snapshots.set(toRefKey(seeded.ref), snapshot);
        notify(seeded.ref, snapshot);
      }
    },
    subscribe: (ref, listener) => {
      const key = toRefKey(ref);
      const refListeners =
        listeners.get(key) ?? new Set<(snapshot: FlowResourceSnapshot) => void>();
      refListeners.add(listener);
      listeners.set(key, refListeners);

      const existing = snapshots.get(key);
      if (existing !== undefined) {
        listener(existing);
      }

      return () => {
        refListeners.delete(listener);
        if (refListeners.size === 0) {
          listeners.delete(key);
        }
      };
    },
    patch: (ref, updater) => {
      const current = snapshots.get(toRefKey(ref));
      const nextValue = updater((current?.value as Record<string, unknown> | undefined) ?? {});
      const nextSnapshot = createSuccessSnapshot(ref.id, nextValue);
      snapshots.set(toRefKey(ref), nextSnapshot);
      notify(ref, nextSnapshot);
    },
    get: (ref) => snapshots.get(toRefKey(ref)) ?? null,
  };
}

function createContractOrchestrators(): FlowRuntimeOrchestrators {
  const actors = new Map<string, FlowActor<unknown, FlowEvent, string>>();

  return {
    start: (machine, options) => {
      const actor = createContractActor(machine, options?.id ?? machine.id);
      actors.set(actor.id, actor as unknown as FlowActor<unknown, FlowEvent, string>);
      return actor;
    },
    get: (id) => actors.get(id) ?? null,
    stop: async (id) => {
      const actor = actors.get(id);
      if (actor !== undefined) {
        await actor.dispose();
      }
      actors.delete(id);
    },
  };
}

export function createRuntime(layer?: unknown): FlowRuntime {
  const resources = createContractResources();
  const orchestrators = createContractOrchestrators();

  return Object.freeze({
    kind: "runtime",
    managedRuntime: {
      kind: "managedRuntime" as const,
      layer,
    },
    resources,
    orchestrators,
    createActor: <Context, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<Context, Event, State>,
    ) => createContractActor(machine),
  });
}
