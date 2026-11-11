# `Exit`

Source: [Effect v4 `Exit` API](https://www.effect.website/docs/v4/api/effect/Exit). Examples assume `import { Exit } from "effect"`.

`Exit` is the final value of an Effect computation, representing either success or a structured failure `Cause`.

## API index

1. [Exit.match](#exitmatch)
2. [Exit.succeed](#exitsucceed)
3. [Exit.fail](#exitfail)
4. [Exit.isSuccess](#exitissuccess)
5. [Exit.isFailure](#exitisfailure)
6. [Exit.map](#exitmap)
7. [Exit.mapError](#exitmaperror)
8. [Exit.getSuccess](#exitgetsuccess)
9. [Exit.getCause](#exitgetcause)
10. [Exit](#exit)

### Additional known APIs (not expanded)

`TypeId`, `Proto`, `Success`, `Failure`, `isExit`, `failCause`, `die`, `interrupt`, `hasFails`, `hasDies`, `hasInterrupts`, `filterSuccess`, `filterValue`, `filterFailure`, `filterCause`, `findError`, `findDefect`, `mapBoth`, `asVoid`, `asVoidAll`, `findErrorOption`

### [Exit.match](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Exit.ts:787)

Handles success and failure branches while keeping the `Cause` visible in the failure branch.

```ts
const message = Exit.match(Exit.succeed(42), {
  onSuccess: (value) => `value:${value}`,
  onFailure: () => "failed",
});
```

### [Exit.succeed](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Exit.ts:219)

Creates a successful `Exit` containing a value.

```ts
const success = Exit.succeed({ status: "ok" as const });
```

### [Exit.fail](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Exit.ts:282)

Creates a failed `Exit` containing a typed error as a `Cause.Fail`.

```ts
const failure = Exit.fail("invalid input");
```

### [Exit.isSuccess](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Exit.ts:403)

Narrows an `Exit` to its successful branch.

```ts
const exit = Exit.succeed(42);
if (Exit.isSuccess(exit)) console.log(exit.value);
```

### [Exit.isFailure](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Exit.ts:431)

Narrows an `Exit` to its failed branch and exposes its `Cause`.

```ts
const exit = Exit.fail("invalid");
if (Exit.isFailure(exit)) console.log(exit.cause);
```

### [Exit.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Exit.ts:830)

Transforms a success value while preserving failure causes.

```ts
const doubled = Exit.map(Exit.succeed(21), (value) => value * 2);
```

### [Exit.mapError](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Exit.ts:871)

Transforms typed errors inside a failed `Exit` without changing its success value.

```ts
const renamed = Exit.mapError(Exit.fail("bad"), (error) => new Error(error));
```

### [Exit.getSuccess](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Exit.ts:1020)

Extracts the success value as an `Option`, returning `None` for failure.

```ts
const value = Exit.getSuccess(Exit.succeed(42));
```

### [Exit.getCause](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Exit.ts:1049)

Extracts the failure `Cause` as an `Option`, returning `None` for success.

```ts
const cause = Exit.getCause(Exit.fail("bad"));
```

### [Exit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Exit.ts:59)

`Exit<A, E>` is the data representation of an effect's success or structured failure.

```ts
const result: Exit.Exit<number, string> = Exit.succeed(42);
```
