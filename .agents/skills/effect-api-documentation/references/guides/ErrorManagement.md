# Error management composition

Use the error channel to model expected failures, recover only the cases you
understand, retry transient work, and keep validation failures together. This
guide follows the local [expected-errors](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/error-management/expected-errors.mdx:20), [matching](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/error-management/matching.mdx:10), [retrying](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/error-management/retrying.mdx:8), and [error accumulation](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/error-management/error-accumulation.mdx:8) recipes. Official references: [expected errors](https://www.effect.website/docs/v4/error-management/expected-errors), [matching](https://www.effect.website/docs/v4/error-management/matching), [retrying](https://www.effect.website/docs/v4/error-management/retrying).

## Recipe index

1. [Model typed errors as a union](#model-typed-errors-as-a-union)
2. [Recover one tagged error](#recover-one-tagged-error)
3. [Retry only transient failures](#retry-only-transient-failures)
4. [Fall back after a retry schedule](#fall-back-after-a-retry-schedule)
5. [Accumulate validation failures](#accumulate-validation-failures)

### [Model typed errors as a union](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/error-management/expected-errors.mdx:20)

Use `Data.TaggedError` for expected domain failures. Sequential composition
preserves the union and stops at the first failure; the `Effect<A, E, R>` model
keeps success, error, and service requirements separate ([Effect.ts:116](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:116)).

```ts
import { Data, Effect } from "effect"

class InvalidInput extends Data.TaggedError("InvalidInput")<{}> {}
class UserNotFound extends Data.TaggedError("UserNotFound")<{}> {}

const validate = (id: string): Effect.Effect<string, InvalidInput> =>
  id.length > 0 ? Effect.succeed(id) : Effect.fail(new InvalidInput())
const load = (id: string): Effect.Effect<string, UserNotFound> =>
  id === "user-1" ? Effect.succeed("Ada") : Effect.fail(new UserNotFound())

const program = Effect.gen(function*() {
  const id = yield* validate("user-1")
  return yield* load(id) // Effect<string, InvalidInput | UserNotFound>
})
```

### [Recover one tagged error](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/error-management/expected-errors.mdx:123)

`Effect.catchTag` handles one member of a tagged union and leaves unmatched
errors in the error channel ([Effect.ts:2703](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:2703)). Use `catchTags` when several tags share one recovery boundary.

```ts
import { Data, Effect } from "effect"

class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly status: number
}> {}
class ValidationError extends Data.TaggedError("ValidationError")<{}> {}

const request: Effect.Effect<string, NetworkError | ValidationError> =
  Effect.fail(new NetworkError({ status: 503 }))

const recovered = request.pipe(
  Effect.catchTag("NetworkError", (error) =>
    Effect.succeed(`cached after ${error.status}`),
  ),
)
```

### [Retry only transient failures](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/error-management/retrying.mdx:39)

Retry only errors that are safe to repeat. `while` stops retrying when the
failure is permanent; defects and interruption are not typed retry failures
([Effect.ts:4040](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:4040)).

```ts
import { Data, Effect } from "effect"

class RequestError extends Data.TaggedError("RequestError")<{
  readonly retryable: boolean
}> {}

let attempts = 0
const request = Effect.failSync(() => {
  attempts++
  return new RequestError({ retryable: attempts < 2 })
})

const program = request.pipe(
  Effect.retry({ times: 5, while: (error) => error.retryable }),
)
```

### [Fall back after a retry schedule](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/error-management/retrying.mdx:96)

Use a `Schedule` for backoff or retry limits, then make the exhausted case an
explicit success or a new typed failure ([Effect.ts:4119](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:4119)).

```ts
import { Effect, Schedule } from "effect"

const request = Effect.fail("unavailable")
const program = Effect.retryOrElse(
  request,
  Schedule.recurs(2),
  (error, retries) => Effect.succeed(`${error} after ${retries} retries`),
)

Effect.runSync(program) // "unavailable after 2 retries"
```

### [Accumulate validation failures](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/error-management/error-accumulation.mdx:8)

Use `Effect.validate` when every input must be checked and all failures should
be reported together. Use ordinary `Effect.all` or `forEach` when fail-fast
execution is the desired behavior ([Effect.ts:606](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:606)).

```ts
import { Effect } from "effect"

const checked = Effect.validate([1, 2, 3, 4], (value) =>
  value % 2 === 0
    ? Effect.succeed(value)
    : Effect.fail(`${value} is not even`),
)

Effect.runSyncExit(checked) // Exit.fail(["1 is not even", "3 is not even"])
```
