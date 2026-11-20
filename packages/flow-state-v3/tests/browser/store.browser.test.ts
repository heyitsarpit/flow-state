import { Cause, Context, Effect, Exit, Layer, Option, Schedule, Schema, Scope } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  layerIndexedDb,
  Store,
  type StoreRefused,
  StoreScope,
} from "../../src/host/persistence.ts";
import { storeContract } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";

storeContract("layerIndexedDb in a real browser", layerIndexedDb());

const set = (key: string, text: string) => ({ key, value: Option.some(text) });

// A store of the given app and scope, built in the caller's Scope.
const storeOf = (layer: Layer.Layer<Store, never, StoreScope>, app: string, scope: string) =>
  Layer.build(Layer.provide(layer, Layer.succeed(StoreScope, { app, scope }))).pipe(
    Effect.map((built) => Context.get(built, Store)),
  );

// An IndexedDB request's result, read straight from the page's own IndexedDB.
const requested = <A>(request: IDBRequest<A>) =>
  Effect.callback<A, DOMException | null>((resume) => {
    request.addEventListener("success", () => resume(Effect.succeed(request.result)));
    request.addEventListener("error", () => resume(Effect.fail(request.error)));
  });

const rawOpen = (name: string) => requested(indexedDB.open(name));

const rawUpgrade = (name: string, version: number) => requested(indexedDB.open(name, version));

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a browser test case is the edge that runs its Effect
  Effect.runPromise(Effect.scoped(effect));

describe("the IndexedDB adapter in a real browser (Persistence O1; WriteAhead R12; Safari D1, D3)", () => {
  it("Persistence O1: a batch lands in the page's real IndexedDB, under the app's database and the scope", () =>
    run(
      Effect.gen(function* () {
        const store = yield* storeOf(layerIndexedDb(), "real-records", "s");
        yield* store.write([set("k", "v")]);
        const db = yield* rawOpen("flow-state/real-records");

        const text = yield* requested<unknown>(
          db
            .transaction("records", "readonly")
            .objectStore("records")
            .get(["real-records", "s", "k"]),
        );

        db.close();

        expect(text).toBe("v");
      }),
    ));

  it("WriteAhead R12: one failing request in a 100-key batch lands nothing and the batch is refused", () =>
    run(
      Effect.gen(function* () {
        const store = yield* storeOf(layerIndexedDb(), "torn", "s");
        yield* store.write([set("r50", "old")]);
        // oxlint-disable-next-line typescript/unbound-method -- the original put, called back with its own this
        const put = IDBObjectStore.prototype.put;

        // The 51st put becomes an add of a key that exists, which fails with ConstraintError.
        // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- the DOM's own put signature, whose key is optional
        IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
          return Array.isArray(key) && key[2] === "r50"
            ? this.add(value, key)
            : put.call(this, value, key);
        };

        const exit = yield* Effect.exit(
          store.write(Array.from({ length: 100 }, (_, n) => set(`r${String(n)}`, "new"))),
        ).pipe(Effect.ensuring(Effect.sync(() => (IDBObjectStore.prototype.put = put))));

        expect(Exit.isFailure(exit)).toBe(true);
        expect([...(yield* store.load)]).toEqual([["r50", "old"]]);
      }),
    ));

  it("Persistence O1: a write on a connection a version change closed is refused, not a defect", () =>
    run(
      Effect.gen(function* () {
        const store = yield* storeOf(layerIndexedDb({ database: "upgraded" }), "upgraded", "s");
        yield* store.write([set("a", "1")]);
        const newer = yield* rawUpgrade("upgraded", 2);
        newer.close();
        const exit = yield* Effect.exit(store.write([set("b", "2")]));

        expect(
          Exit.isFailure(exit) &&
            Option.exists(
              Cause.findErrorOption(exit.cause),
              (e: StoreRefused) => e.reason === "closed",
            ),
        ).toBe(true);
      }),
    ));

  it("Persistence O1: two databases never see each other's records, and the default name comes from the app id", () =>
    run(
      Effect.gen(function* () {
        const a = yield* storeOf(layerIndexedDb({ database: "isolated-a" }), "isolated", "s");
        const b = yield* storeOf(layerIndexedDb({ database: "isolated-b" }), "isolated", "s");
        yield* a.write([set("k", "a")]);
        yield* storeOf(layerIndexedDb(), "named-by-app", "s");

        // FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: the page lists its databases only by a Promise.
        const names = yield* Effect.tryPromise({
          try: () => indexedDB.databases(),
          catch: () => "the page could not list its databases",
        });

        expect([...(yield* b.load)]).toEqual([]);
        expect(names.map((d) => d.name)).toContain("flow-state/named-by-app");
      }),
    ));

  it("Persistence O1: once the Layer's scope closes its connection is released, so deleting the database is not blocked", () =>
    run(
      Effect.gen(function* () {
        const scope = yield* Scope.make();

        const store = yield* storeOf(
          layerIndexedDb({ database: "released" }),
          "released",
          "s",
        ).pipe(Scope.provide(scope));

        yield* store.write([set("k", "v")]);
        yield* Scope.close(scope, Exit.void);

        const outcome = yield* Effect.callback<string>((resume) => {
          const deleting = indexedDB.deleteDatabase("released");
          deleting.addEventListener("success", () => resume(Effect.succeed("deleted")));
          deleting.addEventListener("blocked", () => resume(Effect.succeed("blocked")));
        });

        expect(outcome).toBe("deleted");
      }),
    ));

  it("Safari D3: every transaction the adapter starts, the load's included, calls commit()", () =>
    run(
      Effect.gen(function* () {
        const counts = { begun: 0, committed: 0 };
        // oxlint-disable-next-line typescript/unbound-method -- the original, called back with its own this
        const transaction = IDBDatabase.prototype.transaction;
        // oxlint-disable-next-line typescript/unbound-method -- the original, called back with its own this
        const commit = IDBTransaction.prototype.commit;

        IDBDatabase.prototype.transaction = function (
          ...args: Parameters<IDBDatabase["transaction"]>
        ) {
          counts.begun += 1;

          return transaction.apply(this, args);
        };

        IDBTransaction.prototype.commit = function () {
          counts.committed += 1;
          commit.call(this);
        };

        yield* Effect.gen(function* () {
          const store = yield* storeOf(layerIndexedDb(), "committed", "s");
          yield* store.write([set("k", "v")]);
          yield* store.load;
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              IDBDatabase.prototype.transaction = transaction;
              IDBTransaction.prototype.commit = commit;
            }),
          ),
        );

        expect(counts).toEqual({ begun: 2, committed: 2 });
      }),
    ));
});

