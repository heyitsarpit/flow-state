# `@effect/vitest`

Source: installed `@effect/vitest@4.1.4` (`node_modules/@effect/vitest/src/index.ts`, `src/internal/internal.ts`). Examples assume `import { assert, it, layer } from "@effect/vitest"` and `import { Effect } from "effect"`.

`@effect/vitest` is `@stability unstable` (module doc header and every export). It re-exports all of `vitest`, so `describe`, `expect` and friends come from the same import.

The `it` helpers run Effect tests. Each `it.effect` test runs in a `Scope` with `TestClock` and `TestConsole` provided. `it.live` runs in a `Scope` with the live clock.

Note: there is no `it.scoped` in 4.1.4. The `it` object has `effect`, `live`, `layer`, `prop`, `flakyTest`, plus the normal Vitest test API (`it.skip`, `it.each`, and so on). Use `it.effect` where a scoped test is wanted.

## API index

1. [it.effect](#iteffect)
2. [it.live](#itlive)
3. [it.prop and it.effect.prop](#itprop-and-iteffectprop)
4. [layer and it.layer](#layer-and-itlayer)
5. [flakyTest](#flakytest)
6. [makeMethods](#makemethods)

### Additional known APIs (not expanded)

`addEqualityTesters`, `beforeAll`, `beforeEach`, `describeWrapped`, `Vitest.Tester`, `Vitest.Methods`, `Vitest.MethodsNonLive`, `Vitest.Arbitraries`, `Vitest.TestFunction`, `API`, `it.each`, `it.skipIf`, `it.runIf`, `it.only`, `it.fails`, `it.skip`, `it.for`

### [it.effect](/Users/arpit/Developer/flow-state/node_modules/@effect/vitest/src/index.ts:259)

Registers an Effect test. The Effect runs with a `Scope`, `TestClock` and `TestConsole` provided, and the test fails if the Effect fails or dies.

Signature:

```ts
Vitest.Tester<Scope.Scope>   // interface Tester<R, ExtraContext> extends Test<R, ExtraContext>
// call form: (name: string, self: (ctx) => Effect<A, E, R>, timeout?: number | TestOptions) => void
```

Confirmed behaviour: `it.effect` is `makeTester(flow(Effect.scoped, Effect.provide(TestEnv)))` (internal.ts:490), and `TestEnv` merges `TestConsole.layer` with `TestClock.layer()` (internal.ts:68). Timeouts and interruption stop the test fiber via `runTest` (internal.ts:60-67).

Example:

```ts
import { assert, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"

it.effect("sleep finishes only when the test clock is advanced", () =>
  Effect.gen(function*() {
    const fiber = yield* Effect.sleep("1 minute").pipe(Effect.fork)
    yield* TestClock.adjust("1 minute")
    yield* Fiber.join(fiber)
    assert.isTrue(true)
  }))
```

### [it.live](/Users/arpit/Developer/flow-state/node_modules/@effect/vitest/src/index.ts:268)

Same as `it.effect` but without `TestClock` and `TestConsole`. The Effect runs in a `Scope` with live services.

Signature:

```ts
Vitest.Tester<Scope.Scope>
```

Confirmed behaviour: `live: makeTester(Effect.scoped, it)` (internal.ts:491).

Example:

```ts
import { assert, it } from "@effect/vitest"
import { Clock, Effect } from "effect"

it.live("reads the real clock", () =>
  Effect.gen(function*() {
    const now = yield* Clock.currentTimeMillis
    assert.isTrue(now > 0)
  }))
```

### [it.prop and it.effect.prop](/Users/arpit/Developer/flow-state/node_modules/@effect/vitest/src/index.ts:396)

Property tests over `Schema` or `Arbitrary` inputs. `it.prop` takes a synchronous callback. `it.effect.prop` takes an Effect callback.

Signatures:

```ts
// MethodsNonLive.prop (index.ts, Vitest.MethodsNonLive)
prop<const Arbs extends Arbitraries>(
  name: string,
  arbitraries: Arbs,
  self: (properties: { [K in keyof Arbs]: ArbitraryValue<Arbs[K]> }, ctx: TestContext) => boolean | void,
  timeout?: number | (TestOptions & { arbitrary?: Arbitrary.CheckOptions })
): void

// Tester.prop (it.effect.prop, index.ts, Vitest.Tester)
prop<const Arbs extends Arbitraries, A, E>(
  name: string,
  arbitraries: Arbs,
  self: (properties: {...}, ctx: TestContext) => Effect<A, E, R>,
  timeout?: number | (TestOptions & { arbitrary?: Arbitrary.CheckOptions })
): void
```

Confirmed behaviour:

- `Arbitraries` is an array or record whose entries are `Schema` or `Arbitrary`. Entries are compiled with `Arbitrary.schema` when they are schemas (internal.ts:98-106).
- `it.prop` throws a `TypeError` if the callback returns anything other than `boolean` or `undefined` (internal.ts:307-311). `false` and throws falsify the property.
- Falsification triggers shrinking. The failure is reported through `Arbitrary.formatCheckFailure` and raised as an `Error` (internal.ts:121-132).
- The `arbitrary` timeout option passes `Arbitrary.CheckOptions` to `Arbitrary.checkEffect` (internal.ts:95-97). `concurrency` and `runs` are the options you would tune here.
- Property callbacks receive only the base test context; they cannot request Vitest fixtures (internal.ts:239-252).

Example:

```ts
import { it } from "@effect/vitest"
import { Schema } from "effect"

it.prop("reversing twice is identity", [Schema.Array(Schema.Int)], ([values]) => {
  const twice = [...values].reverse().reverse()
  return twice.join(",") === values.join(",")
}, { arbitrary: { runs: 200 } })
```

### [layer and it.layer](/Users/arpit/Developer/flow-state/node_modules/@effect/vitest/src/index.ts:363)

Shares a `Layer` between the tests of a block. `it.layer(layer, options)` is the nested form on the `it` object; `layer(layer, options)` is the top-level form. Both return a function that takes an optional name and a callback receiving a restricted `it`.

Signature (top-level `layer`; `it.layer` has the same options with `memoMap` and `excludeTestServices`):

```ts
layer<R, E>(layer_: Layer<R, E>, options?: {
  readonly concurrent?: boolean
  readonly memoMap?: Layer.MemoMap
  readonly timeout?: Duration.Input
  readonly excludeTestServices?: boolean
  readonly buildPerTest?: boolean
}): {
  (f: (it: MethodsNonLive<R>) => void): void
  (name: string, f: (it: MethodsNonLive<R>) => void): void
}
```

Confirmed behaviour:

- Without `buildPerTest`, the layer is built once per block and released after its last test (internal.ts:372-375, `releaseAfterLastTest` at 426).
- `buildPerTest: true` builds the layer once per test with new services that are released when that test finishes. Services from an enclosing `layer` block stay shared. A build failure fails only that test (index.ts:363 doc block; internal.ts:346-361).
- Blocks nested inside a per-test block are built per test too (internal.ts:367 sets `buildPerTest` inherited).
- `timeout` has no effect on a per-test block (index.ts doc).
- Retry and repeat: a block whose tests can run more than once (`retry` or `repeats`) is released in `afterAll` rather than after its last test, because the last attempt cannot be counted (internal.ts:234-236 `runsMoreThanOnce`, internal.ts:421-426). This is the source behaviour behind the retry-leak area; the PR number was not confirmed.

Example:

```ts
import { assert, layer } from "@effect/vitest"
import { Context, Effect, Layer } from "effect"

class Foo extends Context.Service<Foo, "foo">()("Foo") {
  static layer = Layer.succeed(Foo, "foo")
}

layer(Foo.layer)("shared", (it) => {
  it.effect("reads the shared service", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* Foo, "foo")
    }))
})
```

Per-test build:

```ts
import { assert, layer } from "@effect/vitest"
import { Context, Effect, Layer, Ref } from "effect"

class Cache extends Context.Service<Cache, Ref.Ref<Array<string>>>()("Cache") {
  static layer = Layer.effect(Cache, Ref.make<Array<string>>([]))
}

layer(Layer.empty)("per test", (it) => {
  it.layer(Cache.layer, { buildPerTest: true })((it) => {
    it.effect("first test writes", () =>
      Effect.gen(function*() {
        const cache = yield* Cache
        yield* Ref.update(cache, (keys) => [...keys, "a"])
      }))
    it.effect("second test starts empty", () =>
      Effect.gen(function*() {
        assert.deepStrictEqual(yield* Ref.get(yield* Cache), [])
      }))
  })
})
```

### [flakyTest](/Users/arpit/Developer/flow-state/node_modules/@effect/vitest/src/index.ts:384)

Retries a scoped Effect to tolerate intermittent failures, dying when retries run out.

Signature:

```ts
flakyTest<A, E, R>(
  self: Effect<A, E, R | Scope>,
  timeout?: Duration.Input
): Effect<A, never, R>
```

Confirmed behaviour (internal.ts:465-480): `Effect.scoped`, then `Effect.sandbox`, then retry with `Schedule.recurs(10)` while elapsed is within `timeout` (default 30 seconds), then `Effect.orDie`.

Example:

```ts
import { assert, it } from "@effect/vitest"
import { Effect } from "effect"

it.effect("tolerates a flaky probe", () =>
  Effect.gen(function*() {
    yield* it.flakyTest(Effect.succeed(1), "5 seconds")
    assert.isTrue(true)
  }))
```

### [makeMethods](/Users/arpit/Developer/flow-state/node_modules/@effect/vitest/src/index.ts:442)

Builds the Effect test helpers around a Vitest test API that already has fixtures.

Signature:

```ts
makeMethods<ExtraContext>(it: TestAPI<ExtraContext>): Vitest.Methods<never, ExtraContext>
```

Confirmed behaviour: tests receive the fixtures they destructure. Property tests receive only the base context (index.ts doc; internal.ts:488-496).

Example:

```ts
import { assert, makeMethods, test } from "@effect/vitest"
import { Effect } from "effect"

const it = makeMethods(test.extend("config", { scope: "file" }, () => ({ port: 3000 })))

it.effect("reads the config fixture", ({ config }) =>
  Effect.sync(() => {
    assert.strictEqual(config.port, 3000)
  }))
```
