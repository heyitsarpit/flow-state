# `FiberMap`

Source: [Effect v4 `FiberMap` API](https://www.effect.website/docs/v4/api/effect/FiberMap). Examples assume `import { Effect, FiberMap } from "effect"`.

## API index

1. [FiberMap.FiberMap](#fibermapfibermap)
2. [FiberMap.make](#fibermapmake)
3. [FiberMap.run](#fibermaprun)
4. [FiberMap.set](#fibermapset)
5. [FiberMap.get](#fibermapget)
6. [FiberMap.has](#fibermaphas)
7. [FiberMap.remove](#fibermapremove)
8. [FiberMap.clear](#fibermapclear)
9. [FiberMap.awaitEmpty](#fibermapawaitempty)
10. [FiberMap.join](#fibermapjoin)
11. [FiberMap.size](#fibermapsize)

### Additional known APIs (not expanded)

`isFiberMap`, `makeRuntime`, `makeRuntimePromise`, `setUnsafe`, `getUnsafe`, `hasUnsafe`, `runtime`, `runtimePromise`

### [FiberMap.FiberMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberMap.ts:58)

Represents a scoped map of keyed fibers; replacing or removing a key interrupts its current fiber.

```ts
const jobs: FiberMap.FiberMap<string, string, Error> = yield* FiberMap.make();
```

### [FiberMap.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberMap.ts:155)

Creates a scoped keyed fiber map that interrupts its fibers when the scope closes.

```ts
const program = Effect.scoped(Effect.gen(function*() {
  const jobs = yield* FiberMap.make<string>();
  return yield* FiberMap.size(jobs);
}));
```

### [FiberMap.run](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberMap.ts:738)

Forks an effect under a key and replaces the previous fiber for that key unless `onlyIfMissing` is set.

```ts
const fiber = yield* FiberMap.run(jobs, requestId, processRequest);
```

### [FiberMap.set](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberMap.ts:427)

Registers an already-forked fiber under a key, interrupting the previous entry by default.

```ts
yield* FiberMap.set(jobs, requestId, Effect.runFork(processRequest));
```

### [FiberMap.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberMap.ts:534)

Looks up the fiber for a key and returns an `Option` inside `Effect`.

```ts
const current = yield* FiberMap.get(jobs, requestId);
```

### [FiberMap.has](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberMap.ts:602)

Checks whether a key currently has a tracked fiber.

```ts
const active = yield* FiberMap.has(jobs, requestId);
```

### [FiberMap.remove](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberMap.ts:637)

Removes and interrupts the fiber stored under a key, if present.

```ts
yield* FiberMap.remove(jobs, requestId);
```

### [FiberMap.clear](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberMap.ts:688)

Interrupts every tracked fiber and clears the map.

```ts
yield* FiberMap.clear(jobs);
```

### [FiberMap.awaitEmpty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberMap.ts:1025)

Waits until all currently tracked fibers have completed.

```ts
yield* FiberMap.awaitEmpty(jobs);
```

### [FiberMap.join](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberMap.ts:993)

Waits for the map to fail or close, propagating the first non-ignored fiber failure.

```ts
yield* FiberMap.join(jobs);
```

### [FiberMap.size](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberMap.ts:963)

Reads the number of currently tracked keys.

```ts
const active = yield* FiberMap.size(jobs);
```
