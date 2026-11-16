import { Option, Predicate, Result } from "effect";
import { toCanonicalJson } from "./codec.ts";

// FLOW_STATE_ALLOW_UNKNOWN: a slot's value has the type its selector returns; saved, it is JSON.
type Value = unknown;

/**
 * A context slot's last-seen value as JSON: a JSON value as it is, and `undefined`, an Option, or an
 * array or plain object holding them tagged; none for any other value, which a record saves
 * unknown.
 *
 * **Details**
 *
 * Each form is an object whose `~` names it, so a decoded value is equal to the one encoded.
 */
// RETURN_TYPE: recursive: an Option, array or object encodes what it holds.
export const encodeSeen = (value: Value): Option.Option<Value> => {
  const json = Result.getSuccess(toCanonicalJson(value));

  if (Option.isSome(json)) return Option.some({ "~": "json", value: json.value });

  if (value === undefined) return Option.some({ "~": "undefined" });

  if (Option.isOption(value))
    return Option.match(value, {
      onNone: () => Option.some({ "~": "none" }),
      onSome: (inner) =>
        Option.map(encodeSeen(inner), (encoded) => ({ "~": "some", value: encoded })),
    });

  if (Array.isArray(value))
    return Option.map(Option.all(value.map(encodeSeen)), (items) => ({ "~": "array", items }));

  if (Predicate.isObject(value) && Object.getPrototypeOf(value) === Object.prototype)
    return Option.map(
      Option.all(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeSeen(v)]))),
      (fields) => ({ "~": "object", fields }),
    );

  return Option.none();
};

/**
 * The value {@link encodeSeen} saved; none for a form it never writes.
 */
// RETURN_TYPE: recursive: an Option, array or object decodes what it holds.
export const decodeSeen = (json: Value): Option.Option<Value> =>
  Predicate.isObject(json) && "~" in json && Predicate.isString(json["~"])
    ? (forms[json["~"]]?.(json) ?? Option.none())
    : Option.none();

// How each tagged form reads back.
// FLOW_STATE_ALLOW_UNKNOWN: the fields of one saved form.
const forms: Readonly<
  Record<string, (json: { readonly [key: string]: unknown }) => Option.Option<unknown>>
> = {
  json: (json) => ("value" in json ? Option.some(json["value"]) : Option.none()),
  undefined: () => Option.some(undefined),
  none: () => Option.some(Option.none()),
  some: (json) => Option.map(decodeSeen(json["value"]), (inner) => Option.some(inner)),
  array: (json) => {
    const items = json["items"];

    return Array.isArray(items) ? Option.all(items.map(decodeSeen)) : Option.none();
  },
  object: (json) => {
    const fields = json["fields"];

    return Predicate.isObject(fields)
      ? Option.all(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeSeen(v)])))
      : Option.none();
  },
};
