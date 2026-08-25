# `Array`

Source: [Effect v4 `Array` API](https://www.effect.website/docs/v4/api/effect/Array). Examples assume `import { Array } from "effect"`.

`Array` provides data-first and data-last helpers over JavaScript arrays and other iterables. It also exposes types that preserve readonly and non-empty guarantees.

## API index

1. [Array.NonEmptyReadonlyArray](#arraynonemptyreadonlyarray)
2. [Array.NonEmptyArray](#arraynonemptyarray)
3. [Array.ReadonlyArray.Infer](#arrayreadonlyarrayinfer)
4. [Array.ReadonlyArray.With](#arrayreadonlyarraywith)
5. [Array.ReadonlyArray.OrNonEmpty](#arrayreadonlyarrayornonempty)
6. [Array.ReadonlyArray.AndNonEmpty](#arrayreadonlyarrayandnonempty)
7. [Array.ReadonlyArray.Flatten](#arrayreadonlyarrayflatten)
8. [Array.ReadonlyArrayTypeLambda](#arrayreadonlyarraytypelambda)
9. [Array.make](#arraymake)
10. [Array.range](#arrayrange)
11. [Array.fromIterable](#arrayfromiterable)
12. [Array.fromNullishOr](#arrayfromnullishor)
13. [Array.match](#arraymatch)
14. [Array.matchLeft](#arraymatchleft)
15. [Array.matchRight](#arraymatchright)
16. [Array.isReadonlyArrayNonEmpty](#arrayisreadonlyarraynonempty)
17. [Array.get](#arrayget)
18. [Array.head](#arrayhead)
19. [Array.take](#arraytake)
20. [Array.takeWhile](#arraytakewhile)
21. [Array.findFirst](#arrayfindfirst)
22. [Array.map](#arraymap)
23. [Array.flatMap](#arrayflatmap)
24. [Array.filterMap](#arrayfiltermap)
25. [Array.filter](#arrayfilter)
26. [Array.partition](#arraypartition)
27. [Array.zipWith](#arrayzipwith)
28. [Array.reduce](#arrayreduce)

### Additional known APIs (not expanded)

`Array`, `allocate`, `makeBy`, `replicate`, `ensure`, `fromRecord`, `fromOption`, `prepend`, `prependAll`, `append`, `appendAll`, `scan`, `scanRight`, `isArray`, `isArrayEmpty`, `isReadonlyArrayEmpty`, `isArrayNonEmpty`, `length`, `getUnsafe`, `last`, `tail`, `init`, `takeRight`, `span`, `dropRight`, `dropWhile`, `findFirstIndex`, `findLastIndex`, `findFirstWithIndex`, `findLast`, `insertAt`, `replace`, `modify`, `remove`, `reverse`, `sort`, `sortWith`, `zip`, `unzip`, `intersperse`, `splitAt`, `chunksOf`, `groupBy`, `union`, `intersection`, `difference`, `empty`, `of`, `flatten`, `getSomes`, `getFailures`, `getSuccesses`, `separate`, `reduceRight`, `liftOption`, `liftPredicate`, `liftNullishOr`, `flatMapNullishOr`, `liftResult`, `every`, `some`, `extend`, `min`, `max`, `unfold`, `forEach`, `dedupe`, `dedupeAdjacent`, `join`, `mapAccum`, `cartesian`, `Do`, `bind`, `bindTo`.

## Type-level concepts

`ReadonlyArray<A>` keeps callers from mutating the input. `NonEmptyReadonlyArray<A>`
and `NonEmptyArray<A>` encode the presence of at least one element, while
`OrNonEmpty`, `AndNonEmpty`, and `ReadonlyArrayTypeLambda` preserve those facts
through generic collection operations.

```ts
import type { Array } from "effect"

const ids: Array.NonEmptyReadonlyArray<string> = ["a", "b"]
const first: string = ids[0]
```

### [Array.NonEmptyReadonlyArray](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:84)

Represents a readonly array with at least one element. Use it when callers may safely access the first element without an empty case.

```ts
import type { Array } from "effect"

const ids: Array.NonEmptyReadonlyArray<string> = ["a", "b"]
const first: string = ids[0]
```

### [Array.NonEmptyArray](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:115)

Represents a mutable array with at least one element. Use it when a construction or transform guarantees non-emptiness and mutation is intentional.

```ts
import type { Array } from "effect"

const values: Array.NonEmptyArray<number> = [1]
values.push(2)
```

### [Array.ReadonlyArray.Infer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:3371)

Infers the element type from an array or other iterable type.

```ts
import type { Array } from "effect"

type Element = Array.ReadonlyArray.Infer<readonly [string, number]> // string | number
```

### [Array.ReadonlyArray.With](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:3390)

Builds an output array type while preserving whether the input was non-empty.

```ts
import type { Array } from "effect"

type Result = Array.ReadonlyArray.With<readonly [number], string> // NonEmptyArray<string>
```

### [Array.ReadonlyArray.OrNonEmpty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:3412)

Produces a non-empty result type when either input collection is known to be non-empty.

```ts
import type { Array } from "effect"

type Result = Array.ReadonlyArray.OrNonEmpty<readonly [number], string[], string>
// NonEmptyArray<string>
```

### [Array.ReadonlyArray.AndNonEmpty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:3439)

Produces a non-empty result type only when both input collections are known to be non-empty.

```ts
import type { Array } from "effect"

type Result = Array.ReadonlyArray.AndNonEmpty<readonly [number], readonly [boolean], string>
// NonEmptyArray<string>
```

### [Array.ReadonlyArray.Flatten](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:3463)

Computes the element type and non-empty result shape for nested readonly arrays.

```ts
import type { Array } from "effect"

type Result = Array.ReadonlyArray.Flatten<ReadonlyArray<ReadonlyArray<number>>> // Array<number>
```

### [Array.ReadonlyArrayTypeLambda](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:57)

Provides the higher-kinded type encoding for `ReadonlyArray` when using generic typeclass utilities.

```ts
import type { Array, HKT } from "effect"

type Strings = HKT.Kind<Array.ReadonlyArrayTypeLambda, never, never, never, string>
const values: Strings = ["a", "b"]
```

### [Array.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:144)

Creates a non-empty array from one or more values while preserving the element union.

```ts
import { Array } from "effect"

const values = Array.make("draft", "published")
```

### [Array.range](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:241)

Creates an inclusive non-empty range of integers. When the start exceeds the end, the result contains the start value.

```ts
import { Array } from "effect"

const pages = Array.range(1, 3) // [1, 2, 3]
```

### [Array.fromIterable](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:304)

Converts a `Set`, generator, or other iterable to an array. Existing arrays are returned by reference; use `copy` when a fresh array is required.

```ts
import { Array } from "effect"

const incoming = new Map([
  ["u1", " Alice@Example.COM "],
  ["u2", "bob@example.com"],
])
const users = Array.map(
  Array.fromIterable(incoming),
  ([id, email]) => ({ id, email: email.trim().toLowerCase() })
)
```

### [Array.fromNullishOr](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:4018)

Converts one nullable value into zero or one array elements, which is useful when flattening optional results into array pipelines.

```ts
import { Array } from "effect"

const values = Array.fromNullishOr<string | undefined>(undefined) // []
```

### [Array.match](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:422)

Branches on whether an array is empty and passes the complete non-empty array to the matching handler.

```ts
import { Array } from "effect"

const describe = Array.match({
  onEmpty: () => "empty",
  onNonEmpty: (values) => `first: ${values[0]}`,
})
const result = describe(["ready"]) // "first: ready"
```

### [Array.matchLeft](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:476)

Branches on whether an array is empty and splits a non-empty array into its head and remaining tail.

```ts
import { Array } from "effect"

const describe = Array.matchLeft({
  onEmpty: () => "empty",
  onNonEmpty: (head, tail) => `${head} + ${tail.length} more`,
})
const result = describe(["a", "b"]) // "a + 1 more"
```

### [Array.matchRight](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:530)

Branches on whether an array is empty and splits a non-empty array into its initial elements and final element.

```ts
import { Array } from "effect"

const describe = Array.matchRight({
  onEmpty: () => "empty",
  onNonEmpty: (init, last) => `${init.length} before ${last}`,
})
const result = describe(["a", "b"]) // "1 before b"
```

### [Array.isReadonlyArrayNonEmpty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:892)

Narrows a readonly array to `NonEmptyReadonlyArray` after checking its length.

```ts
import { Array } from "effect"

const values: ReadonlyArray<number> = [1, 2]
if (Array.isReadonlyArrayNonEmpty(values)) console.log(values[0])
```

### [Array.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:951)

Reads an index safely and returns `Option.none()` instead of throwing for an out-of-bounds index.

```ts
import { Array, Option, pipe } from "effect"

const userId = pipe(
  Array.get(["user-1", "alice@example.com"], 0),
  Option.filter((id) => id.startsWith("user-")),
  Option.map((id) => id.toUpperCase())
)
```

### [Array.head](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:1085)

Returns the first element as an `Option`, making empty-array handling explicit.

```ts
import { Array, Option } from "effect"

const first = Array.head(["a", "b"])
console.log(Option.getOrElse(first, () => "missing"))
```

### [Array.take](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:1296)

Keeps the first `n` values from an iterable and returns a new array.

```ts
import { Array } from "effect"

const preview = Array.take([1, 2, 3, 4], 2) // [1, 2]
```

### [Array.takeWhile](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:1367)

Keeps the leading prefix while a predicate or refinement succeeds.

```ts
import { Array } from "effect"

const prefix = Array.takeWhile([2, 4, 5, 6], (n) => n % 2 === 0) // [2, 4]
```

### [Array.findFirst](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:1728)

Returns the first matching or mapped value as an `Option`, stopping at the first success.

```ts
import { Array } from "effect"

const match = Array.findFirst([1, 3, 4], (n) => n % 2 === 0) // Some(4)
```

### [Array.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:3493)

Transforms every element into a new array and passes the element index to the mapper.

```ts
import { Array } from "effect"

const labels = Array.map(["a", "b"], (value, index) => `${index}:${value}`)
```

### [Array.flatMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:3527)

Maps each element to an iterable and concatenates the results into one array.

```ts
import { Array } from "effect"

const expanded = Array.flatMap([1, 2], (n) => Array.range(1, n))
```

### [Array.filterMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:3710)

Maps with a `Result` and keeps only successful values, combining filtering and transformation in one pass.

```ts
import { Array, Result } from "effect"

const even = Array.filterMap([1, 2, 3], (n) => n % 2 === 0 ? Result.succeed(n * 10) : Result.failVoid)
```

### [Array.filter](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:3752)

Keeps elements satisfying a predicate or refinement and returns a new array.

```ts
import { Array } from "effect"

const positive = Array.filter([-1, 2, -3, 4], (n) => n > 0) // [2, 4]
```

### [Array.partition](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:3801)

Runs a `Result`-returning classifier and keeps failures and successes separately.

```ts
import { Array, Result } from "effect"

const [invalid, valid] = Array.partition(["18", "unknown", "21"], (input) => {
  const age = Number(input)
  return Number.isInteger(age) && age >= 18 ? Result.succeed(age) : Result.fail(input)
})
```

### [Array.zipWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:2240)

Combines corresponding elements from two iterables, stopping at the shorter input.

```ts
import { Array } from "effect"

const totals = Array.zipWith([10, 20], [2, 3], (price, count) => price * count)
```

### [Array.reduce](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Array.ts:3893)

Folds an iterable from left to right into one accumulated value.

```ts
import { Array } from "effect"

const total = Array.reduce([1, 2, 3], 0, (sum, value) => sum + value)
```
