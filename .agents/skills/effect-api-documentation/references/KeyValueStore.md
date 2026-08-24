# `KeyValueStore`

**Unstable API.** Import this module from `effect/unstable/persistence/KeyValueStore`.
The [official v4 API reference](https://www.effect.website/docs/v4/api/effect/unstable/persistence/KeyValueStore) is useful for orientation, but the local pinned source is authoritative when it differs. The local checkout currently identifies the package as `effect@4.0.0-beta.98`.

## API index

1. [KeyValueStore service](#keyvaluestore-service)
2. [layerMemory](#layermemory)
3. [layerSql](#layersql)
4. [toSchemaStore](#toschemastore)
5. [prefix](#prefix)
6. [make](#make)
7. [layerFileSystem](#layerfilesystem)
8. [layerStorage](#layerstorage)

### Additional known APIs (not expanded)

`MakeOptions`, `MakeStringOptions`, `KeyValueStoreError`, `makeStringOnly`, `LayerSqlOptions`, `SchemaStore`

### [KeyValueStore service](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:38)

`KeyValueStore` provides effectful string and binary reads, writes, removal, clearing, size checks, and conditional modification. Missing keys are represented as `undefined`, while operational failures use `KeyValueStoreError`.

```ts
import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"

const program = Effect.gen(function*() {
  const store = yield* KeyValueStore.KeyValueStore
  yield* store.set("feature", "on")
  return yield* store.get("feature")
})
```

### [layerMemory](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:317)

Provides a process-local store backed by a `Map`. It is useful for tests and volatile state; values do not survive process restarts.

```ts
import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"

const program = Effect.succeed("ready").pipe(
  Effect.provide(KeyValueStore.layerMemory)
)
```

### [layerSql](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:472)

Provides a SQL-backed store and creates its configured table when needed. It requires the active `SqlClient` and stores both strings and binary values.

```ts
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"

const storeLayer = KeyValueStore.layerSql({ table: "app_kv" })
```

### [toSchemaStore](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:745)

Adapts a string/binary store to a JSON-encoded schema store. Reads decode to `Option`, writes encode the schema value, and schema failures remain typed.

```ts
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"
import * as Schema from "effect/Schema"

declare const store: KeyValueStore.KeyValueStore
const settings = KeyValueStore.toSchemaStore(
  store,
  Schema.Struct({ theme: Schema.String })
)
```

### [prefix](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:297)

Returns a view that prepends a fixed string to every key while delegating operations to the original store. This isolates namespaces without creating another backend.

```ts
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"

declare const store: KeyValueStore.KeyValueStore
const tenantStore = KeyValueStore.prefix(store, "tenant:42:")
```

### [make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:224)

Constructs a store from required primitive operations and derives `has`, `isEmpty`, `modify`, and `modifyUint8Array` unless overrides are supplied.

```ts
import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"

const store = KeyValueStore.make({
  get: () => Effect.succeed(undefined),
  getUint8Array: () => Effect.succeed(undefined),
  set: () => Effect.void,
  remove: () => Effect.void,
  clear: Effect.void,
  size: Effect.succeed(0)
})
```

### [layerFileSystem](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:349)

Provides a file-backed store rooted at the supplied directory, creating the directory when needed. The layer requires `FileSystem` and `Path` services, and `clear` removes and recreates that directory.

```ts
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"

const storeLayer = KeyValueStore.layerFileSystem("./var/kv")
```

### [layerStorage](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:802)

Provides a store backed by a Web `Storage` object such as `localStorage` or `sessionStorage`. The storage object is evaluated when the layer is built.

```ts
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"

const storeLayer = KeyValueStore.layerStorage(() => localStorage)
```
