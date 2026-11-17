import { Equal, Option, Result, Schema } from "effect";
import type { Values } from "./compiled.ts";

/**
 * A context slot's selection as its Schema reads it back, beside its JSON form: the value a consumer
 * reads, saves and compares, the same live and after a reload.
 */
export type Selected = {
  // FLOW_STATE_ALLOW_UNKNOWN: a selection has the type its slot's Schema decodes, typed at the definition.
  readonly value: unknown;
  // FLOW_STATE_ALLOW_UNKNOWN: its Schema's JSON form, checked by the codec only when a record saves it.
  readonly json: unknown;
};

/**
 * The inputs a reaction's selection read: each slot it read, none for a slot never selected, and
 * each memory field it read, from `source`, the memory object it read them from, which baselines
 * read in one wave share.
 */
export type Frame = {
  readonly slots: ReadonlyMap<string, Option.Option<Selected>>;
  // FLOW_STATE_ALLOW_UNKNOWN: a memory field has its field Schema's type, typed at the definition.
  readonly memory: ReadonlyMap<string, unknown>;
  readonly source: Source;
};

/**
 * The memory a baseline read its fields from: the actor's memory object, or a saved copy read back.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a memory field has its field Schema's type.
export type Source = Values | ReadonlyMap<string, unknown>;

/**
 * A reaction's baseline: its last selection and the inputs it was read from.
 */
export type Baseline = {
  // FLOW_STATE_ALLOW_UNKNOWN: a reaction's selection has the type its select returns.
  readonly selection: unknown;
  readonly frame: Frame;
};

/**
 * A saved slot's JSON read back through its Schema; fails when the Schema refuses it or its decode
 * throws.
 */
export const readSelected = (
  // FLOW_STATE_ALLOW_UNKNOWN: a slot's JSON codec, typed at the definition.
  codec: Schema.Codec<unknown, unknown>,
  // FLOW_STATE_ALLOW_UNKNOWN: a selection's JSON form, as its Schema wrote it.
  json: unknown,
) =>
  Result.flatMap(
    Result.try({ try: () => Schema.decodeUnknownResult(codec)(json), catch: () => "schema" }),
    (decoded) =>
      Result.map(
        Result.mapError(decoded, () => "schema"),
        (value) => ({ value, json }) satisfies Selected,
      ),
  );

/**
 * A raw selection passed once through its slot's JSON codec: its JSON form and the value that form
 * reads back as. Fails only when the Schema refuses the selection or encodes it without end (a
 * cycle the Schema follows): its selector's contract. A record's bounds are the record's: a form
 * past one is saved unknown, never refused here.
 */
export const selectedOf = (
  // FLOW_STATE_ALLOW_UNKNOWN: a slot's JSON codec, typed at the definition.
  codec: Schema.Codec<unknown, unknown>,
  // FLOW_STATE_ALLOW_UNKNOWN: a selector's raw result, checked here by its slot's Schema.
  raw: unknown,
) =>
  Result.flatMap(
    Result.try({ try: () => Schema.encodeUnknownResult(codec)(raw), catch: () => "schema" }),
    (encoded) =>
      Result.flatMap(
        Result.mapError(encoded, () => "schema"),
        (json) => readSelected(codec, json),
      ),
  );

/**
 * Whether two slots hold the same JSON form, so a selection read back from either is the same in
 * every way a select can read it, a Map's or Set's order included; or are both never selected.
 */
export const sameForm = (a: Option.Option<Selected>, b: Option.Option<Selected>) =>
  Option.isNone(a) ? Option.isNone(b) : Option.exists(b, (y) => Equal.equals(a.value.json, y.json));

/**
 * Whether two slots hold equal selections, or are both never selected.
 */
export const sameSlot = (a: Option.Option<Selected>, b: Option.Option<Selected>) =>
  Option.isNone(a)
    ? Option.isNone(b)
    : Option.exists(b, (y) => Equal.equals(a.value.value, y.value));
