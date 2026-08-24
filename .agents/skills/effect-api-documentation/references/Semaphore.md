# `Semaphore`

Source: [Effect v4 `Semaphore` API](https://www.effect.website/docs/v4/api/effect/Semaphore). Examples assume `import { Effect, Semaphore } from "effect"`.

## API index

1. [Semaphore.Semaphore](#semaphoresemaphore)
2. [Semaphore.make](#semaphoremake)
3. [Semaphore.withPermits](#semaphorewithpermits)
4. [Semaphore.withPermit](#semaphorewithpermit)
5. [Semaphore.withPermitsIfAvailable](#semaphorewithpermitsifavailable)
6. [Semaphore.take](#semaphoretake)
7. [Semaphore.release](#semaphorerelease)
8. [Semaphore.resize](#semaphoreresize)

### Additional known APIs (not expanded)

`makeUnsafe`, `releaseAll`

### [Semaphore.Semaphore](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Semaphore.ts:55)

Represents a pool of permits for limiting concurrent work.

```ts
const semaphore: Semaphore.Semaphore = yield* Semaphore.make(4);
```

### [Semaphore.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Semaphore.ts:329)

Creates a semaphore with the given number of permits.

```ts
const semaphore = yield* Semaphore.make(4);
```

### [Semaphore.withPermits](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Semaphore.ts:378)

Runs an effect after acquiring a number of permits and releases them when the effect exits.

```ts
const result = yield* Semaphore.withPermits(semaphore, 2, Effect.succeed("work"));
```

### [Semaphore.withPermit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Semaphore.ts:403)

Runs an effect while holding exactly one permit.

```ts
const result = yield* Semaphore.withPermit(semaphore, Effect.succeed("work"));
```

### [Semaphore.withPermitsIfAvailable](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Semaphore.ts:432)

Runs an effect only when the requested permits are immediately available, returning an `Option` otherwise.

```ts
const result = yield* Semaphore.withPermitsIfAvailable(semaphore, 1, Effect.succeed("work"));
```

### [Semaphore.take](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Semaphore.ts:464)

Acquires permits manually, waiting when none are available.

```ts
yield* Semaphore.take(semaphore, 2);
```

### [Semaphore.release](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Semaphore.ts:497)

Returns permits acquired with `take` to the semaphore.

```ts
yield* Semaphore.release(semaphore, 2);
```

### [Semaphore.resize](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Semaphore.ts:351)

Changes the semaphore's total permit capacity.

```ts
yield* Semaphore.resize(semaphore, 8);
```
