# Requirements management composition

Effect requirements are the `R` channel of `Effect<A, E, R>`: services are
declared as typed context keys, implemented by Layers, and removed from an
effect when the graph is provided. These recipes follow the local [services](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/requirements-management/services.mdx:84), [layers](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/requirements-management/layers.mdx:421), [layer memoization](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/requirements-management/layer-memoization.mdx:10), and [test dependency](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/requirements-management/layers.mdx:1094) recipes. Official references: [services](https://www.effect.website/docs/v4/requirements-management/services), [layers](https://www.effect.website/docs/v4/requirements-management/layers), [layer memoization](https://www.effect.website/docs/v4/requirements-management/layer-memoization).

## Recipe index

1. [Declare a service and track A/E/R](#declare-a-service-and-track-aer)
2. [Compose a dependency graph with Layers](#compose-a-dependency-graph-with-layers)
3. [Choose shared or fresh layer instances](#choose-shared-or-fresh-layer-instances)
4. [Replace the graph in tests](#replace-the-graph-in-tests)

### [Declare a service and track A/E/R](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/requirements-management/services.mdx:84)

`Context.Service` creates a stable key and a typed service shape
([Context.ts:200](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:200)). A program can then yield the key as an effect; its `R` requirement records the missing service.

```ts
import { Context, Effect, Layer } from "effect"

class Config extends Context.Service<Config, { readonly prefix: string }>()("Config") {}

const program: Effect.Effect<string, never, Config> = Effect.gen(function*() {
  const config = yield* Config
  return `${config.prefix}:ready`
})

const runnable = Effect.provide(program, Layer.succeed(Config, { prefix: "app" }))
Effect.runSync(runnable) // "app:ready"
```

### [Compose a dependency graph with Layers](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/requirements-management/layers.mdx:421)

Use `Layer.effect` for a service whose construction needs another service,
then provide that dependency and merge the resulting outputs
([Layer.ts:974](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:974), [Layer.ts:1245](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1245), [Layer.ts:1375](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1375)).

```ts
import { Console, Context, Effect, Layer } from "effect"

class Config extends Context.Service<Config, { readonly prefix: string }>()("Config") {}
class Logger extends Context.Service<Logger, { readonly log: (s: string) => Effect.Effect<void> }>()("Logger") {}

const ConfigLive = Layer.succeed(Config, { prefix: "app" })
const LoggerLive = Layer.effect(Logger, Effect.gen(function*() {
  const config = yield* Config
  return { log: (message: string) => Console.log(`${config.prefix}: ${message}`) }
}))

const AppLive = Layer.merge(ConfigLive, Layer.provide(LoggerLive, ConfigLive))
```

### [Choose shared or fresh layer instances](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/requirements-management/layer-memoization.mdx:25)

Globally provided layers are memoized by reference, so dependent services can
share one acquisition. Wrap a layer with `Layer.fresh` when each branch needs
an independent instance ([Layer.ts:2100](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:2100)).

```ts
import { Context, Effect, Layer } from "effect"

class A extends Context.Service<A, { readonly value: number }>()("A") {}
class B extends Context.Service<B, { readonly value: string }>()("B") {}
class C extends Context.Service<C, { readonly value: boolean }>()("C") {}

let initCount = 0
const ALive = Layer.effect(A, Effect.sync(() => ({ value: ++initCount })))
const BLive = Layer.effect(B, Effect.map(A, ({ value }) => ({ value: String(value) })))
const CLive = Layer.effect(C, Effect.map(A, ({ value }) => ({ value: value > 0 })))
const program = Effect.gen(function*() {
  yield* B
  yield* C
})

await Effect.runPromise(Effect.provide(
  program,
  Layer.merge(Layer.provide(BLive, ALive), Layer.provide(CLive, ALive)),
))
initCount // 1: the shared ALive is built once

await Effect.runPromise(Effect.provide(
  program,
  Layer.merge(
    Layer.provide(BLive, Layer.fresh(ALive)),
    Layer.provide(CLive, Layer.fresh(ALive)),
  ),
))
initCount // 3: each Layer.fresh builds a new A
```

### [Replace the graph in tests](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/requirements-management/layers.mdx:1094)

Keep production construction in a live Layer and replace either a dependency
or the whole service at the test boundary. This keeps application code
unchanged while making external behavior deterministic.

```ts
import { Context, Effect, Layer } from "effect"

class Cache extends Context.Service<Cache, { readonly get: (key: string) => Effect.Effect<string> }>()("Cache") {}

const program = Effect.gen(function*() {
  return yield* (yield* Cache).get("user:1")
})

const CacheTest = Layer.succeed(Cache, {
  get: (key) => Effect.succeed(`fixture:${key}`),
})

Effect.runSync(Effect.provide(program, CacheTest)) // "fixture:user:1"
```
