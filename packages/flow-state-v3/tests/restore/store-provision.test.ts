import { Cause, Effect, Exit, Layer, Option, Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { attachInspector } from "../../src/host/inspect.ts";
import { layerIndexedDb, Store } from "../../src/host/persistence.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";

const Draft = definition({
  id: "StoreProvision/Draft",
  persist: true,
  states: ["EDITING"],
  events: {},
  memory: { text: Flow.initial(Schema.String, "") },
});

const DraftMachine = machine(Draft, ({ S }) => ({ default: S.EDITING }));

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
  it("Pending D9: flow-state/persistence exports the Store service and layerIndexedDb, and importing it opens nothing", () => {
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
