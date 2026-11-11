# `PersistedQueue`

**Unstable API.** Import this module from `effect/unstable/persistence/PersistedQueue`.
The [official v4 API reference](https://www.effect.website/docs/v4/api/effect/unstable/persistence/PersistedQueue) is useful for orientation, but the local pinned source is authoritative when it differs. The local checkout currently identifies the package as `effect@4.0.0-beta.98`.

`PersistedQueue` stores schema-encoded work items in a durable queue so they can survive process restarts and be retried after failure.

## API index

1. [make](#make)
2. [PersistedQueue interface](#persistedqueue-interface)
3. [layerStoreMemory](#layerstorememory)
4. [layerStoreSql](#layerstoresql)
5. [layerStoreRedis](#layerstoreredis)
6. [PersistedQueueStore](#persistedqueuestore)
7. [layer](#layer)

### Additional known APIs (not expanded)

`TypeId`, `PersistedQueueFactory`, `makeFactory`, `PersistedQueueError`, `ErrorTypeId`, `makeStoreRedis`, `makeStoreSql`

### [make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedQueue.ts:121)

Accesses the `PersistedQueueFactory` to create a named queue whose values are encoded and decoded with the supplied schema. The returned effect requires that factory service.

```ts
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue"
import * as Schema from "effect/Schema"

const queue = PersistedQueue.make({
  name: "emails",
  schema: Schema.Struct({ to: Schema.String })
})
```

### [PersistedQueue interface](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedQueue.ts:62)

`offer` returns an id and suppresses duplicate custom ids; `take` processes one item inside a scope and requeues failed work until `maxAttempts` is reached. An interrupt does not count as a processing failure in the in-memory store implementation.

```ts
import * as Effect from "effect/Effect"
import type * as PersistedQueue from "effect/unstable/persistence/PersistedQueue"

declare const queue: PersistedQueue.PersistedQueue<{ to: string }>
const work = queue.take((item, metadata) =>
  Effect.log(`${metadata.id}: ${item.to}`)
)
```

### [layerStoreMemory](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedQueue.ts:289)

Provides a process-local and volatile queue store. A failed scoped take is requeued until its configured maximum attempt count.

```ts
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue"

const volatileStore = PersistedQueue.layerStoreMemory
```

### [layerStoreSql](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedQueue.ts:1187)

Provides a SQL-backed queue store using the SQL client, row locks, lock refresh, and completion or retry updates. The table and polling/lock durations can be configured.

```ts
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue"

const storeLayer = PersistedQueue.layerStoreSql({
  tableName: "job_queue",
  lockExpiration: "2 minutes"
})
```

### [layerStoreRedis](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedQueue.ts:726)

Provides a Redis-backed queue store with worker locks, lock refresh, polling, and a failed queue for exhausted items. It requires the module's `Redis` service.

```ts
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue"

const storeLayer = PersistedQueue.layerStoreRedis({ prefix: "jobs:" })
```

### [PersistedQueueStore](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedQueue.ts:251)

Defines the low-level `offer` and scoped `take` operations used by queue factories. Implement this service when integrating a persistence backend not supplied by the module.

```ts
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue"

const storeTag = PersistedQueue.PersistedQueueStore
```

### [layer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedQueue.ts:192)

Provides `PersistedQueueFactory` from the current `PersistedQueueStore`. Compose it with one store layer before using `PersistedQueue.make`.

```ts
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue"

const factoryLayer = PersistedQueue.layer
```
