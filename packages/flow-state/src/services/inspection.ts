import { Clock, Context, Effect, Layer, Ref } from "effect";

import type { FlowInspectionEventInput } from "../inspection-events.js";
import type {
  FlowInspectionEvent,
  FlowInspectionFilter,
  FlowInspectionListener,
  FlowInspectionObserver,
  FlowInspectionSubscription,
} from "../public/data-types.js";

type InspectionLogState = Readonly<{
  readonly nextSequence: number;
  readonly entries: ReadonlyArray<FlowInspectionEvent>;
}>;

type InspectionListenerEntry = Readonly<{
  readonly filter?: FlowInspectionFilter;
  readonly next: FlowInspectionListener;
  readonly error?: (error: unknown) => void;
  readonly complete?: () => void;
}>;

type MutableFlowInspectionSubscription = (() => void) & {
  unsubscribe: () => void;
  closed: boolean;
};

function eventFamilyOf(event: FlowInspectionEvent): FlowInspectionFilter["family"] {
  const separator = event.type.indexOf(":");
  return (
    separator === -1 ? event.type : event.type.slice(0, separator)
  ) as FlowInspectionFilter["family"];
}

function matchesInspectionFilter(
  event: FlowInspectionEvent,
  filter?: FlowInspectionFilter,
): boolean {
  if (filter === undefined) {
    return true;
  }

  if (filter.type !== undefined && event.type !== filter.type) {
    return false;
  }

  if (filter.types !== undefined && !filter.types.includes(event.type)) {
    return false;
  }

  if (filter.family !== undefined && eventFamilyOf(event) !== filter.family) {
    return false;
  }

  if (filter.id !== undefined && event.id !== filter.id) {
    return false;
  }

  if (filter.actorId !== undefined && event.actorId !== filter.actorId) {
    return false;
  }

  if (filter.rootActorId !== undefined && event.rootActorId !== filter.rootActorId) {
    return false;
  }

  if (filter.appId !== undefined && event.appId !== filter.appId) {
    return false;
  }

  if (filter.moduleId !== undefined && event.moduleId !== filter.moduleId) {
    return false;
  }

  if (filter.correlationId !== undefined && event.correlationId !== filter.correlationId) {
    return false;
  }

  if (filter.eventType !== undefined && event.eventType !== filter.eventType) {
    return false;
  }

  if (filter.afterSequence !== undefined && event.sequence <= filter.afterSequence) {
    return false;
  }

  return filter.predicate?.(event) ?? true;
}

function normalizeObserver(
  listenerOrObserver: FlowInspectionListener | FlowInspectionObserver,
): InspectionListenerEntry {
  if (typeof listenerOrObserver === "function") {
    return {
      next: listenerOrObserver,
    };
  }

  return {
    next: listenerOrObserver.next,
    ...(listenerOrObserver.error === undefined ? {} : { error: listenerOrObserver.error }),
    ...(listenerOrObserver.complete === undefined ? {} : { complete: listenerOrObserver.complete }),
  };
}

export class InspectionLog extends Context.Service<
  InspectionLog,
  {
    readonly entries: (
      filter?: FlowInspectionFilter,
    ) => Effect.Effect<ReadonlyArray<FlowInspectionEvent>>;
    readonly append: (event: FlowInspectionEventInput) => Effect.Effect<void>;
    readonly clear: Effect.Effect<void>;
    readonly subscribe: (
      listenerOrObserver: FlowInspectionListener | FlowInspectionObserver,
      filter?: FlowInspectionFilter,
    ) => Effect.Effect<FlowInspectionSubscription>;
  }
>()("@flow-state/core/InspectionLog") {
  static readonly layer = Layer.effect(
    InspectionLog,
    Effect.gen(function* () {
      const state = yield* Ref.make<InspectionLogState>({
        nextSequence: 1,
        entries: Object.freeze([]),
      });
      const listeners = new Set<InspectionListenerEntry>();

      const append = Effect.fn("InspectionLog.append")(function* (event: FlowInspectionEventInput) {
        const timestamp = yield* Clock.currentTimeMillis;
        const appended = yield* Ref.modify(state, (current) => {
          const normalized = Object.freeze({
            ...event,
            timestamp,
            sequence: current.nextSequence,
          }) as FlowInspectionEvent;

          return [
            normalized,
            {
              nextSequence: current.nextSequence + 1,
              entries: Object.freeze([...current.entries, normalized]),
            } satisfies InspectionLogState,
          ] as const;
        });

        yield* Effect.sync(() => {
          for (const listener of Array.from(listeners)) {
            if (!matchesInspectionFilter(appended, listener.filter)) {
              continue;
            }

            try {
              listener.next(appended);
            } catch (error) {
              if (listener.error !== undefined) {
                listener.error(error);
                continue;
              }
              throw error;
            }
          }
        });
      });

      const entries = Effect.fn("InspectionLog.entries")((filter?: FlowInspectionFilter) =>
        Effect.map(Ref.get(state), (current) =>
          filter === undefined
            ? current.entries
            : Object.freeze(
                current.entries.filter((event) => matchesInspectionFilter(event, filter)),
              ),
        ),
      );

      const subscribe = Effect.fn("InspectionLog.subscribe")(
        (
          listenerOrObserver: FlowInspectionListener | FlowInspectionObserver,
          filter?: FlowInspectionFilter,
        ) =>
          Effect.sync(() => {
            const observer = normalizeObserver(listenerOrObserver);
            const entry = {
              ...observer,
              ...(filter === undefined ? {} : { filter }),
            } satisfies InspectionListenerEntry;

            listeners.add(entry);

            const subscription = (() => {
              if (subscription.closed) {
                return;
              }

              subscription.closed = true;
              listeners.delete(entry);
            }) as MutableFlowInspectionSubscription;
            subscription.unsubscribe = subscription;
            subscription.closed = false;

            return subscription satisfies FlowInspectionSubscription;
          }),
      );

      const clear = Ref.update(state, (current) => ({
        ...current,
        entries: Object.freeze([]),
      }));

      return InspectionLog.of({
        entries,
        append,
        clear,
        subscribe,
      });
    }),
  );
}
