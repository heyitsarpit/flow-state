import { Option } from "effect";

import type { FlowInvalidationTarget, FlowResourceRef, FlowSeededResource } from "../api/types.js";
import { hydrateResourceRecord } from "./hydration.js";
import type { PrevalidatedResourceRestoreEntry } from "./hydration.js";
import type { InternalResourceRecord, ResourceHydrationEntry } from "./resource-snapshot.js";

export type ResourceState = Readonly<{
  readonly records: ReadonlyMap<string, InternalResourceRecord>;
}>;

type PostFetchInvalidation = InternalResourceRecord["postFetchInvalidation"];

type UpdateRecord = (
  state: ResourceState,
  ref: FlowResourceRef,
  updater: (current: InternalResourceRecord) => InternalResourceRecord,
) => ResourceState;

type ExpirationAt = (ref: FlowResourceRef, updatedAt: number) => Option.Option<number>;

type ShouldRefreshOnInvalidate = (ref: FlowResourceRef) => boolean;

type ResourceKeyOf = (ref: FlowResourceRef) => string;

type MatchesInvalidationTarget = (
  resource: InternalResourceRecord,
  target: FlowInvalidationTarget,
) => boolean;

type MergePostFetchInvalidation = (
  current: PostFetchInvalidation,
  next: PostFetchInvalidation,
) => PostFetchInvalidation;

export function seedResourceState(
  state: ResourceState,
  resources: ReadonlyArray<FlowSeededResource>,
  now: number,
  updateRecord: UpdateRecord,
  expirationAt: ExpirationAt,
): ResourceState {
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
}

export function hydrateResourceState(
  state: ResourceState,
  entries: ReadonlyArray<ResourceHydrationEntry>,
  updateRecord: UpdateRecord,
  preserveEqualTimestamp = false,
): ResourceState {
  let nextState = state;
  for (const entry of entries) {
    nextState = updateRecord(nextState, entry.ref, (current) =>
      hydrateResourceRecord(current, entry, preserveEqualTimestamp),
    );
  }

  return nextState;
}

export function restorePrevalidatedResourceState(
  state: ResourceState,
  entries: ReadonlyArray<PrevalidatedResourceRestoreEntry>,
  resourceKeyOf: ResourceKeyOf,
): ResourceState {
  const records = new Map(state.records);
  let changed = false;

  for (const entry of entries) {
    const key = resourceKeyOf(entry.target.ref);
    if (records.get(key) !== entry.record) {
      changed = true;
    }
    records.set(key, entry.record);
  }

  if (!changed) {
    return state;
  }

  return {
    records,
  };
}

export function patchResourceState<Value>(
  state: ResourceState,
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  updater: (current: Value | undefined) => Value,
  now: number,
  updateRecord: UpdateRecord,
  expirationAt: ExpirationAt,
): ResourceState {
  return updateRecord(state, ref, (current) => {
    const currentValue = Option.getOrUndefined(current.value) as Value | undefined;
    const nextValue = updater(currentValue);

    return {
      ...current,
      value: Option.some(nextValue),
      previousValue: currentValue === undefined ? current.previousValue : Option.some(currentValue),
      error: Option.none(),
      activity: "idle",
      freshness: "fresh",
      updatedAt: Option.some(now),
      invalidatedAt: Option.none(),
      expiresAt: expirationAt(ref, now),
      requestId: Option.none(),
      revision: current.revision + 1,
    };
  });
}

export function invalidateResourceState(
  state: ResourceState,
  target: FlowInvalidationTarget,
  now: number,
  updateRecord: UpdateRecord,
  matchesInvalidationTarget: MatchesInvalidationTarget,
  shouldRefreshOnInvalidate: ShouldRefreshOnInvalidate,
  mergePostFetchInvalidation: MergePostFetchInvalidation,
): Readonly<{
  readonly nextState: ResourceState;
  readonly changed: number;
  readonly refsToRefresh: ReadonlyArray<FlowResourceRef>;
}> {
  let nextState = state;
  let changed = 0;
  const refsToRefresh: Array<FlowResourceRef> = [];

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

  return {
    nextState,
    changed,
    refsToRefresh,
  };
}
