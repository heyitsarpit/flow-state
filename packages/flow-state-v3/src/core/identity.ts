import { Option, Predicate, Result, Schema } from "effect";
import { type Compiled, Source, type Values } from "./compiled.ts";

/**
 * The prefix of a local actor's name: a singleton's literal name may not start with it, and a
 * value-named actor's name is JSON text, so a local actor never shares a shared actor's identity.
 */
export const LOCAL_PREFIX = "~";

/**
 * A machine's input fields, by name: the fields that name a value-named actor.
 */
export const inputFieldsOf = (compiled: Compiled) =>
  compiled.fields
    .filter((f) => Source.$is("Input")(f.source))
    .toSorted((a, b) => Number(a.name > b.name) - Number(a.name < b.name));

// The JSON text of a machine's input fields, each encoded by its Schema, in field-name order.
const nameCodec = (compiled: Compiled) =>
  Schema.fromJsonString(
    Schema.Struct(Object.fromEntries(inputFieldsOf(compiled).map((f) => [f.name, f.schema]))),
  );

/**
 * The name a value names an actor by: its input fields, each checked by its Schema's type side
 * and encoded, in field-name order, as JSON text. Fields the value has beyond its input are not
 * part of the identity. Fails with the first field that is missing or does not type-check.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a ref's value is the caller's; each input field is checked before it is trusted.
export const nameOfValue = (compiled: Compiled, value: unknown) => {
  const input: Record<string, unknown> = {};

  for (const field of inputFieldsOf(compiled)) {
    const given = Predicate.hasProperty(value, field.name) ? value[field.name] : undefined;

    if (!field.is(given)) return Result.fail(field.name);
    input[field.name] = given;
  }

  return Result.mapError(Schema.encodeUnknownResult(nameCodec(compiled))(input), () => compiled.id);
};

/**
 * The input an actor is created from: a value-named actor's input fields decoded from its name,
 * or nothing for a singleton or a local actor.
 */
// RETURN_TYPE: an actor's input is the Values creation takes.
export const inputOfName = (compiled: Compiled, name: string): Values =>
  inputFieldsOf(compiled).length === 0 || name.startsWith(LOCAL_PREFIX)
    ? {}
    : Option.getOrElse(Schema.decodeUnknownOption(nameCodec(compiled))(name), () => ({}));
