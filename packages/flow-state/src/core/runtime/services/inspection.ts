import { Clock, Context, Effect, Layer, Ref } from "effect";

import {
  exportInspectionEvents,
  matchesInspectionFilter,
  type FlowInspectionEventInput,
} from "../../inspection/inspection-events.js";
import {
  createInspectionSnapshot,
  normalizeInspectionRetentionPolicy,
  pruneInspectionEntries,
  type NormalizedFlowInspectionRetention,
} from "../../inspection/inspection-retention.js";
import { normalizeInspectionObserver } from "../../inspection/inspection-observer.js";
import { createInspectionSubscription } from "../../inspection/inspection-subscription.js";
import type {
  FlowInspectionEvent,
  FlowInspectionExportOptions,
  FlowInspectionFilter,
  FlowInspectionListener,
  FlowInspectionObserver,
  FlowInspectionRetentionPolicy,
  FlowInspectionSnapshot,
  FlowInspectionSubscription,
} from "../../api/data-types.js";

type InspectionLogState = Readonly<{
  readonly nextSequence: number;
  readonly entries: ReadonlyArray<FlowInspectionEvent>;
  readonly truncatedBeforeSequence?: number;
  readonly retention: NormalizedFlowInspectionRetention;
}>;

type InspectionListenerEntry = Readonly<{
  readonly filter?: FlowInspectionFilter;
  readonly next: FlowInspectionListener;
  readonly error?: (error: unknown) => void;
  readonly complete?: () => void;
}>;

export class InspectionLog extends Context.Service<
  InspectionLog,
  {
    readonly entries: (
      filter?: FlowInspectionFilter,
    ) => Effect.Effect<ReadonlyArray<FlowInspectionEvent>>;
    readonly snapshot: (filter?: FlowInspectionFilter) => Effect.Effect<FlowInspectionSnapshot>;
    readonly export: <Redacted = FlowInspectionEvent, Serialized = Redacted>(
      options?: FlowInspectionExportOptions<Redacted, Serialized>,
    ) => Effect.Effect<ReadonlyArray<Serialized>>;
    readonly retention: Effect.Effect<FlowInspectionRetentionPolicy>;
    readonly setRetention: (policy?: FlowInspectionRetentionPolicy) => Effect.Effect<void>;
    readonly append: (event: FlowInspectionEventInput) => Effect.Effect<void>;
    readonly clear: Effect.Effect<void>;
    readonly subscribe: (
      listenerOrObserver: FlowInspectionListener | FlowInspectionObserver,
      filter?: FlowInspectionFilter,
    ) => Effect.Effect<FlowInspectionSubscription>;
  }
>()("flow-state/InspectionLog") {
  static readonly layer = Layer.effect(
    InspectionLog,
    Effect.gen(function* () {
      const state = yield* Ref.make<InspectionLogState>({
        nextSequence: 1,
        entries: Object.freeze([]),
        retention: normalizeInspectionRetentionPolicy(),
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
          const retained = pruneInspectionEntries(
            Object.freeze([...current.entries, normalized]),
            timestamp,
            current.retention,
            current.truncatedBeforeSequence,
          );

          return [
            normalized,
            {
              nextSequence: current.nextSequence + 1,
              entries: retained.entries,
              ...(retained.truncatedBeforeSequence === undefined
                ? {}
                : { truncatedBeforeSequence: retained.truncatedBeforeSequence }),
              retention: current.retention,
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
                try {
                  listener.error(error);
                } catch {
                  // Inspection observers cannot veto committed publication.
                  continue;
                }
                continue;
              }
              // Inspection observers cannot veto committed publication.
              continue;
            }
          }
        });
      });

      const retainedEntries = Effect.fn("InspectionLog.retainedEntries")(
        (filter?: FlowInspectionFilter) =>
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            return yield* Ref.modify(state, (current) => {
              const retained = pruneInspectionEntries(
                current.entries,
                now,
                current.retention,
                current.truncatedBeforeSequence,
              );
              return [
                filter === undefined
                  ? retained.entries
                  : Object.freeze(
                      retained.entries.filter((event) => matchesInspectionFilter(event, filter)),
                    ),
                retained.entries === current.entries &&
                retained.truncatedBeforeSequence === current.truncatedBeforeSequence
                  ? current
                  : {
                      ...current,
                      entries: retained.entries,
                      ...(retained.truncatedBeforeSequence === undefined
                        ? {}
                        : { truncatedBeforeSequence: retained.truncatedBeforeSequence }),
                    },
              ] as const;
            });
          }),
      );

      const entries = Effect.fn("InspectionLog.entries")((filter?: FlowInspectionFilter) =>
        retainedEntries(filter),
      );

      const snapshot = Effect.fn("InspectionLog.snapshot")((filter?: FlowInspectionFilter) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          return yield* Ref.modify(state, (current) => {
            const retained = pruneInspectionEntries(
              current.entries,
              now,
              current.retention,
              current.truncatedBeforeSequence,
            );
            return [
              createInspectionSnapshot(
                retained.entries,
                now,
                retained.truncatedBeforeSequence,
                filter,
              ),
              retained.entries === current.entries &&
              retained.truncatedBeforeSequence === current.truncatedBeforeSequence
                ? current
                : {
                    ...current,
                    entries: retained.entries,
                    ...(retained.truncatedBeforeSequence === undefined
                      ? {}
                      : { truncatedBeforeSequence: retained.truncatedBeforeSequence }),
                  },
            ] as const;
          });
        }),
      );

      const exportEntries = Effect.fn("InspectionLog.export")(
        <Redacted = FlowInspectionEvent, Serialized = Redacted>(
          options?: FlowInspectionExportOptions<Redacted, Serialized>,
        ) =>
          Effect.map(retainedEntries(options?.filter), (selected) =>
            exportInspectionEvents(selected, options),
          ),
      );

      const retention = Effect.map(Ref.get(state), (current) => current.retention.policy);

      const setRetention = Effect.fn("InspectionLog.setRetention")(
        (policy?: FlowInspectionRetentionPolicy) =>
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            const retention = normalizeInspectionRetentionPolicy(policy);
            yield* Ref.update(state, (current) => {
              const retained = pruneInspectionEntries(
                current.entries,
                now,
                retention,
                current.truncatedBeforeSequence,
              );
              return {
                ...current,
                entries: retained.entries,
                ...(retained.truncatedBeforeSequence === undefined
                  ? {}
                  : { truncatedBeforeSequence: retained.truncatedBeforeSequence }),
                retention,
              };
            });
          }),
      );

      const subscribe = Effect.fn("InspectionLog.subscribe")(
        (
          listenerOrObserver: FlowInspectionListener | FlowInspectionObserver,
          filter?: FlowInspectionFilter,
        ) =>
          Effect.sync(() => {
            const observer = normalizeInspectionObserver(listenerOrObserver);
            const entry = {
              ...observer,
              ...(filter === undefined ? {} : { filter }),
            } satisfies InspectionListenerEntry;

            listeners.add(entry);

            return createInspectionSubscription(() => {
              listeners.delete(entry);
            });
          }),
      );

      const clear = Ref.update(state, (current) => ({
        nextSequence: current.nextSequence,
        entries: Object.freeze([]),
        retention: current.retention,
      }));

      return InspectionLog.of({
        entries,
        snapshot,
        export: exportEntries,
        retention,
        setRetention,
        append,
        clear,
        subscribe,
      });
    }),
  );
}
