import { Effect, Layer, Option, Predicate, Result, Schema } from "effect";
import { Store, StoreRefused, StoreScope, type StoreWrite } from "../store.ts";

const RECORDS = "records";

// A request or transaction as the adapter hears it: its events, and its error once one fails.
type Heard<Kind extends string> = {
  readonly addEventListener: (type: Kind, listener: () => void) => void;
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the DOM's own field: null until the request fails
  readonly error: DOMException | null;
};

/**
 * A request as the adapter reads it.
 */
type Request<A> = Heard<"success" | "error"> & { readonly result: A };

/**
 * The parts of an IndexedDB transaction the adapter uses.
 */
type Transaction = Heard<"complete" | "abort"> & {
  readonly objectStore: (name: string) => {
    readonly put: (value: string, key: IDBValidKey) => Request<IDBValidKey>;
    readonly delete: (key: IDBValidKey) => Request<undefined>;
    // FLOW_STATE_ALLOW_UNKNOWN: stored values are decoded by the Loaded Schema before use.
    readonly getAll: (query: IDBKeyRange) => Request<ReadonlyArray<unknown>>;
    readonly getAllKeys: (query: IDBKeyRange) => Request<ReadonlyArray<IDBValidKey>>;
  };
  readonly commit: () => void;
};

/**
 * The parts of an IndexedDB connection the adapter uses, so a test can stand in for one.
 */
export type Connection = {
  readonly transaction: (name: string, mode: IDBTransactionMode) => Transaction;
};

/**
 * Where one app's scope keeps its records: each record's key is `[app, scope, key]`.
 */
export type Place = { readonly app: string; readonly scope: string };

const reasons = new Map<string, StoreRefused["reason"]>([
  ["QuotaExceededError", "quota"],
  ["InvalidStateError", "closed"],
  ["AbortError", "aborted"],
]);

// Every reason is a refusal; the error's name decides the reason, kept as evidence.
// FLOW_STATE_ALLOW_UNKNOWN: whatever IndexedDB threw or failed with.
const refusedBy = (error: unknown) =>
  new StoreRefused({
    reason: error instanceof DOMException ? (reasons.get(error.name) ?? "failed") : "failed",
  });

const Loaded = Schema.Struct({
  keys: Schema.Array(Schema.Tuple([Schema.String, Schema.String, Schema.String])),
  values: Schema.Array(Schema.String),
});

type Records = ReturnType<Transaction["objectStore"]>;

// Runs one transaction and answers once IndexedDB does: landed only when it completed and every
// request in it succeeded, since a page frozen into the bfcache can fail every request and still
// complete. The transaction and its requests are made inside the callback, so every listener is
// attached before IndexedDB can answer; it is committed at once, so a frozen one never holds the
// store. Whatever IndexedDB throws, as a closing connection does, is a refusal.
const transact = <A>(
  db: Connection,
  mode: IDBTransactionMode,
  start: (records: Records) => {
    readonly requests: ReadonlyArray<Heard<"success" | "error">>;
    readonly value: () => Effect.Effect<A, StoreRefused>;
  },
) =>
  Effect.callback<A, StoreRefused>((resume) => {
    const started = Result.try({
      try: () => {
        const tx = db.transaction(RECORDS, mode);

        return { tx, ...start(tx.objectStore(RECORDS)) };
      },
      catch: refusedBy,
    });

    if (Result.isFailure(started)) return resume(Effect.fail(started.failure));

    const { tx, requests, value } = started.success;
    let succeeded = 0;
    let failed = Option.none<StoreRefused>();

    for (const r of requests) {
      r.addEventListener("success", () => void (succeeded += 1));
      r.addEventListener("error", () => void (failed = Option.some(refusedBy(r.error))));
    }

    tx.addEventListener("complete", () =>
      resume(
        Option.match(failed, {
          onSome: Effect.fail,
          onNone: () =>
            succeeded === requests.length
              ? value()
              : Effect.fail(new StoreRefused({ reason: "aborted" })),
        }),
      ),
    );
    tx.addEventListener("abort", () => resume(Effect.fail(refusedBy(tx.error))));
    const committed = Result.try({ try: () => tx.commit(), catch: refusedBy });

    if (Result.isFailure(committed)) resume(Effect.fail(committed.failure));
  });

