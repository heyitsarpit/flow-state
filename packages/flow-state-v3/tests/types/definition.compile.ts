import { Context, Effect, Schema, SchemaGetter } from "effect";
import { definition, Flow } from "../../src/index.ts";

class Rates extends Context.Service<Rates, { readonly factor: number }>()("types/Rates") {}

const NeedsRates = Schema.Number.pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transformEffect((n: number) =>
      Effect.map(Effect.service(Rates), (rates) => n * rates.factor),
    ),
    encode: SchemaGetter.transform((n: number) => n),
  }),
);

const lamp = { id: "types/Lamp", states: ["OFF"], events: {} } as const;

void definition({ ...lamp, memory: { level: Flow.initial(Schema.Number, 0) } });

void definition({
  ...lamp,
  memory: {
    // @ts-expect-error a memory field with no source (Machines O1, Compile R5)
    level: Schema.Number,
  },
});

void Flow.initial(Schema.NullOr(Schema.Number), null);

// @ts-expect-error a Schema modifier over a Flow marker (Machines O1)
void Schema.NullOr(Flow.initial(Schema.Number, 0));

void Flow.initial(Schema.Number, 0);

// @ts-expect-error a field Schema that needs services (Persistence O2)
void Flow.initial(NeedsRates, 0);

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
    // @ts-expect-error a context slot that is not Provider.select's (Compile R4; construction.test pairs it)
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
