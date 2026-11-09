# `PartitionedSemaphore`

Source: [Effect v4 `PartitionedSemaphore` API](https://www.effect.website/docs/v4/api/effect/PartitionedSemaphore). Examples assume `import { Effect, PartitionedSemaphore } from "effect"`.

`PartitionedSemaphore` limits concurrent work with independent permit budgets selected by partition key.

## API index

1. [PartitionedSemaphore.PartitionedSemaphore](#partitionedsemaphorepartitionedsemaphore)
2. [PartitionedSemaphore.make](#partitionedsemaphoremake)
3. [PartitionedSemaphore.withPermits](#partitionedsemaphorewithpermits)
4. [PartitionedSemaphore.withPermit](#partitionedsemaphorewithpermit)
5. [PartitionedSemaphore.withPermitsIfAvailable](#partitionedsemaphorewithpermitsifavailable)
6. [PartitionedSemaphore.available](#partitionedsemaphoreavailable)
7. [PartitionedSemaphore.capacity](#partitionedsemaphorecapacity)
8. [PartitionedSemaphore.take](#partitionedsemaphoretake)
9. [PartitionedSemaphore.release](#partitionedsemaphorerelease)

### Additional known APIs (not expanded)

`PartitionedTypeId`, `makeUnsafe`, `Partitioned`

### [PartitionedSemaphore.PartitionedSemaphore](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PartitionedSemaphore.ts:62)

Represents a permit pool that tracks waiting and acquired work by partition key.

```ts
const limits: PartitionedSemaphore.PartitionedSemaphore<string> = yield* PartitionedSemaphore.make({ permits: 4 });
```

### [PartitionedSemaphore.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PartitionedSemaphore.ts:115)

Creates a partitioned semaphore with a shared total permit count.

```ts
const limits = yield* PartitionedSemaphore.make({ permits: 4 });
```

### [PartitionedSemaphore.withPermits](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PartitionedSemaphore.ts:462)

Runs an effect after acquiring weighted permits for a partition and releases them on exit.

```ts
const result = yield* PartitionedSemaphore.withPermits(limits, "tenant-a", 2, Effect.succeed("work"));
```

### [PartitionedSemaphore.withPermit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PartitionedSemaphore.ts:506)

Runs an effect while holding one permit for a partition.

```ts
const result = yield* PartitionedSemaphore.withPermit(limits, "tenant-a", Effect.succeed("work"));
```

### [PartitionedSemaphore.withPermitsIfAvailable](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PartitionedSemaphore.ts:544)

Runs partitioned work only when permits are immediately available, returning an `Option` otherwise.

```ts
const result = yield* PartitionedSemaphore.withPermitsIfAvailable(limits, 1, Effect.succeed("work"));
```

### [PartitionedSemaphore.available](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PartitionedSemaphore.ts:353)

Reads the number of currently available permits.

```ts
const free = yield* PartitionedSemaphore.available(limits);
```

### [PartitionedSemaphore.capacity](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PartitionedSemaphore.ts:372)

Reads the fixed total permit capacity.

```ts
const total = PartitionedSemaphore.capacity(limits);
```

### [PartitionedSemaphore.take](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PartitionedSemaphore.ts:401)

Acquires permits for a partition with explicit release control.

```ts
yield* PartitionedSemaphore.take(limits, "tenant-a", 2);
```

### [PartitionedSemaphore.release](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PartitionedSemaphore.ts:428)

Returns manually acquired permits to the shared pool.

```ts
yield* PartitionedSemaphore.release(limits, 2);
```
