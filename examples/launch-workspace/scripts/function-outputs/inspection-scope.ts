import { Effect } from "effect";

export type InspectionScopeDependencies<Runtime, SinkSubscription, RuntimeSubscription, Actor> =
  Readonly<{
    acquireRuntime: () => Runtime;
    releaseRuntime: (runtime: Runtime) => Promise<void> | void;
    acquireSinkSubscription: (runtime: Runtime) => SinkSubscription;
    releaseSinkSubscription: (subscription: SinkSubscription) => Promise<void> | void;
    acquireRuntimeSubscription: (runtime: Runtime) => RuntimeSubscription;
    releaseRuntimeSubscription: (subscription: RuntimeSubscription) => Promise<void> | void;
    acquireActor: (runtime: Runtime) => Actor;
    releaseActor: (actor: Actor) => Promise<void> | void;
  }>;

function releaseEffect(release: () => Promise<void> | void): Effect.Effect<void> {
  return Effect.promise(() => Promise.resolve().then(release));
}

export function runInspectionScope<Runtime, SinkSubscription, RuntimeSubscription, Actor, Value>(
  dependencies: InspectionScopeDependencies<Runtime, SinkSubscription, RuntimeSubscription, Actor>,
  use: (owners: Readonly<{ runtime: Runtime; actor: Actor }>) => Promise<Value>,
): Promise<Value> {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* Effect.acquireRelease(
          Effect.sync(dependencies.acquireRuntime),
          (owner) => releaseEffect(() => dependencies.releaseRuntime(owner)),
        );
        yield* Effect.acquireRelease(
          Effect.sync(() => dependencies.acquireSinkSubscription(runtime)),
          (subscription) => releaseEffect(() => dependencies.releaseSinkSubscription(subscription)),
        );
        yield* Effect.acquireRelease(
          Effect.sync(() => dependencies.acquireRuntimeSubscription(runtime)),
          (subscription) =>
            releaseEffect(() => dependencies.releaseRuntimeSubscription(subscription)),
        );
        const actor = yield* Effect.acquireRelease(
          Effect.sync(() => dependencies.acquireActor(runtime)),
          (owner) => releaseEffect(() => dependencies.releaseActor(owner)),
        );

        return yield* Effect.tryPromise({
          try: () => use({ runtime, actor }),
          catch: (cause) => cause,
        });
      }),
    ),
  );
}
