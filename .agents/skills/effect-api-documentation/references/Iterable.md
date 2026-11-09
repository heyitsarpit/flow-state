# `Iterable`

Source: [Effect v4 `Iterable` API](https://www.effect.website/docs/v4/api/effect/Iterable). Examples assume `import { Iterable } from "effect"`.

`Iterable` works with arrays, strings, sets, generators, and custom lazy sequences without forcing them into arrays until a consumer needs materialized values.

## API index

1. [Iterable.makeBy](#iterablemakeby)
2. [Iterable.range](#iterablerange)
3. [Iterable.replicate](#iterablereplicate)
4. [Iterable.repeat](#iterablerepeat)
5. [Iterable.take](#iterabletake)
6. [Iterable.drop](#iterabledrop)
7. [Iterable.head](#iterablehead)
8. [Iterable.findFirst](#iterablefindfirst)
9. [Iterable.zip](#iterablezip)
10. [Iterable.zipWith](#iterablezipwith)
11. [Iterable.map](#iterablemap)
12. [Iterable.flatMap](#iterableflatmap)
13. [Iterable.flatten](#iterableflatten)
14. [Iterable.filter](#iterablefilter)
15. [Iterable.groupBy](#iterablegroupby)
16. [Iterable.filterMap](#iterablefiltermap)
17. [Iterable.flatMapNullishOr](#iterableflatmapnullishor)
18. [Iterable.getSomes](#iterablegetsomes)
19. [Iterable.some](#iterablesome)
20. [Iterable.forEach](#iterableforeach)
21. [Iterable.unfold](#iterableunfold)
22. [Iterable.reduce](#iterablereduce)

### Additional known APIs (not expanded)

`forever`, `fromRecord`, `prepend`, `prependAll`, `append`, `appendAll`, `scan`, `isEmpty`, `size`, `headUnsafe`, `takeWhile`, `findLast`, `intersperse`, `contains`, `chunksOf`, `groupWith`, `filterMapWhile`, `getFailures`, `getSuccesses`, `dedupeAdjacent`, `cartesian`, `countBy`.

## Type-level concepts

`Iterable<A>` is the built-in TypeScript iteration protocol, not a separate
Effect collection type. The transformation helpers preserve the element type
through their return value, and predicate or refinement overloads can narrow
it. Most transformations stay lazy; `forEach`, `reduce`, and terminal checks
such as `some` consume the iterable.

```ts
import { Iterable } from "effect"

const doubled: globalThis.Iterable<number> = Iterable.map([1, 2], (n) => n * 2)
```

### [Iterable.makeBy](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:55)

Creates a lazy iterable from an index-based function. Omit `length` only when a downstream consumer will bound the sequence.

```ts
import { Iterable } from "effect"

const squares = Iterable.makeBy((n) => n * n, { length: 3 })
console.log(globalThis.Array.from(squares)) // [0, 1, 4]
```

### [Iterable.range](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:95)

Creates an inclusive integer iterable, or an unbounded sequence when no end is supplied.

```ts
import { Iterable } from "effect"

const pages = Iterable.range(1, 3)
console.log(globalThis.Array.from(pages)) // [1, 2, 3]
```

### [Iterable.replicate](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:123)

Creates a lazy iterable that repeats one value a bounded number of times.

```ts
import { Iterable } from "effect"

const retries = Iterable.replicate("retry", 3)
console.log(globalThis.Array.from(retries)) // ["retry", "retry", "retry"]
```

### [Iterable.repeat](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:145)

Repeats an iterable's contents a fixed number of times and obtains a fresh iterator for each repetition.

```ts
import { Iterable } from "effect"

const repeated = Iterable.repeat([1, 2], 2)
console.log(globalThis.Array.from(repeated)) // [1, 2, 1, 2]
```

### [Iterable.take](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:586)

Bounds an iterable by keeping only its first `n` values, which is essential before materializing an unbounded sequence.

```ts
import { Iterable } from "effect"

const firstTen = Iterable.take(Iterable.range(0), 10)
console.log(globalThis.Array.from(firstTen).length) // 10
```

### [Iterable.drop](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:693)

Skips the first `n` values and yields the remaining values lazily.

```ts
import { Iterable } from "effect"

const rest = Iterable.drop(["header", "a", "b"], 1)
console.log(globalThis.Array.from(rest)) // ["a", "b"]
```

### [Iterable.head](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:506)

Returns the first value as an `Option` without throwing on an empty iterable.

```ts
import { Iterable, Option } from "effect"

const first = Iterable.head(new Set(["ready"]))
console.log(Option.getOrElse(first, () => "missing"))
```

### [Iterable.findFirst](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:755)

Finds the first matching or mapped value and returns it as an `Option`.

```ts
import { Iterable } from "effect"

const user = Iterable.findFirst([{ id: 1 }, { id: 2 }], (item) => item.id === 2)
```

### [Iterable.zip](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:879)

Pairs corresponding values and stops when either input is exhausted.

```ts
import { Iterable } from "effect"

const pairs = Iterable.zip([1, 2], ["a", "b"])
console.log(globalThis.Array.from(pairs)) // [[1, "a"], [2, "b"]]
```

### [Iterable.zipWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:934)

Combines corresponding values directly instead of allocating tuple pairs.

```ts
import { Iterable } from "effect"

const totals = Iterable.zipWith([1, 2], [10, 20], (a, b) => a + b)
console.log(globalThis.Array.from(totals)) // [11, 22]
```

### [Iterable.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:1487)

Lazily transforms each value and passes the zero-based index to the mapper.

```ts
import { Iterable } from "effect"

const labels = Iterable.map(["a", "b"], (value, index) => `${index}:${value}`)
```

### [Iterable.flatMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:1546)

Maps each value to an iterable and concatenates the results lazily.

```ts
import { Iterable } from "effect"

const expanded = Iterable.flatMap([1, 2], (n) => Iterable.range(1, n))
```

### [Iterable.flatten](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:1589)

Flattens one level of nested iterables without recursively flattening deeper values.

```ts
import { Iterable } from "effect"

const values = Iterable.flatten([[1, 2], [3]])
console.log(globalThis.Array.from(values)) // [1, 2, 3]
```

### [Iterable.filter](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:1918)

Lazily keeps values matching a predicate or refinement and preserves the narrowed element type for refinements.

```ts
import { Iterable } from "effect"

const positives = Iterable.filter([-1, 2, -3, 4], (n) => n > 0)
console.log(globalThis.Array.from(positives)) // [2, 4]
```

### [Iterable.groupBy](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:1351)

Consumes an iterable and groups all elements into non-empty record buckets by a computed string or symbol key. Matching elements do not need to be adjacent.

```ts
import { Iterable } from "effect"

const events = new Set([
  { id: "e1", kind: "audit" as const },
  { id: "e2", kind: "metric" as const },
  { id: "e3", kind: "audit" as const },
])
const byKind = Iterable.groupBy(events, (event) => event.kind)
console.log(byKind.audit) // [{ id: "e1", kind: "audit" }, { id: "e3", kind: "audit" }]
```

### [Iterable.filterMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:1660)

Maps values to `Result`s and yields only successful results, skipping failures lazily.

```ts
import { Iterable, Result } from "effect"

const numbers = Iterable.filterMap(["1", "bad", "3"], (text) => {
  const value = Number(text)
  return Number.isNaN(value) ? Result.failVoid : Result.succeed(value)
})
console.log(globalThis.Array.from(numbers)) // [1, 3]
```

### [Iterable.flatMapNullishOr](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:1990)

Maps values to nullable results and drops `null` and `undefined` values without an intermediate `Option`.

```ts
import { Iterable } from "effect"

const values = Iterable.flatMapNullishOr(["a", "x"], (key) => new Map([["a", 1]]).get(key))
```

### [Iterable.getSomes](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:1765)

Extracts present values from an iterable of `Option`s and skips `None` values.

```ts
import { Iterable, Option } from "effect"

const values = Iterable.getSomes([Option.some(1), Option.none(), Option.some(2)])
```

### [Iterable.some](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:2043)

Checks whether any element satisfies a predicate and stops at the first match.

```ts
import { Iterable } from "effect"

const hasFailure = Iterable.some(["ok", "failed"], (value) => value === "failed")
```

### [Iterable.forEach](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:2154)

Consumes an iterable and invokes a callback for each value with its zero-based index.

```ts
import { Iterable } from "effect"

const seen: Array<string> = []
Iterable.forEach(["a", "b"], (value, index) => {
  seen.push(`${index}:${value}`)
})
```

### [Iterable.unfold](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:2099)

Generates a lazy iterable from a state transition that returns `Option.some([value, nextState])` or `Option.none()` to stop.

```ts
import { Iterable, Option } from "effect"

const countdown = Iterable.unfold(3, (n) => n > 0 ? Option.some([n, n - 1] as const) : Option.none())
```

### [Iterable.reduce](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Iterable.ts:2215)

Folds an iterable from left to right into an accumulated value while exposing each index.

```ts
import { Iterable } from "effect"

const total = Iterable.reduce([1, 2, 3], 0, (sum, value) => sum + value)
```
