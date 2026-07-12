import { Effect, Option, Scope } from "effect";

import type {
  FlowInvalidationTarget,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowSeededResource,
} from "../api/types.js";
import { assertDurableFlowKey, createFlowKeyIdentityScope } from "../api/canonical-key.js";
import {
  hasResourceRuntimeDefinition,
  resourceMetadataForRef,
  resourceSchemaForRef,
  type FlowResourceRuntimeMetadata,
} from "../api/resource-runtime.js";
import {
  invalidPrevalidatedResourceRestoreDiagnostic,
  missingResourceRuntimeDetailsDiagnostic,
} from "../../shared/diagnostics.js";
import type { NotificationSchedulerService } from "../runtime/services/notification-scheduler.js";
import type { PrevalidatedResourceRestoreEntry } from "./hydration.js";
import { createResourceInvalidation, type ResourceInvalidation } from "./invalidation.js";
import {
  createEmptyResourceRecord,
  currentTimeMillis,
  hasResourceSnapshotValue,
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
  restorePrevalidatedResourceState,
  seedResourceState,
  type ResourceState,
} from "./resource-store-state-updates.js";
import { createResourceStoreSubscriptionController } from "./resource-store-subscriptions.js";
import { createSelectionSource } from "./selection-source.js";

type PostFetchInvalidation = InternalResourceRecord["postFetchInvalidation"];

function getRecord<Value, Error>(
  resourceKeyOf: ResourceInvalidation["resourceKeyOf"],
  state: ResourceState,
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
): InternalResourceRecord<Value, Error> {
  return (state.records.get(resourceKeyOf(ref)) ??
    createEmptyResourceRecord(ref)) as InternalResourceRecord<Value, Error>;
}

