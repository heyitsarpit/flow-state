import { Result, Schema } from "effect";
import { CodecFailure, encodeCanonical } from "./codec.ts";
import type { Values } from "./compiled.ts";
import type { ReadFailure } from "./vocabulary.ts";
import type { ActorId } from "./world.ts";

/**
 * Flow's record format, stamped on every actor, lane and owed record.
 */
export const FORMAT = 3;

// The formats a record of this release reads: the current one, and formats 1 and 2 through their
// steps; a newer, null, fractional or string one is never read.
export const Format = Schema.Literals([1, 2, FORMAT]);

export const ActorJson = Schema.Struct({ machine: Schema.String, name: Schema.String });

export const FormatJson = Schema.Struct({ format: Format });

/**
 * A failure of a record's read, for `mapError` and `fromNullishOr`.
 */
export const readFailed = (code: ReadFailure) => () => code;

export const reasonOf = (failure: CodecFailure) =>
  CodecFailure.$match(failure, {
    Malformed: ({ reason, path }) => `${reason} at ${path}`,
  });

// The canonical text of a record, or why it has none.
export const textOf = (record: Values) => Result.mapError(encodeCanonical(record), reasonOf);

export const decodeBy =
  <A, I>(schema: Schema.Codec<A, I>, why: ReadFailure) =>
  // FLOW_STATE_ALLOW_UNKNOWN: a canonical JSON value, decoded here once by the Schema its key names.
  (value: unknown) =>
    // A user Schema whose decode throws is the record's failure too: the boot goes on.
    Result.flatMap(
      Result.try({ try: () => Schema.decodeUnknownResult(schema)(value), catch: () => why }),
      (decoded) => Result.mapError(decoded, () => why),
    );

/**
 * An identity as a record names it.
 */
export const actorOf = (r: ActorId) => ({
  machine: r.machine,
  name: r.name,
});
