# `FiberSet`

Source: [Effect v4 `FiberSet` API](https://www.effect.website/docs/v4/api/effect/FiberSet). Examples assume `import { Effect, FiberSet } from "effect"`.

`FiberSet` tracks a group of fibers so an owner can add work and await or interrupt the whole group as one lifecycle unit.

## API index

1. [FiberSet.FiberSet](#fibersetfiberset)
2. [FiberSet.make](#fibersetmake)
3. [FiberSet.run](#fibersetrun)
4. [FiberSet.awaitEmpty](#fibersetawaitempty)
5. [FiberSet.join](#fibersetjoin)
6. [FiberSet.clear](#fibersetclear)
7. [FiberSet.add](#fibersetadd)
8. [FiberSet.size](#fibersetsize)
9. [FiberSet.runtime](#fibersetruntime)

### Additional known APIs (not expanded)

`isFiberSet`, `makeRuntime`, `makeRuntimePromise`, `addUnsafe`, `runtimePromise`

### [FiberSet.FiberSet](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberSet.ts:52)

Represents a scoped collection of fibers that removes completed fibers and interrupts remaining fibers when its scope closes.

```ts
const workers: FiberSet.FiberSet<string, Error> = yield* FiberSet.make();
```

### [FiberSet.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberSet.ts:144)

Creates a scoped set whose fibers are interrupted when the owning scope closes.

```ts
const program = Effect.scoped(Effect.gen(function*() {
  const workers = yield* FiberSet.make();
  return yield* FiberSet.size(workers);
}));
```

### [FiberSet.run](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberSet.ts:459)

Forks an effect and registers the resulting fiber so completion and scope shutdown are managed by the set.

```ts
const fiber = yield* FiberSet.run(workers, sendHeartbeat);
```

### [FiberSet.awaitEmpty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberSet.ts:708)

Waits until all currently tracked fibers have completed.

```ts
yield* FiberSet.awaitEmpty(workers);
```

### [FiberSet.join](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberSet.ts:680)

Waits for the set to fail or close, propagating the first non-ignored fiber failure.

```ts
yield* FiberSet.join(workers);
```

### [FiberSet.clear](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberSet.ts:414)

Interrupts every tracked fiber and clears the set.

```ts
yield* FiberSet.clear(workers);
```

### [FiberSet.add](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberSet.ts:362)

Registers an already-forked fiber in the set and removes it after completion.

```ts
const fiber = Effect.runFork(work);
yield* FiberSet.add(workers, fiber);
```

### [FiberSet.size](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberSet.ts:656)

Reads the number of currently tracked fibers.

```ts
const active = yield* FiberSet.size(workers);
```

### [FiberSet.runtime](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberSet.ts:531)

Captures the current environment and returns a direct runner for adding effects to the set.

```ts
const runFork = yield* FiberSet.runtime(workers)<AppServices>();
const fiber = runFork(App.load);
```
