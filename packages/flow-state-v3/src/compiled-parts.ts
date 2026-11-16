import { Option, Predicate, Schema, SchemaAST } from "effect";
import {
  type EventEntry,
  type Field,
  type Mapping,
  Operation,
  Source,
  type Values,
} from "./core/compiled.ts";
import type { Bound, Ending } from "./contract.ts";
import { isMarker, pureDefault } from "./construction.ts";
import { type AnyDefinition, codecOf, type EventFields, fieldsOf } from "./definition.ts";
import type { Field as FieldMarker } from "./flow.ts";

// FLOW_STATE_ALLOW_UNKNOWN: an ending's value is the commit's or lookup's own; the mapper is written for it.
const endingValue = (value: unknown) =>
  // SAFETY: the runtime passes each mapper the ending value of the operation it is declared on.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, lint-bomb/no-escape-hatch-assertion -- an ending's value type is erased in Compiled and restored at its mapper
  value as never;

// RETURN_TYPE: the Compiled Mapping shape.
const mappingOf = (ending: Ending, slot: string): Mapping => ({
  event: ending.ending.event,
  from: Option.map(ending.ending.from, (map) => ({
    slot,
    // FLOW_STATE_ALLOW_UNKNOWN: an ending's value is the call's own; its mapper is written for it.
    run: (value: unknown) => map(endingValue(value), {}),
  })),
});

const inputFieldsOf = (input: Schema.Codec<Values, Values>) => {
  const ast = SchemaAST.toType(input.ast);

  return SchemaAST.isObjects(ast) ? ast.propertySignatures.map((p) => String(p.name)) : [];
};

export const operationOf = (name: string, bound: Bound) => {
  const failure = new Map(
    Object.entries(bound.failure).map(([tag, ending]) => [
      tag,
      mappingOf(ending, `operations.${name}.failure.${tag}`),
    ]),
  );

  const shared = {
    name,
    contract: bound.contract,
    keyFields: bound.key,
    inputFields: inputFieldsOf(bound.input),
    key: bound.keyText,
    input: bound.input,
    inputJson: bound.inputJson,
    success: mappingOf(bound.success, `operations.${name}.success`),
    failure,
  };

  const slot = `operations.${name}.call`;

  return bound.kind === "write"
    ? Operation.Write({
        ...shared,
        call: { slot, run: bound.call },
        concurrency: bound.concurrency,
        notSent: Option.map(bound.notSent, (ending) =>
          mappingOf(ending, `operations.${name}.notSent`),
        ),
        unknown: mappingOf(bound.unknown, `operations.${name}.unknown`),
      })
    : Operation.Read({ ...shared, call: { slot, run: bound.call } });
};

// RETURN_TYPE: the Compiled Source each start becomes.
const sourceOf = (name: string, marked: FieldMarker): Source => {
  if (!isMarker(marked) || marked["~flow"] === "private") return Source.Optional();

  if (marked["~flow"] === "input") return Source.Input();

  return marked.start._tag === "Computed"
    ? Source.Computed({ compute: { slot: `memory.${name}`, run: marked.start.compute } })
    : Source.Constant({ value: marked.start.value });
};

// RETURN_TYPE: the Compiled shape this part builds.
export const fieldOf = (name: string, raw: FieldMarker): Field => {
  const isPrivate = isMarker(raw) && raw["~flow"] === "private";
  const marked = isMarker(raw) && raw["~flow"] === "private" ? raw.field : raw;
  const schema = isMarker(marked) ? marked.schema : marked;

  const source = sourceOf(name, marked);

  return {
    name,
    schema,
    source,
    private: isPrivate,
    is: Schema.is(schema),
    fallback: Option.flatten(pureDefault(schema.ast)),
  };
};

export const memoryCodec = (fields: ReadonlyArray<Field>) =>
  codecOf<Values>(Schema.Struct(Object.fromEntries(fields.map((f) => [f.name, f.schema]))));

export const eventsOf = (definition: AnyDefinition) => {
  // RETURN_TYPE: the Compiled shape this part builds.
  const entry = (fields: EventFields, isPublic: boolean): EventEntry => ({
    payload: codecOf<Values>(Schema.Struct(fieldsOf(fields))),
    public: isPublic,
    uncertain: Predicate.hasProperty(fields, "~flow"),
  });

  return new Map([
    ...Object.entries(definition.events).map(([tag, f]) => [tag, entry(f, true)] as const),
    ...Object.entries(definition.internalEvents).map(([tag, f]) => [tag, entry(f, false)] as const),
  ]);
};
