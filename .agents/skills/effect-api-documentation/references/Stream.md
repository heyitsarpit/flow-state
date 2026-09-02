# `Stream`

Source: [Effect v4 `Stream` API](https://www.effect.website/docs/v4/api/effect/Stream). Examples assume `import { Effect, Stream } from "effect"`.

`Stream` represents a resource-safe sequence of values over time, combining incremental pulls, backpressure, effects, failure, interruption, and cleanup.

## API index

1. [Stream.Stream](#streamstream)
2. [Stream.fromIterable](#streamfromiterable)
3. [Stream.fromEffect](#streamfromeffect)
4. [Stream.map](#streammap)
5. [Stream.mapEffect](#streammapeffect)
6. [Stream.flatMap](#streamflatmap)
7. [Stream.filter](#streamfilter)
8. [Stream.merge](#streammerge)
9. [Stream.zipWith](#streamzipwith)
10. [Stream.runCollect](#streamruncollect)
11. [Stream.runForEach](#streamrunforeach)
12. [Stream.runDrain](#streamrundrain)
13. [Stream.succeed](#streamsucceed)
14. [Stream.make](#streammake)
15. [Stream.empty](#streamempty)
16. [Stream.fromQueue](#streamfromqueue)
17. [Stream.concat](#streamconcat)
18. [Stream.drain](#streamdrain)
19. [Stream.take](#streamtake)
20. [Stream.runHead](#streamrunhead)
21. [Stream.runCount](#streamruncount)

### Additional known APIs (not expanded)

`TypeId`, `isStream`, `DefaultChunkSize`, `fromChannel`, `service`, `serviceOption`, `fromEffectDrain`, `fromEffectRepeat`, `fromEffectSchedule`, `tick`, `fromPull`, `toChannel`, `callback`, `sync`, `suspend`, `fail`, `failSync`, `failCause`, `die`, `fromIteratorSucceed`, `fromArray`, `fromArrayEffect`, `fromArrays`, `fromPubSub`, `fromReadableStream`, `fromAsyncIterable`, `fromSchedule`, `fromSubscription`, `fromEventListener`, `unfold`, `paginate`, `iterate`, `range`, `never`, `unwrap`, `scoped`, `mapBoth`, `mapArray`, `flattenEffect`, `tap`, `tapBoth`, `tapSink`, `result`, `switchMap`, `flatten`, `drainFork`, `repeat`, `schedule`, `timeout`, `timeoutOrElse`, `forever`, `flattenIterable`, `flattenTake`, `prepend`, `mergeEffect`, `mergeResult`, `mergeLeft`, `mergeRight`, `mergeAll`, `cross`, `crossWith`, `zipWithArray`, `zip`, `zipLeft`, `zipRight`, `zipFlatten`, `zipWithIndex`, `zipWithNext`, `zipWithPrevious`, `zipWithPreviousAndNext`, `zipLatest`, `zipLatestWith`, `raceAll`, `race`, `filterMap`, `filterEffect`, `filterMapEffect`, `partitionQueue`, `partitionEffect`, `partition`, `when`, `peel`, `buffer`, `bufferArray`, `mapError`, `tapCause`, `tapError`, `run`, `runSum`, `runFold`, `runFoldEffect`, `runLast`, `runForEachWhile`, `runForEachArray`, `toPubSub`, `toPubSubTake`, `toQueue`, `runIntoPubSub`, `runIntoQueue`

### [Stream.Stream](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:126)

Represents a lazy, effectful sequence of values that may fail or require services.

```ts
const numbers: Stream.Stream<number> = Stream.make(1, 2, 3);
```

### [Stream.fromIterable](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:1102)

Creates a stream from any iterable, preserving its values as stream elements.

```ts
const numbers = Stream.fromIterable([1, 2, 3]);
```

### [Stream.fromEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:364)

Creates a single-element stream from an effect; the effect failure becomes the stream failure.

```ts
const user = Stream.fromEffect(Effect.succeed({ id: "u1" }));
```

### [Stream.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:1878)

Transforms each emitted element while preserving the stream's effects and failures.

```ts
const doubled = Stream.make(1, 2, 3).pipe(Stream.map((n) => n * 2));
```

### [Stream.mapEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:2020)

Transforms elements with an effectful function, including its services, failures, and concurrency options.

```ts
const enriched = Stream.make("a", "b").pipe(
  Stream.mapEffect((id) => Effect.succeed({ id })),
);
```

For bounded concurrent enrichment, pass the concurrency policy and continue composing the resulting stream.

```ts
const users = Stream.fromIterable(["u1", "u2", "u3"]).pipe(
  Stream.mapEffect(
    (id) => Effect.succeed({ id, active: true }),
    { concurrency: 2 },
  ),
  Stream.filter((user) => user.active),
);

const activeUsers = yield* Stream.runCollect(users);
```

### [Stream.flatMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:2436)

Replaces each element with a stream and flattens the resulting streams into one stream.

```ts
const expanded = Stream.make(1, 2).pipe(
  Stream.flatMap((n) => Stream.make(n, n + 10)),
);
```

### [Stream.filter](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:4306)

Keeps only elements accepted by a predicate or refinement.

```ts
const even = Stream.fromIterable([1, 2, 3, 4]).pipe(Stream.filter((n) => n % 2 === 0));
```

### [Stream.merge](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:3128)

Runs two streams concurrently and emits values from both as they arrive.

```ts
const events = Stream.merge(Stream.make("cache"), Stream.make("network"));
```

### [Stream.zipWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:3514)

Pairs corresponding elements from two streams and combines each pair with a function.

```ts
const labels = Stream.zipWith(
  Stream.make(1, 2),
  Stream.make("a", "b"),
  (n, label) => `${n}-${label}`,
);
```

### [Stream.runCollect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:10618)

Runs a stream and collects all emitted elements into an array.

```ts
const values = yield* Stream.runCollect(Stream.make(1, 2, 3));
```

### [Stream.runForEach](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:10866)

Runs an effect for every emitted element and completes when the stream completes.

```ts
yield* Stream.runForEach(Stream.make("a", "b"), (value) => Effect.log(value));
```

Use the consumer as the final stage of a filtered event pipeline when each accepted event has an effectful side effect.

```ts
const persist = (event: { readonly kind: string }) =>
  Effect.log(`persisting ${event.kind}`);

yield* Stream.fromIterable([
  { kind: "updated" },
  { kind: "ignored" },
]).pipe(
  Stream.filter((event) => event.kind === "updated"),
  Stream.runForEach(persist),
);
```

### [Stream.runDrain](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:11005)

Runs a stream for its effects while discarding all emitted values.

```ts
yield* Stream.runDrain(Stream.fromEffect(Effect.log("warm cache")));
```

### [Stream.succeed](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:827)

Creates a pure stream that emits one value and then completes.

```ts
const stream = Stream.succeed("ready");
const values = yield* Stream.runCollect(stream);
console.log(values); // ["ready"]
```

### [Stream.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:850)

Creates a pure stream from a variadic sequence of values.

```ts
const values = yield* Stream.runCollect(Stream.make(1, 2, 3));
console.log(values); // [1, 2, 3]
```

### [Stream.empty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:805)

Creates a stream that completes without emitting any values.

```ts
const values = yield* Stream.runCollect(Stream.empty);
console.log(values); // []
```

### [Stream.fromQueue](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:1293)

Creates a stream that pulls values from a queue until the queue completes or fails.

```ts
import { Cause, Effect, Queue, Stream } from "effect";

const program = Effect.gen(function*() {
  const queue = yield* Queue.unbounded<number, Cause.Done>();
  yield* Queue.offerAll(queue, [1, 2]);
  yield* Queue.end(queue);
  return yield* Stream.runCollect(Stream.fromQueue(queue));
});
```

### [Stream.concat](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:3059)

Runs one stream to completion and then emits the values from the next stream.

```ts
const values = yield* Stream.runCollect(
  Stream.concat(Stream.make(1, 2), Stream.make(3, 4)),
);
console.log(values); // [1, 2, 3, 4]
```

### [Stream.drain](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:2624)

Runs a stream while discarding its emitted values, preserving its effects and failures.

```ts
const warmed = Stream.make("cache", "index").pipe(Stream.drain);
yield* Stream.runDrain(warmed);
```

### [Stream.take](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:6328)

Keeps at most the first `n` emitted values and then ends the stream.

```ts
const values = yield* Stream.runCollect(
  Stream.range(1, 10).pipe(Stream.take(3)),
);
console.log(values); // [1, 2, 3]
```

### [Stream.runHead](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:10813)

Runs a stream and returns its first value as an `Option`.

```ts
import { Option } from "effect";

const head = yield* Stream.runHead(Stream.make("first", "second"));
if (Option.isSome(head)) {
  console.log(head.value); // "first"
}
```

### [Stream.runCount](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:10652)

Runs a stream and returns the number of values it emitted.

```ts
const count = yield* Stream.runCount(Stream.make("a", "b", "c"));
console.log(count); // 3
```
