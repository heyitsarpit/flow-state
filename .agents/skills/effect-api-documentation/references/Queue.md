# `Queue`

Source: [Effect v4 `Queue` API](https://www.effect.website/docs/v4/api/effect/Queue). Examples assume `import { Effect, Queue } from "effect"`.

## API index

1. [Queue.Queue](#queuequeue)
2. [Queue.bounded](#queuebounded)
3. [Queue.unbounded](#queueunbounded)
4. [Queue.offer](#queueoffer)
5. [Queue.offerAll](#queueofferall)
6. [Queue.take](#queuetake)
7. [Queue.takeAll](#queuetakeall)
8. [Queue.poll](#queuepoll)
9. [Queue.size](#queuesize)
10. [Queue.shutdown](#queueshutdown)

### Additional known APIs (not expanded)

`isQueue`, `isEnqueue`, `isDequeue`, `asEnqueue`, `asDequeue`, `make`, `sliding`, `dropping`, `offerUnsafe`, `offerAllUnsafe`, `fail`, `failCause`, `failCauseUnsafe`, `end`, `endUnsafe`, `interrupt`, `clear`, `collect`, `takeN`, `takeBetween`, `peek`, `takeUnsafe`, `isFull`, `sizeUnsafe`, `isFullUnsafe`, `into`

### [Queue.Queue](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:296)

Combines enqueue and dequeue capabilities into a concurrent message queue.

```ts
const queue: Queue.Queue<string> = yield* Queue.bounded<string>(10);
```

### [Queue.bounded](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:491)

Creates a fixed-capacity queue that applies backpressure when full.

```ts
const queue = yield* Queue.bounded<string>(100);
```

### [Queue.unbounded](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:599)

Creates a queue without a capacity limit; producers do not wait for space.

```ts
const queue = yield* Queue.unbounded<Uint8Array>();
```

### [Queue.offer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:632)

Adds one message, suspending or applying the configured strategy when capacity is reached.

```ts
const accepted = yield* Queue.offer(queue, "job-1");
```

### [Queue.offerAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:746)

Offers many messages and returns the messages that could not be accepted.

```ts
const remaining = yield* Queue.offerAll(queue, ["job-1", "job-2"]);
```

### [Queue.take](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:1396)

Removes the next message, waiting until one is available or the queue terminates.

```ts
const job = yield* Queue.take(queue);
```

### [Queue.takeAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:1218)

Removes all currently available messages, waiting for at least one message.

```ts
const batch = yield* Queue.takeAll(queue);
```

### [Queue.poll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:1434)

Attempts a non-blocking take and returns an `Option` for the result.

```ts
const maybeJob = yield* Queue.poll(queue);
```

### [Queue.size](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:1630)

Reads the current number of buffered messages.

```ts
const pending = yield* Queue.size(queue);
```

### [Queue.shutdown](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:1114)

Shuts down the queue and interrupts waiting producers and consumers.

```ts
yield* Queue.shutdown(queue);
```
