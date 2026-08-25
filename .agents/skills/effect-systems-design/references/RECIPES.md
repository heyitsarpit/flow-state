# Import-first recipes

These are the canonical use-case recipes for this skill. Copy only the smallest composition whose
semantics match, then verify exact APIs in the consuming package and its tests. Member semantics
and signatures live in the [Effect API references](../../effect-api-documentation/SKILL.md).

## Contents

- [Pipe and transformations](#pipe-and-transformations)
- [Pure pipelines, matching, and data shape](#pure-pipelines-matching-and-data-shape)
- [Option and Result](#option-and-result)
- [Collections and loops](#collections-and-loops)
- [Errors and outcomes](#errors-and-outcomes)
- [Duration and Schedule](#duration-and-schedule)
- [Services and Layers](#services-and-layers)
- [Request and RequestResolver](#request-and-requestresolver)
- [State and coordination](#state-and-coordination)
- [Resources and fibers](#resources-and-fibers)
- [Streams and host edges](#streams-and-host-edges)
- [Observability](#observability)
- [Deterministic tests](#deterministic-tests)

## Pipe and transformations

### IF lifting an existing value, a synchronous action, or lazy Effect construction

- **THEN:** Use `succeed`, `sync`, or `suspend` respectively.
- **CHECK:** Use `Effect.try` when the thunk may throw; do not suspend an already reusable Effect.

```ts
import { Effect } from "effect";

const fixed = Effect.succeed({ mode: "safe" as const });
const readAtExecution = Effect.sync(() => process.env.MODE);
const chooseAtExecution = Effect.suspend(() => (enabled ? primary : fallback));
```

### IF a transformation reads naturally from input to output

- **THEN:** Use the Effect's `.pipe(...)`; choose `map`, `tap`, and `flatMap` according to whether
  the step is pure, observes the value, or starts the next Effect.
- **CHECK:** A `map` callback must not hide a Promise or side effect.

```ts
import { Effect } from "effect";

const saved = readText.pipe(
  Effect.map((text) => text.trim()),
  Effect.filterOrFail(
    (text) => text.length > 0,
    () => new EmptyInput(),
  ),
  Effect.tap(audit),
  Effect.flatMap(save),
);
```

The readability gain is visible value flow: each line says whether it transforms, observes, or
continues the procedure. Import standalone `pipe` only for values without a `.pipe` method or when
generic pipeline construction is genuinely clearer.

### IF several dependent steps include ordinary branching

- **THEN:** Use `Effect.gen`; use `return yield*` for a terminal typed failure or interruption.
- **CHECK:** JavaScript `try/catch` around `yield*` does not catch Effect failures.

```ts
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const input = yield* readText;
  if (input.trim() === "") return yield* Effect.fail(new EmptyInput());
  yield* audit(input);
  return input.length;
});
```

### IF sequencing ignores or replaces the current success

- **THEN:** Use `andThen` to ignore it, `as` to replace it, and `asVoid` when only completion
  matters.
- **CHECK:** Use `tap` when the observer needs the value and the pipeline must retain it.

```ts
import { Effect } from "effect";

const saved = validate.pipe(Effect.andThen(write), Effect.as("saved" as const));
const notified = notify.pipe(Effect.asVoid);
```

**Source examples:** Effect v4
[Effect.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts)
and Phoenix
[captureAndUpload](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/design-capture/src/orchestrate.ts).

## Option and Result

### IF nullish data becomes composable absence

- **THEN:** Use `Option.fromNullishOr`, transform only the present value, and eliminate the Option
  at the boundary.
- **CHECK:** Use `fromUndefinedOr` or `fromNullOr` when the other nullish value is meaningful.

```ts
import { Option } from "effect";

const displayName = (raw: string | null | undefined): string =>
  Option.fromNullishOr(raw).pipe(
    Option.map((name) => name.trim()),
    Option.filter((name) => name.length > 0),
    Option.getOrElse(() => "Anonymous"),
  );
```

The wrapper earns its place because the whole normalization reads as one absence-aware pipeline.
A single fallback branch should remain `?.`, `??`, or `if`.

### IF pure synchronous work can fail

- **THEN:** Use `Result`; keep the failure a value until another Effect semantic appears.
- **CHECK:** Do not introduce Effect solely to carry a typed parse or validation error.

```ts
import { Result } from "effect";

type DecodeError = { readonly _tag: "DecodeError"; readonly cause: unknown };

const decodeJson = (text: string): Result.Result<unknown, DecodeError> =>
  Result.try({
    try: () => JSON.parse(text) as unknown,
    catch: (cause): DecodeError => ({ _tag: "DecodeError", cause }),
  });
```

### IF independent optional or result values must be combined

- **THEN:** Use `Option.all` or `Result.all`; use `Effect.fromResult`, `Effect.option`, or
  `Effect.result` only when crossing between value and Effect channels.
- **CHECK:** Give absence a domain error before using `Effect.fromOption` when
  `NoSuchElementError` would be meaningless.

```ts
import { Effect, Option, Result } from "effect";

const coordinates = Option.all({ lat: maybeLat, lon: maybeLon });
const decoded = Result.all({ config: configResult, secrets: secretsResult });
const required = Effect.fromResult(decoded);
const captured = loadUser.pipe(Effect.result);
```

**Source examples:** Effect v4
[Option.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts),
[Result.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts), and
Phoenix
[decodeCaptureManifest](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/fabrika-cli/src/eval/runner.ts).

## Collections and loops

### IF transforming an in-memory collection purely

- **THEN:** Use native collection methods or a loop.
- **CHECK:** Prefer a loop for state, early exit, pagination, or tighter allocation control.

```ts
const activeIds = users.filter((user) => user.active).map((user) => user.id);
```

### IF applying Effects to a finite collection

- **THEN:** Use `forEach` and state concurrency explicitly; use `all` for a small fixed group.
- **CHECK:** Use sequential work for ordered side effects and a finite bound for external systems.

```ts
import { Effect } from "effect";

const loaded = Effect.forEach(ids, loadById, { concurrency: 8 });
const ordered = Effect.forEach(records, writeRecord, { concurrency: 1 });
const page = Effect.all({ profile: loadProfile, settings: loadSettings }, { concurrency: 2 });
```

### IF every item must run even when some fail

- **THEN:** Pick the result shape that states the policy: `validate` accumulates failures,
  `partition` separates both sides, and `result` retains each typed outcome.
- **CHECK:** Do not accumulate operations whose side effects require fail-fast behavior.

```ts
import { Effect } from "effect";

const accumulated = Effect.validate(inputs, validateInput, { concurrency: 4 });
const separated = Effect.partition(inputs, validateInput, { concurrency: 4 });
const outcomes = Effect.forEach(inputs, (input) => validateInput(input).pipe(Effect.result));
```

**Source examples:** Effect v4
[Effect.test.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/test/Effect.test.ts)
and Phoenix
[peer.send](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/pipeline-crew-mcp/src/peer/peer.ts).

## Errors and outcomes

### IF callers recover from an expected failure

- **THEN:** Give it a stable tag and recovery fields, then catch only the tag or predicate the
  caller understands.
- **CHECK:** Do not let broad Cause handling consume defects or interruption.

```ts
import { Data, Effect } from "effect";

class NotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}

const user = loadById("42").pipe(Effect.catchTag("NotFound", () => Effect.succeed(defaultUser)));
```

### IF choosing how to change a failure

- **THEN:** Use `mapError` to translate, `catchTag`/`catchIf` to recover narrowly, and
  `orElseSucceed` only for an explicit total fallback.
- **CHECK:** Treat `orDie` as an architecture policy boundary, never an error-type shortcut.

```ts
const translated = request.pipe(Effect.mapError((cause) => new TransportError({ cause })));
const retried = request.pipe(Effect.catchIf(isRetryable, retryRequest));
const defaulted = optionalLookup.pipe(Effect.orElseSucceed(() => defaultUser));
```

Separate lines make the human choice visible; chaining all three would imply a policy the example
cannot justify.

### IF an operation's outcome must become data

- **THEN:** Use `Effect.result` for typed success/failure and `Effect.exit` for complete failure,
  defect, and interruption truth.
- **CHECK:** Keep v4 `Cause.reasons` intact until the owning boundary classifies it.

```ts
import { Effect } from "effect";

const typedOutcome = Effect.result(loadUser);
const completeOutcome = Effect.exit(loadUser);
```

See [Effect error handling](../../effect-api-documentation/references/Effect.md).

## Pure pipelines, matching, and data shape

These routes choose the smallest plain-data composition. Use the
[effect-api-documentation skill](../../effect-api-documentation/SKILL.md) for exact exports,
signatures, and member semantics; the linked `Option`, `Result`, `Match`, `Predicate`, and `Struct`
references remain the API authority.

### IF a value needs one immediate left-to-right transformation

- **THEN:** Use `pipe`; keep each step a unary pure function.
- **BECAUSE:** The value is transformed now without creating a reusable pipeline.
- **CHECK:** Use a direct call or native method when it is clearer than a pipeline.

### IF the same unary pipeline will be reused

- **THEN:** Use `flow`; use `Function.compose` when explicit function-after-function composition is
  the clearest statement of order.
- **BECAUSE:** `flow` names a reusable left-to-right pipeline, while `compose` names a deliberate
  function composition.
- **CHECK:** Verify direction and arity; do not create a reusable closure for one call.

```ts
import { Function, pipe } from "effect";

const normalized = pipe(input, trim, normalize);
const normalizeInput = Function.flow(trim, normalize);
const explicit = Function.compose(trim, normalize);
```

### IF a custom abstraction should support the same fluent `.pipe` surface

- **THEN:** Implement `Pipeable` and use `Pipeable.pipeArguments` inside the abstraction's owning
  implementation.
- **BECAUSE:** Callers can compose the abstraction without learning a second pipeline convention.
- **CHECK:** Add it only when the abstraction has stable value semantics and repeated pipeline use;
  route exact member details to the API handoff and pinned source.

### IF an `Option` or `Result` already exists

- **THEN:** Use `Option.match` or `Result.match` to handle both branches and return the boundary's
  output type.
- **BECAUSE:** Both outcomes stay visible until the caller deliberately classifies them.
- **CHECK:** Do not replace a two-branch policy with a default merely to shorten the code.

```ts
import { Option, Result } from "effect";

const optionLabel = Option.match(option, {
  onNone: () => "missing",
  onSome: (value) => `value:${value}`,
});
const resultLabel = Result.match(result, {
  onFailure: (error) => `error:${error}`,
  onSuccess: (value) => `value:${value}`,
});
```

### IF an `Option` or `Result` must be collapsed at an intentional boundary

- **THEN:** Use `getOrElse` with a policy-owned fallback.
- **BECAUSE:** The caller has explicitly decided that absence or failure no longer needs to remain
  distinguishable.
- **CHECK:** Do not use `getOrElse` in the middle of a pipeline when later code still needs the
  original outcome.

### IF a closed tagged union needs total handling

- **THEN:** Use `Match.typeTags` for a reusable total function over `_tag`, or
  `Match.tagsExhaustive` when completing a composed matcher.
- **BECAUSE:** Adding or removing a tag becomes a type-checked change at the match boundary.
- **CHECK:** Keep the union closed and make every tag handler explicit; use an ordinary `switch` for
  a small one-off union with no reusable matching policy.

### IF only some patterns intentionally apply

- **THEN:** Finish the matcher with `Match.option` when no match means `Option.none`, or
  `Match.result` when no match should remain a typed failure.
- **BECAUSE:** Partial matching preserves the distinction between “not applicable” and a chosen
  default.
- **CHECK:** Do not use a partial matcher where the domain requires exhaustive handling.

### IF input narrowing or validation is reused

- **THEN:** Build a `Predicate` refinement and compose it; use a decoder such as Schema when
  untrusted data also needs structural decoding or error reporting.
- **BECAUSE:** Reusable predicates centralize narrowing without introducing an Effect for pure
  checks.
- **CHECK:** Keep the refinement sound and test both the runtime predicate and the narrowed type.

### IF immutable record reshaping gains type-level value

- **THEN:** Use `Struct` for typed picks, omits, renames, assignments, or mapped fields.
- **BECAUSE:** Its type transformations can preserve the resulting shape more precisely than ad hoc
  object operations.
- **CHECK:** Prefer object spread, destructuring, or a plain function when native TypeScript already
  expresses the shape clearly.

### IF pure data is transformed in an Array, Record, Tuple, or Iterable

- **THEN:** Use the corresponding Effect collection module when its type/value behavior solves a
  real problem; otherwise keep native TypeScript collections and methods.
- **BECAUSE:** Pure data work does not need an Effect wrapper, and the native operation is often the
  clearest contract.
- **CHECK:** Choose the abstraction for a concrete law such as typed key preservation, tuple shape,
  or iterable composition; do not import a collection module for naming alone.

See [Function](../../effect-api-documentation/references/Function.md) and
[Pipeable](../../effect-api-documentation/references/Pipeable.md),
[Option](../../effect-api-documentation/references/Option.md),
[Result](../../effect-api-documentation/references/Result.md),
[Match](../../effect-api-documentation/references/Match.md),
[Predicate](../../effect-api-documentation/references/Predicate.md), and
[Struct](../../effect-api-documentation/references/Struct.md). Verify `pipe`, `flow`,
and `Function.compose` in the pinned
[Function.ts](../../../../codebases/effect-v4/packages/effect/src/Function.ts), `Pipeable` in
[Pipeable.ts](../../../../codebases/effect-v4/packages/effect/src/Pipeable.ts), and collection
exports in [Array.ts](../../../../codebases/effect-v4/packages/effect/src/Array.ts),
[Record.ts](../../../../codebases/effect-v4/packages/effect/src/Record.ts),
[Tuple.ts](../../../../codebases/effect-v4/packages/effect/src/Tuple.ts), and
[Iterable.ts](../../../../codebases/effect-v4/packages/effect/src/Iterable.ts).

## Duration and Schedule

### IF code names a duration, retries, or repeats

- **THEN:** Build named `Duration` values and compose a bounded `Schedule`; apply it with `retry` or
  `repeat` according to whether failures or successes drive the policy.
- **CHECK:** Retry only classified transient errors and safe-to-repeat operations.

```ts
import { Duration, Effect, Schedule } from "effect";

const requestTimeout: Duration.Input = "5 seconds";
const retryPolicy = Schedule.exponential("100 millis").pipe(
  Schedule.jittered,
  Schedule.upTo({ times: 4 }),
);

const response = request.pipe(
  Effect.retry({ schedule: retryPolicy, while: (error) => error.retryable }),
  Effect.timeout(requestTimeout),
);

const heartbeatEvery = Duration.seconds(10);
const heartbeat = beat.pipe(Effect.repeat(Schedule.spaced(heartbeatEvery)));
```

The named policy makes its units, bound, backoff, and retry classifier reviewable.

See the [Schedule API recipe](../../effect-api-documentation/references/Schedule.md).

## Services and Layers

### IF a reusable capability must travel through deep calls

- **THEN:** Define a `Context.Service`, require it where it is used, and provide its Layer at one
  composition edge.
- **CHECK:** Pass request data as arguments and leave contextual capabilities in `R`.

```ts
import { Context, Effect, Layer } from "effect";

class Users extends Context.Service<
  Users,
  {
    readonly find: (id: string) => Effect.Effect<User, UserError>;
  }
>()("app/Users") {}

const UsersTest = Layer.succeed(Users, {
  find: (id) => Effect.succeed({ id }),
});

const findUser = (id: string) => Users.pipe(Effect.flatMap((users) => users.find(id)));

const tested = findUser("42").pipe(Effect.provide(UsersTest));
```

The deepest function states the capability it needs, intermediate callers preserve `R`, and the
composition edge chooses the implementation once.

### IF the same capability needs live, test, and request-specific variants

- **THEN:** Use an effectful `Layer` for live construction, `Layer.succeed` for a test value, and
  `Effect.provideService` for one request's override.
- **CHECK:** Keep request data as arguments; use a request-scoped Layer only when its construction
  owns resources that must close with the request.

```ts
const UsersLive = Layer.effect(Users, loadUsersService);
const UsersTest = Layer.succeed(Users, { find: (id) => Effect.succeed({ id }) });

const live = findUser("42").pipe(Effect.provide(UsersLive));
const test = findUser("42").pipe(Effect.provide(UsersTest));
const requestOverride = Effect.provideService(
  findUser("42"),
  Users,
  { find: (id) => Effect.succeed({ id, source: "request" }) },
);
```

### IF a service Layer needs implementation dependencies

- **THEN:** Capture them during Layer construction and finish with `Layer.provide` so callers see
  only the remaining public requirements.
- **CHECK:** Retain a dependency with `Layer.provideMerge` only when downstream composition needs it.

```ts
const UsersLive = Layer.effect(
  Users,
  Effect.gen(function* () {
    const database = yield* Database;
    return { find: (id: string) => database.find(id) };
  }),
).pipe(Layer.provide(DatabaseLive));
```

### IF a non-Effect host runs many programs against one environment

- **THEN:** Compose the requirements into one application Layer, create one `ManagedRuntime`, and
  dispose it from the host owner.
- **CHECK:** Do not build or dispose the runtime per request, operation, or render.

```ts
import { ManagedRuntime } from "effect";

const AppLive = UsersTest;
const runtime = ManagedRuntime.make(AppLive);
const runUser = (id: string) => runtime.runPromise(findUser(id));
const shutdown = () => runtime.dispose();
```

See [Layer composition](../../effect-api-documentation/references/Layer.md) and
[ManagedRuntime](../../effect-api-documentation/references/ManagedRuntime.md).

## Request and RequestResolver

### IF many Effects ask for the same request-shaped data in one turn

- **THEN:** Define a `Request`, resolve it with `RequestResolver`, and use `Effect.request`; use a
  batched resolver when the backing operation accepts several keys at once.
- **CHECK:** Preserve entry order, complete every entry, and set delay, grouping, cache, and batch
  bounds as explicit policy.

```ts
import { Effect, Request, RequestResolver } from "effect";

interface GetUser extends Request.Request<User, UserError> {
  readonly _tag: "GetUser";
  readonly id: string;
}
const GetUser = Request.tagged<GetUser>("GetUser");
const resolver = RequestResolver.make<GetUser>((entries) =>
  Effect.gen(function* () {
    const users = yield* loadUsers(entries.map(({ request }) => request.id));
    for (const entry of entries) {
      const user = users.get(entry.request.id);
      yield* Request.completeEffect(
        entry,
        user === undefined
          ? Effect.fail(missingUser(entry.request.id))
          : Effect.succeed(user),
      );
    }
  }),
);

const getUser = (id: string) => Effect.request(GetUser({ id }), resolver);
```

Use `RequestResolver.make` when one batch performs effectful I/O and must complete each entry;
route exact resolver constructors and completion APIs to the [RequestResolver reference](../../effect-api-documentation/references/RequestResolver.md).

## State and coordination

### IF choosing current state, a one-shot gate, or an ordered mailbox

- **THEN:** Use the primitive whose name states the law: `Ref`, `Deferred`, or `Queue`.
- **CHECK:** Define atomicity for state, winner selection for the gate, and capacity,
  acknowledgment, and shutdown for the mailbox.

```ts
import { Deferred, Effect, Queue, Ref } from "effect";

const program = Effect.gen(function* () {
  const counter = yield* Ref.make(0);
  const ready = yield* Deferred.make<void>();
  const inbox = yield* Queue.bounded<Command>(32);
  return { counter, ready, inbox };
});
```

Keep these separate in real code unless one owner genuinely coordinates all three; combining them
in a demo hides which primitive supplies which guarantee.

See [Ref](../../effect-api-documentation/references/Ref.md),
[Deferred](../../effect-api-documentation/references/Deferred.md), and
[Queue](../../effect-api-documentation/references/Queue.md).

## Resources and fibers

### IF one use must acquire and release a resource

- **THEN:** Use `acquireUseRelease`; use `acquireRelease` plus `Effect.scoped` when the resource
  must remain available to several operations.
- **CHECK:** Prove release after success, typed failure, interruption, and acquisition failure.

```ts
import { Effect } from "effect";

const program = Effect.acquireUseRelease(
  connectWorker,
  (worker) => worker.run,
  (worker, _exit) => worker.close,
);
```

Acquisition, use, and cleanup remain one owned operation; a detached Promise does not.

### IF one operation needs unconditional cleanup without exposing a reusable resource

- **THEN:** Use `ensuring` for unconditional cleanup, `onExit` when cleanup needs the outcome, and
  `Effect.scoped` when the operation locally opens scoped resources.
- **CHECK:** `onExit` does not replace `acquireRelease` when successful acquisition creates the
  ownership obligation.

```ts
import { Effect } from "effect";

const alwaysClose = useHandle.pipe(Effect.ensuring(closeHandle));
const recordOutcome = operation.pipe(Effect.onExit(writeAuditRecord));
const localResourceProgram = Effect.scoped(openAndUseResource);
```

See [Effect resource management](../../effect-api-documentation/references/Effect.md).

For Layer-to-Scope-to-runtime ownership, see [ResourceManagement.md](./ResourceManagement.md).

## Streams and host edges

### IF values form a resource-safe temporal process

- **THEN:** Use Stream operators for the temporal pipeline and finish at an explicit consumer.
- **CHECK:** Define source lifetime, hot/cold behavior, buffer, overflow, completion, and bounded
  consumption.

```ts
import { Stream } from "effect";

const users = Stream.fromIterable(ids).pipe(
  Stream.map((id) => id.trim()),
  Stream.filter((id) => id.length > 0),
  Stream.mapEffect(loadById, { concurrency: 4 }),
);

const collected = users.pipe(Stream.runCollect);
```

Choose a source whose name states its production model, such as `fromIterable`, `paginate`,
`fromEffectSchedule`, or `callback`; choose `runCollect`, `runForEach`, or `runDrain` according to
what the host needs.

### IF a non-Effect host runs many programs against one environment

- **THEN:** Reuse the host-owned runtime from [Services and Layers](#services-and-layers).
- **CHECK:** Keep Promise, response, and framework conversion at this final edge.

See [Stream](../../effect-api-documentation/references/Stream.md) and
[ManagedRuntime](../../effect-api-documentation/references/ManagedRuntime.md).

## Observability

### IF a meaningful operation needs logs or a span

- **THEN:** Use `tap` for observation that preserves the value, annotations at the owning boundary,
  and `withSpan` around stable operations whose latency and failure matter.
- **CHECK:** Keep hot pure helpers untraced, bound attribute cardinality, and configure exporters
  through Layers.

```ts
import { Effect } from "effect";

const observed = loadUser.pipe(
  Effect.tap((user) => Effect.logInfo("loaded user", user.id)),
  Effect.annotateLogs("requestId", requestId),
  Effect.withSpan("users.load", { attributes: { "user.id": userId } }),
);
```

See [Layer-owned Logger](../../effect-api-documentation/references/Logger.md) and
[Tracer](../../effect-api-documentation/references/Tracer.md).

### IF logging, tracing, or metrics are application-wide policy

- **THEN:** Install exporters and formatting in the application Layer; keep operation annotations and
  spans in the Effect pipeline.
- **CHECK:** Do not thread Logger, Tracer, or Metric through domain signatures.

```ts
import { Effect, Logger } from "effect";

const ObservabilityLive = Logger.layer([Logger.consolePretty()]);
const observed = operation.pipe(Effect.provide(ObservabilityLive));
```

See [Logger](../../effect-api-documentation/references/Logger.md),
[Tracer](../../effect-api-documentation/references/Tracer.md), and
[Metric](../../effect-api-documentation/references/Metric.md).

## Deterministic tests

### IF testing time or a race

- **THEN:** Use `TestClock` for time and `Deferred` checkpoints for order.
- **CHECK:** Never use real sleeps as synchronization and close every Scope the test opens.

```ts
import { Deferred, Duration, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

const test = Effect.gen(function* () {
  const started = yield* Deferred.make<void>();
  const fiber = yield* Effect.forkChild(
    Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.sleep(Duration.seconds(10)))),
  );

  yield* Deferred.await(started);
  yield* TestClock.adjust(Duration.seconds(10));
  yield* Fiber.await(fiber);
}).pipe(Effect.provide(TestClock.layer()));
```

The checkpoint proves order and the installed virtual clock proves the deadline without scheduler
luck.

See [TestClock](../../effect-api-documentation/references/TestClock.md) and
[Effect testing](../../effect-api-documentation/references/Effect.md).
