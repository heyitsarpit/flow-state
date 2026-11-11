# `Option`

Source: [Effect v4 `Option` API](https://www.effect.website/docs/v4/api/effect/Option). Examples assume `import { Option } from "effect"`; the `Result` conversion examples also use `Result` from `effect`.

`Option` represents a value that may be present or absent without using `null` or `undefined` in the domain flow.

## API index

1. [Option.match](#optionmatch)
2. [Option.map](#optionmap)
3. [Option.flatMap](#optionflatmap)
4. [Option.getOrElse](#optiongetorelse)
5. [Option.fromNullishOr](#optionfromnullishor)
6. [Option.filter](#optionfilter)
7. [Option.orElse](#optionorelse)
8. [Option.all](#optionall)
9. [Option.product](#optionproduct)
10. [Option.contains](#optioncontains)
11. [Option.some](#optionsome)
12. [Option.none](#optionnone)
13. [Option.getSuccess](#optiongetsuccess)
14. [Option.getFailure](#optiongetfailure)
15. [Option.flatMapNullishOr](#optionflatmapnullishor)
16. [Option.firstSomeOf](#optionfirstsomeof)
17. [Option.fromIterable](#optionfromiterable)
18. [Option.liftThrowable](#optionliftthrowable)
19. [Option.liftPredicate](#optionliftpredicate)
20. [Option.exists](#optionexists)

### Additional known APIs (not expanded)

`isOption`, `isNone`, `isSome`, `toRefinement`, `orElseSome`, `orElseResult`, `fromUndefinedOr`, `fromNullOr`, `liftNullishOr`, `getOrNull`, `getOrUndefined`, `getOrThrowWith`, `getOrThrow`, `as`, `asVoid`, `void`, `andThen`, `flatten`, `zipRight`, `zipLeft`, `composeK`, `tap`, `productMany`, `zipWith`, `reduceCompact`, `toArray`, `partitionMap`, `filterMap`, `makeEquivalence`, `makeOrder`, `lift2`, `containsWith`, `bindTo`, `let`, `bind`, `Do`, `gen`, `makeReducer`, `makeCombinerFailFast`, `makeReducerFailFast`

### [Option.match](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:423)

Handles both `None` and `Some` branches and returns a plain value.

```ts
const label = Option.some(1).pipe(
  Option.match({ onNone: () => "missing", onSome: (value) => `value:${value}` }),
);
```

### [Option.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:1159)

Transforms a present value while preserving `None`.

```ts
const doubled = Option.some(2).pipe(Option.map((value) => value * 2));
```

### [Option.flatMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:1297)

Chains an optional computation without nesting `Option<Option<A>>`.

```ts
const street = Option.some({ address: Option.some("Main St") }).pipe(
  Option.flatMap((user) => user.address),
);
```

### [Option.getOrElse](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:617)

Extracts a value or lazily computes a fallback when the option is `None`.

```ts
const name = Option.none<string>().pipe(Option.getOrElse(() => "anonymous"));
```

### [Option.fromNullishOr](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:821)

Turns `null` and `undefined` into `None` while preserving every other value.

```ts
const toOption = (value: string | undefined) => Option.fromNullishOr(value);
```

### [Option.filter](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:2020)

Keeps a present value only when its predicate succeeds.

```ts
const positive = Option.some(-1).pipe(Option.filter((value) => value > 0));
```

### [Option.orElse](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:657)

Lazily supplies another `Option` only when the first one is `None`.

```ts
const value = Option.none<string>().pipe(
  Option.orElse(() => Option.some("fallback")),
);
```

### [Option.all](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:1735)

Combines a tuple, record, or iterable of options; any `None` makes the result `None`.

```ts
const user = Option.all({ id: Option.some("acct-1"), name: Option.some("Ada") });
```

### [Option.product](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:1634)

Combines two `Some` values into a tuple, returning `None` if either is absent.

```ts
const pair = Option.product(Option.some("acct-1"), Option.some(42));
```

### [Option.contains](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:2270)

Tests whether an option contains a value equal to the supplied value.

```ts
const isAdmin = Option.some("admin").pipe(Option.contains("admin"));
```

### [Option.some](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:292)

Wraps a known present value in `Some`, including `null` or `undefined` when supplied.

```ts
const present = Option.some(42);
```

### [Option.none](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:259)

Creates an `Option` representing an expected absent value.

```ts
const missing = Option.none<{ id: string }>();
```

### [Option.getSuccess](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:550)

Converts a `Result` to an `Option` containing only its success value.

```ts
const value = Option.getSuccess(Result.succeed("ok"));
```

### [Option.getFailure](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:582)

Converts a `Result` to an `Option` containing only its failure value.

```ts
const error = Option.getFailure(Result.fail("invalid"));
```

### [Option.flatMapNullishOr](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:1404)

Chains a function that may return `null` or `undefined`, converting those values to `None`.

```ts
const city = Option.some({ address: { city: "Pune" } }).pipe(
  Option.flatMapNullishOr((user) => user.address?.city),
);
```

### [Option.firstSomeOf](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:774)

Returns the first `Some` from an iterable, which is useful for ordered fallbacks.

```ts
const value = Option.firstSomeOf([
  Option.none<string>(),
  Option.some("cache"),
  Option.some("network"),
]);
```

### [Option.fromIterable](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:513)

Wraps the first element of an iterable, or returns `None` when it is empty.

```ts
const first = Option.fromIterable(new Set(["a", "b"]));
```

### [Option.liftThrowable](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:1042)

Converts a throwing function into one that returns `None` when it throws.

```ts
const parseJson = Option.liftThrowable(JSON.parse);
const parsed = parseJson('{"ok":true}');
```

### [Option.liftPredicate](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:2178)

Lifts a predicate into a function returning `Some` on success and `None` otherwise.

```ts
const positive = Option.liftPredicate((value: number) => value > 0);
const result = positive(1);
```

### [Option.exists](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts:2312)

Tests a predicate against the present value and returns `false` for `None`.

```ts
const hasLongName = Option.some("Ada").pipe(
  Option.exists((name) => name.length > 2),
);
```
