# `Pool`

Source: [Effect v4 `Pool` API](https://www.effect.website/docs/v4/api/effect/Pool). Examples assume `import { Duration, Effect, Pool } from "effect"`.

## API index

1. [Pool.make](#poolmake)
2. [Pool.makeWithTTL](#poolmakewithttl)
3. [Pool.get](#poolget)
4. [Pool.invalidate](#poolinvalidate)
5. [Pool.isPool](#poolispool)

### Additional known APIs (not expanded)

`Pool`, `Config`, `State`, `PoolItem`, `Strategy`, `makeWithStrategy`

### [Pool.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Pool.ts:220)

Creates a fixed-size scoped pool with bounded per-item concurrency. Closing the surrounding scope releases the pooled items and shuts down the pool.

```ts
const usePool = Effect.scoped(
  Effect.gen(function*() {
    const pool = yield* Pool.make({
      acquire: Effect.succeed("connection"),
      size: 4,
    });
    return yield* Pool.get(pool);
  }),
);
```

### [Pool.makeWithTTL](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Pool.ts:285)

Creates an elastic pool with minimum and maximum sizes that can reclaim unused excess items after a time-to-live.

```ts
const pool = Pool.makeWithTTL({
  acquire: Effect.succeed("connection"),
  min: 1,
  max: 8,
  timeToLive: Duration.seconds(60),
});
```

### [Pool.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Pool.ts:421)

Borrows an item for the current scope; releasing the borrow returns it to the pool for reuse.

```ts
const borrow = <E>(pool: Pool.Pool<string, E>) => Pool.get(pool);
```

### [Pool.invalidate](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Pool.ts:509)

Marks a borrowed item unusable so the pool removes it and reallocates a replacement when needed.

```ts
const discardConnection = <E>(pool: Pool.Pool<string, E>, connection: string) =>
  Pool.invalidate(pool, connection);
```

### [Pool.isPool](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Pool.ts:190)

Checks and narrows unknown input at a runtime integration boundary.

```ts
declare const candidate: unknown;
if (Pool.isPool(candidate)) {
  const pool = candidate;
}
```
