# `Types`

Source: [Effect v4 `Types` API](https://www.effect.website/docs/v4/api/effect/Types). Examples use type-only imports from `effect`.

`Types` contains type-level helpers for expressing and transforming generic TypeScript relationships without adding runtime data.

## API index

1. [Types.ExtractTag](#typesextracttag)
2. [Types.ExcludeTag](#typesexcludetag)
3. [Types.Tags](#typestags)
4. [Types.MergeRight](#typesmergeright)
5. [Types.Simplify](#typessimplify)
6. [Types.NoInfer](#typesnoinfer)
7. [Types.UnionToIntersection](#typesuniontointersection)
8. [Types.Concurrency](#typesconcurrency)
9. [Types.Equals](#typesequals)

### Additional known APIs (not expanded)

`TupleOf`, `TupleOfAtLeast`, `EqualsWith`, `Has`, `MergeLeft`, `Mutable`, `DeepMutable`, `Invariant`, `Covariant`, `Contravariant`, `VoidIfEmpty`, `NotFunction`, `NoExcessProperties`, `unassigned`, `unhandled`, `IsUnion`, `ReasonOf`, `ReasonTags`, `ExtractReason`, `NarrowReason`, `OmitReason`, `ExcludeReason`, `RequiredKeys`

### [Types.ExtractTag](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Types.ts:187)

Selects one member of a tagged union by its `_tag`, keeping its payload type.

```ts
import type { Types } from "effect"

type Error = { _tag: "NotFound"; id: string } | { _tag: "Timeout"; ms: number }
type Timeout = Types.ExtractTag<Error, "Timeout">
```

### [Types.ExcludeTag](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Types.ts:154)

Removes one tagged variant from an error or state union.

```ts
import type { Types } from "effect"

type Error = { _tag: "NotFound" } | { _tag: "Timeout" }
type WithoutTimeout = Types.ExcludeTag<Error, "Timeout">
```

### [Types.Tags](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Types.ts:120)

Extracts the string-literal tag union used to constrain matching and recovery APIs.

```ts
import type { Types } from "effect"

type Error = { _tag: "NotFound" } | { _tag: "Timeout" }
type ErrorTag = Types.Tags<Error>
```

### [Types.MergeRight](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Types.ts:405)

Merges object types with the second type winning on overlapping keys.

```ts
import type { Types } from "effect"

type Config = Types.MergeRight<{ port: number; host: string }, { port: 8080 }>
```

### [Types.Simplify](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Types.ts:250)

Flattens an intersection for readable editor output without changing its meaning.

```ts
import type { Types } from "effect"

type Readable = Types.Simplify<{ id: string } & { active: boolean }>
```

### [Types.NoInfer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Types.ts:544)

Prevents a callback or fallback parameter from widening the type inferred from the primary value.

```ts
import type { Types } from "effect"

declare const withDefault: <A>(value: A, fallback: Types.NoInfer<A>) => A
const value = withDefault<"draft" | "published">("draft", "published")
```

### [Types.UnionToIntersection](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Types.ts:219)

Combines a union of object capabilities into one type when composing descriptors or service fragments.

```ts
import type { Types } from "effect"

type Capability = { read: true } | { write: true }
type AllCapabilities = Types.UnionToIntersection<Capability>
```

### [Types.Concurrency](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Types.ts:440)

Names the supported concurrency options shared by Effect combinators.

```ts
import type { Types } from "effect"

const limit: Types.Concurrency = 8
const inherited: Types.Concurrency = "inherit"
```

### [Types.Equals](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Types.ts:282)

Produces a type-level boolean for exact equality checks in type tests and generic constraints.

```ts
import type { Types } from "effect"

type Same = Types.Equals<{ id: string }, { id: string }>
type Different = Types.Equals<{ id: string }, { id: number }>
```
