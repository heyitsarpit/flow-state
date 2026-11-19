import { describe, expectTypeOf, it } from "vite-plus/test";
import { Context, Schema, SchemaGetter } from "effect";
import { definition, Flow } from "../../src/index.ts";

class Rates extends Context.Service<Rates, { readonly factor: number }>()("types/Rates") {}

const NeedsRates = Schema.Number.pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transformEffect((n: number) => Rates.useSync((rates) => n * rates.factor)),
    encode: SchemaGetter.transform((n: number) => n),
  }),
);

const lamp = { id: "types/Lamp", states: ["OFF"], events: {} } as const;

describe("Machines O1, Compile R4, R5: a definition's fields and operations", () => {
  it("each wrong line fails to compile beside its exact right one", () => {
    expectTypeOf(
      definition({ ...lamp, memory: { level: Flow.initial(Schema.Number, 0) } }).Memory.Type,
    ).toEqualTypeOf<{ readonly level: number }>();

    void definition({
      ...lamp,
      memory: {
        // @ts-expect-error a memory field with no source (Machines O1, Compile R5)
        level: Schema.Number,
      },
    });

    expectTypeOf(Flow.initial(Schema.NullOr(Schema.Number), null).schema.Type).toEqualTypeOf<
      number | null
    >();

    // @ts-expect-error a Schema modifier over a Flow marker (Machines O1)
    void Schema.NullOr(Flow.initial(Schema.Number, 0));

    expectTypeOf(Flow.initial(Schema.Number, 0).schema.Type).toEqualTypeOf<number>();

    // @ts-expect-error a field Schema that needs services (Persistence O2)
    void Flow.initial(NeedsRates, 0);

    const withEvent = definition({ ...lamp, events: { X: {} } });
    const withContext = definition({ ...lamp, context: {} });
    const withOperations = definition({ ...lamp, operations: () => ({}) });

    expectTypeOf<keyof typeof withEvent.events>().toEqualTypeOf<"X">();
    expectTypeOf<keyof typeof withEvent.events.X>().toEqualTypeOf<never>();
    expectTypeOf<keyof typeof withContext.context>().toEqualTypeOf<never>();
    expectTypeOf<keyof typeof withOperations.operations>().toEqualTypeOf<never>();

    void definition({
      ...lamp,
      events: {
        // @ts-expect-error a Flow.uncertain-shaped event with no fields (Compile R4; construction.test pairs it)
        X: { "~flow": "uncertain" },
      },
    });

    void definition({
      ...lamp,
      context: {
        // @ts-expect-error a context slot that is not Flow.context's (Compile R4; construction.test pairs it)
        c: 5,
      },
    });

    // @ts-expect-error a definition that is null (Compile R4; construction.test pairs it)
    void definition(null);

    void definition({
      ...lamp,
      // @ts-expect-error an operations callback that returns no record (Compile R4; construction.test pairs it)
      operations: () => undefined,
    });

    void definition({
      ...lamp,
      // @ts-expect-error an operations record whose value is not an operation (Compile R4; construction.test pairs it)
      operations: () => ({ save: 5 }),
    });

    void definition({
      ...lamp,
      memory: {
        // @ts-expect-error a constant start its field's Schema refuses (Compile R4, R6; construction.test pairs it)
        count: Flow.initial(Schema.Number, "0"),
      },
    });
  });
});
