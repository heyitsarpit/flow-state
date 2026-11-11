import { Data, Effect, Predicate, type Schema } from "effect";
import type { Denial } from "./core/compiled.ts";

/**
 * A Schema that decodes and encodes with no services, as every Flow field does.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a field Schema may have any type; it is read where the field is used.
export type Plain = Schema.Codec<unknown, unknown>;

/**
 * A memory field with a constant start (`Flow.initial`).
 */
export type Initial<S extends Plain = Plain> = {
  readonly "~flow": "initial";
  readonly schema: S;
  readonly value: S["Type"];
};

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
 * - `Flow.initial(schema, value)`: a memory field that starts at a constant.
 * - `Flow.uncertain(fields)`: an internal event an operation's unknown ending maps to.
 * - `Flow.entry`: in a schedule's `armOn`, arm it on its state's entry too.
 */
export const Flow = {
  // RETURN_TYPE: the marker's Schema type parameter types the memory field.
  initial: <S extends Plain>(schema: S, value: S["Type"]): Initial<S> => ({
    "~flow": "initial",
    schema,
    value,
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
 * How a commit classifies its ending (WriteLanes R2).
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
