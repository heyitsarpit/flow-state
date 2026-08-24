# `PersistedCache`

**Unstable API.** Import this module from `effect/unstable/persistence/PersistedCache`.
The [official v4 API reference](https://www.effect.website/docs/v4/api/effect/unstable/persistence/PersistedCache) is useful for orientation, but the local pinned source is authoritative when it differs. The local checkout currently identifies the package as `effect@4.0.0-beta.98`.

## API index

1. [make](#make)
2. [PersistedCache interface](#persistedcache-interface)

### Additional known APIs (not expanded)

None

### [make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedCache.ts:57)

Creates a cache for a `Persistable` request type. It checks the scoped in-memory cache, then the named persistent store, stores the lookup `Exit` with the configured TTL, and supports separate in-memory capacity and TTL settings.

```ts
import * as Effect from "effect/Effect"
import * as Persistable from "effect/unstable/persistence/Persistable"
import * as PersistedCache from "effect/unstable/persistence/PersistedCache"
import * as Schema from "effect/Schema"

const User = Persistable.Class<{ payload: { id: string } }>()("User", {
  primaryKey: ({ id }) => id,
  success: Schema.String
})
const cache = PersistedCache.make(
  (request: InstanceType<typeof User>) => Effect.succeed(request.id),
  { storeId: "users", timeToLive: () => "1 hour" }
)
```

### [PersistedCache interface](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedCache.ts:29)

Exposes `get`, `invalidate`, and the underlying in-memory `Cache`. `get` can fail with lookup, persistence, or schema errors; `invalidate` removes both persistent and in-memory entries.

```ts
import type * as PersistedCache from "effect/unstable/persistence/PersistedCache"

declare const cache: PersistedCache.PersistedCache<any>
const refresh = cache.invalidate
```
