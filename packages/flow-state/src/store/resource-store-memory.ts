import { Cause, Context, Deferred, Effect, Option } from "effect";

import { missingResourceRuntimeDetailsDiagnostic } from "../diagnostics.js";
import type {
  FlowInvalidationTarget,
  FlowResourceFreshness,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowSeededResource,
  FlowTag,
} from "../public/types.js";
import type { NotificationSchedulerService } from "../services/notification-scheduler.js";
import { hydrateResourceRecord } from "./hydration.js";
import { matchesInvalidationTarget, resourceKeyOf } from "./invalidation.js";
import {
  createEmptyResourceRecord,
  currentTimeMillis,
  staleAfterMillis,
  toPublicResourceSnapshot,
  type InternalResourceRecord,
  type ResourceHydrationEntry,
} from "./resource-snapshot.js";
import { createSelectionSource } from "./selection-source.js";
import { selectSource } from "./selected-source.js";

type ResourceState = Readonly<{
  readonly records: ReadonlyMap<string, InternalResourceRecord>;
}>;

type SelectedResourceRecord = ReturnType<
  typeof selectSource<ResourceState, InternalResourceRecord | undefined>
>;

type RuntimeResourceDetails<Value> = Readonly<{
  readonly lookup: unknown;
  readonly tags: ReadonlyArray<FlowTag>;
  readonly placeholder?: Value | Option.Option<Value> | null | undefined;
  readonly freshness?: FlowResourceFreshness;
}>;

type RuntimeResourceRef<Value> = FlowResourceRef<string, ReadonlyArray<unknown>, Value> &
  Readonly<{
    readonly __runtime?: RuntimeResourceDetails<Value>;
  }>;

type PostFetchInvalidation = InternalResourceRecord["postFetchInvalidation"];

type InFlightLookup = Readonly<{
  // This registry intentionally erases per-ref generics; lookup helpers restore them.
  readonly deferred: Deferred.Deferred<any, any>;
}>;

function nextRequestId(record: InternalResourceRecord): string {
  return `${record.ref.id}:${record.latestRequest + 1}`;
}

function getRecord<Value, Error>(
  state: ResourceState,
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
): InternalResourceRecord<Value, Error> {
  return (state.records.get(resourceKeyOf(ref)) ??
    createEmptyResourceRecord(ref)) as InternalResourceRecord<Value, Error>;
}

function runtimeDetails<Value>(
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
): RuntimeResourceDetails<Value> | undefined {
  return (ref as RuntimeResourceRef<Value>).__runtime;
}

function expirationAt(ref: FlowResourceRef, updatedAt: number): Option.Option<number> {
  const staleAfter = staleAfterMillis(runtimeDetails(ref)?.freshness);
  return Option.isSome(staleAfter) ? Option.some(updatedAt + staleAfter.value) : Option.none();
}

function mergePostFetchInvalidation(
  current: PostFetchInvalidation,
  next: PostFetchInvalidation,
): PostFetchInvalidation {
  if (current === "refresh" || next === "refresh") {
    return "refresh";
  }

  if (current === "invalidate" || next === "invalidate") {
    return "invalidate";
  }

  return "none";
}

function updateRecord(
  state: ResourceState,
  ref: FlowResourceRef,
  updater: (current: InternalResourceRecord) => InternalResourceRecord,
): ResourceState {
  const key = resourceKeyOf(ref);
  const current = state.records.get(key) ?? createEmptyResourceRecord(ref);
  const next = updater(current);

  if (next === current) {
    return state;
  }

  const records = new Map(state.records);
  records.set(key, next);
  return {
    records,
  };
}

