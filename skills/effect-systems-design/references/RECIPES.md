# Import-first recipes

These are the canonical code examples for this skill. Copy only the smallest recipe whose
semantics match, then verify its signatures with `$effect-ts` against the consuming package.
Detailed Effect and Phoenix evidence lives in [SOURCES.md](./SOURCES.md).

## Contents

- [Pipe and transformations](#pipe-and-transformations)
- [Option and Result](#option-and-result)
- [Collections and loops](#collections-and-loops)
- [Errors and outcomes](#errors-and-outcomes)
- [Duration and Schedule](#duration-and-schedule)
- [Services and Layers](#services-and-layers)
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
[Effect.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Effect.ts)
and Phoenix
[captureAndUpload](/Users/arpit/Developer/flow-state/docs/codebases/phoenix/packages/design-capture/src/orchestrate.ts).

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
[Option.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Option.ts),
[Result.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Result.ts), and
Phoenix
[decodeCaptureManifest](/Users/arpit/Developer/flow-state/docs/codebases/phoenix/packages/fabrika-cli/src/eval/runner.ts).

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
[Effect.test.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/test/Effect.test.ts)
and Phoenix
[peer.send](/Users/arpit/Developer/flow-state/docs/codebases/phoenix/packages/pipeline-crew-mcp/src/peer/peer.ts).

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

**Source examples:** Effect v4
[01_error-handling.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/01_effect/04_errors/01_error-handling.ts)
and Phoenix
[translateVoteMiss](/Users/arpit/Developer/flow-state/docs/codebases/phoenix/apps/web/worker/features/vote/translate-vote-miss.ts).

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
  Schedule.both(Schedule.recurs(4)),
);

const response = request.pipe(
  Effect.retry({ schedule: retryPolicy, while: (error) => error.retryable }),
  Effect.timeout(requestTimeout),
);

const heartbeatEvery = Duration.seconds(10);
const heartbeat = beat.pipe(Effect.repeat(Schedule.spaced(heartbeatEvery)));
```

The policy has a name, units, bound, backoff, and retry classifier, so a reader can review it
without reconstructing timer arithmetic.

**Source examples:** Effect v4
[10_schedules.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts)
and Phoenix
[coldStartRetrySchedule](/Users/arpit/Developer/flow-state/docs/codebases/phoenix/apps/web/worker/features/fate-live/cold-start-retry.ts).

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

**Source examples:** Effect v4
[20_layer-composition.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/01_effect/03_services/20_layer-composition.ts)
and Phoenix
[Drizzle.ts](/Users/arpit/Developer/flow-state/docs/codebases/phoenix/apps/web/worker/db/Drizzle.ts).

## State and coordination

### IF choosing current state, a one-shot gate, or an ordered mailbox

- **THEN:** Use the primitive whose name states the law: `Ref`, `Deferred`, or `Queue`.
- **CHECK:** Define atomicity for state, winner selection for the gate, and capacity,
  acknowledgment, and shutdown for the mailbox.

```ts
import { Deferred, Queue, Ref } from "effect";

const counter = Ref.make(0);
const ready = Deferred.make<void>();
const inbox = Queue.bounded<Command>(32);
```

Keep these separate in real code unless one owner genuinely coordinates all three; combining them
in a demo hides which primitive supplies which guarantee.

**Source:** Effect v4
[Ref.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Ref.ts),
[Deferred.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Deferred.ts), and
[Queue.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Queue.ts).

## Resources and fibers

### IF acquisition owns cleanup and background work

- **THEN:** Register cleanup with `acquireRelease`, then attach the worker to a parent or Scope.
- **CHECK:** Use a handshake when callers depend on startup, and close the Scope in tests.

```ts
import { Effect, Layer } from "effect";

const WorkerLive = Layer.effectDiscard(
  Effect.acquireRelease(connectWorker, (worker) => worker.close).pipe(
    Effect.flatMap((worker) => worker.run),
    Effect.forkScoped,
  ),
);
```

Acquisition, use, worker lifetime, and cleanup read in ownership order. A detached Promise would
hide every one of those relationships.

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

**Source examples:** Effect v4
[10_acquire-release.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/01_effect/05_resources/10_acquire-release.ts)
and Phoenix
[crewHeartbeatLayer](/Users/arpit/Developer/flow-state/docs/codebases/phoenix/packages/pipeline-crew-mcp/src/crew/heartbeat.ts).

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

- **THEN:** Build one `ManagedRuntime` from the host-lived Layer and dispose it from that owner.
- **CHECK:** Do not create a runtime per request, operation, or component render.

```ts
import { ManagedRuntime } from "effect";

const runtime = ManagedRuntime.make(AppLive);
const handle = (request: Request) => runtime.runPromise(route(request));
const shutdown = () => runtime.dispose();
```

**Source examples:** Effect v4
[Stream.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Stream.ts),
[ManagedRuntime.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts), and
Phoenix
[makeFateRuntime](/Users/arpit/Developer/flow-state/docs/codebases/phoenix/apps/web/worker/features/fate/layers.ts).

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

**Source examples:** Effect v4
[20_otlp-tracing.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/08_observability/20_otlp-tracing.ts)
and Phoenix
[buildRealFlags](/Users/arpit/Developer/flow-state/docs/codebases/phoenix/apps/web/worker/features/flagship/Flags.ts).

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
});
```

The checkpoint proves order and virtual time proves the deadline, so the test describes behavior
instead of depending on scheduler luck.

**Source examples:** Effect v4
[10_effect-tests.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/09_testing/10_effect-tests.ts)
and Phoenix
[heartbeat.test.ts](/Users/arpit/Developer/flow-state/docs/codebases/phoenix/packages/pipeline-crew-mcp/src/crew/heartbeat.test.ts).
