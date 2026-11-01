# `Queue`

Source: [Effect v4 `Queue` API](https://www.effect.website/docs/v4/api/effect/Queue). Examples assume `import { Effect, Fiber, Queue } from "effect"`.

`Queue` coordinates producers and consumers through effectful offering and taking, with capacity, backpressure, shutdown, and failure semantics.

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
11. [Queue.isQueue](#queueisqueue)
12. [Queue.sliding](#queuesliding)
13. [Queue.dropping](#queuedropping)
14. [Queue.fail](#queuefail)
15. [Queue.end](#queueend)
16. [Queue.interrupt](#queueinterrupt)
17. [Queue.clear](#queueclear)
18. [Queue.takeN](#queuetaken)
19. [Queue.takeBetween](#queuetakebetween)
20. [Queue.peek](#queuepeek)
21. [Queue.isFull](#queueisfull)

### Additional known APIs (not expanded)

`isEnqueue`, `isDequeue`, `asEnqueue`, `asDequeue`, `make`, `offerUnsafe`, `offerAllUnsafe`, `failCause`, `failCauseUnsafe`, `endUnsafe`, `collect`, `takeUnsafe`, `sizeUnsafe`, `isFullUnsafe`, `into`

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

Use a bounded queue between a producer and a worker so offers apply backpressure while the worker processes jobs.

```ts
const program = Effect.gen(function*() {
  const queue = yield* Queue.bounded<string>(2);
  const worker = yield* Effect.forkChild(
    Effect.gen(function*() {
      for (let index = 0; index < 3; index++) {
        const job = yield* Queue.take(queue);
        yield* Effect.log(`processed ${job}`);
      }
    }),
  );

  yield* Queue.offerAll(queue, ["a", "b", "c"]);
  yield* Fiber.join(worker);
  yield* Queue.shutdown(queue);
});
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

### [Queue.isQueue](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:45)

Checks whether an unknown value is a queue and narrows it to the combined enqueue/dequeue interface.

```ts
const input: unknown = yield* Queue.unbounded<number>();

if (Queue.isQueue(input)) {
  console.log(yield* Queue.size(input));
}
```

### [Queue.sliding](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:526)

Creates a bounded queue that drops the oldest buffered values when a new offer arrives at capacity.

```ts
const queue = yield* Queue.sliding<number>(2);
yield* Queue.offerAll(queue, [1, 2, 3]);

const values = yield* Queue.takeAll(queue);
console.log(values); // [2, 3]
```

### [Queue.dropping](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:562)

Creates a bounded queue that rejects new offers when it is full instead of suspending the producer.

```ts
const queue = yield* Queue.dropping<number>(2);
yield* Queue.offerAll(queue, [1, 2]);

const accepted = yield* Queue.offer(queue, 3);
console.log(accepted); // false
```

### [Queue.fail](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:854)

Terminates a queue with a typed error so future takes fail with that error.

```ts
const queue = yield* Queue.bounded<number, string>(2);
yield* Queue.fail(queue, "worker stopped");

const error = yield* Effect.flip(Queue.take(queue));
console.log(error); // "worker stopped"
```

### [Queue.end](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:982)

Completes a queue after its buffered values are consumed, causing later takes to observe `Cause.Done`.

```ts
import { Cause } from "effect";

const queue = yield* Queue.bounded<number, Cause.Done>(2);
yield* Queue.offer(queue, 1);
yield* Queue.end(queue);

console.log(yield* Queue.take(queue)); // 1
```

### [Queue.interrupt](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:1077)

Stops new offers while allowing already buffered values to be drained before the queue finishes.

```ts
const queue = yield* Queue.bounded<number>(2);
yield* Queue.offer(queue, 1);
yield* Queue.interrupt(queue);

console.log(yield* Queue.take(queue)); // 1
```

### [Queue.clear](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:1171)

Removes and returns all currently buffered values without waiting for another offer.

```ts
const queue = yield* Queue.unbounded<string>();
yield* Queue.offerAll(queue, ["a", "b"]);

const values = yield* Queue.clear(queue);
console.log(values); // ["a", "b"]
```

### [Queue.takeN](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:1304)

Takes up to the requested number of values as one array.

```ts
const queue = yield* Queue.unbounded<number>();
yield* Queue.offerAll(queue, [1, 2, 3]);

const firstTwo = yield* Queue.takeN(queue, 2);
console.log(firstTwo); // [1, 2]
```

### [Queue.takeBetween](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:1346)

Takes at least `min` and at most `max` values, waiting when the minimum is not yet available.

```ts
const queue = yield* Queue.unbounded<number>();
yield* Queue.offerAll(queue, [1, 2, 3]);

const batch = yield* Queue.takeBetween(queue, 2, 5);
console.log(batch); // [1, 2, 3]
```

### [Queue.peek](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:1471)

Reads the next value without removing it from the queue.

```ts
const queue = yield* Queue.unbounded<string>();
yield* Queue.offer(queue, "job-1");

const next = yield* Queue.peek(queue);
const stillQueued = yield* Queue.take(queue);
console.log(next, stillQueued); // "job-1" "job-1"
```

### [Queue.isFull](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts:1655)

Checks whether a bounded queue currently has no remaining capacity.

```ts
const queue = yield* Queue.bounded<number>(2);
console.log(yield* Queue.isFull(queue)); // false

yield* Queue.offerAll(queue, [1, 2]);
console.log(yield* Queue.isFull(queue)); // true
```
