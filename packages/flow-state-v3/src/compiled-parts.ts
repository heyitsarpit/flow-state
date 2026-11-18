import { Option, Schema, SchemaAST } from "effect";
import { walkerOf } from "./core/boundary.ts";
import {
  type EventEntry,
  type Field,
  type Mapping,
  Operation,
  type OperationWalk,
  Source,
  type Values,
} from "./core/compiled.ts";
import type { Bound, Ending } from "./contract.ts";
import { isUncertain } from "./config.ts";
import { isMarker, isPrivate, pureDefault, schemaOfField, unwrapPrivate } from "./construction.ts";
import type { AnyDefinition, EventFields } from "./definition.ts";
import { admissionOf, codecOf } from "./events.ts";
import type { Field as FieldMarker } from "./flow.ts";

// FLOW_STATE_ALLOW_UNKNOWN: an ending's value is the commit's or lookup's own; the mapper is written for it.
const endingValue = (value: unknown) =>
  // SAFETY: the runtime passes each mapper the ending value of the operation it is declared on.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, lint-bomb/no-escape-hatch-assertion -- an ending's value type is erased in Compiled and restored at its mapper
  value as never;

// RETURN_TYPE: the Compiled Mapping shape.
export const mappingOf = (ending: Ending, slot: string): Mapping => ({
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

// RETURN_TYPE: the Compiled OperationWalk shape.
const operationWalkOf = (bound: Bound): OperationWalk => ({
  input: walkerOf(bound.inputJson),
  keyText: bound.textOfKey,
});

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
    walk: operationWalkOf(bound),
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
  const marked = unwrapPrivate(raw);
  const schema = schemaOfField(raw);

  const source = sourceOf(name, marked);
  const json = Schema.toCodecJson(schema);
  const walk = walkerOf(json);

  return {
    name,
    schema,
    json,
    walk,
    source,
    private: isPrivate(raw),
    is: walk.is,
    fallback: Option.flatten(pureDefault(schema.ast)),
  };
};

export const memoryCodec = (fields: ReadonlyArray<Field>) =>
  codecOf<Values>(Schema.Struct(Object.fromEntries(fields.map((f) => [f.name, f.schema]))));

export const eventsOf = (definition: AnyDefinition) => {
  // RETURN_TYPE: the Compiled shape this part builds.
  const entry = (tag: string, fields: EventFields, isPublic: boolean): EventEntry => ({
    ...admissionOf(definition, tag, fields),
    public: isPublic,
    uncertain: isUncertain(fields),
  });

  return new Map([
    ...Object.entries(definition.events).map(([tag, f]) => [tag, entry(tag, f, true)] as const),
    ...Object.entries(definition.internalEvents).map(
      ([tag, f]) => [tag, entry(tag, f, false)] as const,
    ),
  ]);
};
