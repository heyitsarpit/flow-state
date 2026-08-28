# `Layer`

Source: [Effect v4 `Layer` API](https://www.effect.website/docs/v4/api/effect/Layer). Examples assume `import { Context, Effect, Layer } from "effect"`. Effect v4 rc.112 does not export `Layer.scoped`; resource-backed services use `Layer.effect` with a scoped acquisition effect.

## API index

### Type-level concepts

1. [Layer.Layer](#layerlayer)
2. [Layer.Any](#layerany)
3. [Layer.Services](#layerservices)
4. [Layer.Error](#layererror)
5. [Layer.Success](#layersuccess)
6. [Layer.MemoMap](#layermemomap)

### Memoization, building, and scope

7. [Layer.isLayer](#layerislayer)
8. [Layer.fromBuild](#layerfrombuild)
9. [Layer.fromBuildMemo](#layerfrombuildmemo)
10. [Layer.makeMemoMapUnsafe](#layermakememomapunsafe)
11. [Layer.forkMemoMapUnsafe](#layerforkmemomapunsafe)
12. [Layer.makeMemoMap](#layermakememomap)
13. [Layer.forkMemoMap](#layerforkmemomap)
14. [Layer.CurrentMemoMap](#layercurrentmemomap)
15. [Layer.buildWithMemoMap](#layerbuildwithmemomap)
16. [Layer.build](#layerbuild)
17. [Layer.buildWithScope](#layerbuildwithscope)

### Common constructors

18. [Layer.succeed](#layersucceed)
19. [Layer.succeedContext](#layersucceedcontext)
20. [Layer.empty](#layerempty)
21. [Layer.sync](#layersync)
22. [Layer.syncContext](#layersynccontext)
23. [Layer.effect](#layereffect)
24. [Layer.effectContext](#layereffectcontext)
25. [Layer.effectDiscard](#layereffectdiscard)
26. [Layer.suspend](#layersuspend)
27. [Layer.unwrap](#layerunwrap)

### Composition and provisioning

28. [Layer.mergeAll](#layermergeall)
29. [Layer.merge](#layermerge)
30. [Layer.provide](#layerprovide)
31. [Layer.provideMerge](#layerprovidemerge)
32. [Layer.flatMap](#layerflatmap)
33. [Layer.tap](#layertap)

### Diagnostics and failure handling

34. [Layer.tapError](#layertaperror)
35. [Layer.tapCause](#layertapcause)
36. [Layer.orDie](#layerordie)
37. [Layer.catch](#layercatch)
38. [Layer.catchTag](#layercatchtag)
39. [Layer.catchCause](#layercatchcause)
40. [Layer.updateService](#layerupdateservice)
41. [Layer.fresh](#layerfresh)
42. [Layer.launch](#layerlaunch)

### Testing and type constraints

43. [Layer.PartialEffectful](#layerpartialeffectful)
44. [Layer.mock](#layermock)
45. [Layer.satisfiesSuccessType](#layersatisfiessuccesstype)
46. [Layer.satisfiesErrorType](#layersatisfieserrortype)
47. [Layer.satisfiesServicesType](#layersatisfiesservicestype)

### Additional known APIs (not expanded)

`LayerUnify`, `LayerUnifyIgnore`, `Variance`, `SpanOptions`, `span`, `parentSpan`, `withSpan`, `withParentSpan`

## Type-level concepts

### [Layer.Layer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:54)

`Layer<ROut, E, RIn>` describes service construction: `ROut` is provided, `E` is the construction error, and `RIn` is required to build the layer. Acquired resources belong to its scope.

```ts
type Config = { readonly port: number }
type ConfigError = { readonly _tag: "ConfigError" }
type Environment = { readonly database: unknown }
declare const config: Layer.Layer<Config, ConfigError, Environment>
```

### [Layer.Any](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:127)

`Layer.Any` constrains a generic value to a layer without fixing its output, error, or requirements.

```ts
const layers: Array<Layer.Any> = [
  Layer.succeed(Context.Service<number>("Port"), 8080)
]
```

### [Layer.Services](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:148)

Extracts the `RIn` service requirements from a layer type.

```ts
declare const database: Layer.Layer<"Database", never, "Config">
type Requirements = Layer.Services<typeof database>
```

### [Layer.Error](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:165)

Extracts the `E` construction error type from a layer.

```ts
declare const config: Layer.Layer<"Config", "ConfigError", never>
type ConstructionError = Layer.Error<typeof config>
```

### [Layer.Success](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:180)

Extracts the `ROut` services provided by a layer.

```ts
declare const config: Layer.Layer<"Config", never, never>
type Provided = Layer.Success<typeof config>
```

### [Layer.MemoMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:219)

`Layer.MemoMap` tracks construction so the same layer value can share one acquired resource across dependent builds.

```ts
const memoMap: Layer.MemoMap = Layer.makeMemoMapUnsafe()
```

## Memoization, building, and scope

### [Layer.isLayer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:273)

Narrows an unknown value to a `Layer` by checking its runtime marker.

```ts
const value: unknown = Layer.empty
if (Layer.isLayer(value)) Layer.build(value)
```

### [Layer.fromBuild](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:327)

Constructs a layer from a builder receiving the current `MemoMap` and `Scope` and returning a context effect.

```ts
const Port = Context.Service<number>("Port")
const layer = Layer.fromBuild((_memoMap, _scope) =>
  Effect.succeed(Context.make(Port, 8080)))
```

### [Layer.fromBuildMemo](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:371)

Constructs a custom layer like `fromBuild` while memoizing its construction through the supplied `MemoMap`.

```ts
const Port = Context.Service<number>("Port")
const layer = Layer.fromBuildMemo((_memoMap, _scope) =>
  Effect.succeed(Context.make(Port, 8080)))
```

### [Layer.makeMemoMapUnsafe](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:478)

Creates a `MemoMap` synchronously for manual layer building.

```ts
const memoMap = Layer.makeMemoMapUnsafe()
```

### [Layer.forkMemoMapUnsafe](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:497)

Creates a child memo map that reuses parent entries while keeping new entries local.

```ts
const parent = Layer.makeMemoMapUnsafe()
const child = Layer.forkMemoMapUnsafe(parent)
```

### [Layer.makeMemoMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:528)

Creates a `MemoMap` as an Effect value.

```ts
const program = Effect.gen(function*() {
  return yield* Layer.makeMemoMap
})
```

### [Layer.forkMemoMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:547)

Creates a child memo map effectfully, inheriting parent entries without adding child entries to the parent.

```ts
const program = Effect.gen(function*() {
  const parent = yield* Layer.makeMemoMap
  return yield* Layer.forkMemoMap(parent)
})
```

### [Layer.CurrentMemoMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:567)

`CurrentMemoMap` is the context service for the current layer-build memo map. `forkOrCreate` forks the current map or creates a root one.

```ts
const memoMap = Layer.CurrentMemoMap.forkOrCreate(Context.empty())
```

### [Layer.buildWithMemoMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:622)

Builds a layer with an explicit memo map and scope, returning its service context as an Effect.

```ts
const Port = Context.Service<number>("Port")
const layer = Layer.succeed(Port, 8080)
const program = Effect.gen(function*() {
  const memoMap = yield* Layer.makeMemoMap
  const scope = yield* Effect.scope
  return yield* Layer.buildWithMemoMap(layer, memoMap, scope)
})
```

### [Layer.build](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:674)

Builds a layer into an Effect that yields its service context using the current scope and a forked memo map.

```ts
const Port = Context.Service<number>("Port")
const services = Layer.build(Layer.succeed(Port, 8080))
```

### [Layer.buildWithScope](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:732)

Builds a layer with a caller-supplied scope, so acquired resources are released when that scope closes.

```ts
const Port = Context.Service<number>("Port")
const program = Effect.gen(function*() {
  const scope = yield* Effect.scope
  return yield* Layer.buildWithScope(Layer.succeed(Port, 8080), scope)
})
```

## Common constructors

### [Layer.succeed](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:775)

Provides one service from an already-created value.

```ts
const Port = Context.Service<number>("Port")
const live = Layer.succeed(Port, 8080)
```

### [Layer.succeedContext](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:828)

Provides every service in an existing context at once.

```ts
const Port = Context.Service<number>("Port")
const Host = Context.Service<string>("Host")
const services = Context.make(Port, 8080).pipe(Context.add(Host, "localhost"))
const live = Layer.succeedContext(services)
```

### [Layer.empty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:856)

`Layer.empty` provides no services, cannot fail, and performs no construction or finalization work.

```ts
declare const enabled: boolean
const startup = enabled ? Layer.effectDiscard(Effect.log("start")) : Layer.empty
```

### [Layer.sync](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:890)

Lazily creates one service from a synchronous function when the layer is built.

```ts
const Port = Context.Service<number>("Port")
const live = Layer.sync(Port, () => 8080)
```

### [Layer.syncContext](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:935)

Lazily creates a complete context synchronously when the layer is built.

```ts
const Port = Context.Service<number>("Port")
const live = Layer.syncContext(() => Context.make(Port, 8080))
```

### [Layer.effect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:974)

Creates one service from an Effect, supporting dependencies and scoped acquisition.

```ts
const Port = Context.Service<number>("Port")
const live = Layer.effect(Port, Effect.sync(() => 8080))
```

`Layer.effect` runs its construction effect in the layer scope. In rc.112, use `Effect.acquireRelease` inside this constructor for a resource-backed service; `Layer.scoped` is an Effect 3 name and is intentionally not documented as a v4 export.

```ts
class Connection extends Context.Service<Connection, {
  readonly query: (sql: string) => Effect.Effect<string>
}>()("Connection") {}

const connectionLayer = Layer.effect(
  Connection,
  Effect.acquireRelease(
    Effect.sync(() => ({ query: (sql: string) => Effect.succeed(`rows:${sql}`) })),
    () => Effect.log("connection closed"),
  ),
)
```

### [Layer.effectContext](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1031)

Creates all services in a context from an Effect run inside the layer scope.

```ts
const Port = Context.Service<number>("Port")
const live = Layer.effectContext(Effect.succeed(Context.make(Port, 8080)))
```

### [Layer.effectDiscard](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1061)

Runs an Effect during construction, discards its success value, and provides no services.

```ts
const initialize = Layer.effectDiscard(
  Effect.sync(() => console.log("initialize")))
```

### [Layer.suspend](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1091)

Defers choosing a layer until its first build and then uses normal layer memoization.

```ts
const Port = Context.Service<number>("Port")
const useLocal = true
const live = Layer.suspend(() =>
  useLocal ? Layer.succeed(Port, 8080) : Layer.succeed(Port, 9090))
```

### [Layer.unwrap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1126)

Flattens an Effect that produces a Layer, combining the outer and inner failure and requirement types.

```ts
const Port = Context.Service<number>("Port")
const selected = Effect.succeed(Layer.succeed(Port, 8080))
const live = Layer.unwrap(selected)
```

## Composition and provisioning

### [Layer.mergeAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1194)

Builds all supplied layers concurrently and merges their contexts, errors, and requirements.

```ts
const Port = Context.Service<number>("Port")
const Host = Context.Service<string>("Host")
const live = Layer.mergeAll(
  Layer.succeed(Port, 8080), Layer.succeed(Host, "localhost"))
```

### [Layer.merge](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1245)

Merges one layer with another layer or an array while retaining all outputs.

```ts
const Port = Context.Service<number>("Port")
const Host = Context.Service<string>("Host")
const live = Layer.succeed(Port, 8080).pipe(
  Layer.merge(Layer.succeed(Host, "localhost")))
```

### [Layer.provide](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1375)

Feeds a dependency layer's outputs into this layer's requirements and hides those dependency outputs.

```ts
const Database = Context.Service<string>("Database")
const Users = Context.Service<string>("Users")
const users = Layer.effect(Users, Effect.service(Database)).pipe(
  Layer.provide(Layer.succeed(Database, "db")))
```

### [Layer.provideMerge](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1490)

Provides dependencies while retaining both their services and this layer's services.

```ts
const Database = Context.Service<string>("Database")
const Users = Context.Service<string>("Users")
const users = Layer.effect(Users, Effect.service(Database)).pipe(
  Layer.provideMerge(Layer.succeed(Database, "db")))
```

### [Layer.flatMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1598)

Builds a layer dynamically from the context produced by a previous layer.

```ts
const Port = Context.Service<number>("Port")
const Address = Context.Service<string>("Address")
const live = Layer.succeed(Port, 8080).pipe(
  Layer.flatMap((services) =>
    Layer.succeed(Address, "localhost:" + Context.get(services, Port))))
```

### [Layer.tap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1637)

Runs an Effect after successful construction, discards its value, and preserves the original context.

```ts
const Port = Context.Service<number>("Port")
const live = Layer.succeed(Port, 8080).pipe(
  Layer.tap(() => Effect.sync(() => console.log("built"))))
```

## Diagnostics and failure handling

### [Layer.tapError](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1676)

Runs an Effect for a typed construction error and then re-fails with the original error.

```ts
declare const layer: Layer.Layer<"App", "ConfigError", never>
const observed = layer.pipe(
  Layer.tapError((error) => Effect.sync(() => console.error(error))))
```

### [Layer.tapCause](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1716)

Runs an Effect for any construction `Cause`, then preserves the original cause.

```ts
declare const layer: Layer.Layer<"App", "ConfigError", never>
const observed = layer.pipe(
  Layer.tapCause((cause) => Effect.sync(() => console.error(cause))))
```

### [Layer.orDie](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1782)

Converts typed construction failures into defects and removes them from the layer error type.

```ts
declare const layer: Layer.Layer<"App", "ConfigError", never>
const unrecoverable = layer.pipe(Layer.orDie)
```

### [Layer.catch](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1819)

Recovers from any typed construction error with a fallback layer selected by the error.

```ts
declare const primary: Layer.Layer<"App", "ConfigError", never>
const recovered = primary.pipe(
  Layer.catch(() => Layer.succeed(Context.Service<string>("App"), "fallback")))
```

### [Layer.catchTag](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1854)

Recovers only from selected tagged construction errors.

```ts
declare const primary: Layer.Layer<"App", { readonly _tag: "ConfigError" }, never>
const recovered = primary.pipe(
  Layer.catchTag("ConfigError", () =>
    Layer.succeed(Context.Service<string>("App"), "fallback")))
```

### [Layer.catchCause](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1962)

Recovers from any failure `Cause` by choosing a fallback layer, including defects and interruption.

```ts
declare const primary: Layer.Layer<"App", "ConfigError", never>
const recovered = primary.pipe(
  Layer.catchCause(() =>
    Layer.succeed(Context.Service<string>("App"), "fallback")))
```

### [Layer.updateService](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1999)

Transforms an existing service during layer construction. The resulting layer requires that service.

```ts
const Logger = Context.Service<{ log: (message: string) => void }>("Logger")
declare const app: Layer.Layer<"App", never, typeof Logger>
const withPrefix = app.pipe(
  Layer.updateService(Logger, (logger) => ({
    log: (message) => logger.log("[app] " + message)})))
```

### [Layer.fresh](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:2100)

Creates a version with a new memo map, so resources are not shared with other uses of the original layer.

```ts
const shared = Layer.effectDiscard(Effect.log("connect"))
const independent = Layer.merge(Layer.fresh(shared), Layer.fresh(shared))
```

### [Layer.launch](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:2167)

Builds a layer and keeps its scope alive until interruption, then runs its finalizers.

```ts
const application = Layer.effectDiscard(Effect.log("starting")).pipe(
  Layer.launch)
```

## Testing and type constraints

### [Layer.PartialEffectful](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:2190)

Makes Effect, Stream, Channel, and functions returning them optional while keeping non-effectful properties required.

```ts
type TestApi = Layer.PartialEffectful<{
  endpoint: string
  get: (id: string) => Effect.Effect<string>
}>
const mock: TestApi = { endpoint: "test" }
```

### [Layer.mock](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:2262)

Creates a service layer from a partial implementation; missing effectful members fail when exercised.

```ts
const Users = Context.Service<{
  endpoint: string
  get: (id: string) => Effect.Effect<string>
}>("Users")
const testUsers = Layer.mock(Users, { endpoint: "test" })
```

### [Layer.satisfiesSuccessType](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:2350)

Adds a compile-time constraint that the provided services extend the requested `ROut` type.

```ts
declare const layer: Layer.Layer<"Config", never, never>
const checked = Layer.satisfiesSuccessType<"Config" | "Metrics">()(layer)
```

### [Layer.satisfiesErrorType](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:2385)

Adds a compile-time constraint that the construction error extends the requested `E` type.

```ts
declare const layer: Layer.Layer<"Config", TypeError, never>
const checked = Layer.satisfiesErrorType<Error>()(layer)
```

### [Layer.satisfiesServicesType](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:2419)

Adds a compile-time constraint that requirements extend the requested `RIn` type.

```ts
declare const layer: Layer.Layer<"Config", never, "Env">
const checked = Layer.satisfiesServicesType<"Env" | "Optional">()(layer)
```
