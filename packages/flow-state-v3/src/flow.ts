import { Data, Effect, Option, Predicate, type Schema } from "effect";
import type { Denial, Values } from "./core/compiled.ts";
import { builder } from "./entry.ts";
import type { ContextOfTokens } from "./tokens.ts";

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
 * How a token reads its provider's outside snapshot, kept by the token's identity.
 */
export type Reader = {
  readonly provider: string;
  readonly schema: Plain;
  // FLOW_STATE_ALLOW_UNKNOWN: the value a read takes from the snapshot, typed at the token.
  readonly read: (snapshot: { readonly state: string; readonly memory: Values }) => unknown;
};

const readers = new WeakMap<WeakKey, Reader>();

/**
 * Records how a token Flow made reads its provider.
 */
// RETURN_TYPE: the token as given, so its maker returns it in place.
export const reading = <T extends WeakKey>(token: T, reader: Reader): T => {
  readers.set(token, reader);

  return token;
};

// FLOW_STATE_ALLOW_UNKNOWN: an authored token, recognised by identity.
const readerOf = (token: unknown) =>
  Predicate.isObject(token) ? Option.fromUndefinedOr(readers.get(token)) : Option.none<Reader>();

// FLOW_STATE_ALLOW_UNKNOWN: a select's result, checked by the slot's Schema when it is selected.
type Select = (values: Values) => unknown;

// FLOW_STATE_ALLOW_UNKNOWN: a function an author passed as select, checked callable by its caller.
const selectOf = (given: unknown) =>
  // SAFETY: the select an author wrote for these reads, called with exactly their values.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a select's argument type is erased here and restored at its declaration
  given as Select;

// FLOW_STATE_ALLOW_UNKNOWN: an authored token or Schema, and a derived slot's spec.
const contextSlot = (first: unknown, ...spec: ReadonlyArray<unknown>) => slotOf(first, spec[0]);

// A derived slot's reads and select, read from its spec only when its definition decodes it.
// FLOW_STATE_ALLOW_UNKNOWN: an authored spec, read by its fields.
const derivedOf = (spec: unknown) => {
  const reads =
    Predicate.hasProperty(spec, "reads") && Predicate.isObject(spec.reads) ? spec.reads : {};

  const given = Predicate.hasProperty(spec, "select") ? spec.select : undefined;
  const select = Predicate.isFunction(given) ? selectOf(given) : () => undefined;

  const known = Object.entries(reads).flatMap(([name, token]) =>
    Option.match(readerOf(token), { onNone: () => [], onSome: (r) => [[name, r] as const] }),
  );

  return { select, known };
};

// A slot whose provider and select come from its tokens, read when its definition decodes it.
// FLOW_STATE_ALLOW_UNKNOWN: an authored token or Schema, and an authored spec.
const slotOf = (first: unknown, spec: unknown) =>
  spec === undefined
    ? Option.match(readerOf(first), {
        onNone: () => ({
          "~flow": "context",
          provider: "",
          schema: first,
          select: () => undefined,
        }),
        onSome: (r) => ({
          "~flow": "context",
          provider: r.provider,
          schema: r.schema,
          select: r.read,
        }),
      })
    : {
        "~flow": "context",
        get provider() {
          return derivedOf(spec).known[0]?.[1].provider ?? "";
        },
        schema: first,
        select: (snapshot: { readonly state: string; readonly memory: Values }) => {
          const { select, known } = derivedOf(spec);

          return select(Object.fromEntries(known.map(([name, r]) => [name, r.read(snapshot)])));
        },
      };

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
  initial: builder(
    "Flow.initial",
    // RETURN_TYPE: the marker's Schema type parameter types the memory field.
    <S extends Plain>(schema: S, value: S["Type"] | ((fields: Values) => S["Type"])): Initial<S> =>
      Predicate.isFunction(value)
        ? { "~flow": "initial", schema, start: { _tag: "Computed", compute: value } }
        : { "~flow": "initial", schema, start: { _tag: "Constant", value } },
  ),
  input: builder(
    "Flow.input",
    // RETURN_TYPE: the marker's Schema type parameter types the memory field.
    <S extends Plain>(schema: S): Input<S> => ({ "~flow": "input", schema }),
  ),
  private: builder(
    "Flow.private",
    // RETURN_TYPE: the marker keeps its field's type.
    <F extends Initial | OptionalField>(field: F): Private<F> => ({ "~flow": "private", field }),
  ),
  uncertain: builder(
    "Flow.uncertain",
    // RETURN_TYPE: the marker's fields type the event payload.
    <const F extends Schema.Struct.Fields>(fields: F): Uncertain<F> => ({
      "~flow": "uncertain",
      fields,
    }),
  ),
  entry,
  context: builder(
    "Flow.context",
    // SAFETY: each overload returns the ContextSlot its arguments declare; definition decodes it.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the overloads are the public contract
    contextSlot as ContextOfTokens,
  ),
};

/**
 * A guard's refusal with a literal code.
 *
 * **When to use**
 *
 * Return it from a guard that declines: `memory.ready || deny("NotReady")`.
 */
export const deny = builder(
  "deny",
  // RETURN_TYPE: a denial is plain data, storable in memory.
  (code: string): Denial => ({ _tag: "Flow/Denial", code }),
);

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
  success: builder("Outcome.success", <A>(value: A) => Effect.succeed(value)),
  failure: builder("Outcome.failure", <E>(error: E) => Effect.fail(new OutcomeFailure({ error }))),
  unknown: builder("Outcome.unknown", <E>(error: E) => Effect.fail(new OutcomeUnknown({ error }))),
};

/**
 * The reason an error names: its `_tag`, or `Error` for an untagged one.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a commit's error is the application's own value.
export const reasonOf = (error: unknown) =>
  Predicate.hasProperty(error, "_tag") && Predicate.isString(error._tag) ? error._tag : "Error";
