# `HashSet`

Source: [Effect v4 `HashSet` API](https://www.effect.website/docs/v4/api/effect/HashSet). Examples assume `import { HashSet } from "effect"`.

`HashSet` provides immutable hash sets for membership, insertion, removal, combination, and traversal of unique values.

## API index

1. [HashSet.HashSet](#hashsethashset)
2. [HashSet.make](#hashsetmake)
3. [HashSet.fromIterable](#hashsetfromiterable)
4. [HashSet.add](#hashsetadd)
5. [HashSet.has](#hashsethas)
6. [HashSet.remove](#hashsetremove)
7. [HashSet.union](#hashsetunion)
8. [HashSet.intersection](#hashsetintersection)
9. [HashSet.difference](#hashsetdifference)
10. [HashSet.isSubset](#hashsetissubset)
11. [HashSet.map](#hashsetmap)
12. [HashSet.filter](#hashsetfilter)
13. [HashSet.some](#hashsetsome)
14. [HashSet.every](#hashsetevery)
15. [HashSet.reduce](#hashsetreduce)

### Additional known APIs (not expanded)

`empty`, `isHashSet`, `size`, `isEmpty`

### [HashSet.HashSet](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:51)

Represents an immutable hash-based set with structural value equality.

```ts
const ids: HashSet.HashSet<string> = HashSet.empty();
```

### [HashSet.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:149)

Creates a set from values and removes duplicates.

```ts
const ids = HashSet.make("u1", "u2", "u1");
```

### [HashSet.fromIterable](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:174)

Creates a set from any iterable.

```ts
const ids = HashSet.fromIterable(["u1", "u2", "u1"]);
```

### [HashSet.add](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:223)

Returns a new set containing a value.

```ts
const updated = HashSet.add(HashSet.make("u1"), "u2");
```

### [HashSet.has](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:265)

Checks membership using the set's equality and hashing behavior.

```ts
const present = HashSet.has(HashSet.make("u1"), "u1");
```

### [HashSet.remove](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:296)

Returns a new set without a value.

```ts
const remaining = HashSet.remove(HashSet.make("u1", "u2"), "u1");
```

### [HashSet.union](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:366)

Combines all values from two sets.

```ts
const all = HashSet.union(HashSet.make("a"), HashSet.make("b", "a"));
```

### [HashSet.intersection](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:393)

Keeps only values present in both sets.

```ts
const common = HashSet.intersection(HashSet.make("a", "b"), HashSet.make("b", "c"));
```

### [HashSet.difference](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:420)

Keeps values in the first set that are absent from the second.

```ts
const onlyA = HashSet.difference(HashSet.make("a", "b"), HashSet.make("b"));
```

### [HashSet.isSubset](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:449)

Checks whether every value in one set is contained by another.

```ts
const subset = HashSet.isSubset(HashSet.make("a"), HashSet.make("a", "b"));
```

### [HashSet.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:480)

Transforms values into a new set; collisions are deduplicated.

```ts
const lengths = HashSet.map(HashSet.make("a", "bb"), (value) => value.length);
```

### [HashSet.filter](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:506)

Keeps values that satisfy a predicate.

```ts
const evens = HashSet.filter(HashSet.make(1, 2, 3), (value) => value % 2 === 0);
```

### [HashSet.some](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:542)

Checks whether at least one value satisfies a predicate.

```ts
const hasLarge = HashSet.some(HashSet.make(1, 2, 3), (value) => value > 2);
```

### [HashSet.every](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:570)

Checks whether every value satisfies a predicate.

```ts
const allPositive = HashSet.every(HashSet.make(1, 2, 3), (value) => value > 0);
```

### [HashSet.reduce](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashSet.ts:599)

Folds set values into one result.

```ts
const total = HashSet.reduce(HashSet.make(1, 2, 3), 0, (sum, value) => sum + value);
```
