# `Clock`

Source: [Effect v4 `Clock` API](https://www.effect.website/docs/v4/api/effect/Clock). Examples assume `import { Clock, Effect } from "effect"`.

`Clock` provides current-time and sleep operations as an injectable service, keeping time-dependent programs replaceable in deterministic tests.

## API index

1. [Clock.Clock](#clockclock)
2. [Clock.currentTimeMillis](#clockcurrenttimemillis)
3. [Clock.currentTimeNanos](#clockcurrenttimenanos)
4. [Clock.clockWith](#clockclockwith)

### Additional known APIs (not expanded)

`currentTimeMillisUnsafe`, `currentTimeNanosUnsafe`, `sleep`

### [Clock.Clock](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Clock.ts:40)

Defines the time service used for current-time reads and sleeping; provide a test implementation to make time deterministic.

```ts
const clock = yield* Clock.Clock;
const now = clock.currentTimeMillisUnsafe();
```

### [Clock.currentTimeMillis](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Clock.ts:169)

Reads the current time in milliseconds from the active `Clock` service.

```ts
const now = yield* Clock.currentTimeMillis;
```

### [Clock.currentTimeNanos](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Clock.ts:194)

Reads the current time in nanoseconds from the active `Clock` service.

```ts
const now = yield* Clock.currentTimeNanos;
```

### [Clock.clockWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Clock.ts:141)

Accesses the full clock service when a workflow needs multiple time operations or its unsafe accessors.

```ts
const now = yield* Clock.clockWith((clock) => Effect.succeed(clock.currentTimeMillisUnsafe()));
```