function runtimeDetails<Value>(
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
): FlowResourceRuntimeMetadata<Value> | undefined {
  return resourceMetadataForRef(ref);
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

function validatePrevalidatedResourceRestoreEntry(
  entry: PrevalidatedResourceRestoreEntry,
): ReturnType<typeof invalidPrevalidatedResourceRestoreDiagnostic> | undefined {
  const ref = entry.target.ref;
  if (entry.record.ref !== ref) {
    return invalidPrevalidatedResourceRestoreDiagnostic({
      refId: ref.id,
      reason: "record-target-ref-mismatch",
    });
  }

  if (!Object.isFrozen(entry.record)) {
    return invalidPrevalidatedResourceRestoreDiagnostic({
      refId: ref.id,
      reason: "record-not-frozen",
    });
  }

  if (!Object.isFrozen(entry.record.tags)) {
    return invalidPrevalidatedResourceRestoreDiagnostic({
      refId: ref.id,
      reason: "record-tags-not-frozen",
    });
  }

  if (!hasResourceRuntimeDefinition(ref)) {
    return invalidPrevalidatedResourceRestoreDiagnostic({
      refId: ref.id,
      reason: "missing-runtime-definition",
    });
  }

  if (resourceSchemaForRef(ref) !== entry.target.schema) {
    return invalidPrevalidatedResourceRestoreDiagnostic({
      refId: ref.id,
      reason: "schema-mismatch",
    });
  }

  return undefined;
}

function validatePrevalidatedResourceRestore(
  entries: ReadonlyArray<PrevalidatedResourceRestoreEntry>,
  resourceKeyOf: ResourceInvalidation["resourceKeyOf"],
): ReturnType<typeof invalidPrevalidatedResourceRestoreDiagnostic> | undefined {
  const seenKeys = new Set<string>();
  for (const entry of entries) {
    const diagnostic = validatePrevalidatedResourceRestoreEntry(entry);
    if (diagnostic !== undefined) {
      return diagnostic;
    }

    const key = resourceKeyOf(entry.target.ref);
    if (seenKeys.has(key)) {
      return invalidPrevalidatedResourceRestoreDiagnostic({
        refId: entry.target.ref.id,
        reason: "duplicate-resource-key",
      });
    }
    seenKeys.add(key);
  }

  return undefined;
}

function validateResourceRuntimeDefinition(
  ref: FlowResourceRef,
): ReturnType<typeof missingResourceRuntimeDetailsDiagnostic> | undefined {
  return hasResourceRuntimeDefinition(ref)
    ? undefined
    : missingResourceRuntimeDetailsDiagnostic(ref.id);
}

function validateResourceRuntimeDefinitions(
  refs: Iterable<FlowResourceRef>,
): ReturnType<typeof missingResourceRuntimeDetailsDiagnostic> | undefined {
  for (const ref of refs) {
    const diagnostic = validateResourceRuntimeDefinition(ref);
    if (diagnostic !== undefined) {
      return diagnostic;
    }
  }

  return undefined;
}

function updateRecord(
  resourceKeyOf: ResourceInvalidation["resourceKeyOf"],
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
  options: Readonly<{
    readonly backgroundScope: Scope.Scope;
    readonly initialOnline?: boolean;
  }>,
) {
  const identityScope = createFlowKeyIdentityScope();
  const resourceInvalidation = createResourceInvalidation(identityScope);
  const { matchesInvalidationTarget, resourceKeyOf } = resourceInvalidation;
  const getStoreRecord = <Value, Error>(
    state: ResourceState,
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ): InternalResourceRecord<Value, Error> => getRecord(resourceKeyOf, state, ref);
  const updateStoreRecord = (
    state: ResourceState,
    ref: FlowResourceRef,
    updater: (current: InternalResourceRecord) => InternalResourceRecord,
  ): ResourceState => updateRecord(resourceKeyOf, state, ref, updater);

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
    resourceKeyOf,
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
    hasResourceSnapshotValue(snapshot) &&
    !snapshot.isPlaceholderData;

  const get = <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ): Effect.Effect<FlowResourceSnapshot<Value> | null> =>
    Effect.gen(function* () {
      const now = yield* readNow();
      const record = source.getSnapshot().records.get(resourceKeyOf(ref)) as
        | InternalResourceRecord<Value, unknown>
        | undefined;
      if (record === undefined) {
        if (!hasResourceRuntimeDefinition(ref)) {
          return null;
        }

        return toPublicResourceSnapshot(now, createEmptyResourceRecord(ref));
      }

      return toPublicResourceSnapshot(now, record);
    });

  const lookupController = createResourceStoreLookupController({
    source,
    ...(options?.initialOnline === undefined ? {} : { initialOnline: options.initialOnline }),
    resourceKeyOf,
    readNow,
    get,
    expirationAt,
    getRecord: getStoreRecord,
    updateRecord: updateStoreRecord,
    shouldReuseInvalidatedValue,
  });
  const { ensure, refresh, setOnline } = lookupController;

  const seed = (
    resources: ReadonlyArray<FlowSeededResource>,
  ): Effect.Effect<void, ReturnType<typeof missingResourceRuntimeDetailsDiagnostic>> =>
    Effect.gen(function* () {
      const diagnostic = validateResourceRuntimeDefinitions(
        resources.map((resource) => resource.ref),
      );
      if (diagnostic !== undefined) {
        return yield* Effect.fail(diagnostic);
      }
      const now = yield* readNow();

      notificationScheduler.batch(() => {
        source.update((state) =>
          seedResourceState(state, resources, now, updateStoreRecord, expirationAt),
        );
      });
    });

  const hydrate = (
    entries: ReadonlyArray<ResourceHydrationEntry>,
  ): Effect.Effect<void, ReturnType<typeof missingResourceRuntimeDetailsDiagnostic>> =>
    Effect.gen(function* () {
      const diagnostic = validateResourceRuntimeDefinitions(entries.map((entry) => entry.ref));
      if (diagnostic !== undefined) {
        return yield* Effect.fail(diagnostic);
      }
      yield* readNow();

      notificationScheduler.batch(() => {
        source.update((state) => hydrateResourceState(state, entries, updateStoreRecord));
      });
    });

  const restorePrevalidated = (
    entries: ReadonlyArray<PrevalidatedResourceRestoreEntry>,
  ): Effect.Effect<void, ReturnType<typeof invalidPrevalidatedResourceRestoreDiagnostic>> =>
    Effect.gen(function* () {
      yield* readNow();

      const diagnostic = validatePrevalidatedResourceRestore(entries, resourceKeyOf);
      if (diagnostic !== undefined) {
        return yield* Effect.fail(diagnostic);
      }

      notificationScheduler.batch(() => {
        source.update((state) => restorePrevalidatedResourceState(state, entries, resourceKeyOf));
      });
    });

  const patch = <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    updater: (current: Value | undefined) => Value,
  ): Effect.Effect<void, ReturnType<typeof missingResourceRuntimeDetailsDiagnostic>> =>
    Effect.gen(function* () {
      const diagnostic = validateResourceRuntimeDefinition(ref);
      if (diagnostic !== undefined) {
        return yield* Effect.fail(diagnostic);
      }
      const now = yield* readNow();

      source.update((state) =>
        patchResourceState(state, ref, updater, now, updateStoreRecord, expirationAt),
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
            updateStoreRecord,
            matchesInvalidationTarget,
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
          Effect.forkIn(options.backgroundScope, { startImmediately: true }),
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
      return Array.from(source.getSnapshot().records.values()).map((record) => {
        assertDurableFlowKey(record.ref.key);
        return Object.freeze({
          ref: record.ref,
          snapshot: toPublicResourceSnapshot(now, record),
        }) satisfies ResourceHydrationEntry;
      });
    });

  return {
    get,
    seed,
    hydrate,
    restorePrevalidated,
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
