# `SubscriptionRef`

Source: [Effect v4 `SubscriptionRef` API](https://www.effect.website/docs/v4/api/effect/SubscriptionRef). Examples assume `import { Effect, SubscriptionRef } from "effect"` and an enclosing scoped `Effect` program.

`SubscriptionRef` combines a current value with a stream of changes so consumers can read a snapshot and subscribe without a racy gap.

## API index

1. [SubscriptionRef.SubscriptionRef](#subscriptionrefsubscriptionref)
2. [SubscriptionRef.make](#subscriptionrefmake)
3. [SubscriptionRef.changes](#subscriptionrefchanges)
4. [SubscriptionRef.get](#subscriptionrefget)
5. [SubscriptionRef.set](#subscriptionrefset)
6. [SubscriptionRef.update](#subscriptionrefupdate)
7. [SubscriptionRef.updateEffect](#subscriptionrefupdateeffect)
8. [SubscriptionRef.modify](#subscriptionrefmodify)
9. [SubscriptionRef.modifyEffect](#subscriptionrefmodifyeffect)
10. [SubscriptionRef.setAndGet](#subscriptionrefsetandget)

### Additional known APIs (not expanded)

`isSubscriptionRef`, `getUnsafe`, `getAndSet`, `getAndUpdate`, `getAndUpdateEffect`, `getAndUpdateSome`, `getAndUpdateSomeEffect`, `modifySome`, `modifySomeEffect`, `updateAndGet`, `updateAndGetEffect`, `updateSome`, `updateSomeEffect`, `updateSomeAndGet`, `updateSomeAndGetEffect`

### [SubscriptionRef.SubscriptionRef](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SubscriptionRef.ts:37)

Combines mutable state with a stream of the current value and every subsequent update.

```ts
const state: SubscriptionRef.SubscriptionRef<number> = yield* SubscriptionRef.make(0);
```

### [SubscriptionRef.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SubscriptionRef.ts:111)

Creates a subscription ref and publishes its initial value to new subscribers.

```ts
const state = yield* SubscriptionRef.make("idle");
```

### [SubscriptionRef.changes](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SubscriptionRef.ts:160)

Returns a stream beginning with the current value followed by future changes.

```ts
const updates = SubscriptionRef.changes(state);
```

### [SubscriptionRef.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SubscriptionRef.ts:213)

Reads the current value.

```ts
const current = yield* SubscriptionRef.get(state);
```

### [SubscriptionRef.set](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SubscriptionRef.ts:662)

Replaces the value and publishes the new value to subscribers.

```ts
yield* SubscriptionRef.set(state, "ready");
```

### [SubscriptionRef.update](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SubscriptionRef.ts:721)

Applies a pure update and publishes the resulting value.

```ts
yield* SubscriptionRef.update(state, (status) => status.toUpperCase());
```

### [SubscriptionRef.updateEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SubscriptionRef.ts:752)

Derives the next value effectfully, then publishes it when the update succeeds.

```ts
yield* SubscriptionRef.updateEffect(state, (value) => Effect.succeed(`${value}!`));
```

### [SubscriptionRef.modify](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SubscriptionRef.ts:464)

Atomically returns a result and stores a new value, publishing the new value.

```ts
const previous = yield* SubscriptionRef.modify(state, (value) => [value, "next"]);
```

### [SubscriptionRef.modifyEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SubscriptionRef.ts:504)

Performs an effectful atomic modification and publishes the resulting state.

```ts
const result = yield* SubscriptionRef.modifyEffect(state, (value) => Effect.succeed([value, "next"]));
```

### [SubscriptionRef.setAndGet](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/SubscriptionRef.ts:690)

Sets a value, publishes it, and returns the new value.

```ts
const current = yield* SubscriptionRef.setAndGet(state, "done");
```
