import { Option, Schema, SchemaAST } from "effect";
import { walkerOf } from "./core/boundary.ts";
import {
  type Commit,
  type EndingContext,
  type EventEntry,
  type Field,
  type Lookup,
  type Mapping,
  Operation,
  type OperationWalk,
  type ServiceKeys,
  Source,
  type Values,
  type Writes,
} from "./core/compiled.ts";
import type { Bound, BoundInternals } from "./contract.ts";
import { internalsOf } from "./made.ts";
import { defect } from "./core/defect.ts";
import { isUncertain } from "./config.ts";
import {
  isInitial,
  isInput,
  isPrivate,
  pureDefault,
  schemaOfField,
  unwrapPrivate,
} from "./construction.ts";
import { declarationOf } from "./declaration-of.ts";
import type { AnyDefinition, EventFields } from "./definition.ts";
import { admissionOf, endingOf, structOf } from "./events.ts";
import { slot } from "./handles.ts";
import type { Field as FieldMarker } from "./flow.ts";

// RETURN_TYPE: the Compiled Mapping shape.
export const mappingOf = (
  // FLOW_STATE_ALLOW_UNKNOWN: an ending its owner's decode checked is an event token or a mapping.
  ending: unknown,
  slot: string,
): Mapping => {
  const read = endingOf(ending);

  return {
    event: Option.getOrElse(
      Option.map(read, (e) => e.event),
      () => "",
    ),
    from: Option.map(
      Option.flatMap(read, (e) => e.from),
      (map) => ({
        slot,
        // FLOW_STATE_ALLOW_UNKNOWN: an ending's value is the call's own; its mapper is written for it.
        run: (value: unknown, context: EndingContext) => map(value, context),
      }),
    ),
  };
};

const inputNamesOf = (input: Schema.Codec<Values, Values>) => {
  const ast = SchemaAST.toType(input.ast);

  return SchemaAST.isObjects(ast) ? ast.propertySignatures.map((p) => String(p.name)) : [];
};

// RETURN_TYPE: the Compiled OperationWalk shape.
const operationWalkOf = (bound: Bound): OperationWalk => ({
  input: walkerOf(bound.inputJson),
  keyText: internalsOf<BoundInternals>("bound", bound).textOfKey,
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
    inputFields: inputNamesOf(bound.input),
    key: bound.keyText,
    input: bound.input,
    inputJson: bound.inputJson,
    walk: operationWalkOf(bound),
    success: mappingOf(bound.success, `operations.${name}.success`),
    failure,
  };

  const place = `operations.${name}.call`;
  const internals = internalsOf<BoundInternals>("bound", bound);
  const services = slot<() => ServiceKeys>(`operations.${name}.services`, () => internals.services);

  if (internals.kind === "read")
    return Operation.Read({
      ...shared,
      services,
      staleTime: internals.staleTime,
      gcTime: internals.gcTime,
      call: slot<Lookup>(place, internals.call),
    });

  return bound.kind === "write"
    ? Operation.Write({
        ...shared,
        services,
        call: slot<Commit>(place, internals.call),
        writes: Option.map(internals.writes, (writes) =>
          slot<Writes>(`operations.${name}.writes`, writes),
        ),
        idempotency: internals.idempotency,
        concurrency: bound.concurrency,
        notSent: Option.map(bound.notSent, (ending) =>
          mappingOf(ending, `operations.${name}.notSent`),
        ),
        unknown: mappingOf(bound.unknown, `operations.${name}.unknown`),
      })
    : defect(`the read ${name} holds a write's call`);
};

// RETURN_TYPE: the Compiled Source each start becomes.
const sourceOf = (marked: FieldMarker): Source => {
  if (isInput(marked)) return Source.Input();

  return isInitial(marked) ? Source.Constant({ value: marked.value }) : Source.Optional();
};

// RETURN_TYPE: the Compiled shape this part builds.
export const fieldOf = (name: string, raw: FieldMarker): Field => {
  const marked = unwrapPrivate(raw);
  const schema = schemaOfField(raw);

  const source = sourceOf(marked);
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
  structOf(Object.fromEntries(fields.map((f) => [f.name, f.schema])));

export const eventsOf = (definition: AnyDefinition) => {
  // RETURN_TYPE: the Compiled shape this part builds.
  const entry = (tag: string, fields: EventFields, isPublic: boolean): EventEntry => ({
    ...admissionOf(definition, tag, fields),
    public: isPublic,
    uncertain: isUncertain(fields),
  });

  const declaration = declarationOf(definition);

  return new Map([
    ...Object.entries(declaration.events).map(([tag, f]) => [tag, entry(tag, f, true)] as const),
    ...Object.entries(declaration.internalEvents).map(
      ([tag, f]) => [tag, entry(tag, f, false)] as const,
    ),
  ]);
};
