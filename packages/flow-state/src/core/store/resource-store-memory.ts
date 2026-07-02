import { Effect, Option } from "effect";

import type {
  FlowInvalidationTarget,
  FlowResourceFreshness,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowSeededResource,
  FlowTag,
} from "../api/types.js";
import type { NotificationSchedulerService } from "../runtime/services/notification-scheduler.js";
import { resourceKeyOf } from "./invalidation.js";
import {
  createEmptyResourceRecord,
  currentTimeMillis,
  staleAfterMillis,
  toPublicResourceSnapshot,
  type InternalResourceRecord,
  type ResourceHydrationEntry,
} from "./resource-snapshot.js";
import { createResourceStoreLookupController } from "./resource-store-lookups.js";
import {
  hydrateResourceState,
  invalidateResourceState,
  patchResourceState,
  seedResourceState,
  type ResourceState,
} from "./resource-store-state-updates.js";
import { createResourceStoreSubscriptionController } from "./resource-store-subscriptions.js";
import { createSelectionSource } from "./selection-source.js";

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
  let lastKnownTime = 0;

  const readNow = (): Effect.Effect<number> =>
    Effect.flatMap(currentTimeMillis, (now) =>
      Effect.sync(() => {
        lastKnownTime = now;
        return now;
      }),
    );

  const subscriptionController = createResourceStoreSubscriptionController({
    source,
    readNow,
    currentTime: () => lastKnownTime,
  });
  const { hasActiveSubscription, subscribe } = subscriptionController;

  const shouldRefreshOnInvalidate = (ref: FlowResourceRef): boolean =>
    runtimeDetails(ref)?.freshness?.onInvalidate === "active" && hasActiveSubscription(ref);

  const shouldReuseInvalidatedValue = <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    snapshot: FlowResourceSnapshot<Value>,
  ): boolean =>
    runtimeDetails(ref)?.freshness?.onInvalidate === "never" &&
    snapshot.freshness === "invalidated" &&
    snapshot.value !== undefined &&
    !snapshot.isPlaceholderData;

  const get = <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ): Effect.Effect<FlowResourceSnapshot<Value>> =>
    Effect.gen(function* () {
      const now = yield* readNow();
      const record = getRecord<Value, unknown>(source.getSnapshot(), ref);
      return toPublicResourceSnapshot(now, record);
    });

  const lookupController = createResourceStoreLookupController({
    source,
    ...(options?.initialOnline === undefined ? {} : { initialOnline: options.initialOnline }),
    readNow,
    get,
    runtimeDetails,
    expirationAt,
    getRecord,
    updateRecord,
    shouldReuseInvalidatedValue,
  });
  const { ensure, refresh, setOnline } = lookupController;

  const seed = (resources: ReadonlyArray<FlowSeededResource>): Effect.Effect<void> =>
    Effect.gen(function* () {
      const now = yield* readNow();

      notificationScheduler.batch(() => {
        source.update((state) =>
          seedResourceState(state, resources, now, updateRecord, expirationAt),
        );
      });
    });

  const hydrate = (entries: ReadonlyArray<ResourceHydrationEntry>): Effect.Effect<void> =>
    Effect.gen(function* () {
      yield* readNow();

      notificationScheduler.batch(() => {
        source.update((state) => hydrateResourceState(state, entries, updateRecord));
      });
    });

  const patch = <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    updater: (current: Value | undefined) => Value,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      const now = yield* readNow();

      source.update((state) =>
        patchResourceState(state, ref, updater, now, updateRecord, expirationAt),
      );
    });

  const invalidate = (target: FlowInvalidationTarget): Effect.Effect<number, never, unknown> =>
    Effect.gen(function* () {
      const context = yield* Effect.context<unknown>();
      const now = yield* readNow();
      let changed = 0;
      let refsToRefresh: ReadonlyArray<FlowResourceRef> = [];

      notificationScheduler.batch(() => {
        source.update((state) => {
          const result = invalidateResourceState(
            state,
            target,
            now,
            updateRecord,
            shouldRefreshOnInvalidate,
            mergePostFetchInvalidation,
          );
          changed = result.changed;
          refsToRefresh = result.refsToRefresh;
          return result.nextState;
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
