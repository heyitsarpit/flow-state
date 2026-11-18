import { byCodeUnits } from "./world.ts";
import { Option, Predicate, Result, Schema } from "effect";
import { parseCanonical, writeJson } from "./codec.ts";
import { type Compiled, type Field, Source, type Values } from "./compiled.ts";
import { defect } from "./defect.ts";

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
    .toSorted((a, b) => byCodeUnits(a.name, b.name));

/**
 * The Schema of a machine's name: its input fields, each by its own Schema, in field-name order;
 * a name is this Struct's encoded form as JSON text.
 */
export const nameSchemaOf = (fields: ReadonlyArray<Field>) =>
  Schema.Struct(
    Object.fromEntries(
      fields
        .filter((f) => Source.$is("Input")(f.source))
        .toSorted((a, b) => byCodeUnits(a.name, b.name))
        .map((f) => [f.name, f.schema]),
    ),
  );

/**
 * The name a value names an actor by: its input fields, each checked by its Schema's type side
 * and encoded, in field-name order, as JSON text. Fields the value has beyond its input are not
 * part of the identity. Fails with the first field that is missing or does not type-check, or,
 * when every field checks, with none: the input has no encoded form.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a ref's value is the caller's; each input field is checked before it is trusted.
export const nameOfValue = (compiled: Compiled, value: unknown) => {
  const input: Record<string, unknown> = {};

  for (const field of inputFieldsOf(compiled)) {
    const given = Predicate.hasProperty(value, field.name) ? value[field.name] : undefined;

    if (!field.is(given)) return Result.fail(Option.some(field.name));
    input[field.name] = given;
  }

  return Result.mapError(
    Result.flatMap(compiled.identity.encode(input), (encoded) =>
      Result.mapError(writeJson(encoded), () => "schema"),
    ),
    () => Option.none<string>(),
  );
};

/**
 * The input a name names: a value-named actor's input fields decoded from its name, or nothing for
 * a singleton or a local actor. Fails `name` when the name does not decode by the machine's
 * identity, or when its input does not name it back, so no other actor's name stands for it.
 */
// RETURN_TYPE: an actor's input is the Values creation takes.
export const decodeName = (compiled: Compiled, name: string): Result.Result<Values, "name"> =>
  inputFieldsOf(compiled).length === 0 || name.startsWith(LOCAL_PREFIX)
    ? Result.succeed({})
    : Result.mapError(
        Result.flatMap(
          Result.mapError(parseCanonical(name), () => "json"),
          (json) =>
            Result.flatMap(compiled.identity.decode(json), (input) =>
              Result.flatMap(
                Result.mapError(nameOfValue(compiled, input), () => "schema"),
                (again) =>
                  again === name ? Result.succeed<Values>({ ...input }) : Result.fail("other"),
              ),
            ),
        ),
        () => "name" as const,
      );

/**
 * The input an actor is created from, by its name. A name reaches here only from a ref or a record
 * the boot read, and both are checked by `decodeName`, so a name that does not decode is a defect.
 */
// RETURN_TYPE: an actor's input is the Values creation takes.
export const inputOfName = (compiled: Compiled, name: string): Values =>
  Result.getOrElse(decodeName(compiled, name), () =>
    defect(`an actor name no admission or boot check read: ${name}`),
  );
