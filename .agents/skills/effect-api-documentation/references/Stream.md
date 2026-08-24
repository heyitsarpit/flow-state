# `Stream`

Source: [Effect v4 `Stream` API](https://www.effect.website/docs/v4/api/effect/Stream). Examples assume `import { Effect, Stream } from "effect"`.

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

### Additional known APIs (not expanded)

`TypeId`, `isStream`, `DefaultChunkSize`, `fromChannel`, `service`, `serviceOption`, `fromEffectDrain`, `fromEffectRepeat`, `fromEffectSchedule`, `tick`, `fromPull`, `toChannel`, `callback`, `empty`, `make`, `sync`, `suspend`, `fail`, `failSync`, `failCause`, `die`, `fromIteratorSucceed`, `fromArray`, `fromArrayEffect`, `fromArrays`, `fromQueue`, `fromPubSub`, `fromReadableStream`, `fromAsyncIterable`, `fromSchedule`, `fromSubscription`, `fromEventListener`, `unfold`, `paginate`, `iterate`, `range`, `never`, `unwrap`, `scoped`, `mapBoth`, `mapArray`, `flattenEffect`, `tap`, `tapBoth`, `tapSink`, `result`, `switchMap`, `flatten`, `drain`, `drainFork`, `repeat`, `schedule`, `timeout`, `timeoutOrElse`, `forever`, `flattenIterable`, `flattenTake`, `concat`, `prepend`, `mergeEffect`, `mergeResult`, `mergeLeft`, `mergeRight`, `mergeAll`, `cross`, `crossWith`, `zipWithArray`, `zip`, `zipLeft`, `zipRight`, `zipFlatten`, `zipWithIndex`, `zipWithNext`, `zipWithPrevious`, `zipWithPreviousAndNext`, `zipLatest`, `zipLatestWith`, `raceAll`, `race`, `filterMap`, `filterEffect`, `filterMapEffect`, `partitionQueue`, `partitionEffect`, `partition`, `when`, `peel`, `buffer`, `bufferArray`, `mapError`, `tapCause`, `tapError`, `run`, `runCount`, `runSum`, `runFold`, `runFoldEffect`, `runHead`, `runLast`, `runForEachWhile`, `runForEachArray`, `toPubSub`, `toPubSubTake`, `toQueue`, `runIntoPubSub`, `runIntoQueue`

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

### [Stream.runDrain](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:11005)

Runs a stream for its effects while discarding all emitted values.

```ts
yield* Stream.runDrain(Stream.fromEffect(Effect.log("warm cache")));
```
