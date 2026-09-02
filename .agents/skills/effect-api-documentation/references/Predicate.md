# `Predicate`

Source: [Effect v4 `Predicate` API](https://www.effect.website/docs/v4/api/effect/Predicate). Examples assume `import { Predicate } from "effect"`.

`Predicate` provides reusable boolean functions and type guards for classifying values and narrowing their TypeScript types.

## API index

1. [Predicate.Predicate](#predicatepredicate)
2. [Predicate.isString](#predicateisstring)
3. [Predicate.isNumber](#predicateisnumber)
4. [Predicate.isNullish](#predicateisnullish)
5. [Predicate.isNotNullish](#predicateisnotnullish)
6. [Predicate.hasProperty](#predicatehasproperty)
7. [Predicate.isTagged](#predicateistagged)
8. [Predicate.and](#predicateand)
9. [Predicate.or](#predicateor)
10. [Predicate.not](#predicatenot)
11. [Predicate.compose](#predicatecompose)
12. [Predicate.Tuple](#predicatetuple)
13. [Predicate.Struct](#predicatestruct)
14. [Predicate.every](#predicateevery)
15. [Predicate.some](#predicatesome)

### Additional known APIs (not expanded)

`Refinement`, `PredicateTypeLambda`, `mapInput`, `isTupleOf`, `isTupleOfAtLeast`, `isTruthy`, `isSet`, `isMap`, `isBoolean`, `isBigInt`, `isSymbol`, `isPropertyKey`, `isFunction`, `isUndefined`, `isNotUndefined`, `isNull`, `isNotNull`, `isNever`, `isUnknown`, `isObjectOrArray`, `isObject`, `isReadonlyObject`, `isObjectKeyword`, `isError`, `isUint8Array`, `isDate`, `isIterable`, `isPromise`, `isPromiseLike`, `isRegExp`, `xor`, `eqv`, `implies`, `nor`, `nand`

### [Predicate.Predicate](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:46)

Represents a boolean test that can be composed and, when refined, narrow a TypeScript type.

```ts
const isPositive: Predicate.Predicate<number> = (value) => value > 0;
```

### [Predicate.isString](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:539)

Narrows an unknown value to `string`.

```ts
const input: unknown = "ready";
if (Predicate.isString(input)) input.toUpperCase();
```

### [Predicate.isNumber](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:572)

Narrows an unknown value to `number`.

```ts
const input: unknown = 42;
const valid = Predicate.isNumber(input);
```

### [Predicate.isNullish](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:893)

Tests whether a value is `null` or `undefined`.

```ts
const missing = Predicate.isNullish(undefined);
```

### [Predicate.isNotNullish](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:926)

Narrows a value to `NonNullable<A>`.

```ts
const input: string | undefined = "ok";
if (Predicate.isNotNullish(input)) input.length;
```

### [Predicate.hasProperty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:1131)

Checks for an own or inherited property and narrows the object shape.

```ts
const input: unknown = { id: "u1" };
if (Predicate.hasProperty(input, "id")) input.id;
```

### [Predicate.isTagged](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:1166)

Checks whether a value has a matching `_tag` discriminator.

```ts
const isReady = Predicate.isTagged("Ready");
const ready = isReady({ _tag: "Ready", value: 1 });
```

### [Predicate.and](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:1621)

Requires both predicates to pass, preserving refinement narrowing when available.

```ts
const isNonEmptyString = Predicate.and(
  Predicate.isString,
  (value: string) => value.length > 0,
);
```

### [Predicate.or](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:1577)

Accepts a value when either predicate passes.

```ts
const isTextOrNumber = Predicate.or(Predicate.isString, Predicate.isNumber);
const valid = isTextOrNumber(42);
```

### [Predicate.not](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:1545)

Negates a predicate.

```ts
const isMissing = Predicate.not(Predicate.isNotNullish);
const absent = isMissing(null);
```

### [Predicate.compose](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:1411)

Chains a refinement with a predicate or a narrower refinement.

```ts
const isLongString = Predicate.compose(
  Predicate.isString,
  (value: string) => value.length > 3,
);
```

### [Predicate.Tuple](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:1450)

Builds a predicate that validates each tuple position with its corresponding predicate.

```ts
const isPair = Predicate.Tuple([Predicate.isString, Predicate.isNumber]);
const valid = isPair(["id", 1]);
```

### [Predicate.Struct](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:1499)

Builds a predicate that validates named object fields.

```ts
const isUser = Predicate.Struct({ id: Predicate.isString, age: Predicate.isNumber });
const valid = isUser({ id: "u1", age: 30 });
```

### [Predicate.every](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:1825)

Builds a predicate that requires every predicate in a collection to pass.

```ts
const isValid = Predicate.every([Predicate.isNumber, (n: number) => n > 0]);
const valid = isValid(3);
```

### [Predicate.some](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Predicate.ts:1863)

Builds a predicate that passes when any predicate in a collection passes.

```ts
const isScalar = Predicate.some([Predicate.isString, Predicate.isNumber]);
const valid = isScalar("id");
```
