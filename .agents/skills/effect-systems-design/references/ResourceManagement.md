# Resource management

Use this guide when a service owns a connection, worker, subscription, cache, or other resource.
The ownership path is **Layer → Scope/Resource → ManagedRuntime → host shutdown**.

Exact member behavior belongs to the [Effect](../../effect-api-documentation/references/Effect.md),
[Layer](../../effect-api-documentation/references/Layer.md), [Resource](../../effect-api-documentation/references/Resource.md),
[Scope](../../effect-api-documentation/references/Scope.md), and
[ManagedRuntime](../../effect-api-documentation/references/ManagedRuntime.md) references.

## Layer → Scope

### IF constructing a service acquires an external resource

- **THEN:** Put `Effect.acquireRelease` inside `Layer.effect`; the Layer builds the service in its
  Scope and registers the finalizer with that Scope.
- **BECAUSE:** The service and its cleanup have one owner, so success, failure, and interruption do
  not leave a detached connection or worker.
- **CHECK:** Verify release after normal use, typed failure, interruption, and failed acquisition.

```ts
import { Context, Effect, Layer } from "effect";

class Database extends Context.Service<
  Database,
  { readonly query: (sql: string) => Effect.Effect<ReadonlyArray<unknown>> }
>()("app/Database") {}

const DatabaseLive = Layer.effect(
  Database,
  Effect.acquireRelease(
    connectDatabase,
    (database) => disconnectDatabase(database),
  ).pipe(
    Effect.map((database) => ({ query: (sql: string) => database.query(sql) })),
  ),
);
```

`Layer.effect` is the v4 construction boundary for scoped acquisition; do not invent another
constructor or an unowned global connection. Use `Layer.buildWithScope` when a caller must supply
the exact Scope that controls the Layer.

### IF the service needs a refreshable scoped value

- **THEN:** Create a `Resource` inside the Layer construction effect and expose Effects such as
  `Resource.get` rather than exposing the mutable Resource object.
- **BECAUSE:** Acquisition, refresh, and release stay in the Layer's Scope while callers see a
  stable service method.
- **CHECK:** A failed refresh must preserve the last good value when that is the Resource policy;
  close the Scope before asserting the resource is no longer usable.

```ts
import { Context, Effect, Layer, Resource } from "effect";

class CurrentConfig extends Context.Service<
  CurrentConfig,
  { readonly get: Effect.Effect<Config, ConfigError> }
>()("app/CurrentConfig") {}

const CurrentConfigLive = Layer.effect(
  CurrentConfig,
  Effect.gen(function* () {
    const current = yield* Resource.manual(loadConfig);
    return { get: Resource.get(current) };
  }),
);
```

## Scope → ManagedRuntime

### IF a host runs a resource-backed application Layer repeatedly

- **THEN:** Build one `ManagedRuntime` from the complete Layer and call `dispose` from the host's
  shutdown hook.
- **BECAUSE:** `ManagedRuntime` caches the Layer context and owns the runtime Scope until disposal.
- **CHECK:** The host must not dispose while requests or owned fibers are still expected to run, and
  it must not reuse the runtime after disposal.

```ts
const runtime = ManagedRuntime.make(CurrentConfigLive);
const readConfig = runtime.runPromise(CurrentConfig.pipe(Effect.flatMap((config) => config.get)));
const shutdown = () => runtime.dispose();
```

For one bounded operation instead of a host-owned runtime, use `Effect.scoped` around the Layer
build or resource use and let that operation's Scope close at the boundary.

## Finalizer proof

### IF cleanup is part of the contract

- **THEN:** Use a deterministic acquisition counter or release probe, run the service through the
  owner, dispose the owner, and assert the probe after disposal.
- **BECAUSE:** Construction alone does not prove cleanup; the assertion ties release to the declared
  owner.
- **CHECK:** Assert exactly one release for one shared runtime, and assert no release before
  acquisition succeeds.

```ts
let released = 0;
const ProbeLive = Layer.effect(
  Probe,
  Effect.acquireRelease(
    Effect.succeed({ ping: Effect.void }),
    () => Effect.sync(() => { released += 1; }),
  ),
);

const runtime = ManagedRuntime.make(ProbeLive);
await runtime.runPromise(Probe.pipe(Effect.asVoid));
await runtime.dispose();
assert.equal(released, 1);
```

In tests, use an `it.effect` body, deterministic gates, and explicit runtime disposal; do not use a
sleep to guess when a finalizer has run.
