# `Cache`

Source: [Effect v4 `Cache` API](https://www.effect.website/docs/v4/api/effect/Cache). Examples assume `import { Cache } from "effect"` and an enclosing `Effect.gen`.

## API index

1. [Cache.Cache](#cachecache)
2. [Cache.make](#cachemake)
3. [Cache.makeWith](#cachemakewith)
4. [Cache.get](#cacheget)
5. [Cache.getOption](#cachegetoption)
6. [Cache.getSuccess](#cachegetsuccess)
7. [Cache.set](#cacheset)
8. [Cache.has](#cachehas)
9. [Cache.invalidate](#cacheinvalidate)
10. [Cache.refresh](#cacherefresh)
11. [Cache.invalidateAll](#cacheinvalidateall)

### Additional known APIs (not expanded)

`Entry`, `invalidateWhen`, `size`, `keys`, `values`, `entries`

### [Cache.Cache](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cache.ts:103)

Represents a bounded, effectful cache that stores successful and failed lookup results.

```ts
const cache: Cache.Cache<string, number, never> = yield* Cache.make({
  capacity: 100,
  lookup: (key) => Effect.succeed(key.length),
});
```

### [Cache.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cache.ts:271)

Creates a cache with a capacity and lookup effect for missing keys.

```ts
const cache = yield* Cache.make({
  capacity: 100,
  lookup: (key: string) => Effect.succeed(key.length),
});
```

### [Cache.makeWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cache.ts:177)

Creates a cache with lower-level control over lifetime, lookup, and service timing.

```ts
const cache = yield* Cache.makeWith((key: string) => Effect.succeed(key.length), { capacity: 100 });
```

### [Cache.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cache.ts:398)

Returns a cached value or runs the lookup effect and stores its result.

```ts
const length = yield* Cache.get(cache, "effect");
```

### [Cache.getOption](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cache.ts:551)

Reads an existing cache entry without invoking the lookup for a missing key.

```ts
const cached = yield* Cache.getOption(cache, "effect");
```

### [Cache.getSuccess](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cache.ts:598)

Returns a `Some` only when an existing entry has completed successfully.

```ts
const success = yield* Cache.getSuccess(cache, "effect");
```

### [Cache.set](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cache.ts:710)

Stores a value directly, bypassing the lookup function.

```ts
yield* Cache.set(cache, "effect", 6);
```

### [Cache.has](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cache.ts:825)

Checks for a non-expired entry without running its lookup.

```ts
const present = yield* Cache.has(cache, "effect");
```

### [Cache.invalidate](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cache.ts:882)

Removes one key so its next access performs a fresh lookup.

```ts
yield* Cache.invalidate(cache, "effect");
```

### [Cache.refresh](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cache.ts:1071)

Runs the lookup for a key and replaces its cached entry with the new result.

```ts
const fresh = yield* Cache.refresh(cache, "effect");
```

### [Cache.invalidateAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cache.ts:1143)

Removes every entry from the cache.

```ts
yield* Cache.invalidateAll(cache);
```
