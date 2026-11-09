# `Tuple`

Source: [Effect v4 `Tuple` API](https://www.effect.website/docs/v4/api/effect/Tuple). Examples assume `import { Tuple } from "effect"`.

`Tuple` creates fresh fixed-position arrays and preserves element positions through access, selection, appending, reordering, and typed transformation.

## API index

1. [Tuple.make](#tuplemake)
2. [Tuple.get](#tupleget)
3. [Tuple.pick](#tuplepick)
4. [Tuple.omit](#tupleomit)
5. [Tuple.appendElement](#tupleappendelement)
6. [Tuple.appendElements](#tupleappendelements)
7. [Tuple.evolve](#tupleevolve)
8. [Tuple.renameIndices](#tuplerenameindices)
9. [Tuple.map](#tuplemap)
10. [Tuple.mapPick](#tuplemappick)
11. [Tuple.mapOmit](#tuplemapomit)
12. [Tuple.isTupleOf](#tupleistupleof)
13. [Tuple.isTupleOfAtLeast](#tupleistupleofatleast)
14. [Tuple.makeEquivalence](#tuplemakeequivalence)
15. [Tuple.makeOrder](#tuplemakeorder)
16. [Tuple.makeCombiner](#tuplemakecombiner)
17. [Tuple.makeReducer](#tuplemakereducer)

### Additional known APIs (not expanded)

None. All confirmed public exports in this module are expanded above.

## Type-level concepts

`Tuple` keeps positions in the tuple type, so `get`, `pick`, `omit`, and the
append helpers derive their result from the supplied indices. `isTupleOf` and
`isTupleOfAtLeast` are length guards only; they do not validate element types.
The mapping helpers use a `Struct.Lambda` so one transformation can produce a
type-aware result for every selected position. See [Struct](Struct.md) for the
lambda contract.

```ts
import { Tuple } from "effect"

const values: Array<number> = [1, 2]
if (Tuple.isTupleOf(values, 2)) {
  const first: number = values[0]
}
```

### [Tuple.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:47)

Creates a tuple from arguments while preserving the inferred element positions and literal types.

```ts
import { Tuple } from "effect"

const point = Tuple.make(10, 20, "red")
```

### [Tuple.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:76)

Reads a valid tuple index while constraining the index to the tuple's known positions.

```ts
import { Tuple } from "effect"

const label = Tuple.get([10, 20, "red"] as const, 2) // "red"
```

### [Tuple.pick](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:122)

Selects tuple positions and preserves the selected element types in the result.

```ts
import { Tuple } from "effect"

const row = ["user-1", "alice@example.com", true] as const
const cacheKey = Tuple.pick(row, [0, 2] as const)
console.log(cacheKey) // ["user-1", true]
```

### [Tuple.omit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:166)

Removes tuple positions while preserving the order and types of the remaining elements.

```ts
import { Tuple } from "effect"

const withoutCount = Tuple.omit(["id", 42, true] as const, [1] as const)
```

### [Tuple.appendElement](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:210)

Appends one element and extends the tuple type with that element at the end.

```ts
import { Tuple } from "effect"

const request = Tuple.appendElement(["users", 1] as const, "json")
```

### [Tuple.appendElements](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:240)

Concatenates two tuples and preserves both tuple shapes in the result.

```ts
import { Tuple } from "effect"

const combined = Tuple.appendElements(["users"] as const, [1, true] as const)
```

### [Tuple.evolve](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:291)

Applies position-specific transformations while leaving positions without a transformer unchanged.

```ts
import { Tuple } from "effect"

const raw = ["  alice@example.com ", "42", "true"] as const
const normalized = Tuple.evolve(raw, [
  (email) => email.trim().toLowerCase(),
  (age) => Number(age),
  (active) => active === "true",
])
```

### [Tuple.renameIndices](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:334)

Reorders tuple elements by mapping each destination position to a stringified source index.

```ts
import { Tuple } from "effect"

const reversed = Tuple.renameIndices(["a", 1, true] as const, ["2", "1", "0"] as const)
```

### [Tuple.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:389)

Applies one `Struct.Lambda` to every tuple position while deriving each output type.

```ts
import { Struct, Tuple } from "effect"

interface Box extends Struct.Lambda {
  <A>(value: A): { readonly value: A }
  readonly "~lambda.out": { readonly value: this["~lambda.in"] }
}
const box = Struct.lambda<Box>((value) => ({ value }))
const result = Tuple.map([1, "a"] as const, box)
```

### [Tuple.mapPick](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:438)

Applies one `Struct.Lambda` only to selected positions and leaves the other positions unchanged.

```ts
import { Struct, Tuple } from "effect"

interface Box extends Struct.Lambda {
  <A>(value: A): { readonly value: A }
  readonly "~lambda.out": { readonly value: this["~lambda.in"] }
}
const box = Struct.lambda<Box>((value) => ({ value }))
const result = Tuple.mapPick([1, "a", true] as const, [0, 2] as const, box)
```

### [Tuple.mapOmit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:494)

Applies one `Struct.Lambda` to every position except the selected ones.

```ts
import { Struct, Tuple } from "effect"

interface Box extends Struct.Lambda {
  <A>(value: A): { readonly value: A }
  readonly "~lambda.out": { readonly value: this["~lambda.in"] }
}
const box = Struct.lambda<Box>((value) => ({ value }))
const result = Tuple.mapOmit([1, "a", true] as const, [1] as const, box)
```

### [Tuple.isTupleOf](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:617)

Checks exact length and narrows an array to a fixed-length tuple. It does not validate element types.

```ts
import { Tuple } from "effect"

const values: Array<number> = [1, 2]
if (Tuple.isTupleOf(values, 2)) console.log(values[1])
```

### [Tuple.isTupleOfAtLeast](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:652)

Checks minimum length and narrows an array to a tuple with a required prefix.

```ts
import { Tuple } from "effect"

const values: Array<number> = [1, 2, 3]
if (Tuple.isTupleOfAtLeast(values, 2)) console.log(values[1])
```

### [Tuple.makeEquivalence](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:549)

Builds element-by-element equality for tuples from one `Equivalence` per position.

```ts
import { Equivalence, Tuple } from "effect"

const equal = Tuple.makeEquivalence([
  Equivalence.strictEqual<string>(),
  Equivalence.strictEqual<number>(),
])
const same = equal(["a", 1], ["a", 1])
```

### [Tuple.makeOrder](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:580)

Builds lexicographic ordering for tuples from one `Order` per position.

```ts
import { Number, String, Tuple } from "effect"

const order = Tuple.makeOrder([String.Order, Number.Order])
const comparison = order(["a", 1], ["b", 1])
```

### [Tuple.makeCombiner](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:683)

Builds a tuple combiner from one `Combiner` per position.

```ts
import { Number, String, Tuple } from "effect"

const combine = Tuple.makeCombiner<readonly [number, string]>([
  Number.ReducerSum,
  String.ReducerConcat,
])
const result = combine.combine([1, "a"], [2, "b"])
```

### [Tuple.makeReducer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tuple.ts:728)

Builds a tuple reducer from one `Reducer` per position and derives its initial tuple value.

```ts
import { Number, String, Tuple } from "effect"

const reduce = Tuple.makeReducer<readonly [number, string]>([
  Number.ReducerSum,
  String.ReducerConcat,
])
const result = reduce.combineAll([[1, "a"], [2, "b"]])
```
