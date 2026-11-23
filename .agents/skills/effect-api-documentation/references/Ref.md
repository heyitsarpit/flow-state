# `Ref`

Source: [Effect v4 `Ref` API](https://www.effect.website/docs/v4/api/effect/Ref). Examples assume `import { Ref } from "effect"` and an enclosing `Effect.gen`.

`Ref` is an effect-safe mutable cell for atomic reads and updates of shared state.

## API index

1. [Ref.Ref](#refref)
2. [Ref.make](#refmake)
3. [Ref.get](#refget)
4. [Ref.set](#refset)
5. [Ref.update](#refupdate)
6. [Ref.modify](#refmodify)
7. [Ref.getAndSet](#refgetandset)
8. [Ref.updateAndGet](#refupdateandget)
9. [Ref.getAndUpdate](#refgetandupdate)

### Additional known APIs (not expanded)

`makeUnsafe`, `getAndUpdateSome`, `setAndGet`, `modifySome`, `updateSome`, `updateSomeAndGet`, `getUnsafe`

### [Ref.Ref](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Ref.ts:65)

Represents mutable state whose reads and updates compose as `Effect` values.

```ts
const counter: Ref.Ref<number> = yield* Ref.make(0);
```

### [Ref.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Ref.ts:186)

Creates a `Ref` initialized with a value.

```ts
const counter = yield* Ref.make(0);
```

### [Ref.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Ref.ts:212)

Reads the current value without changing it.

```ts
const count = yield* Ref.get(counter);
```

### [Ref.set](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Ref.ts:248)

Replaces the current value.

```ts
yield* Ref.set(counter, 10);
```

### [Ref.update](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Ref.ts:612)

Updates the value with a pure function.

```ts
yield* Ref.update(counter, (count) => count + 1);
```

### [Ref.modify](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Ref.ts:490)

Atomically derives a new state and a separate result from the old state.

```ts
const previous = yield* Ref.modify(counter, (count) => [count, count + 1]);
```

### [Ref.getAndSet](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Ref.ts:283)

Sets a value and returns the previous value.

```ts
const previous = yield* Ref.getAndSet(counter, 0);
```

### [Ref.updateAndGet](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Ref.ts:651)

Updates a value and returns the new value.

```ts
const next = yield* Ref.updateAndGet(counter, (count) => count + 1);
```

### [Ref.getAndUpdate](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Ref.ts:323)

Updates a value and returns the previous value.

```ts
const previous = yield* Ref.getAndUpdate(counter, (count) => count + 1);
```
