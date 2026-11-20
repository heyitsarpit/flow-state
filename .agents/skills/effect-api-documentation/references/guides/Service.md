# Service composition

Effect service composition has three ownership steps: define a typed
`Context.Service`, build implementations with `Layer`, and give one owner a
`ManagedRuntime` that runs and disposes the graph. The examples target the
Flow State package's `effect@4.0.0-rc.112` dependency.

## Recipe index

1. [Define required service keys](#define-required-service-keys)
2. [Consume required and optional services](#consume-required-and-optional-services)
3. [Build a dependency graph with Layers](#build-a-dependency-graph-with-layers)
4. [Give the graph one runtime owner](#give-the-graph-one-runtime-owner)
5. [Override services per request or test](#override-services-per-request-or-test)
6. [Use application ownership as a service](#use-application-ownership-as-a-service)
7. [Keep v4 and Effect 3 names separate](#keep-v4-and-effect-3-names-separate)

### [Define required service keys](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:200)

`Context.Service` has two confirmed construction forms. The function form
creates a key directly; the two-stage form creates a class-style key whose
class value is also the key. `Service.of` normalizes an implementation,
`Service.context` creates a one-service context, and both helpers preserve the
declared shape.

```ts
import { Context, Effect, Layer } from "effect"

const Logger = Context.Service<{
  readonly log: (message: string) => Effect.Effect<void>
}>("Logger")

class Database extends Context.Service<Database, {
  readonly query: (sql: string) => Effect.Effect<ReadonlyArray<string>>
}>()("Database") {}

const logger = Logger.of({ log: (message) => Effect.log(message) })
const database = Database.of({
  query: (sql) => Effect.succeed([`rows for ${sql}`]),
})
const loggerContext = Logger.context(logger)
const databaseLayer = Layer.succeed(Database, database)
```

### [Consume required and optional services](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6030)

Yielding a service key or calling `Effect.service` adds that identifier to the
effect's `R` channel. `Service.use` is the effectful callback form and
`Service.useSync` is the synchronous callback form. `Effect.serviceOption`
intentionally turns a missing service into `Option.none()` instead of adding a
requirement. `provideService` supplies one value; `provideContext` supplies a
context containing several values.

```ts
const required = Database.use((db) => db.query("select id from users"))
const syncRequired = Database.useSync((db) => db.query)
const optionalLogger = Effect.serviceOption(Logger)

const oneRequest = required.pipe(
  Effect.provideService(Database, database),
)
const manyServices = required.pipe(
  Effect.provideContext(Context.merge(loggerContext, Database.context(database))),
)
```

### [Build a dependency graph with Layers](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:974)

`Layer.succeed` wraps an existing value. `Layer.effect` builds a service from
an Effect and can capture other services as dependencies. Use `Layer.provide`
to satisfy dependencies privately, `Layer.provideMerge` when the dependency
should remain available, and `Layer.mergeAll` to assemble independent layers.
Use `Layer.fresh` when a branch must rebuild a layer instead of sharing the
memoized instance.

```ts
class Config extends Context.Service<Config, { readonly prefix: string }>()("Config") {}
class Greeter extends Context.Service<Greeter, {
  readonly greet: (name: string) => Effect.Effect<string>
}>()("Greeter") {}
const Metrics = Context.Service<Metrics, { readonly count: (name: string) => void }>()("Metrics") {}

const ConfigLive = Layer.succeed(Config, { prefix: "hello" })
const MetricsLive = Layer.succeed(Metrics, { count: (name) => console.log(name) })
const GreeterLive = Layer.effect(Greeter, Effect.gen(function*() {
  const config = yield* Config
  return { greet: (name: string) => Effect.succeed(`${config.prefix} ${name}`) }
}))

const GreeterPrivate = GreeterLive.pipe(Layer.provide(ConfigLive))
const AppLive = GreeterLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLive, MetricsLive)))
const isolatedApp = Layer.fresh(AppLive)
const program = Greeter.pipe(Effect.flatMap((greeter) => greeter.greet("Ada")))
```

In rc.112, `Layer.scoped` is not a confirmed v4 export. For a resource-backed
service, put `Effect.acquireRelease` inside `Layer.effect`; the layer's scope
owns the finalizer.

```ts
const ConnectionLive = Layer.effect(
  Database,
  Effect.acquireRelease(
    Effect.sync(() => database),
    () => Effect.log("database closed"),
  ),
)
```

### [Give the graph one runtime owner](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:273)

`ManagedRuntime.make` builds a Layer lazily, caches its context, and owns the
scope of resources acquired by that Layer. Host code can call `runPromise`
repeatedly; the owner calls `dispose` exactly when the application or test
boundary ends. Do not create and dispose a runtime inside every service call.

```ts
import { ManagedRuntime } from "effect"

const runtime = ManagedRuntime.make(AppLive)

const greeting = await runtime.runPromise(program)
await runtime.dispose()
```

When a whole application is already expressed as an Effect, use
`runtime.disposeEffect` in that Effect's shutdown path. `ManagedRuntime`
ownership is separate from request-scoped overrides: the runtime owns the
long-lived graph, while a single effect can temporarily replace one service.

### [Override services per request or test](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6221)

Keep live implementations in Layers and replace only the boundary value for a
request or test. A test Layer can replace the entire graph; `provideService`
is narrower and applies only to the effect it wraps.

```ts
const RequestId = Context.Service<string>("RequestId")
const request = Effect.gen(function*() {
  const id = yield* RequestId
  return `handling ${id}`
}).pipe(Effect.provideService(RequestId, "req-123"))

const DatabaseTest = Layer.succeed(Database, {
  query: (sql) => Effect.succeed([`fixture for ${sql}`]),
})
const testProgram = Database.use((db) => db.query("select id from users")).pipe(
  Effect.provide(DatabaseTest),
)
```

For isolated tests that need resource cleanup, make one test runtime from the
test Layer and dispose it in the test teardown. `Layer.fresh` is for an
independent Layer instance, not a substitute for disposing the runtime that
owns it.

### [Use application ownership as a service](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/app-ownership.ts:217)

Flow State's `FlowAppOwnership` is a real application-owned service. Its live
constructor uses `FlowAppOwnership.of(...)` to create the typed implementation
and `Layer.succeed` to publish it. This keeps ownership queries in the
environment instead of passing the app registry through every function.

```ts
const ownership = FlowAppOwnership.of({
  appId: app.id,
  ownershipStatusFor: (machine) => owners.get(machine) ?? { kind: "unregistered" },
  ownsResourceDefinition: (definition) => resources.has(definition),
  ownsResourceRef: (ref) => {
    const definition = resourceDefinitionForRef(ref)
    return definition !== undefined && resources.has(definition)
  },
})
const ownershipLayer = Layer.succeed(FlowAppOwnership, ownership)
```

### [Keep v4 and Effect 3 names separate](/Users/arpit/Developer/flow-state/codebases/accountability/repos/effect/packages/effect/src/Layer.ts:727)

Accountability's vendored Effect 3 package exposes `Context.Tag` and
`Context.GenericTag`, and its Layer module exposes `Layer.scoped`. Flow State
pins Effect v4 rc.112 and uses `Context.Service`; those are different API
surfaces. Treat an Accountability example as Effect 3 evidence, not as a v4
export, until the consuming declarations confirm the name.
