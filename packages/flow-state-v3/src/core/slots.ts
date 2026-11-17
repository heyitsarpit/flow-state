import { Equal, Option, Result, Schema } from "effect";
import { encodeCanonical, toCanonicalJson } from "./codec.ts";
import type { Values } from "./compiled.ts";

/**
 * A context slot's selection as its Schema reads it back, beside its JSON form: the value a consumer
 * reads, saves and compares, the same live and after a reload.
 */
export type Selected = {
  // FLOW_STATE_ALLOW_UNKNOWN: a selection has the type its slot's Schema decodes, typed at the definition.
  readonly value: unknown;
  readonly json: Schema.Json;
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
  json: Schema.Json,
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
 * A raw selection passed once through its slot's JSON codec: its canonical JSON form (a -0 written
 * as 0, which `Equal` holds equal) and the value that form reads back as, so a consumer reads the
 * same value live and after a reload. Fails when the Schema refuses the selection, encodes it
 * without end (a cycle the Schema follows), or its JSON has no canonical form (a lone surrogate):
 * its selector's contract.
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
        (json) =>
          Result.flatMap(
            Result.mapError(toCanonicalJson(json, "zero"), () => "codec"),
            (canonical) => readSelected(codec, canonical),
          ),
      ),
  );

/**
 * Whether two values are equal by `Equal.equals`; for a value too deep for its recursion, whether
 * their canonical texts match, which the codec writes at any depth. Two values with no canonical
 * text that are too deep to compare are taken to differ, so a wave runs rather than being missed.
 */
// FLOW_STATE_ALLOW_UNKNOWN: values a selector, a reaction or a record holds, of any type.
export const sameValue = (a: unknown, b: unknown) =>
  Result.getOrElse(Result.try({ try: () => Equal.equals(a, b), catch: () => "deep" }), () =>
    Option.getOrElse(
      Option.zipWith(
        Result.getSuccess(encodeCanonical(a)),
        Result.getSuccess(encodeCanonical(b)),
        (x, y) => x === y,
      ),
      () => false,
    ),
  );

/**
 * Whether two slots hold the same JSON form, so a selection read back from either is the same in
 * every way a select can read it, a Map's or Set's order included; or are both never selected.
 */
export const sameForm = (a: Option.Option<Selected>, b: Option.Option<Selected>) =>
  Option.isNone(a) ? Option.isNone(b) : Option.exists(b, (y) => sameValue(a.value.json, y.json));

/**
 * Whether two slots hold equal selections, or are both never selected.
 */
export const sameSlot = (a: Option.Option<Selected>, b: Option.Option<Selected>) =>
  Option.isNone(a) ? Option.isNone(b) : Option.exists(b, (y) => sameValue(a.value.value, y.value));
