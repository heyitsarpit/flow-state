import { Context, type Effect, type Option, Schema } from "effect";

/**
 * The store refused a load or a batch, so nothing in the batch landed.
 *
 * **Details**
 *
 * `reason` is evidence only, and every reason is a refusal: `quota` when the store is full,
 * `closed` when its connection was closed under it, `aborted` when it gave up the batch itself,
 * `failed` for anything else, such as a store that cannot be opened.
 */
export class StoreRefused extends Schema.TaggedError<StoreRefused>()("StoreRefused", {
  reason: Schema.Literals(["quota", "closed", "aborted", "failed"]),
}) {}

/**
 * One record's write in a batch: its new text, or `None` to remove it.
 */
export type StoreWrite = { readonly key: string; readonly value: Option.Option<string> };

/**
 * A scope's durable store, as a persisted Runtime uses it: every record of the scope at boot, and
 * atomic batches after.
 *
 * **When to use**
 *
 * Provide a `Store` Layer in the services of a setup with `persistence`: `layerIndexedDb()` in a
 * browser, or your own adapter. Check your own with `storeContract` from `flow-state/testing`.
 *
 * **Details**
 *
 * - `load` gives every record of the scope, by key, or fails `StoreRefused` when it cannot read.
 * - `write(batch)` lands the whole batch or none of it: it succeeds only when every write in it
 *   landed and fails `StoreRefused` when none did. Batches land in the order they are issued.
 * - An interrupted write is unanswered, as a hung store is; Flow treats it as maybe landed.
 * - Records are text. A key is any string, `/`, `|` and `{}` included.
 *
 * **Gotchas**
 *
 * - Read `StoreScope` when the Layer is built, and keep each app and scope apart: two scopes never
 *   see each other's records.
 */
export class Store extends Context.Service<
  Store,
  {
    readonly load: Effect.Effect<ReadonlyMap<string, string>, StoreRefused>;
    readonly write: (batch: ReadonlyArray<StoreWrite>) => Effect.Effect<void, StoreRefused>;
  }
>()("flow-state/Store") {}

/**
 * Which app and scope a `Store` holds: the Runtime provides it while it builds its services.
 *
 * **When to use**
 *
 * Read it in your own `Store` Layer to keep apps and scopes apart.
 */
export class StoreScope extends Context.Service<
  StoreScope,
  { readonly app: string; readonly scope: string }
>()("flow-state/StoreScope") {}