const Memo = definition({
  id: "Browser/Memo",
  persist: true,
  states: ["OPEN"],
  events: { Write: { text: Schema.String } },
  memory: { text: Flow.initial(Schema.String, "") },
});

const MemoMachine = machine(Memo, ({ S }) => ({
  default: S.OPEN,
  on: { Write: { updateMemory: ({ event }) => ({ text: event.text }) } },
}));

const memos = app({ id: "browser-forget", machines: { memo: MemoMachine } });

describe("a Runtime's disposal on real IndexedDB (Restore R10; Actors R22)", () => {
  it("Restore R10: dispose({ forget: true }) deletes the scope's records from the page's IndexedDB before the Store closes", () =>
    run(
      Effect.gen(function* () {
        const runtime = runtimeSetup({
          app: memos,
          scope: "s",
          persistence: { captureMs: 0 },
          services: layerIndexedDb({ database: "forget" }),
        }).construct();

        yield* runtime.ready();
        runtime.ensureActor(actorRef(MemoMachine, "m1")).send(Memo.E.Write({ text: "milk" }));
        const check = yield* storeOf(layerIndexedDb({ database: "forget" }), "browser-forget", "s");

        yield* check.load.pipe(
          Effect.flatMap((saved) => (saved.size > 0 ? Effect.void : Effect.fail("not landed"))),
          Effect.retry({ schedule: Schedule.spaced("20 millis"), times: 100 }),
        );

        const disposed = yield* Effect.exit(runtime.dispose({ forget: true }));

        expect(Exit.isSuccess(disposed)).toBe(true);
        expect([...(yield* check.load).keys()]).toEqual([]);
      }),
    ));
});
