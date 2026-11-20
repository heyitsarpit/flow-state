import { Cause, Effect, Exit, Option, Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
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
  it.fails("WriteAhead R2: an untyped setup that turns persistence on without providing the Store fails ready with StorageFailure", async () => {
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

// The route's path as a value, so the check compiles before the module exists.
const persistenceRoute = "../../src/host/persistence.ts";

describe("the persistence route (Package O1, Pending D9)", () => {
  it.fails("Pending D9: flow-state/persistence exports the Store service and layerIndexedDb", async () => {
    const route: unknown = await import(/* @vite-ignore */ persistenceRoute);

    expect(
      ["Store", "layerIndexedDb"].filter((name) => Predicate.hasProperty(route, name)),
    ).toEqual(["Store", "layerIndexedDb"]);
  });
});
