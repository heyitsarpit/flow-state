# `RateLimiter`

**Unstable API.** Import this module from `effect/unstable/persistence/RateLimiter`.
The [official v4 API reference](https://www.effect.website/docs/v4/api/effect/unstable/persistence/RateLimiter) is useful for orientation, but the local pinned source is authoritative when it differs. The local checkout currently identifies the package as `effect@4.0.0-beta.98`.

## API index

1. [makeWithRateLimiter](#makewithratelimiter)
2. [RateLimiter service](#ratelimiter-service)
3. [makeSleep](#makesleep)
4. [make](#make)
5. [layerStoreMemory](#layerstorememory)
6. [RateLimiterStore](#ratelimiterstore)
7. [RateLimiterError](#ratelimitererror)
8. [layerStoreRedis](#layerstoreredis)

### Additional known APIs (not expanded)

`TypeId`, `layer`, `ErrorTypeId`, `RateLimitExceeded`, `RateLimitStoreError`, `RateLimiterErrorReason`, `ConsumeResult`, `AdaptivePhase`, `AdaptiveConsumeOptions`, `AdaptiveConsumeResult`, `AdaptiveFeedbackOptions`, `makeStoreRedis`, `layerStoreRedisConfig`

### [makeWithRateLimiter](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/RateLimiter.ts:261)

Provides a function that consumes tokens and wraps an effect, delaying it only when the returned `ConsumeResult.delay` is non-zero. The wrapper propagates the original effect error alongside `RateLimiterError`.

```ts
import * as Effect from "effect/Effect"
import * as RateLimiter from "effect/unstable/persistence/RateLimiter"

const program = Effect.gen(function*() {
  const withLimiter = yield* RateLimiter.makeWithRateLimiter
  return yield* withLimiter({ key: "api", limit: 10, window: "1 second" })(
    Effect.succeed("request")
  )
})
```

### [RateLimiter service](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/RateLimiter.ts:45)

The service consumes tokens for a key using `fixed-window` or `token-bucket` algorithms. `onExceeded: "fail"` returns a `RateLimiterError`; `onExceeded: "delay"` returns the wait duration in `ConsumeResult`.

```ts
import * as RateLimiter from "effect/unstable/persistence/RateLimiter"

const check = RateLimiter.RateLimiter.use((limiter) =>
  limiter.consume({ key: "api", limit: 10, window: "1 second" })
)
```

### [makeSleep](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/RateLimiter.ts:308)

Provides a function that uses the delay strategy and sleeps until the requested consumption is allowed. It returns the resulting rate-limit metadata after sleeping when necessary.

```ts
import * as Effect from "effect/Effect"
import * as RateLimiter from "effect/unstable/persistence/RateLimiter"

const waitForQuota = Effect.gen(function*() {
  const sleep = yield* RateLimiter.makeSleep
  return yield* sleep({ key: "api", limit: 10, window: "1 second" })
})
```

### [make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/RateLimiter.ts:86)

Builds a `RateLimiter` from the current `RateLimiterStore`. The limiter defaults to a fixed window, one token, and the fail-on-exceeded strategy unless the consume options override them.

```ts
import * as RateLimiter from "effect/unstable/persistence/RateLimiter"

const limiter = RateLimiter.make
```

### [layerStoreMemory](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/RateLimiter.ts:661)

Provides a process-local store for fixed-window counters, token buckets, and adaptive state. It is volatile and suitable for tests or single-process throttling.

```ts
import * as RateLimiter from "effect/unstable/persistence/RateLimiter"

const storeLayer = RateLimiter.layerStoreMemory
```

### [RateLimiterStore](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/RateLimiter.ts:581)

Defines the low-level fixed-window, token-bucket, and adaptive feedback operations used by `RateLimiter`. Provide this service to choose or implement the backing state store.

```ts
import * as RateLimiter from "effect/unstable/persistence/RateLimiter"

const storeTag = RateLimiter.RateLimiterStore
```

### [RateLimiterError](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/RateLimiter.ts:418)

Wraps either a `RateLimitExceeded` reason or a `RateLimitStoreError` reason. Inspect `error.reason._tag` to distinguish quota rejection from a backing-store failure.

```ts
import * as Duration from "effect/Duration"
import * as RateLimiter from "effect/unstable/persistence/RateLimiter"

const error = new RateLimiter.RateLimiterError({
  reason: new RateLimiter.RateLimitExceeded({
    key: "api",
    limit: 10,
    remaining: 0,
    retryAfter: Duration.seconds(1)
  })
})
```

### [layerStoreRedis](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/RateLimiter.ts:1321)

Provides a Redis-backed store that executes the fixed-window, token-bucket, and adaptive algorithms through Redis scripts. The optional prefix namespaces its keys.

```ts
import * as RateLimiter from "effect/unstable/persistence/RateLimiter"

const storeLayer = RateLimiter.layerStoreRedis({ prefix: "limits:" })
```
