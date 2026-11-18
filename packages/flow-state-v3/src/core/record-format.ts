import { Result, Schema } from "effect";
import { walkerOf } from "./boundary.ts";
import { CodecFailure, encodeCanonical } from "./codec.ts";
import type { Values } from "./compiled.ts";

/**
 * Flow's record format, stamped on every actor, lane and owed record.
 */
export const FORMAT = 4;

// The formats an actor record of this release reads: the current one, and formats 1 to 3 through
// their steps; a newer, null, fractional or string one is never read.
export const Format = Schema.Literals([1, 2, 3, FORMAT]);

export const FormatJson = Schema.Struct({ format: Format });

export const reasonOf = (failure: CodecFailure) =>
  CodecFailure.$match(failure, {
    Malformed: ({ reason, path }) => `${reason} at ${path}`,
  });

// The canonical text of a record, or why it has none.
export const textOf = (record: Values) => Result.mapError(encodeCanonical(record), reasonOf);

/**
 * A Struct that holds exactly its fields: a key it does not declare fails it, so a record holds
 * nothing its kind lacks.
 */
export const exact = <F extends Schema.Struct.Fields>(fields: F) => {
  const declared = new Set(Object.keys(fields));

  const strict: Schema.Top = Schema.StructWithRest(Schema.Struct(fields), [
    Schema.Record(
      Schema.String.check(Schema.makeFilter((key: string) => !declared.has(key))),
      Schema.Never,
    ),
  ]);

  // SAFETY: the rest only refuses keys the Struct does not declare, so what it decodes is the
  // Struct's own Type; typed as the rest, every declared field would read as never.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the rest narrows the input, never the output
  return strict as Schema.Struct<F>;
};

/**
 * A Record each of whose keys reads by `key`: a key it does not read fails it, where a Record's own
 * key Schema would only leave that key unselected.
 */
export const keyedBy = <K extends Schema.Record.Key, V extends Schema.Top>(key: K, value: V) => {
  const reads = Schema.is(key);

  const strict: Schema.Top = Schema.StructWithRest(Schema.Struct({}), [
    Schema.Record(key, value),
    Schema.Record(Schema.String.check(Schema.makeFilter((k: string) => !reads(k))), Schema.Never),
  ]);

  // SAFETY: the second rest only refuses keys the first does not read, so what it decodes is the
  // first Record's own Type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the rest narrows the input, never the output
  return strict as Schema.$Record<K, V>;
};

/**
 * A count: a safe integer, never negative.
 */
export const Count = Schema.Number.check(
  Schema.makeFilter((n: number) => Number.isSafeInteger(n) && n >= 0),
);

/**
 * A reader of one record kind: its Schema's walker, failing with `why`. A user Schema whose decode
 * throws fails the record too: the boot goes on.
 */
export const readerOf = <S extends Schema.Constraint>(schema: S, why: string) => {
  const walker = walkerOf(schema);

  // FLOW_STATE_ALLOW_UNKNOWN: a canonical JSON value, decoded here once by the Schema its key names.
  return (value: unknown) => Result.mapError(walker.decode(value), () => why);
};

/**
 * A digest of a text, stored beside a value it stands for, so a value changed on disk is told
 * from the one written: FNV-1a over its UTF-16 code units, as eight hex digits. Its algorithm is
 * part of the record format.
 */
export const digestOf = (text: string) => {
  let hash = 0x81_1c_9d_c5;

  for (let i = 0; i < text.length; i += 1)
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01_00_01_93) >>> 0;

  return hash.toString(16).padStart(8, "0");
};
