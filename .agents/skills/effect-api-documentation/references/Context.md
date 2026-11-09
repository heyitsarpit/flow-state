# `Context`

Source: [Effect v4 `Context` API](https://www.effect.website/docs/v4/api/effect/Context). Examples import modules as needed.

`Context` is the typed environment map used to define service keys and retrieve the capabilities an Effect program requires.

## API index

### Type-level concepts

1. [Context.Context](#contextcontext)
2. [Context.Key](#contextkey)
3. [Context.Service (interface)](#contextservice-interface)
4. [Context.ServiceClass](#contextserviceclass)
5. [Context.ServiceClass.Shape](#contextserviceclassshape)
6. [Context.Service.Any](#contextserviceany)
7. [Context.Service.Shape](#contextserviceshape)
8. [Context.Service.Identifier](#contextserviceidentifier)
9. [Context.Reference (interface)](#contextreference-interface)

### Common construction and access

10. [Context.Service (constructor)](#contextservice-constructor)
11. [Context.Service.of](#contextserviceof)
12. [Context.Service.context](#contextservicecontext)
13. [Context.Service.use](#contextserviceuse)
14. [Context.Service.useSync](#contextserviceusesync)
15. [Context.Reference (constructor)](#contextreference-constructor)
16. [Context.empty](#contextempty)
17. [Context.make](#contextmake)
18. [Context.add](#contextadd)
19. [Context.addOrOmit](#contextaddoromit)
20. [Context.get](#contextget)
21. [Context.getOption](#contextgetoption)
22. [Context.getOrElse](#contextgetorelse)
23. [Context.getOrUndefined](#contextgetorundefined)

### Composition, guards, and low-level utilities

24. [Context.merge](#contextmerge)
25. [Context.mergeAll](#contextmergeall)
26. [Context.pick](#contextpick)
27. [Context.omit](#contextomit)
28. [Context.isContext](#contextiscontext)
29. [Context.isKey](#contextiskey)
30. [Context.isReference](#contextisreference)
31. [Context.makeUnsafe](#contextmakeunsafe)
32. [Context.getUnsafe](#contextgetunsafe)
33. [Context.getReferenceUnsafe](#contextgetreferenceunsafe)
34. [Context.mutate](#contextmutate)

### Additional known APIs (not expanded)

`ServiceTypeId`

## Type-level concepts

### [Context.Context](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:456)

`Context<Services>` is the immutable service map used by Effect programs. Its type parameter records the service identifiers available for typed access, while runtime entries are stored by each key's string `key`.

```ts
const Port = Context.Service<number>("Port")
const services: Context.Context<number> = Context.make(Port, 8080)
```

### [Context.Key](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:65)

`Context.Key<Identifier, Shape>` is the typed handle for a service. `Identifier` is the environment requirement recorded by an Effect, and `Shape` is the implementation retrieved from the context. A key is also an Effect value, so it can be yielded from `Effect.gen`.

```ts
const Database = Context.Service<{ query: (sql: string) => string }>("Database")
const key: Context.Key<Context.Service.Identifier<typeof Database>, Context.Service.Shape<typeof Database>> = Database
```

### [Context.Service (interface)](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:99)

The `Context.Service<Identifier, Shape>` interface extends `Key` with helpers: `context` creates a one-service context, `use` and `useSync` read the service from the current Effect environment, and `of` returns a value with the service shape.

```ts
const Logger = Context.Service<{ log: (message: string) => void }>("Logger")
const logEffect = Logger.useSync((logger) => logger.log("ready"))
const loggerContext = Logger.context({ log: console.log })
```

### [Context.ServiceClass](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:124)

`ServiceClass<Self, Identifier, Shape>` is the class-style service-key contract. The class value is itself the key, and its `key` property carries the string identifier used at runtime.

```ts
class Config extends Context.Service<Config, { readonly port: number }>()("Config") {}
const config = Context.make(Config, { port: 8080 })
```

### [Context.ServiceClass.Shape](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:145)

`Context.ServiceClass.Shape<Identifier, Service>` describes the metadata carried by a class-style service key: its service type marker, string key, and implementation shape.

```ts
type ConfigClassShape = Context.ServiceClass.Shape<"Config", { readonly port: number }>
```

### [Context.Service.Any](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:376)

`Context.Service.Any` is a type for a service key when the identifier and implementation shape are intentionally unknown. It is useful for heterogeneous key collections and generic helpers.

```ts
const keys: Array<Context.Service.Any> = [
  Context.Service<number>("Port"),
  Context.Service<string>("Host")
]
```

### [Context.Service.Shape](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:399)

Extracts the implementation type carried by a service key.

```ts
const Database = Context.Service<{ query: (sql: string) => string }>("Database")
type DatabaseShape = Context.Service.Shape<typeof Database>
```

### [Context.Service.Identifier](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:422)

Extracts the environment requirement associated with a service key. For a class-style key, this is the class type; for a function-style key, it is the identifier inferred by `Context.Service`.

```ts
class Config extends Context.Service<Config, { readonly port: number }>()("Config") {}
type ConfigRequirement = Context.Service.Identifier<typeof Config>
```

### [Context.Reference (interface)](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:328)

`Context.Reference<Shape>` is a service key with a lazily computed default. A missing reference can resolve to its cached default instead of failing, while an explicitly stored context value still overrides it.

```ts
declare const RequestId: Context.Reference<string>
const requestId = Context.get(Context.empty(), RequestId)
```

## Common construction and access

### [Context.Service (constructor)](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:200)

Creates a required service key with `Context.Service("Key")`, or a class-style key with the two-stage `Context.Service<Self, Shape>()("Key")` form. The string key is the runtime identity, so unrelated services should not reuse it.

```ts
const Database = Context.Service<{ query: (sql: string) => string }>("Database")
class Config extends Context.Service<Config, { readonly port: number }>()("Config") {}
```

### [Context.Service.of](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:99)

`Service.of` is a type-level helper that accepts an implementation with the service shape inferred from the key. It is useful when a class-style service implementation is passed to `Layer.succeed`.

```ts
class FeatureFlags extends Context.Service<FeatureFlags, {
  readonly enabled: (name: string) => boolean
}>()("FeatureFlags") {}

const flags = FeatureFlags.of({ enabled: (name) => name === "new-ui" })
const layer = Layer.succeed(FeatureFlags, flags)
```

### [Context.Service.context](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:99)

`Service.context` turns one implementation into a one-service `Context`. Use it when a host boundary already owns a concrete implementation and needs to provide a context directly.

```ts
const Logger = Context.Service<{ readonly log: (message: string) => void }>("Logger")
const loggerContext = Logger.context({ log: console.log })
const program = Logger.useSync((logger) => logger.log("started")).pipe(
  Effect.provideContext(loggerContext),
)
```

### [Context.Service.use](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:99)

`Service.use` reads the service and applies an effectful function to it. The returned effect keeps the service identifier in its requirements until a Layer or context supplies it.

```ts
const Database = Context.Service<{
  readonly query: (sql: string) => Effect.Effect<ReadonlyArray<string>>
}>("Database")
const rows = Database.use((database) => database.query("select id from users"))
```

### [Context.Service.useSync](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:99)

`Service.useSync` reads the service and maps it with an ordinary synchronous function. It is still an Effect and still requires the service identifier.

```ts
const Config = Context.Service<{ readonly region: string }>("Config")
const region = Config.useSync((config) => config.region)
```

### [Context.Reference (constructor)](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:1335)

Creates a service key with a lazily computed, cached default value. Use it for an overridable default dependency such as a logger or clock.

```ts
const Logger = Context.Reference("Logger", {
  defaultValue: () => ({ log: (message: string) => console.log(message) })
})
const logger = Context.get(Context.empty(), Logger)
```

### [Context.empty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:621)

Returns the shared empty context, which has no services and has the type `Context<never>`.

```ts
const services = Context.empty()
const missing = Context.getOption(services, Context.Service<number>("Port"))
```

### [Context.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:643)

Creates a context containing one implementation associated with a key.

```ts
const Port = Context.Service<number>("Port")
const services = Context.make(Port, 8080)
```

### [Context.add](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:685)

Adds or replaces one service. It supports both the data-first form and the pipeable `Context.add(key, value)` form.

```ts
const Port = Context.Service<number>("Port")
const Host = Context.Service<string>("Host")
const services = Context.make(Port, 8080).pipe(Context.add(Host, "localhost"))
```

### [Context.addOrOmit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:737)

Adds a service for `Option.some(value)` and removes its key for `Option.none()`. This is useful when optional configuration should directly control context membership.

```ts
import { Option } from "effect"

const Port = Context.Service<number>("Port")
const services = Context.empty().pipe(Context.addOrOmit(Port, Option.some(8080)))
const withoutPort = services.pipe(Context.addOrOmit(Port, Option.none()))
```

### [Context.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:927)

Gets a service when the context type proves that the key is present. For a `Reference`, an absent override resolves to its default.

```ts
const Port = Context.Service<number>("Port")
const services = Context.make(Port, 8080)
const port = Context.get(services, Port)
```

### [Context.getOption](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:1047)

Gets a service as an `Option`. Stored values and reference defaults produce `Option.some`; an absent non-reference key produces `Option.none`.

```ts
import { Option } from "effect"

const Port = Context.Service<number>("Port")
const port = Context.getOption(Context.empty(), Port)
const isMissing = Option.isNone(port)
```

### [Context.getOrElse](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:809)

Gets a service or evaluates a fallback for an absent non-reference key. A reference's default takes precedence over the fallback.

```ts
const Port = Context.Service<number>("Port")
const port = Context.getOrElse(Context.empty(), Port, () => 8080)
```

### [Context.getOrUndefined](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:838)

Returns the raw stored value or `undefined`. Unlike `get`, `getOrElse`, and `getOption`, it does not resolve a `Context.Reference` default.

```ts
const Logger = Context.Reference("Logger", { defaultValue: () => "default" })
const stored = Context.getOrUndefined(Context.empty(), Logger) // undefined
```

## Composition, guards, and low-level utilities

### [Context.merge](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:1092)

Combines two contexts. If both contain the same service key, the right-hand context wins.

```ts
const Port = Context.Service<number>("Port")
const left = Context.make(Port, 8080)
const right = Context.make(Port, 9090)
const services = Context.merge(left, right)
```

### [Context.mergeAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:1145)

Combines a variadic list of contexts, keeping the last value for duplicate keys.

```ts
const Host = Context.Service<string>("Host")
const Port = Context.Service<number>("Port")
const services = Context.mergeAll(Context.make(Host, "localhost"), Context.make(Port, 8080))
```

### [Context.pick](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:1192)

Returns a context containing only an allowlisted set of keys.

```ts
const Port = Context.Service<number>("Port")
const Secret = Context.Service<string>("Secret")
const services = Context.make(Port, 8080).pipe(Context.add(Secret, "token"))
const publicServices = services.pipe(Context.pick(Port))
```

### [Context.omit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:1239)

Returns a context with the selected keys removed, which is useful before passing a context across a boundary that must not receive a secret.

```ts
const Secret = Context.Service<string>("Secret")
const services = Context.make(Secret, "token")
const safeServices = services.pipe(Context.omit(Secret))
```

### [Context.isContext](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:565)

Narrows an unknown value to `Context<never>`. It confirms the runtime context marker, not the presence of any particular service.

```ts
const value: unknown = Context.empty()
if (Context.isContext(value)) {
  console.log("received a Context")
}
```

### [Context.isKey](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:582)

Narrows an unknown value to a `Context.Key`, allowing generic code to recognize service keys before using key-specific operations.

```ts
const value: unknown = Context.Service<number>("Port")
if (Context.isKey(value)) {
  console.log(value.key)
}
```

### [Context.isReference](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:604)

Narrows a key to `Context.Reference`, distinguishing keys that carry a default value from required keys.

```ts
const Logger = Context.Reference("Logger", { defaultValue: () => "default" })
if (Context.isReference(Logger)) {
  console.log(Logger.defaultValue())
}
```

### [Context.makeUnsafe](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:494)

Creates a context directly from a service map. It is unsafe because later mutation of the supplied map can affect the context; prefer `empty`, `make`, `add`, or `merge` for normal construction.

```ts
const map = new Map([["Port", 8080]])
const services = Context.makeUnsafe(map)
```

### [Context.getUnsafe](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:882)

Gets a service without requiring the context type to prove its presence. It throws for a missing non-reference key and resolves a missing reference default.

```ts
const Port = Context.Service<number>("Port")
const services = Context.empty()
// Throws because Port is missing and has no default.
const port = Context.getUnsafe(services, Port)
```

### [Context.getReferenceUnsafe](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:973)

Gets a `Context.Reference` value from a context, using the reference's cached default when no override is stored.

```ts
const Logger = Context.Reference("Logger", { defaultValue: () => "default" })
const logger = Context.getReferenceUnsafe(Context.empty(), Logger)
```

### [Context.mutate](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:1267)

Applies several context transformations through one callback while copying the underlying map only once. The returned context is immutable again after the callback completes.

```ts
const Port = Context.Service<number>("Port")
const Host = Context.Service<string>("Host")
const services = Context.empty().pipe(
  Context.mutate((context) =>
    context.pipe(Context.add(Port, 8080), Context.add(Host, "localhost")))
)
```
