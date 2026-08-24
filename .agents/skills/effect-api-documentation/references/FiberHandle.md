# `FiberHandle`

Source: [Effect v4 `FiberHandle` API](https://www.effect.website/docs/v4/api/effect/FiberHandle). Examples assume `import { Effect, FiberHandle } from "effect"`.

## API index

1. [FiberHandle.FiberHandle](#fiberhandlefiberhandle)
2. [FiberHandle.make](#fiberhandlemake)
3. [FiberHandle.run](#fiberhandlerun)
4. [FiberHandle.get](#fiberhandleget)
5. [FiberHandle.set](#fiberhandleset)
6. [FiberHandle.clear](#fiberhandleclear)
7. [FiberHandle.awaitEmpty](#fiberhandleawaitempty)
8. [FiberHandle.join](#fiberhandlejoin)
9. [FiberHandle.runtime](#fiberhandleruntime)

### Additional known APIs (not expanded)

`isFiberHandle`, `makeRuntime`, `makeRuntimePromise`, `setUnsafe`, `getUnsafe`, `runtimePromise`

### [FiberHandle.FiberHandle](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberHandle.ts:55)

Represents a scoped slot for one managed fiber; starting a new fiber interrupts the previous one by default.

```ts
const current: FiberHandle.FiberHandle<string, Error> = yield* FiberHandle.make();
```

### [FiberHandle.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberHandle.ts:138)

Creates a scoped handle whose current fiber is interrupted when the scope closes.

```ts
const program = Effect.scoped(Effect.gen(function*() {
  const handle = yield* FiberHandle.make();
  return yield* FiberHandle.get(handle);
}));
```

### [FiberHandle.run](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberHandle.ts:556)

Forks an effect into the handle, replacing the current fiber unless `onlyIfMissing` is set.

```ts
const fiber = yield* FiberHandle.run(handle, refresh);
```

### [FiberHandle.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberHandle.ts:468)

Reads the current fiber as an `Option` inside `Effect`.

```ts
const current = yield* FiberHandle.get(handle);
```

### [FiberHandle.set](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberHandle.ts:377)

Stores an already-forked fiber in the handle and interrupts the previous one by default.

```ts
yield* FiberHandle.set(handle, Effect.runFork(refresh));
```

### [FiberHandle.clear](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberHandle.ts:499)

Interrupts the current fiber, if any, and leaves the handle empty.

```ts
yield* FiberHandle.clear(handle);
```

### [FiberHandle.awaitEmpty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberHandle.ts:809)

Waits for the current fiber to complete without propagating its failure as the handle’s join signal.

```ts
yield* FiberHandle.awaitEmpty(handle);
```

### [FiberHandle.join](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberHandle.ts:782)

Waits for the managed fiber to fail or for the handle to close.

```ts
yield* FiberHandle.join(handle);
```

### [FiberHandle.runtime](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberHandle.ts:641)

Captures the current environment and returns a direct runner for replacing the handle’s fiber.

```ts
const runFork = yield* FiberHandle.runtime(handle)<AppServices>();
runFork(App.refresh);
```
