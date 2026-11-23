# `Chunk`

Source: [Effect v4 `Chunk` API](https://www.effect.website/docs/v4/api/effect/Chunk). Examples assume `import { Chunk } from "effect"`.

`Chunk` is an immutable, efficient sequence for batching, transforming, and traversing values without exposing its internal representation.

## API index

1. [Chunk.Chunk](#chunkchunk)
2. [Chunk.fromIterable](#chunkfromiterable)
3. [Chunk.make](#chunkmake)
4. [Chunk.map](#chunkmap)
5. [Chunk.flatMap](#chunkflatmap)
6. [Chunk.filter](#chunkfilter)
7. [Chunk.append](#chunkappend)
8. [Chunk.prepend](#chunkprepend)
9. [Chunk.take](#chunktake)
10. [Chunk.drop](#chunkdrop)
11. [Chunk.head](#chunkhead)
12. [Chunk.toArray](#chunktoarray)
13. [Chunk.sort](#chunksort)
14. [Chunk.splitAt](#chunksplitat)
15. [Chunk.chunksOf](#chunkchunksof)
16. [Chunk.findFirst](#chunkfindfirst)
17. [Chunk.contains](#chunkcontains)

### Additional known APIs (not expanded)

`NonEmptyChunk`, `makeEquivalence`, `isChunk`, `empty`, `of`, `toReadonlyArray`, `reverse`, `get`, `fromArrayUnsafe`, `fromNonEmptyArrayUnsafe`, `getUnsafe`, `dropRight`, `dropWhile`, `prependAll`, `appendAll`, `filterMap`, `filterMapWhile`, `compact`, `flatten`, `forEach`, `mapAccum`, `partition`, `separate`, `size`, `sortWith`, `splitNonEmptyAt`, `split`, `splitWhere`, `tail`, `tailNonEmpty`, `takeRight`, `takeWhile`, `union`, `intersection`, `difference`, `dedupe`, `dedupeAdjacent`, `unzip`, `zipWith`, `zip`, `remove`, `modify`, `replace`, `makeBy`, `range`, `containsWith`, `findFirstIndex`, `findLast`, `findLastIndex`, `every`, `some`, `join`, `reduce`, `reduceRight`

### [Chunk.Chunk](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:51)

Represents an immutable, iterable sequence optimized for persistent updates.

```ts
const values: Chunk.Chunk<number> = Chunk.make(1, 2, 3);
```

### [Chunk.fromIterable](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:353)

Creates a chunk from any iterable.

```ts
const values = Chunk.fromIterable(new Set([1, 2, 3]));
```

### [Chunk.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:318)

Creates a non-empty chunk from one or more values.

```ts
const values = Chunk.make("a", "b", "c");
```

### [Chunk.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:1707)

Transforms every element while preserving chunk structure.

```ts
const doubled = Chunk.map(Chunk.make(1, 2), (value) => value * 2);
```

### [Chunk.flatMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:1168)

Maps each element to a chunk and concatenates the results.

```ts
const letters = Chunk.flatMap(Chunk.make("ab", "cd"), (word) => Chunk.fromIterable(word));
```

### [Chunk.filter](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:1061)

Keeps only elements that satisfy a predicate.

```ts
const evens = Chunk.filter(Chunk.make(1, 2, 3, 4), (n) => n % 2 === 0);
```

### [Chunk.append](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:695)

Returns a new chunk with one value appended.

```ts
const values = Chunk.append(Chunk.make(1, 2), 3);
```

### [Chunk.prepend](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:721)

Returns a new chunk with one value prepended.

```ts
const values = Chunk.prepend(Chunk.make(2, 3), 1);
```

### [Chunk.take](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:742)

Keeps up to the first `n` elements.

```ts
const first = Chunk.take(Chunk.make(1, 2, 3), 2);
```

### [Chunk.drop](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:799)

Removes up to the first `n` elements.

```ts
const rest = Chunk.drop(Chunk.make(1, 2, 3), 1);
```

### [Chunk.head](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:1406)

Returns the first element as an `Option`, avoiding an unsafe empty access.

```ts
const first = Chunk.head(Chunk.make("a", "b"));
```

### [Chunk.toArray](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:409)

Materializes a chunk into a mutable JavaScript array.

```ts
const array = Chunk.toArray(Chunk.make(1, 2, 3));
```

### [Chunk.sort](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:1880)

Returns a sorted chunk using an `Order`.

```ts
import { Chunk, Order } from "effect";

const sorted = Chunk.sort(Chunk.make(3, 1, 2), Order.Number);
```

### [Chunk.splitAt](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:1956)

Splits a chunk into a prefix and suffix at an index.

```ts
const [before, after] = Chunk.splitAt(Chunk.make(1, 2, 3), 2);
```

### [Chunk.chunksOf](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:1298)

Partitions a chunk into chunks of at most the requested size.

```ts
const groups = Chunk.chunksOf(Chunk.make(1, 2, 3, 4, 5), 2);
```

### [Chunk.findFirst](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:2629)

Returns the first matching element as an `Option`.

```ts
const found = Chunk.findFirst(Chunk.make(1, 2, 3), (n) => n > 1);
```

### [Chunk.contains](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Chunk.ts:2558)

Checks membership using the default equality behavior.

```ts
const present = Chunk.contains(Chunk.make("api", "worker"), "api");
```
