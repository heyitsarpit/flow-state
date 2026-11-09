# `RequestResolver`

Source: [Effect v4 `RequestResolver` API](https://www.effect.website/docs/v4/api/effect/RequestResolver). Examples assume `import { Effect, Exit, Request, RequestResolver } from "effect"` and a request type named `MyRequest`.

`RequestResolver` owns the execution policy for typed requests, including batching, grouping, delay, caching, concurrency, and completion.

## API index

1. [RequestResolver.RequestResolver](#requestresolverrequestresolver)
2. [RequestResolver.make](#requestresolvermake)
3. [RequestResolver.makeWith](#requestresolvermakewith)
4. [RequestResolver.makeGrouped](#requestresolvermakegrouped)
5. [RequestResolver.fromFunction](#requestresolverfromfunction)
6. [RequestResolver.fromFunctionBatched](#requestresolverfromfunctionbatched)
7. [RequestResolver.fromEffect](#requestresolverfromeffect)
8. [RequestResolver.setDelay](#requestresolversetdelay)
9. [RequestResolver.around](#requestresolveraround)
10. [RequestResolver.batchN](#requestresolverbatchn)
11. [RequestResolver.grouped](#requestresolvergrouped)
12. [RequestResolver.race](#requestresolverrace)
13. [RequestResolver.withCache](#requestresolverwithcache)

### Additional known APIs (not expanded)

`isRequestResolver`, `fromEffectTagged`, `setDelayEffect`, `never`, `withSpan`, `asCache`, `persisted`

### [RequestResolver.RequestResolver](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:77)

Describes how batched requests are grouped, delayed, executed, and completed for `Effect.request`.

```ts
const resolver: RequestResolver.RequestResolver<MyRequest> = RequestResolver.fromEffect(
  (entry) => Effect.succeed(entry.request.id),
);
```

### [RequestResolver.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:232)

Builds a resolver from a function that receives a non-empty batch and completes every entry. The returned effect may fail with the request's error type. A successful resolver run that leaves an entry incomplete is a boundary failure for the waiting request, so every accepted entry must be completed with `Request.complete`, `entry.completeUnsafe`, or another completion helper.

```ts
const resolver = RequestResolver.make<MyRequest>((entries) =>
  Effect.sync(() => {
    for (const entry of entries) entry.completeUnsafe(Exit.succeed(entry.request.id));
  }),
);
```

### [RequestResolver.makeWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:181)

Builds a resolver with explicit batching controls: `batchKey`, optional `preCheck`, a delay effect, `collectWhile`, and the `runAll` batch runner. Use it when the simpler constructors cannot express admission or collection rules.

```ts
const resolver = RequestResolver.makeWith<MyRequest>({
  batchKey: ({ request }) => request.tenantId,
  delay: Effect.sleep("2 millis"),
  collectWhile: (entries) => entries.size < 25,
  runAll: (entries) => Effect.forEach(entries, (entry) =>
    Effect.sync(() => entry.completeUnsafe(Exit.succeed(entry.request.id))),
  ).pipe(Effect.asVoid),
})
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

Adds an in-memory LRU or FIFO cache around a resolver while preserving the resolver interface. The function returns an Effect because the cache is created when that effect runs; repeated equal request values reuse completed success or failure results up to `capacity`.

```ts
const program = Effect.gen(function*() {
  const cached = yield* RequestResolver.withCache(resolver, { capacity: 100, strategy: "lru" })
  return yield* Effect.request(MyRequest({ id: "user-1" }), cached)
})
```
