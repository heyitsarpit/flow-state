# `Deferred`

Source: [Effect v4 `Deferred` API](https://www.effect.website/docs/v4/api/effect/Deferred). Examples assume `import { Deferred, Effect, Fiber } from "effect"`.

`Deferred` is a one-shot synchronization cell: one fiber completes a future success or failure and other fibers await that result.

## API index

1. [Deferred.make](#deferredmake)
2. [Deferred.await](#deferredawait)
3. [Deferred.complete](#deferredcomplete)
4. [Deferred.succeed](#deferredsucceed)
5. [Deferred.fail](#deferredfail)
6. [Deferred.into](#deferredinto)
7. [Deferred.isDone](#deferredisdone)
8. [Deferred.poll](#deferredpoll)
9. [Deferred.completeWith](#deferredcompletewith)
10. [Deferred](#deferred)

### Additional known APIs (not expanded)

`TypeId`, `Variance`, `isDeferred`, `makeUnsafe`, `done`, `failSync`, `failCause`, `failCauseSync`, `die`, `dieSync`, `interrupt`, `interruptWith`, `isDoneUnsafe`, `sync`, `doneUnsafe`

### [Deferred.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Deferred.ts:183)

Allocates an empty one-shot promise that can be completed by another fiber.

```ts
const program = Effect.gen(function*() {
  const gate = yield* Deferred.make<void>();
  yield* Deferred.succeed(gate, undefined);
  yield* Deferred.await(gate);
});
```

### [Deferred.await](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Deferred.ts:230)

Suspends until the deferred is completed, then resumes with its success or failure.

```ts
const program = Effect.gen(function*() {
  const ready = yield* Deferred.make<void>();
  const worker = yield* Effect.forkChild(
    Effect.gen(function*() {
      yield* Effect.sleep("10 millis");
      yield* Deferred.succeed(ready, undefined);
      return "started";
    }),
  );

  yield* Deferred.await(ready);
  return yield* Fiber.join(worker);
});
```

### [Deferred.complete](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Deferred.ts:267)

Runs an effect once and memoizes its `Exit` result for all awaiters.

```ts
const program = Effect.gen(function*() {
  const result = yield* Deferred.make<number, string>();
  const initialization = yield* Effect.forkChild(
    Deferred.complete(
      result,
      Effect.delay("10 millis")(Effect.succeed(42)),
    ),
  );
  const values = yield* Effect.all([
    Deferred.await(result),
    Deferred.await(result),
  ]);
  yield* Fiber.join(initialization);
  return values;
});
```

### [Deferred.succeed](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Deferred.ts:772)

Completes a deferred successfully; later completion attempts return `false`.

```ts
const program = Effect.gen(function*() {
  const result = yield* Deferred.make<number>();
  const first = yield* Deferred.succeed(result, 42);
  const second = yield* Deferred.succeed(result, 99);
  return [first, second];
});
```

### [Deferred.fail](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Deferred.ts:392)

Completes a deferred with a typed failure that is observed by awaiters.

```ts
const program = Effect.gen(function*() {
  const result = yield* Deferred.make<number, string>();
  yield* Deferred.fail(result, "unavailable");
  return yield* Deferred.await(result);
});
```

### [Deferred.into](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Deferred.ts:905)

Attempts to complete a deferred with the full `Exit` produced by an effect.

```ts
const program = Effect.gen(function*() {
  const result = yield* Deferred.make<number, string>();
  yield* Deferred.into(Effect.succeed(42), result);
  return yield* Deferred.await(result);
});
```

### [Deferred.isDone](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Deferred.ts:691)

Checks completion status inside an effect.

```ts
const program = Effect.gen(function*() {
  const result = yield* Deferred.make<number>();
  return yield* Deferred.isDone(result);
});
```

### [Deferred.poll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Deferred.ts:738)

Inspects completion without waiting, returning the stored effect when present.

```ts
const program = Effect.gen(function*() {
  const result = yield* Deferred.make<number>();
  const pending = yield* Deferred.poll(result);
  return pending._tag;
});
```

### [Deferred.completeWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Deferred.ts:315)

Stores an already environment-free effect as the deferred completion without running it.

```ts
const program = Effect.gen(function*() {
  const result = yield* Deferred.make<number>();
  yield* Deferred.completeWith(result, Effect.succeed(42));
  return yield* Deferred.await(result);
});
```

### [Deferred](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Deferred.ts:71)

`Deferred<A, E>` is a one-shot synchronization cell containing a future success or failure.

```ts
const gate: Deferred.Deferred<void, never> = Deferred.makeUnsafe<void>();
```
