import { Clock, Context, Effect, Layer, Ref } from "effect";

import {
  exportInspectionEvents,
  matchesInspectionFilter,
  type FlowInspectionEventInput,
} from "../inspection-events.js";
import type {
  FlowInspectionEvent,
  FlowInspectionExportOptions,
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
    readonly export: <Redacted = FlowInspectionEvent, Serialized = Redacted>(
      options?: FlowInspectionExportOptions<Redacted, Serialized>,
    ) => Effect.Effect<ReadonlyArray<Serialized>>;
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

      const exportEntries = Effect.fn("InspectionLog.export")(
        <Redacted = FlowInspectionEvent, Serialized = Redacted>(
          options?: FlowInspectionExportOptions<Redacted, Serialized>,
        ) =>
          Effect.map(entries(options?.filter), (selected) =>
            exportInspectionEvents(selected, options),
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
        export: exportEntries,
        append,
        clear,
        subscribe,
      });
    }),
  );
}
