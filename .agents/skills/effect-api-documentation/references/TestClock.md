# `TestClock`

Source: [Effect v4 `TestClock` API](https://www.effect.website/docs/v4/api/effect/testing/TestClock). `TestClock` is imported from `effect/testing`; examples assume `import { Effect } from "effect"` and `import { TestClock } from "effect/testing"`.

## API index

1. [TestClock.TestClock](#testclocktestclock)
2. [TestClock.layer](#testclocklayer)
3. [TestClock.adjust](#testclockadjust)
4. [TestClock.setTime](#testclocksettime)
5. [TestClock.testClockWith](#testclocktestclockwith)
6. [TestClock.make](#testclockmake)
7. [TestClock.withLive](#testclockwithlive)

### Additional known APIs (not expanded)

`TestClock.Options`, `TestClock.State`, `currentTimeMillis`, `currentTimeNanos`, `sleep`

### [TestClock.TestClock](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestClock.ts:90)

Provides a controllable `Clock` for deterministic tests of sleeps, timeouts, retries, and schedules.

```ts
const clock = yield* TestClock.testClockWith(Effect.succeed);
```

### [TestClock.layer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestClock.ts:379)

Provides a `TestClock` layer so time-based effects can be driven without real waiting.

```ts
const test = Effect.timeout(work, "1 minute").pipe(
  Effect.provide(TestClock.layer()),
);
```

### [TestClock.adjust](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestClock.ts:445)

Advances the test clock by a duration and runs sleeps scheduled up to the new time.

```ts
yield* TestClock.adjust("5 minutes");
```

### [TestClock.setTime](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestClock.ts:479)

Moves the test clock to an absolute millisecond timestamp and runs due sleeps.

```ts
yield* TestClock.setTime(60_000);
```

### [TestClock.testClockWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestClock.ts:410)

Accesses the current test clock when a test needs its service-level operations.

```ts
const now = yield* TestClock.testClockWith((clock) => clock.currentTimeMillis);
```

### [TestClock.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestClock.ts:225)

Constructs a test clock with an optional warning delay for tests that use time without advancing it.

```ts
const clock = yield* TestClock.make({ warningDelay: "2 seconds" });
```

### [TestClock.withLive](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestClock.ts:513)

Runs one effect against the real clock while the surrounding test continues using the test clock.

```ts
const actual = yield* TestClock.withLive(Clock.currentTimeMillis);
```
