# `SqlSchema`

**Unstable API.** Import this module from `effect/unstable/sql/SqlSchema`.
The [official v4 API reference](https://www.effect.website/docs/v4/api/effect/unstable/sql/SqlSchema) is useful for orientation, but the local pinned source is authoritative when it differs. The local checkout currently identifies the package as `effect@4.0.0-beta.98`.

## API index

1. [findOneOption](#findoneoption)
2. [findOne](#findone)
3. [findAll](#findall)
4. [findNonEmpty](#findnonempty)
5. [void](#void)

### Additional known APIs (not expanded)

None

### [findOneOption](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/SqlSchema.ts:148)

Builds a function that encodes a request, executes the SQL callback, decodes the first row, and returns `Option.none` when no row exists. Schema encoding and decoding services remain visible in the returned effect requirements.

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"

const findUser = SqlSchema.findOneOption({
  Request: Schema.Struct({ id: Schema.Number }),
  Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
  execute: (request) => Effect.succeed([{ id: request.id, name: "Ada" }])
})
```

### [findOne](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/SqlSchema.ts:115)

Builds a function that decodes the first returned row and fails with `Cause.NoSuchElementError` when the SQL callback returns no rows.

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"

const findUser = SqlSchema.findOne({
  Request: Schema.String,
  Result: Schema.Struct({ id: Schema.Number }),
  execute: (id) => Effect.succeed([{ id: Number(id) }])
})
```

### [findAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/SqlSchema.ts:33)

Builds a function that decodes every returned row and represents an empty result set as an empty array. The SQL callback receives the request after request-schema encoding.

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"

const findUsers = SqlSchema.findAll({
  Request: Schema.Void,
  Result: Schema.Struct({ id: Schema.Number }),
  execute: () => Effect.succeed([{ id: 1 }, { id: 2 }])
})
```

### [findNonEmpty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/SqlSchema.ts:65)

Builds a function like `findAll` but turns an empty result set into `Cause.NoSuchElementError`. Successful results are typed as a non-empty array.

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"

const requireUsers = SqlSchema.findNonEmpty({
  Request: Schema.Void,
  Result: Schema.Struct({ id: Schema.Number }),
  execute: () => Effect.succeed([{ id: 1 }])
})
```

### [void](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/SqlSchema.ts:86)

Builds a function that encodes the request, runs a side-effect-only SQL callback, and discards its result. The export is named `void` even though its implementation is internally named `void_`.

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"

const deleteUser = SqlSchema.void({
  Request: Schema.Number,
  execute: (id) => Effect.succeed(`deleted ${id}`)
})
```
