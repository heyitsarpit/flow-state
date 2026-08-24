# `Fiber`

Source: [Effect v4 `Fiber` API](https://www.effect.website/docs/v4/api/effect/Fiber). Examples assume `import { Effect, Fiber } from "effect"`.

## API index

1. [Fiber.join](#fiberjoin)
2. [Fiber.await](#fiberawait)
3. [Fiber.interrupt](#fiberinterrupt)
4. [Fiber.interruptAll](#fiberinterruptall)
5. [Fiber.awaitAll](#fiberawaitall)
6. [Fiber.joinAll](#fiberjoinall)
7. [Fiber.runIn](#fiberrunin)
8. [Fiber.getCurrent](#fibergetcurrent)
9. [Fiber.isFiber](#fiberisfiber)
10. [Fiber](#fiber)

### Additional known APIs (not expanded)

`TypeId`, `Variance`, `interruptAs`, `interruptAllAs`

### [Fiber.join](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Fiber.ts:272)

Waits for a fiber and propagates its success or failure into the current effect.

```ts
const program = Effect.gen(function*() {
  const fiber = yield* Effect.forkChild(Effect.succeed(42));
  return yield* Fiber.join(fiber);
});
```

### [Fiber.await](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Fiber.ts:194)

Waits for a fiber and returns its outcome as an `Exit` without failing the current effect.

```ts
const program = Effect.gen(function*() {
  const fiber = yield* Effect.forkChild(Effect.fail("bad"));
  const exit = yield* Fiber.await(fiber);
  return exit._tag;
});
```

### [Fiber.interrupt](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Fiber.ts:346)

Interrupts a fiber and waits for its cleanup to finish.

```ts
const program = Effect.gen(function*() {
  const fiber = yield* Effect.forkChild(Effect.never);
  yield* Fiber.interrupt(fiber);
});
```

### [Fiber.interruptAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Fiber.ts:462)

Interrupts an iterable of fibers and waits for all of them to finish cleanup.

```ts
const program = Effect.gen(function*() {
  const fibers = yield* Effect.all([Effect.forkChild(Effect.never), Effect.forkChild(Effect.never)]);
  yield* Fiber.interruptAll(fibers);
});
```

### [Fiber.awaitAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Fiber.ts:230)

Collects every fiber outcome as an ordered array of `Exit` values.

```ts
const program = Effect.gen(function*() {
  const fibers = yield* Effect.all([Effect.forkChild(Effect.succeed(1)), Effect.forkChild(Effect.succeed(2))]);
  return yield* Fiber.awaitAll(fibers);
});
```

### [Fiber.joinAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Fiber.ts:298)

Joins all fibers and returns their values, failing if any fiber fails.

```ts
const program = Effect.gen(function*() {
  const fibers = yield* Effect.all([Effect.forkChild(Effect.succeed(1)), Effect.forkChild(Effect.succeed(2))]);
  return yield* Fiber.joinAll(fibers);
});
```

### [Fiber.runIn](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Fiber.ts:629)

Registers a manually managed fiber with a scope so scope closure interrupts it.

```ts
const program = Effect.scoped(
  Effect.gen(function*() {
    const fiber = yield* Effect.forkDetach(Effect.never);
    return Fiber.runIn(fiber, yield* Effect.scope);
  }),
);
```

### [Fiber.getCurrent](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Fiber.ts:605)

Returns the current fiber synchronously when called inside an active runtime fiber.

```ts
const program = Effect.sync(() => Fiber.getCurrent()?.id);
```

### [Fiber.isFiber](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Fiber.ts:571)

Checks whether an unknown value carries the runtime fiber marker.

```ts
const value: unknown = Effect.runFork(Effect.succeed(1));
const isRuntimeFiber = Fiber.isFiber(value);
```

### [Fiber](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Fiber.ts:70)

`Fiber<A, E>` is a handle for running effect work that can be joined, observed, or interrupted.

```ts
const fiber: Fiber.Fiber<number, never> = Effect.runFork(Effect.succeed(1));
```
