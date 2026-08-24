# `Channel`

Source: [Effect v4 `Channel` API](https://www.effect.website/docs/v4/api/effect/Channel). `Channel` is an advanced low-level stream abstraction; prefer `Stream` and `Sink` until direct control of pulls, backpressure, or bidirectional composition is needed. Examples assume `import { Channel, Effect, Scope } from "effect"`.

## API index

1. [Channel.fromIterable](#channelfromiterable)
2. [Channel.map](#channelmap)
3. [Channel.mapEffect](#channelmapeffect)
4. [Channel.flatMap](#channelflatmap)
5. [Channel.filter](#channelfilter)
6. [Channel.concat](#channelconcat)
7. [Channel.merge](#channelmerge)
8. [Channel.pipeTo](#channelpipeto)
9. [Channel.buffer](#channelbuffer)
10. [Channel.interruptWhen](#channelinterruptwhen)
11. [Channel.scoped](#channelscoped)
12. [Channel.ensuring](#channelensuring)
13. [Channel.runForEach](#channelrunforeach)
14. [Channel.runCollect](#channelruncollect)
15. [Channel.runFold](#channelrunfold)
16. [Channel.toPullScoped](#channeltopullscoped)

### Additional known APIs (not expanded)

`TypeId`, `isChannel`, `fromTransform`, `transformPull`, `fromPull`, `fromTransformBracket`, `toTransform`, `DefaultChunkSize`, `callback`, `callbackArray`, `suspend`, `acquireUseRelease`, `acquireRelease`, `fromIterator`, `fromArray`, `fromChunk`, `fromIteratorArray`, `fromIterableArray`, `succeed`, `end`, `endSync`, `sync`, `empty`, `never`, `fail`, `failSync`, `failCause`, `failCauseSync`, `die`, `fromEffect`, `fromEffectDone`, `fromEffectDrain`, `fromEffectTake`, `fromQueue`, `fromQueueArray`, `identity`, `fromSubscription`, `fromSubscriptionArray`, `fromPubSub`, `fromPubSubArray`, `fromPubSubTake`, `fromSchedule`, `fromAsyncIterable`, `fromAsyncIterableArray`, `mapDone`, `mapDoneEffect`, `mapInput`, `mapInputError`, `tap`, `flatten`, `flattenArray`, `flattenTake`, `drain`, `repeat`, `forever`, `schedule`, `filterMap`, `filterEffect`, `filterMapEffect`, `filterArray`, `filterMapArray`, `filterArrayEffect`, `filterMapArrayEffect`, `mapAccum`, `scan`, `scanEffect`, `catchCause`, `tapCause`, `catchCauseIf`, `catchCauseFilter`, `tapError`, `catchIf`, `catchFilter`, `catchTag`, `catchReason`, `catchReasons`, `unwrapReason`, `orElseIfEmpty`, `mergeAll`, `mergeEffect`, `pipeToOrFail`, `embedInput`, `bufferArray`, `haltWhen`, `onError`, `onExit`, `onStart`, `onFirst`, `onEnd`, `provideContext`, `provideService`, `provideServiceEffect`, `provide`, `updateContext`, `updateService`, `withSpan`, `Do`, `bindTo`, `let`, `bind`, `runDrain`, `runForEachWhile`, `runDone`, `runHead`, `runLast`, `runFoldEffect`, `toPull`, `runIntoQueue`, `runIntoQueueArray`, `toQueue`, `toQueueArray`, `toPubSub`, `runIntoPubSub`, `runIntoPubSubArray`, `toPubSubTake`

### [Channel.fromIterable](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:778)

Creates a channel from an iterable, making a finite source available to low-level pipelines.

```ts
const source = Channel.fromIterable([1, 2, 3]);
```

### [Channel.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:1762)

Transforms each emitted element while preserving the channel's completion value and errors.

```ts
const doubled = Channel.fromIterable([1, 2, 3]).pipe(
  Channel.map((value) => value * 2),
);
```

### [Channel.mapEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:1904)

Transforms elements with effects and can bound or reorder concurrent work.

```ts
const enriched = Channel.fromIterable([1, 2, 3]).pipe(
  Channel.mapEffect((value) => Effect.succeed(value * 2), { concurrency: 2 }),
);
```

### [Channel.flatMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:2215)

Expands each output into another channel, with explicit concurrency and buffer controls for advanced pipelines.

```ts
const expanded = Channel.fromIterable([1, 2]).pipe(
  Channel.flatMap((value) => Channel.fromIterable([value, value * 10]), { concurrency: 2 }),
);
```

### [Channel.filter](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:3164)

Keeps only emitted elements that satisfy a predicate, including type-refinement support.

```ts
const even = Channel.fromIterable([1, 2, 3, 4]).pipe(
  Channel.filter((value) => value % 2 === 0),
);
```

### [Channel.concat](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:2530)

Runs one channel to completion before starting the next channel.

```ts
const ordered = Channel.concat(
  Channel.fromIterable([1, 2]),
  Channel.fromIterable([3, 4]),
);
```

### [Channel.merge](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:6130)

Runs two channels concurrently and makes the halt strategy explicit when either side ends or fails.

```ts
const merged = Channel.merge(
  Channel.fromIterable([1, 2]),
  Channel.fromIterable([3, 4]),
  { haltStrategy: "either" },
);
```

### [Channel.pipeTo](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:6515)

Connects a channel's outputs to another channel's inputs for reusable low-level stages.

```ts
const transform = Channel.identity<number, never, void>().pipe(
  Channel.map((value) => value * 2),
);
const piped = Channel.pipeTo(Channel.fromIterable([1, 2, 3]), transform);
```

### [Channel.buffer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:6747)

Buffers output elements so a faster producer can progress independently of a slower consumer.

```ts
const buffered = Channel.fromIterable([1, 2, 3]).pipe(
  Channel.buffer({ capacity: 16, strategy: "suspend" }),
);
```

### [Channel.interruptWhen](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:6869)

Stops a channel when a separate effect completes, useful for cancellation and external shutdown signals.

```ts
const timed = Channel.fromIterable([1, 2, 3]).pipe(
  Channel.interruptWhen(Effect.sleep("1 second")),
);
```

### [Channel.scoped](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:6648)

Provides a scope for channel execution and removes the channel's `Scope` requirement from its environment.

```ts
const resourceful = Channel.scoped(
  Channel.fromEffect(Effect.acquireRelease(Effect.succeed("client"), () => Effect.log("closed"))),
);
```

### [Channel.ensuring](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:7132)

Attaches a finalizer that runs when channel execution exits, including failure and interruption.

```ts
const cleaned = Channel.fromIterable([1, 2]).pipe(
  Channel.ensuring(Effect.log("channel closed")),
);
```

### [Channel.runForEach](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:7755)

Executes an effect for every output element and returns the channel's done value.

```ts
const logged = Channel.runForEach(
  Channel.fromIterable([1, 2]),
  (value) => Effect.log(value),
);
```

### [Channel.runCollect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:7834)

Runs a channel and collects all emitted elements into an array.

```ts
const values = Channel.runCollect(Channel.fromIterable([1, 2, 3]));
```

### [Channel.runFold](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:7935)

Runs a channel while folding its outputs into a pure accumulator.

```ts
const total = Channel.runFold(
  Channel.fromIterable([1, 2, 3]),
  () => 0,
  (sum, value) => sum + value,
);
```

### [Channel.toPullScoped](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Channel.ts:8102)

Converts a channel into a serialized low-level pull that remains valid while the supplied scope is open.

```ts
const next = Effect.gen(function*() {
  const scope = yield* Scope.make();
  const pull = yield* Channel.toPullScoped(Channel.fromIterable([1, 2]), scope);
  return yield* pull;
});
```
