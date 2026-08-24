# `SqlClient`

**Unstable API.** Import this module from `effect/unstable/sql/SqlClient`.
The [official v4 API reference](https://www.effect.website/docs/v4/api/effect/unstable/sql/SqlClient) is useful for orientation, but the local pinned source is authoritative when it differs. The local checkout currently identifies the package as `effect@4.0.0-beta.98`.

## API index

1. [SqlClient interface](#sqlclient-interface)
2. [SqlClient service](#sqlclient-service)
3. [make](#make)
4. [makeWithTransaction](#makewithtransaction)

### Additional known APIs (not expanded)

`SqlClient.MakeOptions`, `TransactionConnection`, `TransactionConnection.Service`, `SafeIntegers`

### [SqlClient interface](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/SqlClient.ts:37)

`SqlClient` combines the tagged SQL statement constructor with connection reservation, transaction handling, row transforms, and reactive query helpers. Its `withTransaction` member commits successful top-level work, uses savepoints for nested work, and rolls back failures or interruptions.

```ts
import * as Effect from "effect/Effect"
import type * as SqlClient from "effect/unstable/sql/SqlClient"

declare const sql: SqlClient.SqlClient
const program = sql.withTransaction(Effect.succeed("committed"))
```

### [SqlClient service](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/SqlClient.ts:94)

The `SqlClient` service tag retrieves the active client from the Effect context. A provided driver layer supplies the connection acquirer and compiler used by tagged-template statements.

```ts
import * as Effect from "effect/Effect"
import * as SqlClient from "effect/unstable/sql/SqlClient"

const program = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  return yield* sql`SELECT 1`
})
```

### [make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/SqlClient.ts:139)

Constructs a client from a connection acquirer, SQL compiler, tracing attributes, transaction commands, and optional row or reactivity integration. The returned effect requires the `Reactivity` service used by the default reactive-query helpers.

```ts
import * as SqlClient from "effect/unstable/sql/SqlClient"

declare const acquirer: SqlClient.SqlClient.MakeOptions["acquirer"]
declare const compiler: SqlClient.SqlClient.MakeOptions["compiler"]
const client = SqlClient.make({ acquirer, compiler, spanAttributes: [] })
```

### [makeWithTransaction](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/sql/SqlClient.ts:222)

Builds a reusable transaction wrapper from connection, begin, savepoint, commit, and rollback callbacks. The wrapper uses the supplied context key to reuse the current connection for nested transactions.

```ts
import * as SqlClient from "effect/unstable/sql/SqlClient"

declare const options: Parameters<typeof SqlClient.makeWithTransaction>[0]
const withTransaction = SqlClient.makeWithTransaction(options)
```
