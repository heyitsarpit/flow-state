# `Effect`

Source: [Effect v4 `Effect` API](https://www.effect.website/docs/v4/api/effect/Effect). Examples import modules as needed.

## API index

1. [Effect.Effect](#effecteffect)
2. [Effect.Success](#effectsuccess)
3. [Effect.Error](#effecterror)
4. [Effect.Services](#effectservices)
5. [Effect.sync](#effectsync)
6. [Effect.suspend](#effectsuspend)
7. [Effect.gen](#effectgen)
8. [Effect.map](#effectmap)
9. [Effect.flatMap](#effectflatmap)
10. [Effect.tap](#effecttap)
11. [Effect.all](#effectall)
12. [Effect.zip](#effectzip)
13. [Effect.zipWith](#effectzipwith)
14. [Effect.tryPromise](#effecttrypromise)
15. [Effect.promise](#effectpromise)
16. [Effect.succeed](#effectsucceed)
17. [Effect.fail](#effectfail)
18. [Effect.catch](#effectcatch)
19. [Effect.catchTag](#effectcatchtag)
20. [Effect.mapError](#effectmaperror)
21. [Effect.retry](#effectretry)
22. [Effect.timeout](#effecttimeout)
23. [Effect.sleep](#effectsleep)
24. [Effect.race](#effectrace)
25. [Effect.match](#effectmatch)
26. [Effect.matchEffect](#effectmatcheffect)
27. [Effect.provide](#effectprovide)
28. [Effect.provideContext](#effectprovidecontext)
29. [Effect.service](#effectservice)
30. [Effect.serviceOption](#effectserviceoption)
31. [Effect.contextWith](#effectcontextwith)
32. [Effect.provideService](#effectprovideservice)
33. [Effect.request](#effectrequest)
34. [Effect.acquireRelease](#effectacquirerelease)
35. [Effect.acquireUseRelease](#effectacquireuserelease)
36. [Effect.ensuring](#effectensuring)
37. [Effect.onExit](#effectonexit)
38. [Effect.addFinalizer](#effectaddfinalizer)
39. [Effect.scoped](#effectscoped)
40. [Effect.forkChild](#effectforkchild)
41. [Effect.runPromise](#effectrunpromise)
42. [Effect.runPromiseExit](#effectrunpromiseexit)
43. [Effect.runSync](#effectrunsync)
44. [Effect.runForkWith](#effectrunforkwith)
45. [Effect.fn](#effectfn)
46. [Effect.fnUntraced](#effectfnuntraced)
47. [Effect.callback](#effectcallback)

### Additional known APIs (not expanded)

`isEffect`, `partition`, `validate`, `findFirst`, `findFirstFilter`, `forEach`, `whileLoop`, `succeedNone`, `succeedSome`, `Do`, `bindTo`, `bind`, `failSync`, `failCause`, `failCauseSync`, `die`, `dieSync`, `yieldNow`, `never`, `fromResult`, `fromOption`, `fromNullishOr`, `transposeOption`, `flatten`, `andThen`, `result`, `option`, `exit`, `as`, `asSome`, `asVoid`, `flip`, `catchTags`, `catchReason`, `catchReasons`, `catchCause`, `catchDefect`, `catchIf`, `mapBoth`, `orDie`, `tapError`, `retryOrElse`, `eventually`, `ignore`, `ignoreCause`, `orElseSucceed`, `firstSuccessOf`, `timeoutOption`, `timeoutOrElse`, `delay`, `timed`, `raceFirst`, `raceAll`, `raceAllFirst`, `filter`, `filterMap`, `filterOrElse`, `filterOrFail`, `when`, `context`, `setContext`, `updateContext`, `updateService`, `provideServiceEffect`, `withConcurrency`, `scopedWith`, `acquireDisposable`, `onError`, `cached`, `cachedWithTTL`, `interrupt`, `interruptible`, `onInterrupt`, `uninterruptible`, `uninterruptibleMask`, `forever`, `repeat`, `replicate`, `schedule`, `tracer`, `withTracer`, `makeSpan`, `withSpan`, `forkScoped`, `forkDetach`, `awaitAllChildren`, `fiber`, `fiberId`, `runFork`, `runCallback`

### [Effect.Effect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:116)

`Effect<A, E, R>` describes a computation that may succeed with `A`, fail with `E`, and require services `R`.

```ts
const program: Effect.Effect<string, never, never> = Effect.succeed("ready");
```

### [Effect.Success](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:173)

Extracts `A`, the success type, from an `Effect` type.

```ts
declare const program: Effect.Effect<number, Error, never>;
type A = Effect.Success<typeof program>; // number
```

### [Effect.Error](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:194)

Extracts `E`, the typed failure type, from an `Effect` type.

```ts
declare const program: Effect.Effect<number, Error, never>;
type E = Effect.Error<typeof program>; // Error
```

### [Effect.Services](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:211)

Extracts `R`, the required services type, from an `Effect` type. The [Effect type recipe](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/getting-started/the-effect-type.mdx) demonstrates extracting `A`, `E`, and `R` together.

```ts
const Logger = Context.Service<{ readonly log: (message: string) => void }>("Logger");
declare const program: Effect.Effect<number, Error, typeof Logger>;
type R = Effect.Services<typeof program>; // typeof Logger
```

### [Effect.sync](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:1141)

Creates a lazy effect from a synchronous computation that does not reject through the typed error channel.

```ts
const now = Effect.sync(() => Date.now());
```

### [Effect.suspend](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:1101)

Defers construction of an effect until the effect runs, which is useful for branching or recursive effect definitions.

```ts
const divide = (a: number, b: number) => Effect.suspend(() =>
  b === 0 ? Effect.fail("division by zero") : Effect.succeed(a / b),
);
```

### [Effect.gen](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:1405)

Builds a readable sequential workflow by yielding `Effect` values.

```ts
const program = Effect.gen(function*() {
  const user = yield* Effect.succeed({ id: "u1" });
  return user.id;
});
```

### [Effect.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:2356)

Transforms a successful value while preserving the effect's failure and service requirements.

```ts
const length = Effect.succeed("hello").pipe(Effect.map((value) => value.length));
```

### [Effect.flatMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:1958)

Sequences an effectful function without nesting effects.

```ts
const user = Effect.succeed("u1").pipe(
  Effect.flatMap((id) => Effect.succeed({ id })),
);
```

### [Effect.tap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:2135)

Runs an effectful observation after success while preserving the original success value.

```ts
const observed = Effect.succeed(42).pipe(
  Effect.tap((value) => Effect.log(`value=${value}`)),
);
```

### [Effect.all](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:514)

Runs a collection or record of effects and combines their successful values.

```ts
const config = Effect.all({ host: Effect.succeed("localhost"), port: Effect.succeed(8080) });
```

### [Effect.zip](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:2543)

Runs two effects and combines their successful values into a tuple.

```ts
const pair = Effect.zip(Effect.succeed(1), Effect.succeed("one"));
```

### [Effect.zipWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:2602)

Runs two effects and combines their successful values with a function.

```ts
const total = Effect.zipWith(Effect.succeed(2), Effect.succeed(3), (a, b) => a + b);
```

### [Effect.tryPromise](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:943)

Lifts a rejecting or throwing promise computation into the typed error channel.

```ts
const fetchUser = (id: string) => Effect.tryPromise(() => fetch(`/users/${id}`));
```

### [Effect.promise](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:869)

Lifts an asynchronous computation known not to reject into an `Effect`.

```ts
const now = Effect.promise(() => Promise.resolve(Date.now()));
```

### [Effect.succeed](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:973)

Creates an effect that succeeds with a value.

```ts
const ready = Effect.succeed({ status: "ready" as const });
```

### [Effect.fail](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:1478)

Creates an effect that fails with a recoverable, typed error.

```ts
const missing = Effect.fail({ _tag: "MissingUser" as const, id: "u1" });
```

### [Effect.catch](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:2656)

Recovers from any typed failure with a fallback effect while leaving defects outside the typed error channel.

```ts
const recovered = Effect.catch(Effect.fail("missing"), () => Effect.succeed("fallback"));
```

### [Effect.catchTag](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:2703)

Recovers from one tagged error while preserving exhaustive typed error handling.

```ts
const recovered = missing.pipe(
  Effect.catchTag("MissingUser", () => Effect.succeed({ id: "fallback" })),
);
```

### [Effect.mapError](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:3533)

Transforms the typed failure channel while preserving success and service requirements.

```ts
const typed = Effect.fail("missing").pipe(Effect.mapError((message) => new Error(message)));
```

### [Effect.retry](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:4040)

Retries failures according to a `Schedule` policy.

```ts
const retried = Effect.fail("temporary").pipe(Effect.retry(Schedule.recurs(3)));
```

### [Effect.timeout](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:4494)

Interrupts an effect that does not complete before the supplied duration and adds a timeout failure.

```ts
const bounded = Effect.succeed("ready").pipe(Effect.timeout("1 second"));
```

### [Effect.sleep](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:4682)

Suspends the current effect for a duration.

```ts
const wait = Effect.sleep("250 millis");
```

### [Effect.race](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:4827)

Runs two effects and returns the first successful result, interrupting the loser.

```ts
const first = Effect.race(
  Effect.sleep("10 millis").pipe(Effect.as("fast")),
  Effect.sleep("20 millis").pipe(Effect.as("slow")),
);
```

### [Effect.match](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:5318)

Handles success and typed failure with pure functions and returns an effect that cannot fail through its typed error channel.

```ts
const label = Effect.match(Effect.fail("missing"), {
  onFailure: (error) => `error: ${error}`,
  onSuccess: (value) => `value: ${value}`,
});
```

### [Effect.matchEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:5641)

Handles success and typed failure with effectful branches.

```ts
const handled = Effect.matchEffect(Effect.succeed(1), {
  onFailure: (error) => Effect.fail(error),
  onSuccess: (value) => Effect.succeed(value + 1),
});
```

### [Effect.provide](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:5862)

Provides a `Layer` to an effect and removes the layer's services from the effect requirements.

```ts
const Logger = Context.Service<{ readonly log: (message: string) => void }>("Logger");
const program = Effect.service(Logger).pipe(
  Effect.provide(Layer.succeed(Logger, { log: console.log })),
);
```

### [Effect.provideContext](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:5950)

Supplies several services from a `Context` and removes them from the effect's requirements.

```ts
const Logger = Context.Service<{ log: (message: string) => void }>("Logger");
const program = Effect.service(Logger).pipe(
  Effect.provideContext(Context.make(Logger, { log: console.log })),
);
```

### [Effect.service](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6030)

Reads one required service from the current context.

```ts
const Logger = Context.Service<{ log: (message: string) => void }>("Logger");
const program = Effect.gen(function*() {
  const logger = yield* Effect.service(Logger);
  logger.log("started");
});
```

### [Effect.serviceOption](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6072)

Reads a service when it is present and returns `Option.none()` when it is absent. Unlike `Effect.service`, the resulting effect has no service requirement, so it is appropriate for optional host capabilities.

```ts
const Metrics = Context.Service<{ readonly count: (name: string) => void }>("Metrics")
const maybeMetrics = Effect.serviceOption(Metrics)
```

### [Effect.contextWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:5824)

Derives an effect from the complete current service context.

```ts
const Counter = Context.Service<number>("Counter");
const current = Effect.contextWith((services) => Effect.succeed(Context.get(services, Counter)));
```

### [Effect.provideService](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6221)

Provides one concrete service implementation directly to an effect.

```ts
const Logger = Context.Service<{ log: (message: string) => void }>("Logger");
const program = Effect.service(Logger).pipe(
  Effect.provideService(Logger, { log: console.log }),
);
```

### [Effect.request](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:8457)

Enqueues a typed `Request` through a `RequestResolver`. The returned effect preserves the request success, error, and service requirement types; batching and completion are owned by the resolver.

```ts
import { Effect, Request, RequestResolver } from "effect"

interface GetUser extends Request.Request<string> {
  readonly _tag: "GetUser"
  readonly id: string
}
const GetUser = Request.tagged<GetUser>("GetUser")
declare const resolver: RequestResolver.RequestResolver<GetUser>

const user = Effect.request(GetUser({ id: "user-1" }), resolver)
```

### [Effect.acquireRelease](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6545)

Acquires a resource and registers its release action with the current scope.

```ts
const connection = Effect.acquireRelease(
  Effect.succeed("connection"),
  () => Effect.log("closed"),
);
const program = Effect.scoped(connection);
```

### [Effect.acquireUseRelease](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6677)

Acquires a resource, uses it, and runs release logic whether use succeeds or fails.

```ts
const program = Effect.acquireUseRelease(
  Effect.succeed("connection"),
  (connection) => Effect.succeed(`using ${connection}`),
  (_connection, _exit) => Effect.log("closed"),
);
```

### [Effect.ensuring](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6777)

Runs a finalizer when an effect that starts execution succeeds, fails, or is interrupted.

```ts
const safe = Effect.ensuring(Effect.succeed("done"), Effect.log("cleanup"));
```

### [Effect.onExit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6941)

Runs an effectful cleanup or observation with the source effect's `Exit` value.

```ts
const observed = Effect.onExit(Effect.succeed(42), (exit) => Effect.sync(() => console.log(exit)));
```

### [Effect.addFinalizer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6731)

Registers cleanup in the current scope without tying it to a specific resource value.

```ts
const program = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.addFinalizer(Effect.log("cleanup"));
    return "work";
  }),
);
```

### [Effect.scoped](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6432)

Creates a scope around an effect and closes it when the effect exits.

```ts
const program = Effect.scoped(
  Effect.acquireRelease(Effect.succeed("resource"), () => Effect.log("released")),
);
```

### [Effect.forkChild](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:8546)

Starts child work in a fiber that remains owned by the parent workflow.

```ts
const program = Effect.gen(function*() {
  const fiber = yield* Effect.forkChild(Effect.succeed(42));
  return yield* Fiber.join(fiber);
});
```

### [Effect.runPromise](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:9020)

Executes an effect and returns its successful result as a Promise; failures reject.

```ts
const result = Effect.runPromise(Effect.succeed(1));
```

### [Effect.runPromiseExit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:9111)

Executes an effect and resolves with an `Exit` so success and failure remain data.

```ts
const result = Effect.runPromiseExit(Effect.fail("missing"));
```

### [Effect.runSync](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:9219)

Executes an effect synchronously; failure or asynchronous work throws.

```ts
const result = Effect.runSync(Effect.succeed(1));
```

### [Effect.runForkWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:8880)

Runs an effect with an explicit service context and returns its running fiber.

```ts
const Logger = Context.Service<{ log: (message: string) => void }>("Logger");
const services = Context.make(Logger, { log: console.log });
const fiber = Effect.runForkWith(services)(Effect.service(Logger));
```

### [Effect.fn](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:13682)

Defines a reusable traced function whose body yields an `Effect` workflow.

```ts
const getLength = Effect.fn("getLength")(function*(value: string) {
  return yield* Effect.succeed(value.length);
});
```

### [Effect.fnUntraced](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:13563)

Defines the same reusable generator-style function without tracing metadata.

```ts
const getLength = Effect.fnUntraced(function*(value: string) {
  return yield* Effect.succeed(value.length);
});
```

### [Effect.callback](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:1200)

Lifts callback-based APIs into an interruptible effect and lets registration return cleanup.

```ts
const delay = (ms: number) => Effect.callback<void>((resume) => {
  const id = setTimeout(() => resume(Effect.succeed(undefined)), ms);
  return Effect.sync(() => clearTimeout(id));
});
```
