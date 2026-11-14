import { Schema } from "effect";

const encode = Schema.encodeSync(Schema.fromJsonString(Schema.Json));

const isArray = Schema.is(Schema.Array(Schema.Json));

const isRecord = Schema.is(Schema.Record(Schema.String, Schema.Json));

// RETURN_TYPE: the function recurses, so TypeScript needs its type written.
const sorted = (value: Schema.Json): Schema.Json => {
  if (isArray(value)) return value.map(sorted);

  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sorted(v)]),
    );

  return value;
};

/**
 * A JSON value's key: its encoded text with every object's fields in name order, so two equal
 * values give one key whatever order their fields were written in.
 */
export const jsonKey = (value: Schema.Json) => encode(sorted(value));
