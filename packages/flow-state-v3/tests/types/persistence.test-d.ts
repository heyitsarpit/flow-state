import { Layer, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { layerIndexedDb, type Store, type StoreScope } from "../../src/host/persistence.ts";
import { Fake, type Story, storeContract } from "../../src/host/testing/index.ts";
import {
  app,
  definition,
  Flow,
  machine,
  type RuntimeSetup,
  runtimeSetup,
} from "../../src/index.ts";

const Draft = definition({
  id: "types/persistence/Draft",
  persist: true,
  states: ["EDITING"],
  events: {},
  memory: { text: Flow.initial(Schema.String, "") },
});

const DraftMachine = machine(Draft, ({ S }) => ({ default: S.EDITING }));

const drafts = app({ id: "types/persistence", machines: { draft: DraftMachine } });

describe("WriteAhead R2: enabled persistence requires the Store service", () => {
  it("a persisted setup whose services do not provide the Store", () => {
    // @ts-expect-error WriteAhead R2: persistence with no Store in the services Layer is a type error
    runtimeSetup({ app: drafts, scope: "s", persistence: {} });
    // @ts-expect-error WriteAhead R2: services that provide something else are not the Store
    runtimeSetup({ app: drafts, scope: "s", persistence: {}, services: Layer.empty });

    expectTypeOf(
      runtimeSetup({ app: drafts, scope: "s", persistence: {}, services: layerIndexedDb() }),
    ).toEqualTypeOf<RuntimeSetup<never, typeof drafts>>();
  });

  it("a setup that saves nothing needs no Store", () => {
    expectTypeOf(runtimeSetup({ app: drafts })).toEqualTypeOf<RuntimeSetup<never, typeof drafts>>();
  });
});

describe("Pending D9: the store contract and the fake store as a Store Layer", () => {
  it("flow-state/testing exports storeContract(name, layer)", () => {
    expectTypeOf(storeContract).parameters.toEqualTypeOf<
      // FLOW_STATE_ALLOW_UNKNOWN: a store's Layer may fail with its own error while it builds.
      [name: string, layer: Layer.Layer<Store, unknown, StoreScope>]
    >();
    expectTypeOf(storeContract).returns.toEqualTypeOf<void>();
  });

  it("Fake.storage gives the fake store as a Store Layer, for the contract", () => {
    expectTypeOf(Fake.storage.layer).toEqualTypeOf<() => Layer.Layer<Store, never, StoreScope>>();
  });
});

describe("WriteAhead R10, T5: a Story hides and shows its tab's page", () => {
  it("a Story has hide and show steps beside reload", () => {
    expectTypeOf<Story<"a">["hide"]>().toEqualTypeOf<() => Story<"a">>();
    expectTypeOf<Story<"a">["show"]>().toEqualTypeOf<() => Story<"a">>();
  });
});
