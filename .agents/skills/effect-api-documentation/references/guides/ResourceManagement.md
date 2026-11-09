# Resource management composition

Choose the smallest lifetime boundary that owns cleanup: bracket short work
with acquire/use/release, attach finalizers to a `Scope` for longer workflows,
and scope stream resources to consumption. These recipes follow the local
[resource introduction](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/resource-management/introduction.mdx:12), [scope](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/resource-management/scope.mdx:10), and [resourceful streams](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/stream/resourceful-streams.mdx:8) recipes. Official references: [resource management](https://www.effect.website/docs/v4/resource-management/introduction), [scope](https://www.effect.website/docs/v4/resource-management/scope), [resourceful streams](https://www.effect.website/docs/v4/stream/resourceful-streams).

## Recipe index

1. [Bracket short-lived work](#bracket-short-lived-work)
2. [Finalize a scoped workflow](#finalize-a-scoped-workflow)
3. [Rollback acquired work on failure](#rollback-acquired-work-on-failure)
4. [Tie a resource to stream consumption](#tie-a-resource-to-stream-consumption)

### [Bracket short-lived work](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/resource-management/introduction.mdx:230)

Use `Effect.acquireUseRelease` when acquisition, use, and release belong to one
operation. Release runs after success, failure, or interruption
([Effect.ts:6677](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6677)).

```ts
import { Console, Effect } from "effect"

const query = Effect.acquireUseRelease(
  Console.log("connect").pipe(Effect.as({ query: () => Effect.succeed("rows") })),
  (db) => db.query(),
  () => Console.log("close"),
)

Effect.runPromise(query) // "connect", "close"
```

### [Finalize a scoped workflow](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/resource-management/scope.mdx:57)

Use `Effect.addFinalizer` for cleanup owned by the current scope, or
`Effect.ensuring` when one effect needs an unconditional finalizer. Scope
finalizers run when the scope closes, in reverse registration order
([Effect.ts:6731](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6731), [Scope.ts:402](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Scope.ts:402)).

```ts
import { Console, Effect } from "effect"

const program = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.addFinalizer(() => Console.log("scope closed"))
    yield* Console.log("work")
  }),
)

Effect.runPromise(program) // "work", then "scope closed"
```

### [Rollback acquired work on failure](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/resource-management/scope.mdx:621)

Register each successful external mutation with `Effect.acquireRelease` and
inspect the closing `Exit`. A failed outer workflow releases successful steps
in reverse order, giving a transaction-like rollback
([Effect.ts:6545](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6545)).

```ts
import { Effect, Exit } from "effect"

const create = (name: string) =>
  Effect.acquireRelease(
    Effect.succeed(name),
    (value, exit) => Exit.isFailure(exit) ? Effect.log(`rollback ${value}`) : Effect.void,
  )

const workspace = Effect.scoped(
  Effect.gen(function*() {
    yield* create("bucket")
    yield* create("index")
    return yield* Effect.fail("database unavailable")
  }),
)
```

### [Tie a resource to stream consumption](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/stream/resourceful-streams.mdx:8)

Put the acquisition inside `Stream.scoped` so the resource stays open while
elements are emitted and closes when collection ends ([Stream.ts:1854](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:1854)). Use `Stream.ensuring` for a stream-level finalizer ([Stream.ts:9965](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts:9965)).

```ts
import { Effect, Stream } from "effect"

const stream = Stream.scoped(
  Stream.fromEffect(
    Effect.acquireRelease(
      Effect.succeed(["a", "b"]),
      () => Effect.log("close"),
    ),
  ),
).pipe(Stream.flatMap(Stream.fromIterable))

Effect.runPromise(Stream.runCollect(stream)) // ["a", "b"]
```
