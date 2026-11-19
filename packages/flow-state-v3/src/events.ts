import { Option, Predicate, Schema } from "effect";
import { admitted, walkerOf } from "./core/boundary.ts";
import type { Values } from "./core/compiled.ts";
import { isUncertain } from "./config.ts";
import type { AnyDefinition, EventFields, Tokens } from "./definition.ts";
import { flowError, raise } from "./error.ts";
import { builder, entry } from "./entry.ts";

/**
 * An event's field Schemas, through its `Flow.uncertain` marker.
 */
export const fieldsOf = (x: EventFields) => (isUncertain(x) ? x.fields : x);

/**
 * A Struct built over a runtime record of field Schemas, as the record codec Compiled holds.
 */
export const codecOf = <E, S = Schema.Top>(schema: S) =>
  // SAFETY: a Struct of a definition's own field Schemas decodes to a record of those fields, and every Flow field Schema needs no services.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Schema.Struct over a runtime record has no static field types
  schema as Schema.Codec<Values, E>;

// FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
export const trusted = <A>(value: unknown) =>
  // SAFETY: a value built from the definition's own keys, whose static type the caller names.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- records built at run time carry no static key types
  value as A;

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
export const payloadOf = (fields: Schema.Struct.Fields) => {
  const payload = codecOf<Values>(Schema.Struct(fields));

  return {
    payload,
    walk: walkerOf(codecOf<Values>(Schema.toType(payload))),
    names: Object.keys(fields),
  };
};

// How each event token Flow made admits its payload, by the token itself: a copy of a token is
// not one.
const admissions = new WeakMap<WeakKey, ReturnType<typeof payloadOf>>();

// The definition each event token was made by, by the token itself.
const definitions = new WeakMap<WeakKey, string>();

const eventToken = (tag: string, fields: Schema.Struct.Fields) => {
  const ending = { event: tag, from: Option.none() };
  const admission = payloadOf(fields);
  const { payload, walk, names } = admission;

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

  const token = Object.assign(make, {
    "~flow": "event",
    tag,
    ending,
    "~payload": payload,
    "~walk": walk,
    "~names": names,
    from: builder(`E.${tag}.from`, (map: (value: never) => Values) => ({
      ending: { event: tag, from: Option.some(map) },
      "~token": token,
    })),
  });

  admissions.set(token, admission);

  return token;
};

/**
 * A definition's event tokens, by tag: each built once with its payload Struct and walker.
 */
export const tokensOf = <Ev extends Readonly<Record<string, EventFields>>, Id extends string>(
  definition: Id,
  events: Ev,
) =>
  trusted<Tokens<Ev, Id>>(
    Object.fromEntries(
      Object.entries(events).map(([tag, fields]) => {
        const token = eventToken(tag, fieldsOf(fields));
        definitions.set(token, definition);

        return [tag, token];
      }),
    ),
  );

/**
 * The id of the definition that made an event token, or none for a value no definition made.
 */
// FLOW_STATE_ALLOW_UNKNOWN: any value a caller passes as a token.
export const definitionOfToken = (token: unknown) =>
  Predicate.isFunction(token) ? Option.fromUndefinedOr(definitions.get(token)) : Option.none();

/**
 * How a definition admits one event's payload: the Struct and its type-side walker its token was
 * built with, so `E.X`, `send` and Compiled check a payload one way.
 */
export const admissionOf = (definition: AnyDefinition, tag: string, fields: EventFields) => {
  const token = definition.E[tag];

  return (
    (Predicate.isFunction(token) ? admissions.get(token) : undefined) ?? payloadOf(fieldsOf(fields))
  );
};
