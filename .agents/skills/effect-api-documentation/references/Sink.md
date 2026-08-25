# `Sink`

Source: [Effect v4 `Sink` API](https://www.effect.website/docs/v4/api/effect/Sink). Examples assume `import { Effect, Sink, Stream } from "effect"`.

## API index

1. [Sink.collect](#sinkcollect)
2. [Sink.fold](#sinkfold)
3. [Sink.reduce](#sinkreduce)
4. [Sink.take](#sinktake)
5. [Sink.find](#sinkfind)
6. [Sink.takeWhile](#sinktakewhile)
7. [Sink.head](#sinkhead)
8. [Sink.last](#sinklast)
9. [Sink.forEach](#sinkforeach)
10. [Sink.drain](#sinkdrain)
11. [Sink.map](#sinkmap)
12. [Sink.flatMap](#sinkflatmap)
13. [Sink.ignoreLeftover](#sinkignoreleftover)
14. [Sink.every](#sinkevery)
15. [Sink.some](#sinksome)
16. [Sink.fromEffect](#sinkfromeffect)
17. [Sink.toChannel](#sinktochannel)
18. [Sink.fromChannel](#sinkfromchannel)

### Additional known APIs (not expanded)

`isSink`, `fromTransform`, `make`, `fromEffectEnd`, `fromQueue`, `fromPubSub`, `succeed`, `sync`, `suspend`, `fail`, `failSync`, `failCause`, `failCauseSync`, `die`, `never`, `foldArray`, `foldUntil`, `mapInput`, `mapInputEffect`, `mapInputArray`, `mapInputArrayEffect`, `mapEnd`, `mapEffectEnd`, `mapEffect`, `mapError`, `mapLeftover`, `reduceWhile`, `reduceWhileEffect`, `reduceWhileArray`, `reduceWhileArrayEffect`, `reduceArray`, `reduceEffect`, `findEffect`, `sum`, `count`, `takeWhileFilter`, `takeWhileEffect`, `takeWhileFilterEffect`, `takeUntil`, `takeUntilEffect`, `forEachArray`, `forEachWhile`, `forEachWhileArray`, `unwrap`, `summarized`, `withDuration`, `timed`, `provideContext`, `provideService`, `orElse`, `catchCause`, `onExit`, `ensuring`

### [Sink.collect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:1539)

Collects every input element into an array when the stream should be consumed completely.

```ts
const values = Stream.run(Stream.make(1, 2, 3), Sink.collect<number>());
```

### [Sink.fold](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:723)

Accumulates input with an effectful step and can stop early, returning unconsumed values as leftovers.

```ts
const total = Sink.fold(
  () => 0,
  (sum) => sum < 10,
  (sum, value: number) => Effect.succeed(sum + value),
);
```

Run the sink against a stream when an aggregate should stop at a domain limit instead of consuming every input.

```ts
const totalUnderLimit = Stream.run(
  Stream.fromIterable([3, 4, 5, 100]),
  Sink.fold(
    () => 0,
    (sum) => sum < 10,
    (sum, value) => Effect.succeed(sum + value),
  ),
);
```

### [Sink.reduce](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:1358)

Reduces all input elements into a value with a pure accumulator.

```ts
const total = Sink.reduce(() => 0, (sum, value: number) => sum + value);
```

### [Sink.take](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:1121)

Consumes at most `n` elements and preserves any over-read elements as leftovers.

```ts
const firstTwo = Stream.run(Stream.make(1, 2, 3), Sink.take<number>(2));
```

### [Sink.find](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:1464)

Stops at the first matching input and returns it as an `Option`.

```ts
const match = Sink.find((value: number) => value > 10);
```

### [Sink.takeWhile](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:1557)

Collects the longest prefix satisfying a predicate and leaves the rest available to the next consumer.

```ts
const prefix = Sink.takeWhile((value: number) => value < 3);
```

### [Sink.head](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:1415)

Returns the first input as an `Option`, or `None` for an empty stream.

```ts
const first = Stream.run(Stream.make("a", "b"), Sink.head<string>());
```

### [Sink.last](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:1442)

Consumes the stream to completion and returns its final input as an `Option`.

```ts
const last = Stream.run(Stream.make("a", "b"), Sink.last<string>());
```

### [Sink.forEach](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:1779)

Runs an effect for every input element and completes with `void`.

```ts
const write = Sink.forEach((line: string) => Effect.log(line));
```

Attach the sink to a stream to make the consuming effect the program boundary.

```ts
const program = Stream.run(
  Stream.fromIterable(["started", "ready"]),
  Sink.forEach((line) => Effect.log(`status: ${line}`)),
);
```

### [Sink.drain](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:694)

Consumes all input when neither the values nor an aggregate result are needed.

```ts
const consumed = Stream.run(Stream.fromIterable([1, 2, 3]), Sink.drain);
```

### [Sink.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:871)

Transforms a sink result without changing how it consumes input or handles leftovers.

```ts
const count = Sink.collect<number>().pipe(Sink.map((values) => values.length));
```

### [Sink.flatMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:1174)

Uses one sink's result to choose the next sink and feeds its leftovers into that sink first.

```ts
const rest = Sink.take<number>(1).pipe(
  Sink.flatMap(() => Sink.collect<number>()),
);
```

### [Sink.ignoreLeftover](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:677)

Discards leftovers when a sink is the final consumer and no downstream stage will use them.

```ts
const firstTwoOnly = Sink.take<number>(2).pipe(Sink.ignoreLeftover);
```

### [Sink.every](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:824)

Returns `true` only when every consumed input satisfies a pure predicate.

```ts
const allPositive = Sink.every((value: number) => value > 0);
```

### [Sink.some](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:844)

Returns `true` when any consumed input satisfies a pure predicate.

```ts
const hasError = Sink.some((line: string) => line.includes("ERROR"));
```

### [Sink.fromEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:449)

Creates a sink whose result comes from an effect and which does not consume upstream input.

```ts
const version = Sink.fromEffect(Effect.succeed("v1"));
```

### [Sink.toChannel](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:281)

Exposes a sink as a low-level `Channel` for composition with channel pipelines.

```ts
const channel = Sink.toChannel(Sink.collect<number>());
```

### [Sink.fromChannel](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Sink.ts:224)

Adapts a compatible `Channel` into a sink while preserving its result and leftovers.

```ts
const sink = Sink.fromChannel(Sink.toChannel(Sink.collect<number>()));
```
