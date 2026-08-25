# Request resolution

`Request` describes one typed data lookup; `Effect.request` submits it to a
`RequestResolver`; the resolver decides how entries are delayed, grouped,
batched, cached, and completed. A request is not a promise or a database
client: the resolver is the boundary that owns backend work and must complete
every accepted entry.

## Recipe index

1. [Choose a request constructor](#choose-a-request-constructor)
2. [Execute a request through a resolver](#execute-a-request-through-a-resolver)
3. [Batch concurrent requests](#batch-concurrent-requests)
4. [Group, delay, and bound batches](#group-delay-and-bound-batches)
5. [Carry requirements through Layers](#carry-requirements-through-layers)
6. [Add in-memory caching](#add-in-memory-caching)
7. [Treat completion as a boundary contract](#treat-completion-as-a-boundary-contract)

### [Choose a request constructor](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Request.ts:327)

Use `Request.tagged` for a generated constructor with a stable `_tag`. Use
`Request.Class` when a domain class should control construction. Both retain
the request's success, typed error, and service-requirement parameters. The
tagged class form is the class-based option when a `_tag` is required.

```ts
import { Request } from "effect"

interface GetUser extends Request.Request<string, "not-found"> {
  readonly _tag: "GetUser"
  readonly id: string
}
const GetUser = Request.tagged<GetUser>("GetUser")

class GetAuditEntry extends Request.Class<{ readonly id: string }, string, "not-found"> {
  constructor(readonly id: string) {
    super({ id })
  }
}
```

### [Execute a request through a resolver](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:8457)

`Effect.request(request, resolver)` returns an effect with the request's
success, error, and service requirements. The resolver may be a ready
`RequestResolver` or an Effect that constructs one; the latter adds its own
construction error and requirements to the returned effect.

```ts
import { Effect, RequestResolver } from "effect"

const resolver = RequestResolver.fromFunction<GetUser>(
  ({ request }) => `user:${request.id}`,
)
const user = Effect.request(GetUser({ id: "user-1" }), resolver)
```

### [Batch concurrent requests](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:377)

`fromFunctionBatched` receives a non-empty batch and must return results in the
same order and length as the entries. Requests must overlap in execution and
use the same resolver and batch key to be collected together; sequentially
awaiting each request gives the resolver no batch to collect.

```ts
const resolver = RequestResolver.fromFunctionBatched<GetUser>((entries) =>
  entries.map(({ request }) => `user:${request.id}`),
)

const users = Effect.all(
  ["a", "b", "c"].map((id) => Effect.request(GetUser({ id }), resolver)),
  { concurrency: 3 },
)
```

For effectful backends, use `RequestResolver.make` or `fromEffect`; complete
each entry after the backend result is available rather than returning a list
that can be misaligned with the input entries.

### [Group, delay, and bound batches](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:279)

`makeGrouped` or `grouped` gives each batch a calculated key, `setDelay` opens a
coalescing window, and `batchN` caps the number of entries in one backend
call. These are resolver policies, so callers continue to use the same
`Effect.request` code.

```ts
import { Effect, Exit, RequestResolver } from "effect"

const byTenant = RequestResolver.makeGrouped<GetUser, string>({
  key: ({ request }) => request.id.split(":")[0]!,
  resolver: (entries) =>
    Effect.forEach(entries, (entry) =>
      Effect.sync(() => entry.completeUnsafe(Exit.succeed(`user:${entry.request.id}`))),
    ).pipe(Effect.asVoid),
})

const bounded = RequestResolver.batchN(
  RequestResolver.setDelay(byTenant, "2 millis"),
  50,
)
```

### [Carry requirements through Layers](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Request.ts:49)

The third `Request` type parameter is its service requirement. When the
request is enqueued, the request entry carries the current context so the
resolver can run request-specific work with that context. Provide those
services at the effect boundary with `Layer` or `Effect.provideService`.

```ts
import { Context, Effect, Layer, Request, RequestResolver } from "effect"

const Region = Context.Service<string>("Region")
interface GetRegionalUser extends Request.Request<string, "not-found", Region> {
  readonly _tag: "GetRegionalUser"
  readonly id: string
}
const GetRegionalUser = Request.tagged<GetRegionalUser>("GetRegionalUser")
const resolver = RequestResolver.fromFunction<GetRegionalUser>(
  ({ request }) => `user:${request.id}`,
)

const program = Effect.request(GetRegionalUser({ id: "user-1" }), resolver)
const live = Layer.succeed(Region, "us-east-1")
const runnable = program.pipe(Effect.provide(live))
```

If resolver construction itself needs services, pass an Effect that yields the
resolver to `Effect.request` and provide its Layer. The request's requirements
and the resolver-construction requirements remain distinct in the type.

### [Add in-memory caching](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:1077)

`RequestResolver.withCache` returns an Effect that creates a resolver wrapper.
The cache uses request equality as its key, stores completed successes and
failures, and evicts by `lru` or `fifo` up to `capacity`. Use `asCache` instead
when callers need the full `Cache` interface for refresh or invalidation.

```ts
const cachedProgram = Effect.gen(function*() {
  const cached = yield* RequestResolver.withCache(resolver, {
    capacity: 500,
    strategy: "lru",
  })
  return yield* Effect.request(GetUser({ id: "user-1" }), cached)
})
```

### [Treat completion as a boundary contract](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RequestResolver.ts:232)

`RequestResolver.make` receives a non-empty batch and a batch key. The runner
must complete every entry, even when the backend returns a partial result. A
runner that succeeds while leaving an entry pending makes the waiting request
fail at the resolver boundary. Use `Request.succeed`, `Request.fail`,
`Request.completeEffect`, or `entry.completeUnsafe` according to the result
you have.

Keep these failures separate:

- the request's typed error is the expected domain failure for one entry;
- the resolver's failed Effect is a backend or batch failure;
- an uncompleted entry is a resolver protocol failure;
- an interrupted resolver run interrupts waiting requests;
- a cached failure is reused like a cached success until eviction.
