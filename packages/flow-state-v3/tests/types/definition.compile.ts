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
