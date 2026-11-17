import { Result, Schema } from "effect";
import { CodecFailure, encodeCanonical } from "./codec.ts";
import type { Values } from "./compiled.ts";
import type { ActorId } from "./world.ts";

/**
 * Flow's record format, stamped on every actor, lane and owed record.
 */
export const FORMAT = 2;

// The formats a record of this release reads: the current one, and format 1 through its step; a
// newer, null, fractional or string one is never read.
export const Format = Schema.Literals([1, FORMAT]);

export const ActorJson = Schema.Struct({ machine: Schema.String, name: Schema.String });

export const FormatJson = Schema.Struct({ format: Format });

export const reasonOf = (failure: CodecFailure) =>
  CodecFailure.$match(failure, {
    BoundExceeded: ({ bound, limit, path }) => `${bound} over ${limit} at ${path}`,
    Malformed: ({ reason, path }) => `${reason} at ${path}`,
  });

// The canonical text of a record, or why it has none.
export const textOf = (record: Values) => Result.mapError(encodeCanonical(record), reasonOf);

export const jsonOf = (json: Schema.Codec<Values, Values>, value: Values) =>
  Result.mapError(Schema.encodeUnknownResult(json)(value), () => "schema");

export const decodeBy =
  <A, I>(schema: Schema.Codec<A, I>, why: string) =>
  // FLOW_STATE_ALLOW_UNKNOWN: a canonical JSON value, decoded here once by the Schema its key names.
  (value: unknown) =>
    Result.mapError(Schema.decodeUnknownResult(schema)(value), () => why);

/**
 * An identity as a record names it.
 */
export const actorOf = (r: ActorId) => ({
  machine: r.machine,
  name: r.name,
});
