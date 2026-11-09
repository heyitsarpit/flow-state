# `Record`

Source: [Effect v4 `Record` API](https://www.effect.website/docs/v4/api/effect/Record). Examples assume `import { Record } from "effect"`.

`Record` provides non-mutating construction, lookup, transformation, filtering, folding, and typed key operations for string- or symbol-keyed records.

## API index

1. [Record.ReadonlyRecord](#recordreadonlyrecord)
2. [Record.ReadonlyRecord.NonLiteralKey](#recordreadonlyrecordnonliteralkey)
3. [Record.ReadonlyRecord.IntersectKeys](#recordreadonlyrecordintersectkeys)
4. [Record.ReadonlyRecordTypeLambda](#recordreadonlyrecordtypelambda)
5. [Record.empty](#recordempty)
6. [Record.fromEntries](#recordfromentries)
7. [Record.collect](#recordcollect)
8. [Record.has](#recordhas)
9. [Record.get](#recordget)
10. [Record.modify](#recordmodify)
11. [Record.replace](#recordreplace)
12. [Record.remove](#recordremove)
13. [Record.map](#recordmap)
14. [Record.mapKeys](#recordmapkeys)
15. [Record.mapEntries](#recordmapentries)
16. [Record.filterMap](#recordfiltermap)
17. [Record.filter](#recordfilter)
18. [Record.getSomes](#recordgetsomes)
19. [Record.keys](#recordkeys)
20. [Record.values](#recordvalues)
21. [Record.set](#recordset)
22. [Record.reduce](#recordreduce)
23. [Record.union](#recordunion)

### Additional known APIs (not expanded)

`isEmptyRecord`, `isEmptyReadonlyRecord`, `pop`, `getFailures`, `getSuccesses`, `partition`, `separate`, `every`, `some`, `intersection`, `difference`, `makeEquivalence`, `singleton`, `makeReducerUnion`, `makeReducerIntersection`.

## Type-level concepts

`ReadonlyRecord<K, A>` represents a record with known key and value types, and
its transformations preserve those relationships while returning fresh values.
`ReadonlyRecordTypeLambda` is type-level plumbing for generic record APIs.

```ts
import type { Record } from "effect"

const settings: Record.ReadonlyRecord<"mode", "safe" | "fast"> = { mode: "safe" }
```

### [Record.ReadonlyRecord](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:45)

Represents a readonly record whose keys are `K` and values are `A`. Its nested namespace contains type-level key utilities such as `NonLiteralKey` and `IntersectKeys`.

```ts
import type { Record } from "effect"

const settings: Record.ReadonlyRecord<"mode", "safe" | "fast"> = { mode: "safe" }
```

### [Record.ReadonlyRecord.NonLiteralKey](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:92)

Widens finite literal string keys to `string` while preserving generic symbol keys for record transforms.

```ts
import type { Record } from "effect"

type Key = Record.ReadonlyRecord.NonLiteralKey<"userId"> // string
```

### [Record.ReadonlyRecord.IntersectKeys](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:114)

Computes the common key type for two string-keyed records, including generic-string cases.

```ts
import type { Record } from "effect"

type Common = Record.ReadonlyRecord.IntersectKeys<"a" | "b", "b" | "c"> // "b"
```

### [Record.ReadonlyRecordTypeLambda](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:145)

Provides the higher-kinded type encoding for readonly records in generic typeclass utilities.

```ts
import type { HKT, Record } from "effect"

type Configs = HKT.Kind<Record.ReadonlyRecordTypeLambda, never, never, never, string>
const configs: Configs = { api: "v4" }
```

### [Record.empty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:169)

Creates an empty record with an explicit key and value type when inference needs help.

```ts
import { Record } from "effect"

const counts = Record.empty<string, number>()
```

### [Record.fromEntries](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:310)

Builds a typed record from an iterable of key-value tuples.

```ts
import { Record } from "effect"

const users = Record.fromEntries([["alice", 1], ["bob", 2]] as const)
```

### [Record.collect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:333)

Transforms every record entry into an array value while providing both key and value to the mapper.

```ts
import { Record } from "effect"

const entries = Record.collect({ a: 1, b: 2 }, (key, value) => `${key}=${value}`)
```

### [Record.has](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:401)

Checks own-property membership without confusing a missing key with a present `undefined` value.

```ts
import { Record } from "effect"

const present = Record.has({ token: undefined }, "token") // true
```

### [Record.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:435)

Looks up a key as an `Option`, keeping missing-key handling explicit.

```ts
import { Option, Record, pipe } from "effect"

const userPath = pipe(
  Record.get({ "x-user-id": "u1" }, "x-user-id"),
  Option.filter((id) => id.length > 0),
  Option.map((id) => `/users/${id}`)
)
```

### [Record.modify](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:464)

Applies a function to an existing key and returns the updated record in an `Option`.

```ts
import { Record } from "effect"

const updated = Record.modify({ retries: 1 }, "retries", (n) => n + 1)
```

### [Record.replace](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:507)

Replaces an existing key and returns `Option.none()` when that key is absent.

```ts
import { Record } from "effect"

const updated = Record.replace({ mode: "safe" }, "mode", "fast")
```

### [Record.remove](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:550)

Returns a shallow copy without the selected key and preserves the original record.

```ts
import { Record } from "effect"

const withoutToken = Record.remove({ token: "secret", user: "a" }, "token")
```

### [Record.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:619)

Transforms record values while preserving each key and passing the key to the mapper.

```ts
import { Record } from "effect"

const labels = Record.map({ a: 1, b: 2 }, (value, key) => `${key}:${value}`)
```

### [Record.mapKeys](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:651)

Transforms keys while retaining their associated values.

```ts
import { Record } from "effect"

const headers = Record.mapKeys({ contentType: "json" }, (key) => key.toLowerCase())
```

### [Record.mapEntries](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:692)

Transforms keys and values together by returning a replacement entry tuple.

```ts
import { Record } from "effect"

const headers = {
  "Content-Type": " application/json ",
  "X-Request-ID": " req-42 ",
}
const normalized = Record.mapEntries(
  headers,
  (value, key) => [key.toLowerCase(), value.trim()] as const
)
```

### [Record.filterMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:733)

Keeps only successful `Result` mappings and preserves the original keys for retained values.

```ts
import { Record, Result } from "effect"

const ports = Record.filterMap({ api: "8080", retries: "3", mode: "fast" }, (value) => {
  const port = Number(value)
  return Number.isInteger(port) ? Result.succeed(port) : Result.failVoid
})
```

### [Record.filter](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:774)

Keeps entries whose values satisfy a predicate or refinement.

```ts
import { Record } from "effect"

const enabled = Record.filter({ a: true, b: false }, (value) => value)
```

### [Record.getSomes](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:824)

Extracts present values from a record of `Option`s while preserving their keys.

```ts
import { Option, Record } from "effect"

const present = Record.getSomes({ a: Option.some(1), b: Option.none() })
```

### [Record.keys](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:1004)

Returns the record's enumerable string keys as an array.

```ts
import { Record } from "effect"

const names = Record.keys({ a: 1, b: 2 })
```

### [Record.values](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:1022)

Returns the record's values as an array in key iteration order.

```ts
import { Record } from "effect"

const values = Record.values({ a: 1, b: 2 })
```

### [Record.set](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:1040)

Adds or replaces one key in a new record without mutating the input.

```ts
import { Record } from "effect"

const next = Record.set({ retries: 1 }, "retries", 2)
```

### [Record.reduce](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:1157)

Folds record values from left to right while exposing each key to the reducer.

```ts
import { Record } from "effect"

const summary = Record.reduce({ a: 1, b: 2 }, 0, (total, value) => total + value)
```

### [Record.union](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Record.ts:1269)

Merges two records, using the combiner only for keys present in both inputs.

```ts
import { Record } from "effect"

const merged = Record.union({ retries: 1 }, { retries: 2, timeout: 10 }, (a, b) => a + b)
```
