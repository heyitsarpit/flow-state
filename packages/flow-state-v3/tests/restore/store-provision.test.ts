import { Cause, Effect, Exit, Layer, Option, Predicate, Schedule, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { attachInspector } from "../../src/host/inspect.ts";
import { layerIndexedDb, Store, StoreRefused } from "../../src/host/persistence.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";

const Draft = definition({
  id: "StoreProvision/Draft",
  persist: true,
  states: ["EDITING"],
  events: { Type: { text: Schema.String } },
  memory: { text: Flow.initial(Schema.String, "") },
});

const DraftMachine = machine(Draft, ({ S }) => ({
  default: S.EDITING,
  on: { Type: { updateMemory: ({ event }) => ({ text: event.text }) } },
}));

const drafts = app({ id: "store-provision", machines: { draft: DraftMachine } });

describe("a persisted setup with no Store (WriteAhead R2)", () => {
  it("WriteAhead R2: an untyped setup that turns persistence on without providing the Store fails ready with StorageFailure", async () => {
    const runtime = runtimeSetup(loose({ app: drafts, scope: "s", persistence: {} })).construct();

    const exit = await Effect.runPromise(Effect.exit(runtime.ready()));

    const code = Exit.isSuccess(exit)
      ? "ready"
      : Option.match(Cause.findErrorOption(exit.cause), {
          onNone: () => "defect",
          onSome: (e) => e.code,
        });

    expect(code).toBe("StorageFailure");
  });
});

describe("the persistence route (Package O1, Pending D9)", () => {
  it("Pending D9: flow-state/persistence exports the Store service and layerIndexedDb; this file imports it in Node, where opening IndexedDB would throw", () => {
    expect(Store.key).toBe("flow-state/Store");
    expect(Predicate.isFunction(layerIndexedDb)).toBe(true);
  });
});

describe("the boot's order with the Store among the services (Actors R3, Q3)", () => {
  it("Actors R3: the services Layer, the Store in it, is acquired whole; then storage loads, before any actor starts", async () => {
    const order: Array<string> = [];

    const services = Layer.mergeAll(
      Layer.effectDiscard(Effect.sync(() => void order.push("service acquired"))),
      Layer.effect(
        Store,
        Effect.sync(() => {
          order.push("store acquired");

          return Store.of({
            load: Effect.sync(() => {
              order.push("loaded");

              return new Map<string, string>();
            }),
            write: () => Effect.void,
          });
        }),
      ),
    );

    const runtime = runtimeSetup({
      app: drafts,
      scope: "s",
      persistence: {},
      services,
    }).construct();

    attachInspector(runtime, (e) => {
      if (e._tag === "Incarnated") order.push("actor started");
    });

    await Effect.runPromise(runtime.ready());
    runtime.ensureActor(actorRef(DraftMachine, "d1"));

    expect(order.slice(0, 2).toSorted()).toEqual(["service acquired", "store acquired"]);
    expect(order.slice(2)).toEqual(["loaded", "actor started"]);
  });
});

// A store whose connection closes with the services, as IndexedDB's does: once its Layer's scope
// is released every load and write refuses `closed`. Its records outlive the Layer, as a disk's do,
// and `log` tells its uses and its close in order.
const closingStore = (records: Map<string, string>, log: Array<string>) =>
  Layer.effect(
    Store,
    Effect.acquireRelease(
      Effect.sync(() => new Map([["open", true]])),
      (connection) =>
        Effect.sync(() => {
          connection.set("open", false);
          log.push("store closed");
        }),
    ).pipe(
      Effect.map((connection) => {
        const used = <A>(what: string, use: () => A) =>
          Effect.suspend(() => {
            const open = connection.get("open") === true;
            log.push(open ? what : `${what} refused`);

            return open ? Effect.sync(use) : Effect.fail(new StoreRefused({ reason: "closed" }));
          });

        return Store.of({
          load: used("load", () => new Map(records)),
          write: (batch) =>
            used(batch.every((w) => Option.isNone(w.value)) ? "delete" : "write", () => {
              for (const w of batch)
                Option.match(w.value, {
                  onNone: () => records.delete(w.key),
                  onSome: (text) => records.set(w.key, text),
                });
            }),
        });
      }),
    ),
  );

const outcomeOf = (exit: Exit.Exit<void, { readonly code: string }>) =>
  Exit.isSuccess(exit)
    ? "ran"
    : Option.match(Cause.findErrorOption(exit.cause), {
        onNone: () => "defect",
        onSome: (e) => e.code,
      });

// A Runtime over the closing store, its draft typed and landed.
const landedOver = async (records: Map<string, string>, log: Array<string>, captureMs: number) => {
  const runtime = runtimeSetup({
    app: drafts,
    scope: "s",
    persistence: { captureMs },
    services: closingStore(records, log),
  }).construct();

  await Effect.runPromise(runtime.ready());
  runtime.ensureActor(actorRef(DraftMachine, "d1")).send(Draft.E.Type({ text: "milk" }));

  return runtime;
};

const landed = (records: Map<string, string>) =>
  Effect.runPromise(
    Effect.suspend(() => (records.size > 0 ? Effect.void : Effect.fail("not yet"))).pipe(
      Effect.retry(Schedule.spaced("1 millis")),
    ),
  );

describe("every store use of a disposal runs while the Store is open (Restore R10; Actors R22, R23)", () => {
  it("Restore R10: dispose({ forget: true }) on a Store that closes with the services deletes every record before the Store closes", async () => {
    const records = new Map<string, string>();
    const log: Array<string> = [];
    const runtime = await landedOver(records, log, 0);
    await landed(records);

    const exit = await Effect.runPromise(Effect.exit(runtime.dispose({ forget: true })));

    expect(outcomeOf(exit)).toBe("ran");
    expect([...records.keys()]).toEqual([]);
    expect(log.slice(-3)).toEqual(["load", "delete", "store closed"]);
  });

  it("Actors R23: the disposal's last write lands on a Store that closes with the services, before it closes", async () => {
    const records = new Map<string, string>();
    const log: Array<string> = [];
    const runtime = await landedOver(records, log, 60_000);

    const exit = await Effect.runPromise(Effect.exit(runtime.dispose()));

    expect(outcomeOf(exit)).toBe("ran");
    expect([...records.values()].some((text) => text.includes("milk"))).toBe(true);
    expect(log.slice(-2)).toEqual(["write", "store closed"]);
  });

  it("Restore R10: a forget asked once the disposal released the services fails StorageFailure with no store call", async () => {
    const records = new Map<string, string>();
    const log: Array<string> = [];
    const runtime = await landedOver(records, log, 0);
    await landed(records);
    await Effect.runPromise(runtime.dispose());
    const kept = new Map(records);
    const used = log.length;

    const exit = await Effect.runPromise(Effect.exit(runtime.dispose({ forget: true })));

    expect(outcomeOf(exit)).toBe("StorageFailure");
    expect(records).toEqual(kept);
    expect(log.slice(used)).toEqual([]);
  });
});
