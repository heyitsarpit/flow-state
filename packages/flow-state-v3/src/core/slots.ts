import { Option, Result, type Schema } from "effect";
import type { Walker } from "./boundary.ts";
import { Canonical, parseCanonical, writeCanonical } from "./codec.ts";
import type { Values } from "./compiled.ts";
import { sameValue } from "./same.ts";

/**
 * A context slot's selection as its Schema reads it back, beside its JSON form: the value a consumer
 * reads, saves and compares, the same live and after a reload, and that form's canonical text.
 */
export type Selected = {
  // FLOW_STATE_ALLOW_UNKNOWN: a selection has the type its slot's Schema decodes, typed at the definition.
  readonly value: unknown;
  readonly json: Schema.Json;
  readonly text: Canonical;
  // FLOW_STATE_ALLOW_UNKNOWN: the selector's own result this was read from; none when restored.
  readonly raw: Option.Option<unknown>;
  // The provider snapshot it was selected from; none when restored.
  readonly from: Option.Option<{ readonly state: string; readonly memory: Values }>;
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
 * A saved slot's JSON read back through its Schema, beside its canonical text; fails when the
 * Schema refuses it or its JSON has no canonical form.
 */
export const readSelected = (
  // FLOW_STATE_ALLOW_UNKNOWN: a slot's walkers, typed at the definition.
  walk: Walker<unknown, unknown>,
  json: Schema.Json,
  written: Option.Option<string> = Option.none(),
) =>
  Result.flatMap(
    Option.match(written, {
      onNone: () => Result.mapError(writeCanonical(json, "zero"), () => "codec"),
      onSome: Result.succeed,
    }),
    (text) =>
      Result.map(
        walk.decode(json),
        (value) =>
          ({
            value,
            json,
            text: new Canonical({ text }),
            raw: Option.none(),
            from: Option.none(),
          }) satisfies Selected,
      ),
  );

/**
 * A raw selection passed once through its slot's JSON codec: its canonical JSON form (a -0 written
 * as 0, which `Equal` holds equal) and the value that form reads back as, so a consumer reads the
 * same value live and after a reload. Fails when the Schema refuses the selection, encodes it
 * without end (a cycle the Schema follows), or its JSON has no canonical form (a lone surrogate):
 * its selector's contract. A selector that returns the very value it returned last (an unchanged
 * part of an immutable snapshot) keeps its last selection, walked once.
 */
export const selectedOf = (
  // FLOW_STATE_ALLOW_UNKNOWN: a slot's walkers, typed at the definition.
  walk: Walker<unknown, unknown>,
  // FLOW_STATE_ALLOW_UNKNOWN: a selector's raw result, checked here by its slot's Schema.
  raw: unknown,
) =>
  Result.flatMap(walk.encode(raw), (json) =>
    Result.flatMap(
      Result.mapError(writeCanonical(json, "zero"), () => "codec"),
      (text) =>
        Result.flatMap(
          Result.mapError(parseCanonical(text), () => "codec"),
          (canonical) =>
            Result.map(readSelected(walk, canonical, Option.some(text)), (selected) => ({
              ...selected,
              raw: Option.some(raw),
            })),
        ),
    ),
  );

/**
 * Whether two slots hold the same JSON form, so a selection read back from either is the same in
 * every way a select can read it, a Map's or Set's order included; or are both never selected.
 */
export const sameForm = (a: Option.Option<Selected>, b: Option.Option<Selected>) =>
  Option.isNone(a) ? Option.isNone(b) : Option.exists(b, (y) => a.value.text.text === y.text.text);

/**
 * Whether two slots hold equal selections, or are both never selected.
 */
export const sameSlot = (a: Option.Option<Selected>, b: Option.Option<Selected>) =>
  Option.isNone(a) ? Option.isNone(b) : Option.exists(b, (y) => sameValue(a.value.value, y.value));
