import { Context, Effect, Layer } from "effect";

import type {
  FlowInvalidationTarget,
  FlowResourceHydrationEntry,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowSeededResource,
} from "../../api/types.js";
import { makeResourceStore } from "../../store/resource-store-memory.js";
import { FlowRuntimePolicy } from "./runtime-policy.js";

export class ResourceStore extends Context.Service<
  ResourceStore,
  {
    readonly get: <Value>(
      ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    ) => Effect.Effect<FlowResourceSnapshot<Value>>;
    readonly seed: (resources: ReadonlyArray<FlowSeededResource>) => Effect.Effect<void>;
    readonly hydrate: (entries: ReadonlyArray<FlowResourceHydrationEntry>) => Effect.Effect<void>;
    readonly dehydrate: () => Effect.Effect<ReadonlyArray<FlowResourceHydrationEntry>>;
    readonly patch: <Value>(
      ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
      updater: (current: Value | undefined) => Value,
    ) => Effect.Effect<void>;
    readonly subscribe: <Value>(
      ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
      listener: (snapshot: FlowResourceSnapshot<Value>) => void,
    ) => Effect.Effect<() => void>;
    readonly invalidate: (target: FlowInvalidationTarget) => Effect.Effect<number, never, unknown>;
    readonly ensure: <Value, Error, Requirements>(
      ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    ) => Effect.Effect<Value, Error, Requirements>;
    readonly refresh: <Value, Error, Requirements>(
      ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    ) => Effect.Effect<Value, Error, Requirements>;
    readonly inspect: () => Effect.Effect<ReadonlyArray<FlowResourceSnapshot>>;
  }
>()("flow-state/ResourceStore") {
  static readonly layer = Layer.effect(
    ResourceStore,
    Effect.gen(function* () {
      const runtimePolicy = yield* FlowRuntimePolicy;
      const initialSignals = yield* runtimePolicy.hostSignals.snapshot;
      const store = makeResourceStore(runtimePolicy.notificationScheduler, {
        initialOnline: initialSignals.online,
      });
      const unsubscribe = yield* runtimePolicy.hostSignals.subscribe((snapshot) => {
        store.setOnline(snapshot.online);
      });

      yield* Effect.acquireRelease(Effect.succeed(unsubscribe), (release) =>
        Effect.sync(() => {
          release();
        }),
      );

      return ResourceStore.of(store);
    }),
  );
}
