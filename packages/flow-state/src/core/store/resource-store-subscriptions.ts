import { Effect } from "effect";

import type { FlowResourceRef, FlowResourceSnapshot } from "../api/types.js";
import { resourceKeyOf } from "./invalidation.js";
import {
  createEmptyResourceRecord,
  toPublicResourceSnapshot,
  type InternalResourceRecord,
} from "./resource-snapshot.js";
import type { ResourceState } from "./resource-store-state-updates.js";
import { selectSource, type WritableSelectionSource } from "./selection-source.js";

type SelectedResourceRecord = ReturnType<
  typeof selectSource<ResourceState, InternalResourceRecord | undefined>
>;

type ResourceStoreSubscriptionDeps = Readonly<{
  readonly source: WritableSelectionSource<ResourceState>;
  readonly readNow: () => Effect.Effect<number>;
  readonly currentTime: () => number;
}>;

export type ResourceStoreSubscriptionController = Readonly<{
  readonly hasActiveSubscription: (ref: FlowResourceRef) => boolean;
  readonly subscribe: <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    listener: (snapshot: FlowResourceSnapshot<Value>) => void,
  ) => Effect.Effect<() => void>;
}>;

export function createResourceStoreSubscriptionController(
  deps: ResourceStoreSubscriptionDeps,
): ResourceStoreSubscriptionController {
  const selections = new Map<string, SelectedResourceRecord>();
  const activeSubscriptions = new Map<string, number>();

  const sourceFor = (ref: FlowResourceRef): SelectedResourceRecord => {
    const key = resourceKeyOf(ref);
    const existing = selections.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const selected = selectSource(deps.source, (state) => state.records.get(key));
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

  const hasActiveSubscription = (ref: FlowResourceRef): boolean => activeSubscriptionCount(ref) > 0;

  const subscribe = <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    listener: (snapshot: FlowResourceSnapshot<Value>) => void,
  ): Effect.Effect<() => void> =>
    Effect.gen(function* () {
      yield* deps.readNow();

      const selection = sourceFor(ref);
      addActiveSubscription(ref);
      let active = true;
      const unsubscribe = selection.subscribe(() => {
        const record = (selection.getSnapshot() ??
          createEmptyResourceRecord(ref)) as InternalResourceRecord<Value, unknown>;
        listener(toPublicResourceSnapshot(deps.currentTime(), record));
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

  return {
    hasActiveSubscription,
    subscribe,
  };
}