/**
 * Writes one batch of a scope's records in one transaction.
 */
export const writeBatch = (db: Connection, place: Place, batch: ReadonlyArray<StoreWrite>) =>
  transact(db, "readwrite", (records) => {
    const requests = batch.map((w) =>
      Option.match(w.value, {
        onNone: () => records.delete([place.app, place.scope, w.key]),
        onSome: (text) => records.put(text, [place.app, place.scope, w.key]),
      }),
    );

    return { requests, value: () => Effect.void };
  });

/**
 * Reads every record of a scope in one transaction.
 */
export const loadAll = (db: Connection, place: Place) =>
  transact(db, "readonly", (records) => {
    // Arrays sort after strings, so `[app, scope, []]` is above every key of the scope.
    const range = IDBKeyRange.bound([place.app, place.scope], [place.app, place.scope, []]);
    const keys = records.getAllKeys(range);
    const values = records.getAll(range);

    return {
      requests: [keys, values],
      value: () =>
        Schema.decodeUnknownEffect(Loaded)({ keys: keys.result, values: values.result }).pipe(
          Effect.filterOrFail(
            (loaded) => loaded.keys.length === loaded.values.length,
            () => new StoreRefused({ reason: "failed" }),
          ),
          Effect.mapError(() => new StoreRefused({ reason: "failed" })),
          Effect.map(
            (loaded) =>
              new Map(
                loaded.keys.flatMap(([, , key], n) =>
                  Option.toArray(
                    Option.map(
                      Option.fromUndefinedOr(loaded.values[n]),
                      (text) => [key, text] as const,
                    ),
                  ),
                ),
              ),
          ),
        ),
    };
  });

// Opens the database, creating its one object store on first use; a connection another open
// wants to upgrade or delete closes itself, so its later writes are refused, not stuck.
const open = (name: string) =>
  Effect.callback<IDBDatabase, StoreRefused>((resume) => {
    if (!Predicate.hasProperty(globalThis, "indexedDB"))
      return resume(Effect.fail(new StoreRefused({ reason: "failed" })));

    const started = Result.try({ try: () => globalThis.indexedDB.open(name, 1), catch: refusedBy });

    if (Result.isFailure(started)) return resume(Effect.fail(started.failure));

    const opening = started.success;
    opening.onupgradeneeded = () => void opening.result.createObjectStore(RECORDS);
    opening.onerror = () => resume(Effect.fail(refusedBy(opening.error)));
    opening.onsuccess = () => {
      const db = opening.result;
      db.onversionchange = () => db.close();
      resume(Effect.succeed(db));
    };
  });

/**
 * The scope's records in the page's IndexedDB, as a `Store` Layer.
 *
 * **When to use**
 *
 * In the services of a persisted setup that runs in a browser.
 *
 * **Details**
 *
 * - `database` defaults to `flow-state/<app id>`, so apps sharing an origin never collide; every
 *   scope of the app keeps its records apart in it.
 * - The connection opens when the Layer is built and closes when the Runtime releases its services.
 *   A page where IndexedDB cannot open still builds: its load is refused, so the Runtime runs
 *   without persistence and reports StorageFailure.
 * - Each batch is one transaction, committed at once; it lands only if every write in it succeeded.
 *
 * **Gotchas**
 *
 * - Safari can lose the last batch when a page closes or enters the back-forward cache; the
 *   capture interval bounds what is lost.
 */
export const layerIndexedDb = (
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public option: an omitted database is named after the app
  options: { readonly database?: string } = {},
) =>
  Layer.effect(
    Store,
    Effect.gen(function* () {
      const place = yield* StoreScope;

      const connection = yield* Effect.result(
        Effect.acquireRelease(open(options.database ?? `flow-state/${place.app}`), (db) =>
          Effect.sync(() => db.close()),
        ),
      );

      const withConnection = <A>(use: (db: Connection) => Effect.Effect<A, StoreRefused>) =>
        Result.match(connection, { onFailure: Effect.fail, onSuccess: use });

      return Store.of({
        load: withConnection((db) => loadAll(db, place)),
        write: (batch) => withConnection((db) => writeBatch(db, place, batch)),
      });
    }),
  );
