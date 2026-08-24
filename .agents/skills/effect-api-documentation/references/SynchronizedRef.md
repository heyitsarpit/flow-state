# `SynchronizedRef`

Source: [Effect v4 `SynchronizedRef` API](https://www.effect.website/docs/v4/api/effect/SynchronizedRef). Examples assume `import { Effect, SynchronizedRef } from "effect"` and an enclosing `Effect.gen`.

## API index

1. [SynchronizedRef.SynchronizedRef](#synchronizedrefsynchronizedref)
2. [SynchronizedRef.make](#synchronizedrefmake)
3. [SynchronizedRef.get](#synchronizedrefget)
4. [SynchronizedRef.set](#synchronizedrefset)
5. [SynchronizedRef.update](#synchronizedrefupdate)
6. [SynchronizedRef.updateEffect](#synchronizedrefupdateeffect)
7. [SynchronizedRef.modify](#synchronizedrefmodify)
8. [SynchronizedRef.modifyEffect](#synchronizedrefmodifyeffect)
9. [SynchronizedRef.getAndSet](#synchronizedrefgetandset)
10. [SynchronizedRef.updateAndGet](#synchronizedrefupdateandget)

### Additional known APIs (not expanded)

`makeUnsafe`, `getUnsafe`, `setAndGet`, `getAndUpdate`, `getAndUpdateEffect`, `getAndUpdateSome`, `getAndUpdateSomeEffect`, `modifySome`, `modifySomeEffect`, `updateSome`, `updateSomeEffect`, `updateSomeAndGet`, `updateSomeAndGetEffect`

### [SynchronizedRef.SynchronizedRef](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SynchronizedRef.ts:37)

Represents mutable state whose reads and updates are serialized by an internal semaphore.

```ts
const state: SynchronizedRef.SynchronizedRef<number> = yield* SynchronizedRef.make(0);
```

### [SynchronizedRef.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SynchronizedRef.ts:91)

Creates a synchronized ref initialized with a value.

```ts
const state = yield* SynchronizedRef.make(0);
```

### [SynchronizedRef.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SynchronizedRef.ts:122)

Reads the current value as an effect.

```ts
const value = yield* SynchronizedRef.get(state);
```

### [SynchronizedRef.set](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SynchronizedRef.ts:410)

Replaces the current value while serializing the write.

```ts
yield* SynchronizedRef.set(state, 10);
```

### [SynchronizedRef.update](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SynchronizedRef.ts:458)

Applies a pure state transition while holding the synchronization permit.

```ts
yield* SynchronizedRef.update(state, (value) => value + 1);
```

### [SynchronizedRef.updateEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SynchronizedRef.ts:485)

Runs an effectful state transition while holding the synchronization permit.

```ts
yield* SynchronizedRef.updateEffect(state, (value) => Effect.succeed(value + 1));
```

### [SynchronizedRef.modify](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SynchronizedRef.ts:282)

Atomically stores a new state and returns a separate result.

```ts
const previous = yield* SynchronizedRef.modify(state, (value) => [value, value + 1]);
```

### [SynchronizedRef.modifyEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SynchronizedRef.ts:306)

Performs an effectful atomic modification and stores its resulting state.

```ts
const previous = yield* SynchronizedRef.modifyEffect(state, (value) => Effect.succeed([value, value + 1]));
```

### [SynchronizedRef.getAndSet](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SynchronizedRef.ts:140)

Sets a value and returns the previous value.

```ts
const previous = yield* SynchronizedRef.getAndSet(state, 0);
```

### [SynchronizedRef.updateAndGet](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SynchronizedRef.ts:514)

Updates the state and returns the new value.

```ts
const next = yield* SynchronizedRef.updateAndGet(state, (value) => value + 1);
```
