import { Option, Predicate, Record, Result, Schema } from "effect";
import { admitted, walkerOf } from "./core/boundary.ts";
import type { Values } from "./core/compiled.ts";
import { isUncertain } from "./config.ts";
import type { Fields } from "./contract.ts";
import type { AnyDefinition, EventFields } from "./definition.ts";
import { flowError, raise } from "./error.ts";
import { builder, entry } from "./entry.ts";
import { type Container, made, madeCallable, madeOf } from "./made.ts";

/**
 * An event's field Schemas, through its `Flow.uncertain` marker.
 */
export const fieldsOf = (x: EventFields) => (isUncertain(x) ? x.fields : x);

/**
 * A record's codec over a runtime record of field Schemas, as Compiled holds it: a definition's
 * memory, payload or name, or a contract's input or key.
 */
// RETURN_TYPE: a Struct of Flow field Schemas, which need no services, decodes to a record.
export const structOf = (fields: Fields): Schema.Codec<Values, Values> => Schema.Struct(fields);

/**
 * A record's JSON codec over a runtime record of field Schemas: the Struct of each field's JSON
 * form, so a field's JSON form is built once, where the field is.
 */
// RETURN_TYPE: a Struct of JSON codecs encodes to a record of JSON values.
export const jsonStructOf = (fields: Fields): Schema.Codec<Values, Values> =>
  Schema.Struct(Record.map(fields, (field) => Schema.toCodecJson(field)));

const invalidEvent = (tag: string, field: ReadonlyArray<string>) =>
  flowError([
    {
      code: "InvalidEvent",
      path: ["E", tag, ...field],
      summary: `E.${tag} was given a payload its Schema refuses`,
      help: "Give the event a payload of its declared fields.",
    },
  ]);

/**
 * An event's payload as Flow admits it: the Struct of its fields, that Struct's type side, which
 * checks a payload without transforming it, and the names of its fields, the only keys kept.
 */
export const payloadOf = (fields: Fields) => {
  const payload = structOf(fields);

  return {
    payload,
    walk: walkerOf(Schema.toType(payload)),
    names: Object.keys(fields),
  };
};

/**
 * What an event token keeps for the core: how it admits its payload, and its definition's id.
 */
export type EventInternals = {
  readonly admission: ReturnType<typeof payloadOf>;
  readonly definition: string;
};

/**
 * What a mapping (`E.X.from(f)`) keeps for the core: its mapper and the token it maps onto.
 */
export type MappingInternals = {
  // FLOW_STATE_ALLOW_UNKNOWN: an ending's value, typed where the mapper is written; its context is Flow's own.
  readonly map: (value: unknown, context: unknown) => Values;
  readonly token: Container;
};

const eventToken = (definition: string, owner: symbol, tag: string, fields: Fields) => {
  const admission = payloadOf(fields);
  const { walk, names } = admission;

  const checks = Object.entries(fields).map(
    ([name, schema]) => [name, walkerOf(schema).is] as const,
  );

  // A payload-free constructor takes no argument; one given, even undefined, is checked.
  // FLOW_STATE_ALLOW_UNKNOWN: what a caller without types passed.
  const make = entry(`E.${tag}`, (...args: ReadonlyArray<unknown>) => {
    const given = args.length === 0 ? {} : args[0];

    return Option.match(admitted(walk, names, given), {
      onSome: (payload) => ({ ...payload, _tag: tag }),
      onNone: () =>
        raise(
          invalidEvent(
            tag,
            checks
              .filter(
                ([name, is]) => !is(Predicate.hasProperty(given, name) ? given[name] : undefined),
              )
              .map(([name]) => name)
              .slice(0, 1),
          ),
        ),
    });
  });

  const token: Container = madeCallable(
    "event",
    owner,
    make,
    {
      tag,
      ending: { event: tag },
      from: builder(`E.${tag}.from`, (map: MappingInternals["map"]) =>
        made("mapping", owner, { ending: { event: tag } }, {
          map,
          token,
        } satisfies MappingInternals),
      ),
    },
    { admission, definition } satisfies EventInternals,
  );

  return token;
};

/**
 * A definition's event tokens, by tag: each built once with its payload Struct and walker.
 */
export const tokensOf = (
  definition: string,
  owner: symbol,
  events: Readonly<Record<string, EventFields>>,
) =>
  Object.fromEntries(
    Object.entries(events).map(([tag, fields]) => [
      tag,
      eventToken(definition, owner, tag, fieldsOf(fields)),
    ]),
  );

/**
 * The id of the definition that made an event token, or none for a value no definition made.
 */
// FLOW_STATE_ALLOW_UNKNOWN: any value a caller passes as a token.
export const definitionOfToken = (token: unknown) =>
  Option.map(
    Result.getSuccess(madeOf<EventInternals>("event")(token, [])),
    (card) => card.internals.definition,
  );

/**
 * How a definition admits one event's payload: the Struct and its type-side walker its token was
 * built with, so `E.X`, `send` and Compiled check a payload one way.
 */
export const admissionOf = (definition: AnyDefinition, tag: string, fields: EventFields) =>
  Option.getOrElse(
    Option.map(
      Result.getSuccess(madeOf<EventInternals>("event")(definition.E[tag], [])),
      (card) => card.internals.admission,
    ),
    () => payloadOf(fieldsOf(fields)),
  );

/**
 * Where an ending goes, as the core reads it: its event, its mapper when it is a mapping
 * (`E.X.from(f)`), its owner and the token it maps onto; none for a value that is neither.
 */
// FLOW_STATE_ALLOW_UNKNOWN: an authored ending, read as made.
export const endingOf = (value: unknown) =>
  Option.orElse(
    Option.map(Result.getSuccess(madeOf<EventInternals>("event")(value, [])), (card) => ({
      event: tagOf(value),
      from: Option.none<MappingInternals["map"]>(),
      owner: card.owner,
      token: value,
    })),
    () =>
      Option.map(Result.getSuccess(madeOf<MappingInternals>("mapping")(value, [])), (card) => ({
        event: tagOf(card.internals.token),
        from: Option.some(card.internals.map),
        owner: card.owner,
        token: card.internals.token,
      })),
  );

// FLOW_STATE_ALLOW_UNKNOWN: a made token or mapping, whose face names its event.
const tagOf = (value: unknown) =>
  Predicate.hasProperty(value, "ending") &&
  Predicate.hasProperty(value.ending, "event") &&
  Predicate.isString(value.ending.event)
    ? value.ending.event
    : "";
