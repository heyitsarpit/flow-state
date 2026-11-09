# `Result`

Source: [Effect v4 `Result` API](https://www.effect.website/docs/v4/api/effect/Result). Examples assume `import { Result } from "effect"`.

`Result` carries a pure computation's success or failure as a value when introducing an Effect runtime would add no useful semantics.

## API index

1. [Result.Result](#resultresult)
2. [Result.match](#resultmatch)
3. [Result.flatMap](#resultflatmap)
4. [Result.orElse](#resultorelse)
5. [Result.getOrElse](#resultgetorelse)
6. [Result.map](#resultmap)
7. [Result.fromNullishOr](#resultfromnullishor)
8. [Result.all](#resultall)
9. [Result.liftPredicate](#resultliftpredicate)
10. [Result.succeed](#resultsucceed)
11. [Result.fail](#resultfail)
12. [Result.fromOption](#resultfromoption)
13. [Result.getSuccess](#resultgetsuccess)
14. [Result.getFailure](#resultgetfailure)
15. [Result.mapError](#resultmaperror)
16. [Result.isResult](#resultisresult)
17. [Result.isFailure](#resultisfailure)
18. [Result.isSuccess](#resultissuccess)
19. [Result.mapBoth](#resultmapboth)
20. [Result.merge](#resultmerge)

### Additional known APIs (not expanded)

`Failure`, `Success`, `failVoid`, `makeEquivalence`, `filterOrFail`, `getOrNull`, `getOrUndefined`, `getOrThrowWith`, `getOrThrow`, `andThen`, `flip`, `gen`, `Do`, `bindTo`, `bind`, `tap`, `transposeOption`, `transposeMapOption`, `succeedNone`, `succeedSome`

### [Result.Result](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:70)

Represents either a successful value or a failure value without throwing.

```ts
const result: Result.Result<number, string> = Result.succeed(42);
```

### [Result.match](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:905)

Handles success and failure explicitly and returns one plain value.

```ts
const message = Result.match(Result.succeed(42), {
  onFailure: (error) => `error:${error}`,
  onSuccess: (value) => `value:${value}`,
});
```

### [Result.flatMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:1337)

Sequences a function that returns another `Result`, short-circuiting on failure.

```ts
const parsed = Result.succeed("42").pipe(
  Result.flatMap((text) => /^\d+$/.test(text) ? Result.succeed(Number(text)) : Result.fail("not a number")),
);
```

### [Result.orElse](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:1292)

Recovers a failure by lazily producing another `Result`.

```ts
const recovered = Result.fail("cache miss").pipe(
  Result.orElse(() => Result.succeed("from network")),
);
```

### [Result.getOrElse](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:1105)

Extracts the success value or computes a fallback from the failure.

```ts
const value = Result.fail("missing").pipe(Result.getOrElse(() => "default"));
```

### [Result.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:859)

Transforms only a successful value and preserves failures.

```ts
const doubled = Result.succeed(21).pipe(Result.map((value) => value * 2));
```

### [Result.fromNullishOr](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:415)

Converts `null` or `undefined` into a caller-defined failure.

```ts
const userId = Result.fromNullishOr(undefined, () => "missing user id");
```

### [Result.all](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:1454)

Combines results in a tuple, iterable, or record; the first failure stops the combination.

```ts
const config = Result.all({
  host: Result.succeed("localhost"),
  port: Result.succeed(8080),
});
```

### [Result.liftPredicate](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:959)

Builds a `Result` from a raw value and a predicate with an explicit failure.

```ts
const positive = Result.liftPredicate((n: number) => n > 0, (n) => `${n} is not positive`);
const result = positive(3);
```

### [Result.succeed](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:284)

Constructs a successful result.

```ts
const ok = Result.succeed({ id: "user-1" });
```

### [Result.fail](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:314)

Constructs a failed result carrying a typed error value.

```ts
const failure = Result.fail({ reason: "invalid input" });
```

### [Result.fromOption](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:459)

Converts `Option.some` to success and `Option.none` to a supplied failure.

```ts
import { Option, Result } from "effect";

const result = Result.fromOption(Option.some("cached"), () => "cache miss");
```

### [Result.getSuccess](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:658)

Keeps a success value as an `Option` and turns failures into `None`.

```ts
const value = Result.getSuccess(Result.succeed(42));
```

### [Result.getFailure](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:691)

Keeps a failure value as an `Option` and turns successes into `None`.

```ts
const error = Result.getFailure(Result.fail("timeout"));
```

### [Result.mapError](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:816)

Transforms only the failure channel while preserving successful values.

```ts
const normalized = Result.fail("timeout").pipe(Result.mapError((error) => new Error(error)));
```

### [Result.isResult](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:559)

Checks whether an unknown value is a `Result` and narrows it to the result type.

```ts
const input: unknown = Result.succeed(42);

if (Result.isResult(input)) {
  const value: Result.Result<unknown, unknown> = input;
  console.log(value);
}
```

### [Result.isFailure](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:592)

Narrows a `Result` to its failure variant so code can read the `.failure` value.

```ts
const result: Result.Result<number, string> = Math.random() > 0.5
  ? Result.succeed(42)
  : Result.fail("unavailable");

if (Result.isFailure(result)) {
  console.log(result.failure);
}
```

### [Result.isSuccess](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:625)

Narrows a `Result` to its success variant so code can read the `.success` value.

```ts
const result: Result.Result<number, string> = Result.succeed(42);

if (Result.isSuccess(result)) {
  console.log(result.success);
}
```

### [Result.mapBoth](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:768)

Transforms both channels while preserving whether the result is a success or a failure.

```ts
const result = Result.fail("unavailable").pipe(
  Result.mapBoth({
    onFailure: (error) => new Error(error),
    onSuccess: (value: never) => String(value),
  }),
);
```

### [Result.merge](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts:1069)

Unwraps either channel directly as a union when both values can be handled the same way.

```ts
const value: number | string = Result.merge(
  Math.random() > 0.5 ? Result.succeed(42) : Result.fail("unavailable"),
);
console.log(value);
```
