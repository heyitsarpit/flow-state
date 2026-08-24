# `Layer`

Source: [Effect v4 `Layer` API](https://www.effect.website/docs/v4/api/effect/Layer). Examples assume `import { Context, Effect, Layer } from "effect"`.

## API index

1. [Layer.Success](#layersuccess)
2. [Layer.Error](#layererror)
3. [Layer.Services](#layerservices)
4. [Layer.succeed](#layersucceed)
5. [Layer.effect](#layereffect)
6. [Layer.sync](#layersync)
7. [Layer.mergeAll](#layermergeall)
8. [Layer.merge](#layermerge)
9. [Layer.provide](#layerprovide)
10. [Layer.provideMerge](#layerprovidemerge)
11. [Layer.flatMap](#layerflatmap)
12. [Layer.build](#layerbuild)
13. [Layer.launch](#layerlaunch)

### Additional known APIs (not expanded)

`Layer`, `Any`, `Services`, `Error`, `Success`, `isLayer`, `fromBuild`, `fromBuildMemo`, `makeMemoMapUnsafe`, `forkMemoMapUnsafe`, `makeMemoMap`, `forkMemoMap`, `CurrentMemoMap`, `buildWithMemoMap`, `buildWithScope`, `succeedContext`, `empty`, `syncContext`, `effectContext`, `effectDiscard`, `suspend`, `unwrap`, `tap`, `tapError`, `tapCause`, `orDie`, `catchTag`, `catchCause`, `updateService`, `fresh`, `mock`, `satisfiesSuccessType`, `satisfiesErrorType`, `satisfiesServicesType`, `span`, `parentSpan`, `withSpan`, `withParentSpan`

### [Layer.Success](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:180)

Extracts `ROut`, the services provided by a `Layer` type.

```ts
declare const live: Layer.Layer<"Config", Error, "Env">;
type Provided = Layer.Success<typeof live>; // "Config"
```

### [Layer.Error](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:165)

Extracts `E`, the construction error type from a `Layer` type.

```ts
declare const live: Layer.Layer<"Config", Error, "Env">;
type Failure = Layer.Error<typeof live>; // Error
```

### [Layer.Services](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:148)

Extracts `RIn`, the service requirements of a `Layer` type. The [requirements-management layers recipe](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/requirements-management/layers.mdx) shows these requirements as the layer's dependency input.

```ts
declare const live: Layer.Layer<"Config", Error, "Env">;
type Requirements = Layer.Services<typeof live>; // "Env"
```

### [Layer.succeed](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:775)

Provides one service from an already-created value.

```ts
const Config = Context.Service<{ port: number }>("Config");
const ConfigLive = Layer.succeed(Config, { port: 8080 });
```

### [Layer.effect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:974)

Builds one service from an `Effect`, including effectful construction and dependencies.

```ts
const Config = Context.Service<{ port: number }>("Config");
const ConfigLive = Layer.effect(Config, Effect.succeed({ port: 8080 }));
```

### [Layer.sync](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:890)

Lazily creates one service synchronously when the layer is built.

```ts
const Clock = Context.Service<{ now: () => number }>("Clock");
const ClockLive = Layer.sync(Clock, () => ({ now: Date.now }));
```

### [Layer.mergeAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1194)

Builds several independent layers together and combines their services.

```ts
const live = Layer.mergeAll(
  Layer.succeed(Context.Service<string>("Host"), "localhost"),
  Layer.succeed(Context.Service<number>("Port"), 8080),
);
```

### [Layer.merge](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1245)

Combines a layer with another layer while retaining both outputs.

```ts
const Host = Context.Service<string>("Host");
const Port = Context.Service<number>("Port");
const live = Layer.succeed(Host, "localhost").pipe(
  Layer.merge(Layer.succeed(Port, 8080)),
);
```

### [Layer.provide](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1375)

Feeds one layer's outputs into another layer's requirements and hides those dependencies. For `self: Layer<ROut2, E2, RIn2>` and `that: Layer<ROut, E, RIn>`, the result is `Layer<ROut2, E | E2, RIn | Exclude<RIn2, ROut>>`: supplied outputs are subtracted from the target requirements.

```ts
const Database = Context.Service<string>("Database");
const Users = Context.Service<string>("Users");
const users = Layer.effect(Users, Effect.service(Database)).pipe(
  Layer.provide(Layer.succeed(Database, "db")),
);
type RemainingRequirements = Layer.Services<typeof users>; // never
```

### [Layer.provideMerge](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1490)

Provides dependencies while retaining both the constructed service and dependency outputs.

```ts
const Database = Context.Service<string>("Database");
const Users = Context.Service<string>("Users");
const live = Layer.effect(Users, Effect.service(Database)).pipe(
  Layer.provideMerge(Layer.succeed(Database, "db")),
);
```

### [Layer.flatMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:1598)

Builds a layer dynamically from the services produced by a previous layer.

```ts
const Config = Context.Service<{ port: number }>("Config");
const Server = Context.Service<string>("Server");
const live = Layer.succeed(Config, { port: 8080 }).pipe(
  Layer.flatMap((config) => Layer.succeed(Server, `:${config.port}`)),
);
```

### [Layer.build](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:674)

Builds a layer into a service context inside an effectful scope.

```ts
const Config = Context.Service<number>("Config");
const context = Layer.build(Layer.succeed(Config, 8080));
```

### [Layer.launch](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Layer.ts:2167)

Builds a layer for its lifecycle and keeps its resulting scope running until interruption.

```ts
const live = Layer.succeed(Context.Service<string>("Mode"), "prod");
const program = Layer.launch(live);
```
