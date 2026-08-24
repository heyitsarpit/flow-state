# `Effect`

Source: [Effect v4 `Effect` API](https://www.effect.website/docs/v4/api/effect/Effect). Examples import modules as needed.

## API index

1. [Effect.Effect](#effecteffect)
2. [Effect.Success](#effectsuccess)
3. [Effect.Error](#effecterror)
4. [Effect.Services](#effectservices)
5. [Effect.gen](#effectgen)
6. [Effect.map](#effectmap)
7. [Effect.flatMap](#effectflatmap)
8. [Effect.all](#effectall)
9. [Effect.tryPromise](#effecttrypromise)
10. [Effect.promise](#effectpromise)
11. [Effect.succeed](#effectsucceed)
12. [Effect.fail](#effectfail)
13. [Effect.catchTag](#effectcatchtag)
14. [Effect.provideContext](#effectprovidecontext)
15. [Effect.service](#effectservice)
16. [Effect.provideService](#effectprovideservice)
17. [Effect.acquireRelease](#effectacquirerelease)
18. [Effect.addFinalizer](#effectaddfinalizer)
19. [Effect.scoped](#effectscoped)
20. [Effect.forkChild](#effectforkchild)
21. [Effect.runForkWith](#effectrunforkwith)
22. [Effect.fn](#effectfn)
23. [Effect.fnUntraced](#effectfnuntraced)
24. [Effect.callback](#effectcallback)

### Additional known APIs (not expanded)

`isEffect`, `partition`, `validate`, `findFirst`, `findFirstFilter`, `forEach`, `whileLoop`, `sync`, `suspend`, `succeedNone`, `succeedSome`, `Do`, `bindTo`, `bind`, `failSync`, `failCause`, `failCauseSync`, `die`, `dieSync`, `yieldNow`, `never`, `fromResult`, `fromOption`, `fromNullishOr`, `transposeOption`, `flatten`, `andThen`, `tap`, `result`, `option`, `exit`, `as`, `asSome`, `asVoid`, `flip`, `zip`, `zipWith`, `catchTags`, `catchReason`, `catchReasons`, `catchCause`, `catchDefect`, `catchIf`, `mapError`, `mapBoth`, `orDie`, `tapError`, `retry`, `retryOrElse`, `eventually`, `ignore`, `ignoreCause`, `orElseSucceed`, `firstSuccessOf`, `timeout`, `timeoutOption`, `timeoutOrElse`, `delay`, `sleep`, `timed`, `race`, `raceFirst`, `raceAll`, `raceAllFirst`, `filter`, `filterMap`, `filterOrElse`, `filterOrFail`, `when`, `match`, `matchEffect`, `context`, `contextWith`, `provide`, `setContext`, `serviceOption`, `updateContext`, `updateService`, `provideServiceEffect`, `withConcurrency`, `scopedWith`, `acquireDisposable`, `acquireUseRelease`, `ensuring`, `onError`, `onExit`, `cached`, `cachedWithTTL`, `interrupt`, `interruptible`, `onInterrupt`, `uninterruptible`, `uninterruptibleMask`, `forever`, `repeat`, `replicate`, `schedule`, `tracer`, `withTracer`, `makeSpan`, `withSpan`, `request`, `forkScoped`, `forkDetach`, `awaitAllChildren`, `fiber`, `fiberId`, `runFork`, `runCallback`, `runPromise`, `runPromiseExit`, `runSync`

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

### [Effect.all](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:514)

Runs a collection or record of effects and combines their successful values.

```ts
const config = Effect.all({ host: Effect.succeed("localhost"), port: Effect.succeed(8080) });
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

### [Effect.catchTag](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:2703)

Recovers from one tagged error while preserving exhaustive typed error handling.

```ts
const recovered = missing.pipe(
  Effect.catchTag("MissingUser", () => Effect.succeed({ id: "fallback" })),
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

### [Effect.provideService](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts:6221)

Provides one concrete service implementation directly to an effect.

```ts
const Logger = Context.Service<{ log: (message: string) => void }>("Logger");
const program = Effect.service(Logger).pipe(
  Effect.provideService(Logger, { log: console.log }),
);
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
