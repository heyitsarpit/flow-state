# Runtime composition

Use a `Layer` to build services, a `ManagedRuntime` to reuse that graph across
host calls, and `NodeRuntime.runMain` at the process boundary. Keep resources
inside the owning scope, model expected failures in the error channel, and
replace time or services in tests. This guide follows the local [runtime](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/runtime.mdx:193), [platform runtime](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/platform/runtime.mdx:8), [terminal](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/platform/terminal.mdx:64), and [TestClock](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/testing/testclock.mdx:59) recipes. Official references: [runtime](https://www.effect.website/docs/v4/runtime), [platform runtime](https://www.effect.website/docs/v4/platform/runtime), [terminal](https://www.effect.website/docs/v4/platform/terminal), [TestClock](https://www.effect.website/docs/v4/testing/testclock).

## Recipe index

1. [Build one reusable application runtime](#build-one-reusable-application-runtime)
2. [Use runMain as the process boundary](#use-runmain-as-the-process-boundary)
3. [Keep resources and errors inside the main effect](#keep-resources-and-errors-inside-the-main-effect)
4. [Run the same workflow with deterministic time](#run-the-same-workflow-with-deterministic-time)

### [Build one reusable application runtime](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/runtime.mdx:193)

Build the service graph once when an external host needs to call Effect from
multiple entry points. `ManagedRuntime` owns the Layer-built context and its
resources until disposal ([ManagedRuntime.ts:273](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:273)).

```ts
import { Console, Context, Effect, Layer, ManagedRuntime } from "effect"

class Notifications extends Context.Service<
  Notifications,
  { readonly send: (message: string) => Effect.Effect<void> }
>()("Notifications") {}

const runtime = ManagedRuntime.make(
  Layer.succeed(Notifications, {
    send: (message) => Console.log(message),
  }),
)

await runtime.runPromise(Notifications.pipe(
  Effect.flatMap((service) => service.send("started")),
))
await runtime.dispose()
```

### [Use runMain as the process boundary](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/platform/runtime.mdx:8)

`NodeRuntime.runMain` owns process-level error reporting, interruption, exit
codes, and teardown. Give it the fully provided application effect rather than
calling a runner at every internal boundary ([NodeRuntime.ts:39](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/platform-node/src/NodeRuntime.ts:39)).

```ts
import { Data, Effect } from "effect"
import { NodeRuntime } from "@effect/platform-node"

class ConfigError extends Data.TaggedError("ConfigError")<{}> {}

const main = Effect.gen(function*() {
  const port = process.env.PORT
  if (!port) return yield* Effect.fail(new ConfigError())
  yield* Effect.log(`listening on ${port}`)
})

NodeRuntime.runMain(main)
```

### [Keep resources and errors inside the main effect](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/resource-management/introduction.mdx:230)

Compose the resource bracket and typed recovery before the host runner. The
runner then sees one effect whose resource lifetime and expected failures are
already explicit ([Effect.ts:6677](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6677), [Effect.ts:2703](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:2703)).

```ts
import { Data, Effect } from "effect"

class DatabaseError extends Data.TaggedError("DatabaseError")<{}> {}

const app = Effect.acquireUseRelease(
  Effect.succeed({ query: Effect.fail(new DatabaseError()) }),
  (db) => db.query,
  () => Effect.log("connection closed"),
).pipe(
  Effect.catchTag("DatabaseError", () => Effect.succeed("fallback")),
)
```

### [Run the same workflow with deterministic time](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/testing/testclock.mdx:59)

Fork time-dependent work, advance `TestClock`, and assert without sleeping in
real time. The same replacement pattern applies to service Layers and Console
implementations ([TestClock.ts:379](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestClock.ts:379), [TestClock.ts:445](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestClock.ts:445)).

```ts
import { Effect, Queue } from "effect"
import { TestClock } from "effect/testing"

const test = Effect.gen(function*() {
  const queue = yield* Queue.unbounded<string>()
  yield* Effect.sleep("1 minute").pipe(
    Effect.andThen(Queue.offer(queue, "ready")),
    Effect.forkChild,
  )
  yield* TestClock.adjust("1 minute")
  return yield* Queue.take(queue)
}).pipe(Effect.provide(TestClock.layer()))

Effect.runPromise(test) // "ready"
```
