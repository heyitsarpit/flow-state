import { Context, Effect, Layer } from "effect";

import type {
  FlowInvalidationTarget,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowSeededResource,
} from "../public/types.js";
import { NotificationScheduler } from "./notification-scheduler.js";
import { makeResourceStore } from "../store/resource-store-memory.js";
import type { ResourceHydrationEntry } from "../store/resource-snapshot.js";

export class ResourceStore extends Context.Service<
  ResourceStore,
  {
    readonly get: <Value>(
      ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    ) => Effect.Effect<FlowResourceSnapshot<Value>>;
    readonly seed: (resources: ReadonlyArray<FlowSeededResource>) => Effect.Effect<void>;
    readonly hydrate: (entries: ReadonlyArray<ResourceHydrationEntry>) => Effect.Effect<void>;
    readonly patch: <Value>(
      ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
      updater: (current: Value | undefined) => Value,
    ) => Effect.Effect<void>;
    readonly subscribe: <Value>(
      ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
      listener: (snapshot: FlowResourceSnapshot<Value>) => void,
    ) => Effect.Effect<() => void>;
    readonly invalidate: (target: FlowInvalidationTarget) => Effect.Effect<number>;
    readonly ensure: <Value, Error, Requirements>(
      ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    ) => Effect.Effect<Value, Error, Requirements>;
    readonly refresh: <Value, Error, Requirements>(
      ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    ) => Effect.Effect<Value, Error, Requirements>;
    readonly inspect: () => Effect.Effect<ReadonlyArray<FlowResourceSnapshot>>;
  }
>()("@flow-state/core/ResourceStore") {
  static readonly layer = Layer.effect(
    ResourceStore,
    Effect.gen(function* () {
      const notificationScheduler = yield* NotificationScheduler;
      return ResourceStore.of(makeResourceStore(notificationScheduler));
    }),
  );
}
