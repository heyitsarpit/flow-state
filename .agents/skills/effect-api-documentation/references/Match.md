# `Match`

Source: [Effect v4 `Match` API](https://www.effect.website/docs/v4/api/effect/Match). Examples assume `import { Match } from "effect"`.

## API index

1. [Match.type](#matchtype)
2. [Match.when](#matchwhen)
3. [Match.discriminator](#matchdiscriminator)
4. [Match.tag](#matchtag)
5. [Match.value](#matchvalue)
6. [Match.exhaustive](#matchexhaustive)
7. [Match.orElse](#matchorelse)
8. [Match.option](#matchoption)
9. [Match.result](#matchresult)
10. [Match.not](#matchnot)
11. [Match.withReturnType](#matchwithreturntype)
12. [Match.discriminatorsExhaustive](#matchdiscriminatorsexhaustive)

### Additional known APIs (not expanded)

`Matcher`, `TypeMatcher`, `ValueMatcher`, `Case`, `Not`, `valueTags`, `typeTags`, `whenOr`, `whenAnd`, `discriminatorStartsWith`, `discriminators`, `tagStartsWith`, `tags`, `tagsExhaustive`, `orElseAbsurd`, `string`, `number`, `boolean`, `bigint`, `symbol`, `date`, `record`, `instanceOf`, `instanceOfUnsafe`, `nonEmptyString`, `is`, `any`, `defined`

### [Match.type](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Match.ts:281)

Starts a type-driven matcher that accumulates cases and can be finalized explicitly.

```ts
const describe = Match.type<unknown>().pipe(
  Match.when(Match.string, (value) => `text:${value}`),
  Match.orElse(() => "other"),
);
```

### [Match.when](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Match.ts:530)

Adds a predicate or pattern case to a matcher.

```ts
const classify = Match.type<number>().pipe(
  Match.when((value) => value > 0, () => "positive"),
  Match.orElse(() => "not positive"),
);
```

### [Match.discriminator](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Match.ts:706)

Matches a value by one discriminator property and a literal case.

```ts
const message = Match.type<{ kind: "ok" | "error"; value: string }>().pipe(
  Match.discriminator("kind", "ok", (value) => value.value),
  Match.orElse(() => "failed"),
);
```

### [Match.tag](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Match.ts:939)

Matches the conventional `_tag` discriminator on tagged values.

```ts
const label = Match.type<{ _tag: "Ready" | "Loading" }>().pipe(
  Match.tag("Ready", () => "ready"),
  Match.orElse(() => "loading"),
);
```

### [Match.value](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Match.ts:327)

Starts a matcher for one concrete input value.

```ts
const label = Match.value("ok").pipe(
  Match.when("ok", () => "accepted"),
  Match.orElse(() => "rejected"),
);
```

### [Match.exhaustive](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Match.ts:2003)

Evaluates a matcher only after all remaining cases have been handled.

```ts
const label = Match.value<"ok" | "no">("ok").pipe(
  Match.when("ok", () => "yes"),
  Match.when("no", () => "no"),
  Match.exhaustive,
);
```

### [Match.orElse](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Match.ts:1825)

Provides a fallback for unmatched inputs.

```ts
const label = Match.value(3).pipe(
  Match.when(1, () => "one"),
  Match.orElse(() => "other"),
);
```

### [Match.option](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Match.ts:1967)

Evaluates a matcher into an `Option` instead of requiring a fallback.

```ts
const result = Match.value("ok").pipe(
  Match.when("ok", () => 200),
  Match.option,
);
```

### [Match.result](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Match.ts:1918)

Evaluates a matcher into a `Result`, preserving an unmatched case as failure.

```ts
const result = Match.value("ok").pipe(
  Match.when("ok", () => 200),
  Match.result,
);
```

### [Match.not](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Match.ts:1146)

Adds a case for values that do not match a supplied pattern.

```ts
const label = Match.type<unknown>().pipe(
  Match.not(Match.string, () => "not text"),
  Match.orElse(() => "text"),
);
```

### [Match.withReturnType](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Match.ts:474)

Constrains the output type of a matcher before cases are added.

```ts
const label = Match.type<number>().pipe(
  Match.withReturnType<string>(),
  Match.when(0, () => "zero"),
  Match.orElse(() => "other"),
);
```

### [Match.discriminatorsExhaustive](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Match.ts:880)

Builds an exhaustive matcher for multiple discriminator fields.

```ts
const match = Match.discriminatorsExhaustive("kind", "status");
```
