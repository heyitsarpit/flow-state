# `Migrator`

**Unstable API.** Import this module from `effect/unstable/sql/Migrator`.
The [official v4 API reference](https://www.effect.website/docs/v4/api/effect/unstable/sql/Migrator) is useful for orientation, but the local pinned source is authoritative when it differs. The local checkout currently identifies the package as `effect@4.0.0-beta.98`.

## API index

1. [make](#make)
2. [fromRecord](#fromrecord)
3. [fromGlob](#fromglob)
4. [fromFileSystem](#fromfilesystem)
5. [MigrationError](#migrationerror)

### Additional known APIs (not expanded)

`MigratorOptions`, `Loader`, `ResolvedMigration`, `Migration`, `fromBabelGlob`

### [make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/Migrator.ts:99)

Creates a migrator that ensures the migrations table exists, runs only pending migrations in a transaction, and optionally dumps the schema after a successful run. The result contains the newly applied `[id, name]` pairs and can fail with `MigrationError` or `SqlError`.

```ts
import * as Effect from "effect/Effect"
import * as Migrator from "effect/unstable/sql/Migrator"

const migrate = Migrator.make({})({
  loader: Migrator.fromRecord({
    "1_create_users": Effect.succeed(undefined)
  })
})
```

### [fromRecord](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/Migrator.ts:383)

Creates a loader from effects keyed by `<id>_<name>`, discarding keys that do not match that form and sorting the remaining migrations by numeric id.

```ts
import * as Effect from "effect/Effect"
import * as Migrator from "effect/unstable/sql/Migrator"

const loader = Migrator.fromRecord({
  "2_add_index": Effect.succeed(undefined),
  "1_create_users": Effect.succeed(undefined)
})
```

### [fromGlob](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/Migrator.ts:336)

Creates a loader from dynamic-import functions keyed by migration filenames such as `001_create_users.ts`. Matching migrations are sorted by id before loading.

```ts
import * as Migrator from "effect/unstable/sql/Migrator"

const loader = Migrator.fromGlob({
  "./001_create_users.ts": () => import("./001_create_users.ts")
})
```

### [fromFileSystem](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/Migrator.ts:406)

Creates a loader that reads a directory through the `FileSystem` service and dynamically imports matching migration files. Files must use the supported `<id>_<name>.js|ts|mjs|mts` naming form.

```ts
import * as Migrator from "effect/unstable/sql/Migrator"

const loader = Migrator.fromFileSystem("./migrations")
```

### [MigrationError](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/Migrator.ts:79)

Represents loading, validation, lock, and execution failures with a `kind` of `BadState`, `ImportError`, `Failed`, `Duplicates`, or `Locked`.

```ts
import * as Migrator from "effect/unstable/sql/Migrator"

const error = new Migrator.MigrationError({
  kind: "Duplicates",
  message: "Found duplicate migration ids"
})
```
