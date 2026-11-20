import { Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { Fake, type Story } from "../../src/host/testing/index.ts";
import type * as Testing from "../../src/host/testing/index.ts";
import { app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";

// Inverted: each line marked `wrong` compiles today. When the Store port lands, each fails the
// check: a setup with no Store gets `@ts-expect-error` naming the rule, beside the correct use
// asserted exactly; a `.not.toHaveProperty` of a name that now exists becomes the name's exact
// type.

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
    // wrong: WriteAhead R2: persistence with no Store in the services Layer is a type error
    runtimeSetup({ app: drafts, scope: "s", persistence: {} });
  });
});

describe("Pending D9: the store contract and the fake store as a Store Layer", () => {
  it("flow-state/testing exports storeContract(name, layer)", () => {
    // wrong: Pending D9: storeContract is exported from the testing route
    expectTypeOf<typeof Testing>().not.toHaveProperty("storeContract");
  });

  it("Fake.storage gives the fake store as a Store Layer, for the contract", () => {
    // wrong: Pending D9: the fake store is a Store Layer the contract runs against
    expectTypeOf(Fake.storage).not.toHaveProperty("layer");
  });
});

describe("WriteAhead R10, T5: a Story hides and shows its tab's page", () => {
  it("a Story has hide and show steps beside reload", () => {
    // wrong: WriteAhead R10, T5: a Story hides its tab's page, as a visibilitychange to hidden does
    expectTypeOf<Story<string>>().not.toHaveProperty("hide");
    // wrong: WriteAhead R10, T5: a Story shows its tab's page again
    expectTypeOf<Story<string>>().not.toHaveProperty("show");
  });
});
