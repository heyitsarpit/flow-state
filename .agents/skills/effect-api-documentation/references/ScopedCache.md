# `ScopedCache`

Source: [installed Effect rc.112 `ScopedCache` source](/Users/arpit/Developer/flow-state/node_modules/effect/src/ScopedCache.ts). Examples assume `import { Effect, ScopedCache } from "effect"` and an enclosing scoped `Effect` program.

`ScopedCache` memoizes effectful lookups while giving each cached entry its own Scope so resources are released on expiry, eviction, invalidation, or close.

## API index

1. [ScopedCache.ScopedCache](#scopedcachescopedcache)
2. [ScopedCache.make](#scopedcachemake)
3. [ScopedCache.makeWith](#scopedcachemakewith)
4. [ScopedCache.get](#scopedcacheget)
5. [ScopedCache.getOption](#scopedcachegetoption)
6. [ScopedCache.getSuccess](#scopedcachegetsuccess)
7. [ScopedCache.invalidate](#scopedcacheinvalidate)
8. [ScopedCache.refresh](#scopedcacherefresh)
9. [ScopedCache.invalidateAll](#scopedcacheinvalidateall)

### Additional known APIs (not expanded)

`State`, `Entry`, `invalidateWhen`

### [ScopedCache.ScopedCache](/Users/arpit/Developer/flow-state/node_modules/effect/src/ScopedCache.ts:32)

Represents a bounded cache whose each entry owns a child `Scope`. Entry resources are released when the entry expires, is evicted, is invalidated, or the owning Scope closes.

### [ScopedCache.make](/Users/arpit/Developer/flow-state/node_modules/effect/src/ScopedCache.ts:174)

Creates a scoped cache with one optional fixed TTL. The lookup must require `Scope.Scope` when it acquires scoped resources.

```ts
const cache = yield* ScopedCache.make({
  capacity: 100,
  lookup: (key: string) => Effect.acquireRelease(
    Effect.succeed(`resource:${key}`),
    () => Effect.void,
  ),
});
```

### [ScopedCache.makeWith](/Users/arpit/Developer/flow-state/node_modules/effect/src/ScopedCache.ts:110)

Creates a scoped cache with a TTL function that receives the lookup `Exit` and key, allowing success and failure to have different lifetimes.

```ts
const cache = yield* ScopedCache.makeWith({
  capacity: 100,
  timeToLive: (exit, key) => exit._tag === "Success" ? "1 hour" : "30 seconds",
  lookup: (key: string) => loadResource(key),
});
```

### [ScopedCache.get](/Users/arpit/Developer/flow-state/node_modules/effect/src/ScopedCache.ts:231)

Returns a cached value or runs the lookup. Concurrent misses for the same key share one in-flight lookup, and successful or failed exits are cached according to TTL.

```ts
const resource = yield* ScopedCache.get(cache, "primary");
```

### [ScopedCache.getOption](/Users/arpit/Developer/flow-state/node_modules/effect/src/ScopedCache.ts:435)

Reads only an unexpired existing entry; it returns `Option.none` without starting a lookup for a missing key.

```ts
const cached = yield* ScopedCache.getOption(cache, "primary");
```

### [ScopedCache.getSuccess](/Users/arpit/Developer/flow-state/node_modules/effect/src/ScopedCache.ts:517)

Returns `Option.some` only for a resolved successful entry; missing, failed, expired, and pending entries return `Option.none`.

```ts
const success = yield* ScopedCache.getSuccess(cache, "primary");
```

### [ScopedCache.invalidate](/Users/arpit/Developer/flow-state/node_modules/effect/src/ScopedCache.ts:825)

Removes one entry and closes its child Scope.

```ts
yield* ScopedCache.invalidate(cache, "primary");
```

### [ScopedCache.refresh](/Users/arpit/Developer/flow-state/node_modules/effect/src/ScopedCache.ts:987)

Always runs the lookup and replaces the existing entry.

```ts
const refreshed = yield* ScopedCache.refresh(cache, "primary");
```

### [ScopedCache.invalidateAll](/Users/arpit/Developer/flow-state/node_modules/effect/src/ScopedCache.ts:1124)

Removes every entry and closes every child Scope.

```ts
yield* ScopedCache.invalidateAll(cache);
```
