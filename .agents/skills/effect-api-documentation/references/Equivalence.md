# `Equivalence`

Source: [Effect v4 `Equivalence` API](https://www.effect.website/docs/v4/api/effect/Equivalence). Examples assume `import { Equivalence } from "effect"`.

`Equivalence` defines reusable equality relations so values can be compared according to domain semantics instead of one hard-coded notion of equality.

## API index

1. [Equivalence.Equivalence](#equivalenceequivalence)
2. [Equivalence.make](#equivalencemake)
3. [Equivalence.strictEqual](#equivalencestrictequal)
4. [Equivalence.mapInput](#equivalencemapinput)
5. [Equivalence.combine](#equivalencecombine)
6. [Equivalence.Struct](#equivalencestruct)
7. [Equivalence.Record](#equivalencerecord)
8. [Equivalence.Tuple](#equivalencetuple)
9. [Equivalence.String](#equivalencestring)
10. [Equivalence.Number](#equivalencenumber)
11. [Equivalence.Date](#equivalencedate)

### Additional known APIs (not expanded)

`Boolean`, `BigInt`, `combineAll`, `Array`, `makeReducer`

### [Equivalence.Equivalence](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Equivalence.ts:60)

Represents a symmetric, transitive equality relation for values of one type.

```ts
const same: Equivalence.Equivalence<number> = (a, b) => a === b;
```

### [Equivalence.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Equivalence.ts:147)

Builds an equivalence from a comparison function while preserving reflexivity.

```ts
const close = Equivalence.make<number>((a, b) => Math.abs(a - b) < 0.01);
```

### [Equivalence.strictEqual](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Equivalence.ts:199)

Creates an equivalence using JavaScript strict equality.

```ts
const same = Equivalence.strictEqual<number>();
const equal = same(1, 1);
```

### [Equivalence.mapInput](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Equivalence.ts:476)

Compares a larger value by mapping both inputs into a value with an existing equivalence.

```ts
const byId = Equivalence.mapInput(Equivalence.String, (user: { id: string }) => user.id);
```

### [Equivalence.combine](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Equivalence.ts:337)

Requires two equivalences to agree before values are considered equal.

```ts
const samePoint = Equivalence.combine(
  Equivalence.mapInput(Equivalence.Number, (p: { x: number; y: number }) => p.x),
  Equivalence.mapInput(Equivalence.Number, (p: { x: number; y: number }) => p.y),
);
```

### [Equivalence.Struct](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Equivalence.ts:693)

Compares selected object fields with their corresponding equivalences.

```ts
const eq = Equivalence.Struct({ id: Equivalence.String, age: Equivalence.Number });
const same = eq({ id: "u1", age: 30 }, { id: "u1", age: 30 });
```

### [Equivalence.Record](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Equivalence.ts:757)

Compares record keys and values with one shared equivalence.

```ts
const eq = Equivalence.Record(Equivalence.Number);
const same = eq({ a: 1 }, { a: 1 });
```

### [Equivalence.Tuple](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Equivalence.ts:543)

Compares fixed tuple positions with per-position equivalences.

```ts
const eq = Equivalence.Tuple([Equivalence.String, Equivalence.Number]);
const same = eq(["a", 1], ["a", 1]);
```

### [Equivalence.String](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Equivalence.ts:220)

Provides strict equality for strings.

```ts
const same = Equivalence.String("a", "a");
```

### [Equivalence.Number](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Equivalence.ts:242)

Provides numeric equality with `NaN` treated as equal to `NaN`.

```ts
const same = Equivalence.Number(1, 1);
```

### [Equivalence.Date](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Equivalence.ts:867)

Compares dates by their timestamps.

```ts
const same = Equivalence.Date(new Date(0), new Date(0));
```
