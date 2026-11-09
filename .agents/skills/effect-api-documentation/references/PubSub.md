# `PubSub`

Source: [Effect v4 `PubSub` API](https://www.effect.website/docs/v4/api/effect/PubSub). Examples assume `import { Effect, PubSub } from "effect"` and an enclosing scoped `Effect` program.

`PubSub` broadcasts published values to multiple subscribers, with explicit buffering, backpressure, and scoped subscription lifetimes.

## API index

1. [PubSub.PubSub](#pubsubpubsub)
2. [PubSub.unbounded](#pubsubunbounded)
3. [PubSub.bounded](#pubsubbounded)
4. [PubSub.publish](#pubsubpublish)
5. [PubSub.publishAll](#pubsubpublishall)
6. [PubSub.subscribe](#pubsubsubscribe)
7. [PubSub.take](#pubsubtake)
8. [PubSub.takeAll](#pubsubtakeall)
9. [PubSub.takeUpTo](#pubsubtakeupto)
10. [PubSub.shutdown](#pubsubshutdown)

### Additional known APIs (not expanded)

`make`, `sliding`, `dropping`, `makeAtomicBounded`, `makeAtomicUnbounded`, `capacity`, `size`, `sizeUnsafe`, `isFull`, `isEmpty`, `isShutdown`, `isShutdownUnsafe`, `awaitShutdown`, `publishUnsafe`, `remaining`, `remainingUnsafe`, `BackPressureStrategy`, `DroppingStrategy`, `SlidingStrategy`

### [PubSub.PubSub](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PubSub.ts:63)

Represents a broadcast hub where each subscriber receives the publications made after it subscribes.

```ts
const hub: PubSub.PubSub<string> = yield* PubSub.unbounded();
```

### [PubSub.unbounded](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PubSub.ts:472)

Creates a pub-sub with no fixed capacity; use when losing messages is worse than unbounded buffering.

```ts
const hub = yield* PubSub.unbounded<string>();
```

### [PubSub.bounded](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PubSub.ts:322)

Creates a backpressured pub-sub with a fixed capacity.

```ts
const hub = yield* PubSub.bounded<string>(100);
```

### [PubSub.publish](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PubSub.ts:905)

Publishes one value to every current subscriber.

```ts
yield* PubSub.publish(hub, "updated");
```

### [PubSub.publishAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PubSub.ts:1023)

Publishes an iterable of values to all current subscribers.

```ts
yield* PubSub.publishAll(hub, ["created", "updated"]);
```

### [PubSub.subscribe](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PubSub.ts:1092)

Creates a scoped subscription that receives future publications.

```ts
const subscription = yield* PubSub.subscribe(hub);
```

### [PubSub.take](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PubSub.ts:1160)

Waits for and removes the next value from a subscription.

```ts
const event = yield* PubSub.take(subscription);
```

### [PubSub.takeAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PubSub.ts:1208)

Waits for one value, then drains the values currently available to a subscription.

```ts
const events = yield* PubSub.takeAll(subscription);
```

### [PubSub.takeUpTo](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PubSub.ts:1287)

Takes up to a maximum number of currently available values from a subscription.

```ts
const events = yield* PubSub.takeUpTo(subscription, 50);
```

### [PubSub.shutdown](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PubSub.ts:757)

Shuts down the pub-sub and its subscriptions.

```ts
yield* PubSub.shutdown(hub);
```
