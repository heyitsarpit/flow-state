# `ManagedRuntime`

Source: [Effect v4 `ManagedRuntime` API](https://www.effect.website/docs/v4/api/effect/ManagedRuntime). Examples assume `import { Effect, Layer, ManagedRuntime } from "effect"`.

## API index

1. [ManagedRuntime.make](#managedruntimemake)
2. [ManagedRuntime.runPromise](#managedruntimerunpromise)
3. [ManagedRuntime.runFork](#managedruntimerunfork)
4. [ManagedRuntime.runPromiseExit](#managedruntimerunpromiseexit)
5. [ManagedRuntime.runSync](#managedruntimerunsync)
6. [ManagedRuntime.dispose](#managedruntimedispose)
7. [ManagedRuntime.context](#managedruntimecontext)
8. [ManagedRuntime.disposeEffect](#managedruntimedisposeeffect)
9. [ManagedRuntime](#managedruntime)

### Additional known APIs (not expanded)

`TypeId`, `isManagedRuntime`, `ManagedRuntime.Services`, `ManagedRuntime.Error`, `ManagedRuntime.runSyncExit`, `ManagedRuntime.runCallback`, `ManagedRuntime.memoMap`, `ManagedRuntime.contextEffect`

### [ManagedRuntime.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:273)

Builds a reusable runtime from a layer and owns that layer's resources until disposal.

```ts
const runtime = ManagedRuntime.make(Layer.succeed(Context.Service<number>("Port"), 8080));
```

### [ManagedRuntime.runPromise](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:185)

Runs an effect against the runtime's cached services and rejects its promise on failure.

```ts
const runtime = ManagedRuntime.make(Layer.succeed(Context.Service<number>("Port"), 8080));
const port = runtime.runPromise(Effect.succeed(8080));
```

### [ManagedRuntime.runFork](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:132)

Starts an effect in the managed runtime and returns its fiber.

```ts
const runtime = ManagedRuntime.make(Layer.empty);
const fiber = runtime.runFork(Effect.succeed("started"));
```

### [ManagedRuntime.runPromiseExit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:196)

Runs an effect and resolves with its `Exit` instead of rejecting on failure.

```ts
const runtime = ManagedRuntime.make(Layer.empty);
const exit = runtime.runPromiseExit(Effect.fail("bad input"));
```

### [ManagedRuntime.runSync](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:155)

Runs a synchronous effect against the managed runtime and returns its value.

```ts
const runtime = ManagedRuntime.make(Layer.empty);
const value = runtime.runSync(Effect.succeed(42));
```

### [ManagedRuntime.dispose](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:208)

Releases the runtime's layer resources from Promise-based host code.

```ts
const runtime = ManagedRuntime.make(Layer.empty);
await runtime.dispose();
```

### [ManagedRuntime.context](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:116)

Materializes the runtime's service context, building the layer lazily on first access.

```ts
const runtime = ManagedRuntime.make(Layer.empty);
const services = await runtime.context();
```

### [ManagedRuntime.disposeEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:217)

Provides disposal as an `Effect` for workflows that already run inside Effect.

```ts
const runtime = ManagedRuntime.make(Layer.empty);
const program = Effect.ensuring(Effect.succeed("work"), runtime.disposeEffect);
```

### [ManagedRuntime](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:112)

Represents a reusable runtime whose layer-built context and resource scope are cached together.

```ts
const runtime: ManagedRuntime.ManagedRuntime<never, never> = ManagedRuntime.make(Layer.empty);
```
