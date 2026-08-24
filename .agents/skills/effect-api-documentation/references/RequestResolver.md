# `RequestResolver`

Source: [Effect v4 `RequestResolver` API](https://www.effect.website/docs/v4/api/effect/RequestResolver). Examples assume `import { Effect, Exit, Request, RequestResolver } from "effect"` and a request type named `MyRequest`.

## API index

1. [RequestResolver.RequestResolver](#requestresolverrequestresolver)
2. [RequestResolver.make](#requestresolvermake)
3. [RequestResolver.makeGrouped](#requestresolvermakegrouped)
4. [RequestResolver.fromFunction](#requestresolverfromfunction)
5. [RequestResolver.fromFunctionBatched](#requestresolverfromfunctionbatched)
6. [RequestResolver.fromEffect](#requestresolverfromeffect)
7. [RequestResolver.setDelay](#requestresolversetdelay)
8. [RequestResolver.around](#requestresolveraround)
9. [RequestResolver.batchN](#requestresolverbatchn)
10. [RequestResolver.grouped](#requestresolvergrouped)
11. [RequestResolver.race](#requestresolverrace)
12. [RequestResolver.withCache](#requestresolverwithcache)

### Additional known APIs (not expanded)

`isRequestResolver`, `makeWith`, `fromEffectTagged`, `setDelayEffect`, `never`, `withSpan`, `asCache`, `persisted`

### [RequestResolver.RequestResolver](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:77)

Describes how batched requests are grouped, delayed, executed, and completed for `Effect.request`.

```ts
const resolver: RequestResolver.RequestResolver<MyRequest> = RequestResolver.fromEffect(
  (entry) => Effect.succeed(entry.request.id),
);
```

### [RequestResolver.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:232)

Builds a resolver from a function that completes every entry in a batch.

```ts
const resolver = RequestResolver.make<MyRequest>((entries) =>
  Effect.sync(() => {
    for (const entry of entries) entry.completeUnsafe(Exit.succeed(entry.request.id));
  }),
);
```

### [RequestResolver.makeGrouped](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:279)

Builds a resolver that groups entries by a key before invoking the resolver function.

```ts
const resolver = RequestResolver.makeGrouped<MyRequest, string>({
  key: ({ request }) => request.tenantId,
  resolver: (entries) => Effect.sync(() => {
    for (const entry of entries) entry.completeUnsafe(Exit.succeed(entry.request.id));
  }),
});
```

### [RequestResolver.fromFunction](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:333)

Creates a resolver from a pure function evaluated once per request entry.

```ts
const resolver = RequestResolver.fromFunction<MyRequest>((entry) => entry.request.id);
```

### [RequestResolver.fromFunctionBatched](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:377)

Creates a resolver from a pure function that returns results aligned with the batch entries.

```ts
const resolver = RequestResolver.fromFunctionBatched<MyRequest>((entries) =>
  entries.map(({ request }) => request.id),
);
```

### [RequestResolver.fromEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:428)

Creates a resolver from an effectful function evaluated for each request.

```ts
const resolver = RequestResolver.fromEffect<MyRequest>((entry) =>
  Effect.succeed(entry.request.id),
);
```

### [RequestResolver.setDelay](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:609)

Adds a duration-based delay before a batch is resolved, allowing nearby requests to coalesce.

```ts
const delayed = RequestResolver.setDelay(resolver, "5 millis");
```

### [RequestResolver.around](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:662)

Runs effects before and after each resolver batch, carrying a value from the first effect to the second.

```ts
const instrumented = RequestResolver.around(
  resolver,
  () => Effect.succeed(Date.now()),
  (_, started) => Effect.log(`batch started at ${started}`),
);
```

### [RequestResolver.batchN](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:750)

Limits the maximum number of requests handled in one resolver batch.

```ts
const bounded = RequestResolver.batchN(resolver, 50);
```

### [RequestResolver.grouped](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:810)

Adds grouping to an existing resolver using a function over request entries.

```ts
const byTenant = RequestResolver.grouped(resolver, ({ request }) => request.tenantId);
```

### [RequestResolver.race](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:869)

Runs two resolvers for a batch and uses the resolver that completes first.

```ts
const fastest = RequestResolver.race(cacheResolver, databaseResolver);
```

### [RequestResolver.withCache](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:1077)

Adds an in-memory LRU or FIFO cache around a resolver while preserving the resolver interface.

```ts
const cached = yield* RequestResolver.withCache(resolver, { capacity: 100, strategy: "lru" });
```
