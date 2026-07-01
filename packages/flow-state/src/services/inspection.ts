import { Clock, Context, Effect, Layer, Ref } from "effect";

import {
  exportInspectionEvents,
  matchesInspectionFilter,
  type FlowInspectionEventInput,
} from "../inspection-events.js";
import { normalizeInspectionObserver } from "../inspection-observer.js";
import {
  createInspectionSnapshot,
  normalizeInspectionRetentionPolicy,
  pruneInspectionEntries,
  type NormalizedFlowInspectionRetention,
} from "../inspection-retention.js";
import { createInspectionSubscription } from "../inspection-subscription.js";
import type {
  FlowInspectionEvent,
  FlowInspectionExportOptions,
  FlowInspectionFilter,
  FlowInspectionListener,
  FlowInspectionObserver,
  FlowInspectionRetentionPolicy,
  FlowInspectionSnapshot,
  FlowInspectionSubscription,
} from "../public/data-types.js";

type InspectionLogState = Readonly<{
  readonly nextSequence: number;
  readonly entries: ReadonlyArray<FlowInspectionEvent>;
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
>()("@flow-state/core/InspectionLog") {
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

          return [
            normalized,
            {
              nextSequence: current.nextSequence + 1,
              entries: pruneInspectionEntries(
                Object.freeze([...current.entries, normalized]),
                timestamp,
                current.retention,
              ),
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
                listener.error(error);
                continue;
              }
              throw error;
            }
          }
        });
      });

      const retainedEntries = Effect.fn("InspectionLog.retainedEntries")(
        (filter?: FlowInspectionFilter) =>
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            return yield* Ref.modify(state, (current) => {
              const entries = pruneInspectionEntries(current.entries, now, current.retention);
              return [
                filter === undefined
                  ? entries
                  : Object.freeze(
                      entries.filter((event) => matchesInspectionFilter(event, filter)),
                    ),
                entries === current.entries
                  ? current
                  : {
                      ...current,
                      entries,
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
            const entries = pruneInspectionEntries(current.entries, now, current.retention);
            return [
              createInspectionSnapshot(entries, now, filter),
              entries === current.entries
                ? current
                : {
                    ...current,
                    entries,
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
            yield* Ref.update(state, (current) => ({
              ...current,
              entries: pruneInspectionEntries(current.entries, now, retention),
              retention,
            }));
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
        ...current,
        entries: Object.freeze([]),
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
