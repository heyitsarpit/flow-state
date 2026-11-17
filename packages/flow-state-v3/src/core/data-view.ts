import { Predicate, Schema } from "effect";
import type { Compiled } from "./compiled.ts";

// Functions Flow derives from a declared Schema: the Schema determines them, so the view omits them.
const DERIVED = new Set(["sameMemory", "is", "walk"]);

// FLOW_STATE_ALLOW_UNKNOWN: any part of a Compiled, or the plain data it shows.
type View = unknown;

// RETURN_TYPE: recursive: the plain data a part of Compiled shows.
const viewOf = (value: View): View => {
  if (Schema.isSchema(value)) return Schema.toJsonSchemaDocument(value);

  if (value instanceof Map) return [...value].map(([k, v]) => [k, viewOf(v)]);

  if (Array.isArray(value)) return value.map(viewOf);

  if (Predicate.hasProperty(value, "slot") && Predicate.hasProperty(value, "run"))
    return value.slot;

  if (!Predicate.isObject(value) || Predicate.isFunction(value)) return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([k, v]) => (DERIVED.has(k) ? [] : [[k, viewOf(v)]])),
  );
};

/**
 * A Compiled as plain data: each Slot by its name, each Schema by its JSON Schema document, maps
 * as entry lists, and the functions Flow derives from a Schema left out. Tools read this view; two
 * compiles of one source give equal views.
 */
export const dataView = (compiled: Compiled) => viewOf(compiled);