export function makeResourceStore(
  notificationScheduler: NotificationSchedulerService,
  options?: Readonly<{
    readonly initialOnline?: boolean;
  }>,
) {
  const source = createSelectionSource<ResourceState>(
    {
      records: new Map(),
    },
    {
      schedule: notificationScheduler.schedule,
    },
  );
  const selections = new Map<string, SelectedResourceRecord>();
  const activeSubscriptions = new Map<string, number>();
  const inFlightLookups = new Map<string, InFlightLookup>();
  const pausedLookups = new Map<string, Deferred.Deferred<void>>();
  let online = options?.initialOnline ?? true;
  let lastKnownTime = 0;

  const readNow = (): Effect.Effect<number> =>
    Effect.flatMap(currentTimeMillis, (now) =>
      Effect.sync(() => {
        lastKnownTime = now;
        return now;
      }),
    );

  const sourceFor = (ref: FlowResourceRef): SelectedResourceRecord => {
    const key = resourceKeyOf(ref);
    const existing = selections.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const selected = selectSource(source, (state) => state.records.get(key));
    selections.set(key, selected);
    return selected;
  };

  const activeSubscriptionCount = (ref: FlowResourceRef): number =>
    activeSubscriptions.get(resourceKeyOf(ref)) ?? 0;

  const addActiveSubscription = (ref: FlowResourceRef): void => {
    const key = resourceKeyOf(ref);
    activeSubscriptions.set(key, activeSubscriptionCount(ref) + 1);
  };

  const removeActiveSubscription = (ref: FlowResourceRef): void => {
    const key = resourceKeyOf(ref);
    const remaining = activeSubscriptionCount(ref) - 1;
    if (remaining <= 0) {
      activeSubscriptions.delete(key);
      return;
    }

    activeSubscriptions.set(key, remaining);
  };

  const shouldRefreshOnInvalidate = (ref: FlowResourceRef): boolean =>
    runtimeDetails(ref)?.freshness?.onInvalidate === "active" && activeSubscriptionCount(ref) > 0;

  const shouldReuseInvalidatedValue = <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    snapshot: FlowResourceSnapshot<Value>,
  ): boolean =>
    runtimeDetails(ref)?.freshness?.onInvalidate === "never" &&
    snapshot.freshness === "invalidated" &&
    snapshot.value !== undefined &&
    !snapshot.isPlaceholderData;

  const getInFlightLookup = <Value, Error>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ): Deferred.Deferred<Value, Error> | undefined =>
    inFlightLookups.get(resourceKeyOf(ref))?.deferred as
      | Deferred.Deferred<Value, Error>
      | undefined;

  const awaitLookup = <Value, Error, Requirements>(
    deferred: Deferred.Deferred<Value, Error>,
  ): Effect.Effect<Value, Error, Requirements> =>
    Effect.flatMap(Effect.context<Requirements>(), () => Deferred.await(deferred));

  const setOnline = (nextOnline: boolean): void => {
    if (online === nextOnline) {
      return;
    }

    online = nextOnline;
    if (!nextOnline) {
      return;
    }

    const resumptions = Array.from(pausedLookups.values());
    pausedLookups.clear();
    for (const deferred of resumptions) {
      Effect.runSync(Deferred.succeed(deferred, void 0));
    }
  };

  const pauseLookupUntilOnline = <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    mode: "ensure" | "refresh",
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (online) {
        return;
      }

      const key = resourceKeyOf(ref);
      const deferred = yield* Deferred.make<void>();
      pausedLookups.set(key, deferred);

      source.update((state) =>
        updateRecord(state, ref, (current) => ({
          ...current,
          activity: "paused",
          freshness: mode === "refresh" ? "stale" : current.freshness,
          requestId: Option.none(),
          revision: current.revision + 1,
        })),
      );

      yield* Deferred.await(deferred).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (pausedLookups.get(key) === deferred) {
              pausedLookups.delete(key);
            }
          }),
        ),
      );
    });

  const get = <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ): Effect.Effect<FlowResourceSnapshot<Value>> =>
    Effect.gen(function* () {
      const now = yield* readNow();
      const record = getRecord<Value, unknown>(source.getSnapshot(), ref);
      return toPublicResourceSnapshot(now, record);
    });

  const seed = (resources: ReadonlyArray<FlowSeededResource>): Effect.Effect<void> =>
    Effect.gen(function* () {
      const now = yield* readNow();

      notificationScheduler.batch(() => {
        source.update((state) => {
          let nextState = state;
          for (const resource of resources) {
            nextState = updateRecord(nextState, resource.ref, (current) => ({
              ...current,
              value: Option.some(resource.value),
              previousValue: current.value,
              error: Option.none(),
              activity: "idle",
              freshness: "fresh",
              updatedAt: Option.some(now),
              invalidatedAt: Option.none(),
              expiresAt: expirationAt(resource.ref, now),
              requestId: Option.none(),
              revision: current.revision + 1,
            }));
          }

          return nextState;
        });
      });
    });

  const hydrate = (entries: ReadonlyArray<ResourceHydrationEntry>): Effect.Effect<void> =>
    Effect.gen(function* () {
      yield* readNow();

      notificationScheduler.batch(() => {
        source.update((state) => {
          let nextState = state;
          for (const entry of entries) {
            nextState = updateRecord(nextState, entry.ref, (current) =>
              hydrateResourceRecord(current, entry),
            );
          }
          return nextState;
        });
      });
    });

  const patch = <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    updater: (current: Value | undefined) => Value,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      const now = yield* readNow();

      source.update((state) =>
        updateRecord(state, ref, (current) => {
          const currentValue = Option.getOrUndefined(current.value) as Value | undefined;
          const nextValue = updater(currentValue);

          return {
            ...current,
            value: Option.some(nextValue),
            previousValue:
              currentValue === undefined ? current.previousValue : Option.some(currentValue),
            error: Option.none(),
            activity: "idle",
            freshness: "fresh",
            updatedAt: Option.some(now),
            invalidatedAt: Option.none(),
            expiresAt: expirationAt(ref, now),
            requestId: Option.none(),
            revision: current.revision + 1,
          };
        }),
      );
    });

  const subscribe = <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    listener: (snapshot: FlowResourceSnapshot<Value>) => void,
  ): Effect.Effect<() => void> =>
    Effect.gen(function* () {
      yield* readNow();

      const selection = sourceFor(ref);
      addActiveSubscription(ref);
      let active = true;
      const unsubscribe = selection.subscribe(() => {
        const record = (selection.getSnapshot() ??
          createEmptyResourceRecord(ref)) as InternalResourceRecord<Value, unknown>;
        listener(toPublicResourceSnapshot(lastKnownTime, record));
      });

      return () => {
        if (!active) {
          return;
        }

        active = false;
        unsubscribe();
        removeActiveSubscription(ref);
      };
    });

  const invalidate = (target: FlowInvalidationTarget): Effect.Effect<number, never, unknown> =>
    Effect.gen(function* () {
      const context = yield* Effect.context<unknown>();
      const now = yield* readNow();
      let changed = 0;
      const refsToRefresh: FlowResourceRef[] = [];

      notificationScheduler.batch(() => {
        source.update((state) => {
          let nextState = state;
          for (const record of state.records.values()) {
            if (!matchesInvalidationTarget(record, target) || record.freshness === "invalidated") {
              continue;
            }

            changed += 1;
            const postFetchInvalidation: PostFetchInvalidation =
              record.activity === "fetching"
                ? shouldRefreshOnInvalidate(record.ref)
                  ? "refresh"
                  : "invalidate"
                : "none";

            if (shouldRefreshOnInvalidate(record.ref) && record.activity !== "fetching") {
              refsToRefresh.push(record.ref);
            }
            nextState = updateRecord(nextState, record.ref, (current) => ({
              ...current,
              freshness: "invalidated",
              invalidatedAt: Option.some(now),
              postFetchInvalidation: mergePostFetchInvalidation(
                current.postFetchInvalidation,
                postFetchInvalidation,
              ),
              revision: current.revision + 1,
            }));
          }
          return nextState;
        });
      });

      for (const ref of refsToRefresh) {
        yield* refresh(ref).pipe(
          Effect.ignore,
          Effect.provideContext(context),
          Effect.forkDetach({ startImmediately: true }),
        );
      }

      return changed;
    });

  const runLookup = <Value, Error, Requirements>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    mode: "ensure" | "refresh",
  ): Effect.Effect<Value, Error, Requirements> =>
    Effect.gen(function* () {
      const runtime = runtimeDetails(ref);
      if (runtime === undefined) {
        return yield* Effect.die(missingResourceRuntimeDetailsDiagnostic(ref.id));
      }

      const existingLookup = getInFlightLookup<Value, Error>(ref);
      if (existingLookup !== undefined) {
        return yield* awaitLookup<Value, Error, Requirements>(existingLookup);
      }

      const context = yield* Effect.context<Requirements>();
      const deferred = yield* Deferred.make<Value, Error>();

      const performLookup = (
        nextMode: "ensure" | "refresh",
      ): Effect.Effect<Value, Error, Requirements> =>
        Effect.gen(function* () {
          yield* pauseLookupUntilOnline(ref, nextMode);
          yield* readNow();
          let requestId = "";
          let requestNumber = 0;

          source.update((state) =>
            updateRecord(state, ref, (current) => {
              requestNumber = current.latestRequest + 1;
              requestId = nextRequestId(current);

              return {
                ...current,
                activity: "fetching",
                freshness: nextMode === "refresh" ? "stale" : current.freshness,
                requestId: Option.some(requestId),
                latestRequest: requestNumber,
                postFetchInvalidation: "none",
                revision: current.revision + 1,
              };
            }),
          );

          const exit = yield* Effect.exit(
            (runtime.lookup as Effect.Effect<Value, Error, Requirements>).pipe(
              Effect.provideContext(context as Context.Context<Requirements>),
            ),
          );
          const finishTime = yield* readNow();
          const nextExpiresAt = expirationAt(ref, finishTime);
          const failReason =
            exit._tag === "Failure" ? exit.cause.reasons.find(Cause.isFailReason) : undefined;
          const settledRecord = getRecord<Value, Error>(source.getSnapshot(), ref);
          const postFetchInvalidation: PostFetchInvalidation =
            settledRecord.latestRequest === requestNumber
              ? settledRecord.postFetchInvalidation
              : "none";

          source.update((state) =>
            updateRecord(state, ref, (current) => {
              if (current.latestRequest !== requestNumber) {
                return current;
              }

              if (exit._tag === "Success") {
                return {
                  ...current,
                  value: Option.some(exit.value),
                  previousValue: current.value,
                  error: Option.none(),
                  activity: "idle",
                  freshness: postFetchInvalidation === "none" ? "fresh" : "invalidated",
                  updatedAt: Option.some(finishTime),
                  invalidatedAt:
                    postFetchInvalidation === "none" ? Option.none() : current.invalidatedAt,
                  expiresAt: nextExpiresAt,
                  requestId: Option.some(requestId),
                  postFetchInvalidation: "none",
                  revision: current.revision + 1,
                };
              }

              return {
                ...current,
                previousValue: Option.isSome(current.value) ? current.value : current.previousValue,
                error:
                  failReason === undefined ? current.error : Option.some(failReason.error as Error),
                activity: "idle",
                freshness: postFetchInvalidation === "none" ? "stale" : "invalidated",
                requestId: Option.some(requestId),
                invalidatedAt: current.invalidatedAt,
                postFetchInvalidation: "none",
                revision: current.revision + 1,
              };
            }),
          );

          if (postFetchInvalidation === "refresh") {
            return yield* performLookup("refresh");
          }

          if (exit._tag === "Success") {
            return exit.value;
          }

          return yield* Effect.failCause(exit.cause as Cause.Cause<Error>);
        });

      inFlightLookups.set(resourceKeyOf(ref), { deferred });

      yield* performLookup(mode).pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) => Deferred.failCause(deferred, cause),
          onSuccess: (value) => Deferred.succeed(deferred, value),
        }),
        Effect.ensuring(
          Effect.sync(() => {
            inFlightLookups.delete(resourceKeyOf(ref));
          }),
        ),
        Effect.forkChild({ startImmediately: true }),
      );

      return yield* awaitLookup<Value, Error, Requirements>(deferred);
    });

  const ensure = <Value, Error, Requirements>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ): Effect.Effect<Value, Error, Requirements> =>
    Effect.flatMap(get(ref), (snapshot) => {
      if (
        snapshot.freshness === "fresh" &&
        snapshot.value !== undefined &&
        !snapshot.isPlaceholderData
      ) {
        return Effect.succeed(snapshot.value as Value);
      }

      if (shouldReuseInvalidatedValue(ref, snapshot)) {
        return Effect.succeed(snapshot.value as Value);
      }

      return runLookup(ref, "ensure");
    });

  const refresh = <Value, Error, Requirements>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ): Effect.Effect<Value, Error, Requirements> => runLookup(ref, "refresh");

  const inspect = (): Effect.Effect<ReadonlyArray<FlowResourceSnapshot>> =>
    Effect.gen(function* () {
      const now = yield* readNow();
      return Array.from(source.getSnapshot().records.values()).map((record) =>
        toPublicResourceSnapshot(now, record),
      );
    });

  const dehydrate = (): Effect.Effect<ReadonlyArray<ResourceHydrationEntry>> =>
    Effect.gen(function* () {
      const now = yield* readNow();
      return Array.from(source.getSnapshot().records.values()).map(
        (record) =>
          Object.freeze({
            ref: record.ref,
            snapshot: toPublicResourceSnapshot(now, record),
          }) satisfies ResourceHydrationEntry,
      );
    });

  return {
    get,
    seed,
    hydrate,
    dehydrate,
    patch,
    subscribe,
    invalidate,
    ensure,
    refresh,
    inspect,
    setOnline,
  };
}
