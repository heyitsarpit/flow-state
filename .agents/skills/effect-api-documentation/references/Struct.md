# `Struct`

Source: [Effect v4 `Struct` API](https://www.effect.website/docs/v4/api/effect/Struct). Examples use `Struct` from `effect`.

`Struct` provides immutable helpers for constructing, selecting, omitting, assigning, and transforming record-like object values.

## API index

1. [Struct.assign](#structassign)
2. [Struct.pick](#structpick)
3. [Struct.omit](#structomit)
4. [Struct.evolve](#structevolve)
5. [Struct.renameKeys](#structrenamekeys)
6. [Struct.get](#structget)
7. [Struct.keys](#structkeys)
8. [Struct.map](#structmap)
9. [Struct.Simplify](#structsimplify)
10. [Struct.Assign](#structassign-1)
11. [Struct.Record](#structrecord)

### Additional known APIs (not expanded)

`Struct.Mutable`, `evolveKeys`, `evolveEntries`, `makeEquivalence`, `makeOrder`, `Lambda`, `Apply`, `lambda`, `mapPick`, `mapOmit`, `makeCombiner`, `makeReducer`

### [Struct.assign](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Struct.ts:274)

Merges two objects into a new object with the right-hand value winning on duplicate keys.

```ts
import { Struct } from "effect"

const config = Struct.assign({ port: 8080 })({ host: "localhost", port: 3000 })
```

### [Struct.pick](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Struct.ts:197)

Creates a new object containing only the selected keys, with the result type narrowed accordingly.

```ts
import { Struct } from "effect"

const publicUser = Struct.pick(["id", "name"])({ id: "u1", name: "Ada", secret: "x" })
```

### [Struct.omit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Struct.ts:234)

Creates a new object without selected keys, useful for removing secrets before logging or serialization.

```ts
import { Struct } from "effect"

const safe = Struct.omit(["password"])({ name: "Ada", password: "secret" })
```

### [Struct.evolve](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Struct.ts:324)

Transforms only the fields named in an evolver and preserves the rest of the object.

```ts
import { Struct } from "effect"

const updated = Struct.evolve({ count: (n: number) => n + 1 })({ count: 1, active: true })
```

### [Struct.renameKeys](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Struct.ts:467)

Renames keys with a typed mapping while leaving unlisted keys unchanged.

```ts
import { Struct } from "effect"

const apiUser = Struct.renameKeys({ userId: "id" })({ userId: "u1", name: "Ada" })
```

### [Struct.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Struct.ts:135)

Reads one property through a typed, pipeable accessor.

```ts
import { Struct } from "effect"

const name = Struct.get("name")({ name: "Ada", active: true })
```

### [Struct.keys](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Struct.ts:168)

Returns string keys as `Array<keyof S & string>` instead of the broad `string[]` from `Object.keys`.

```ts
import { Struct } from "effect"

const user = { name: "Ada", active: true }
const keys: Array<"name" | "active"> = Struct.keys(user)
```

### [Struct.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Struct.ts:694)

Applies one type-aware transformation to every value in an object.

```ts
import { Struct } from "effect"

interface AsArray extends Struct.Lambda {
  <A>(value: A): Array<A>
  readonly "~lambda.out": Array<this["~lambda.in"]>
}

const asArray = Struct.lambda<AsArray>((value) => [value])
const result = Struct.map(asArray)({ width: 10, height: 20 })
```

### [Struct.Simplify](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Struct.ts:49)

Flattens an object intersection for readable editor output while preserving its properties.

```ts
import type { Struct } from "effect"

type User = Struct.Simplify<{ id: string } & { active: boolean }>
```

### [Struct.Assign](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Struct.ts:108)

Computes the type-level result of assigning one object shape over another.

```ts
import type { Struct } from "effect"

type Config = Struct.Assign<{ port: number }, { port: 8080; host: string }>
```

### [Struct.Record](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Struct.ts:970)

Builds a record from a literal key list while preserving the key and value types.

```ts
import { Struct } from "effect"

const labels = Struct.Record(["draft", "published"] as const, "visible")
```
