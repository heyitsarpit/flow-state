import { MAX_DEPTH } from "./core/depth.ts";
import { Data, Effect, Predicate, type Schema } from "effect";
import type { Denial, Values } from "./core/compiled.ts";

/**
 * A Schema that decodes and encodes with no services, as every Flow field does.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a field Schema may have any type; it is read where the field is used.
export type Plain = Schema.Codec<unknown, unknown>;

/**
 * A field Schema that may be absent: the start of an optional memory key.
 */
export type OptionalField = Plain & { readonly "~type.optionality": "optional" };

/**
 * A memory field with a constant start (`Flow.initial(schema, value)`), or one computed from the
 * input and constant fields (`Flow.initial(schema, (fields) => value)`).
 */
export type Initial<S extends Plain = Plain> = {
  readonly "~flow": "initial";
  readonly schema: S;
  readonly start:
    | { readonly _tag: "Constant"; readonly value: S["Type"] }
    | { readonly _tag: "Computed"; readonly compute: (fields: Values) => S["Type"] };
};

/**
 * A memory field the creator supplies (`Flow.input`): part of the definition's Input.
 */
export type Input<S extends Plain = Plain> = { readonly "~flow": "input"; readonly schema: S };

/**
 * A memory field seen only by its owner (`Flow.private`): kept in records and Stories, omitted from
 * outside snapshots.
 */
export type Private<F extends Initial | OptionalField = Initial | OptionalField> = {
  readonly "~flow": "private";
  readonly field: F;
};

/**
 * One memory field: its Schema with the one source it starts from.
 */
export type Field = Initial | Input | Private | OptionalField;

/**
 * An internal event an operation may name as its unknown ending (`Flow.uncertain`).
 */
export type Uncertain<F extends Schema.Struct.Fields = Schema.Struct.Fields> = {
  readonly "~flow": "uncertain";
  readonly fields: F;
};

/**
 * The entry of a schedule's owner state, as an `armOn` element (`Flow.entry`).
 */
export type Entry = { readonly "~flow": "entry" };

const entry: Entry = { "~flow": "entry" };

/**
 * Flow's markers for definitions and schedules.
 *
 * **When to use**
 *
 * - `Flow.initial(schema, value)`: a memory field that starts at a constant;
 *   `Flow.initial(schema, (fields) => value)` computes it from the input and constant fields.
 * - `Flow.input(schema)`: a memory field the creator supplies; read-only afterwards.
 * - `Flow.private(field)`: a field kept from outside snapshots.
 * - `Flow.uncertain(fields)`: an internal event an operation's unknown ending maps to.
 * - `Flow.entry`: in a schedule's `armOn`, arm it on its state's entry too.
 */
export const Flow = {
  /**
   * How deeply a value may nest (arrays, objects, Maps, Sets and class instances inside one
   * another): a platform limit, measured where Effect's Schema and `Equal` recurse. Memory, a
   * selection or a commit input past it is reported UnencodableValue and never fails a turn.
   */
  maxDepth: MAX_DEPTH,
  // RETURN_TYPE: the marker's Schema type parameter types the memory field.
  initial: <S extends Plain>(
    schema: S,
    value: S["Type"] | ((fields: Values) => S["Type"]),
  ): Initial<S> =>
    Predicate.isFunction(value)
      ? { "~flow": "initial", schema, start: { _tag: "Computed", compute: value } }
      : { "~flow": "initial", schema, start: { _tag: "Constant", value } },
  // RETURN_TYPE: the marker's Schema type parameter types the memory field.
  input: <S extends Plain>(schema: S): Input<S> => ({ "~flow": "input", schema }),
  // RETURN_TYPE: the marker keeps its field's type.
  private: <F extends Initial | OptionalField>(field: F): Private<F> => ({
    "~flow": "private",
    field,
  }),
  // RETURN_TYPE: the marker's fields type the event payload.
  uncertain: <const F extends Schema.Struct.Fields>(fields: F): Uncertain<F> => ({
    "~flow": "uncertain",
    fields,
  }),
  entry,
};

/**
 * A guard's refusal with a literal code.
 *
 * **When to use**
 *
 * Return it from a guard that declines: `memory.ready || deny("NotReady")`.
 */
// RETURN_TYPE: a denial is plain data matching Flow.Denial, storable in memory.
export const deny = (code: string): Denial => ({ _tag: "Flow/Denial", code });

/**
 * A commit's definite failure, as `Outcome.failure` marks it.
 */
export class OutcomeFailure<E> extends Data.TaggedError("Flow/Failure")<{ readonly error: E }> {}

/**
 * A commit's unknown ending, as `Outcome.unknown` marks it: the write may have happened.
 */
export class OutcomeUnknown<E> extends Data.TaggedError("Flow/Unknown")<{ readonly error: E }> {}

/**
 * How a commit classifies its ending.
 *
 * **When to use**
 *
 * Inside a commit, `Outcome.success(value)` turns an answer into a success, `Outcome.failure(e)`
 * says this send definitely did not do it, and `Outcome.unknown(e)` says it may have happened. A
 * plain error is a failure; a defect is unknown `Defect`.
 */
export const Outcome = {
  success: <A>(value: A) => Effect.succeed(value),
  failure: <E>(error: E) => Effect.fail(new OutcomeFailure({ error })),
  unknown: <E>(error: E) => Effect.fail(new OutcomeUnknown({ error })),
};

/**
 * The reason an error names: its `_tag`, or `Error` for an untagged one.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a commit's error is the application's own value.
export const reasonOf = (error: unknown) =>
  Predicate.hasProperty(error, "_tag") && Predicate.isString(error._tag) ? error._tag : "Error";
