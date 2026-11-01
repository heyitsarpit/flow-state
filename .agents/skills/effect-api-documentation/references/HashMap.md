# `HashMap`

Source: [Effect v4 `HashMap` API](https://www.effect.website/docs/v4/api/effect/HashMap). Examples assume `import { HashMap } from "effect"`.

`HashMap` provides immutable hash-map collections for keyed lookup, insertion, removal, transformation, and traversal.

## API index

1. [HashMap.HashMap](#hashmaphashmap)
2. [HashMap.make](#hashmapmake)
3. [HashMap.fromIterable](#hashmapfromiterable)
4. [HashMap.get](#hashmapget)
5. [HashMap.set](#hashmapset)
6. [HashMap.has](#hashmaphas)
7. [HashMap.modifyAt](#hashmapmodifyat)
8. [HashMap.remove](#hashmapremove)
9. [HashMap.union](#hashmapunion)
10. [HashMap.map](#hashmapmap)
11. [HashMap.filter](#hashmapfilter)
12. [HashMap.reduce](#hashmapreduce)
13. [HashMap.findFirst](#hashmapfindfirst)
14. [HashMap.empty](#hashmapempty)

### Additional known APIs (not expanded)

`isHashMap`, `isEmpty`, `getHash`, `getUnsafe`, `hasHash`, `hasBy`, `keys`, `values`, `toValues`, `entries`, `toEntries`, `size`, `beginMutation`, `endMutation`, `mutate`, `modifyHash`, `modify`, `removeMany`, `setMany`, `flatMap`, `forEach`, `compact`, `filterMap`, `some`, `every`

### [HashMap.HashMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:51)

Represents an immutable hash-based map with structural key equality.

```ts
const users: HashMap.HashMap<string, number> = HashMap.empty();
```

### [HashMap.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:264)

Creates a map from key/value tuples.

```ts
const users = HashMap.make(["ada", 1], ["grace", 2]);
```

### [HashMap.fromIterable](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:288)

Creates a map from an iterable of key/value tuples.

```ts
const users = HashMap.fromIterable([["ada", 1], ["grace", 2]] as const);
```

### [HashMap.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:332)

Looks up a key safely and returns an `Option`.

```ts
const user = HashMap.get(HashMap.make(["ada", 1]), "ada");
```

### [HashMap.set](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:523)

Returns a new map with a key associated to a value.

```ts
const updated = HashMap.set(HashMap.make(["ada", 1]), "grace", 2);
```

### [HashMap.has](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:440)

Checks whether a key is present.

```ts
const present = HashMap.has(HashMap.make(["ada", 1]), "ada");
```

### [HashMap.modifyAt](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:805)

Updates or removes a key based on its current `Option` value.

```ts
import { HashMap, Option } from "effect";

const increment = HashMap.modifyAt(HashMap.make(["count", 1]), "count", (current) =>
  Option.map(current, (value) => value + 1));
```

### [HashMap.remove](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:937)

Returns a new map without a key.

```ts
const remaining = HashMap.remove(HashMap.make(["ada", 1], ["grace", 2]), "ada");
```

### [HashMap.union](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:912)

Combines maps, with entries from the right-hand map winning duplicate keys.

```ts
const merged = HashMap.union(HashMap.make(["a", 1]), HashMap.make(["a", 2], ["b", 3]));
```

### [HashMap.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:1009)

Transforms each value while retaining its key.

```ts
const labels = HashMap.map(HashMap.make(["a", 1]), (value, key) => `${key}:${value}`);
```

### [HashMap.filter](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:1113)

Keeps entries that satisfy a predicate.

```ts
const large = HashMap.filter(HashMap.make(["a", 1], ["b", 2]), (value) => value > 1);
```

### [HashMap.reduce](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:1088)

Folds entries into one accumulated value.

```ts
const total = HashMap.reduce(HashMap.make(["a", 1], ["b", 2]), 0, (sum, value) => sum + value);
```

### [HashMap.findFirst](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:1189)

Finds the first matching key/value entry as an `Option`.

```ts
const found = HashMap.findFirst(HashMap.make(["a", 1], ["b", 2]), (value) => value > 1);
```

### [HashMap.empty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/HashMap.ts:246)

Creates an empty map with inferred or explicit key and value types.

```ts
const cache = HashMap.empty<string, number>();
```
