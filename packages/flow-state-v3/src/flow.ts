import { Data, Effect, Option, Predicate, Result, Schema } from "effect";
import type { Denial, Read, Values } from "./core/compiled.ts";
import { builder } from "./entry.ts";
import { type Finding, invalid } from "./error.ts";
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
 * A memory field with a constant start (`Flow.initial(schema, value)`).
 */
export type Initial<S extends Plain = Plain> = {
  readonly "~flow": "initial";
  readonly schema: S;
  readonly value: S["Type"];
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
 * How a token reads its provider: the definition that made it, by identity and by id, the read's
 * Schema and what it reads; kept by the token's identity.
 */
export type Reader = {
  readonly owner: symbol;
  readonly provider: string;
  readonly schema: Plain;
  readonly read: Read;
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

/**
 * How a token Flow made reads its provider; none for any other value.
 */
// FLOW_STATE_ALLOW_UNKNOWN: an authored token, recognised by identity.
export const readerOf = (token: unknown) =>
  Predicate.isObject(token) ? Option.fromUndefinedOr(readers.get(token)) : Option.none<Reader>();

// A slot as written, read only when its definition reads it: a pass-through's token, or a
// Schema and a derived slot's spec.
// FLOW_STATE_ALLOW_UNKNOWN: an authored token or Schema, and a derived slot's spec.
const contextSlot = (first: unknown, ...spec: ReadonlyArray<unknown>) =>
  spec.length === 0
    ? {
        "~flow": "context",
        schema: Option.match(readerOf(first), { onNone: () => first, onSome: (r) => r.schema }),
        form: "pass",
        spec: first,
      }
    : { "~flow": "context", schema: first, form: "derived", spec: spec[0] };

// A derived slot's reads and select, or undefined for a part its spec lacks or hides.
// FLOW_STATE_ALLOW_UNKNOWN: an authored spec, read by its fields.
const partsOf = (spec: unknown) =>
  Result.getOrElse(
    Result.try(() => ({
      reads: Predicate.hasProperty(spec, "reads") ? spec.reads : undefined,
      select: Predicate.hasProperty(spec, "select") ? spec.select : undefined,
    })),
    () => ({ reads: undefined, select: undefined }),
  );

/**
 * A slot as its definition reads it: its one provider and each read by name (a pass-through's
 * one read is named by its slot), with its select; or the findings that refuse it.
 */
export const slotReadsOf = (
  name: string,
  slot: {
    // FLOW_STATE_ALLOW_UNKNOWN: an authored slot's parts, checked here before they are trusted.
    readonly schema: unknown;
    readonly form: "pass" | "derived";
    // FLOW_STATE_ALLOW_UNKNOWN: as above.
    readonly spec: unknown;
  },
) => {
  const at = ["context", name];

  if (!Schema.isSchema(slot.schema))
    return Result.fail([
      invalid(
        [...at, "schema"],
        "WrongKind",
        `context slot ${name} has no Schema`,
        "Read a token, Flow.context(X.M.field), or derive: Flow.context(Schema, { reads, select }).",
      ),
    ]);

  return slot.form === "pass" ? passOf(name, slot.spec) : derivedOf(name, slot.spec);
};

// A pass-through's one read, named by its slot; refused at the slot when it is not a Flow token.
// FLOW_STATE_ALLOW_UNKNOWN: an authored token, recognised by identity.
const passOf = (name: string, token: unknown) => {
  const at = ["context", name];

  return Option.match(readerOf(token), {
    onNone: () =>
      Result.fail([
        invalid(
          at,
          "WrongKind",
          `context slot ${name} has no token to read and no reads`,
          "Read a token, Flow.context(X.M.field), or derive: Flow.context(Schema, { reads, select }).",
        ),
      ]),
    onSome: (reader) =>
      Result.succeed({
        provider: reader,
        reads: [{ name, reader }],
        select: (values: Values) => values[name],
      }),
  });
};

// A derived slot's reads by name, all of one provider, with its select; refused at each read that
// is not a Flow token or names a second provider, and at a missing select or reads.
// FLOW_STATE_ALLOW_UNKNOWN: an authored spec, read by its fields.
const derivedOf = (name: string, spec: unknown) => {
  const at = ["context", name];
  const parts = partsOf(spec);
  const select = parts.select;
  const reads = Predicate.isObject(parts.reads) ? Object.entries(parts.reads) : [];
  const findings: Array<Finding> = [];

  if (!Predicate.isFunction(select))
    findings.push(
      invalid(
        [...at, "select"],
        "WrongKind",
        `context slot ${name} has no select function`,
        "Give a derived slot select: (reads) => value.",
      ),
    );

  if (reads.length === 0)
    findings.push(
      invalid(
        [...at, "reads"],
        "WrongKind",
        `context slot ${name} reads nothing`,
        "Name the slot's reads: { reads: { lines: Cart.M.lines } }.",
      ),
    );

  const known = readsOf(at, reads, findings);
  const first = known[0];

  return first === undefined || findings.length > 0 || !Predicate.isFunction(select)
    ? Result.fail(findings)
    : Result.succeed({ provider: first.reader, reads: known, select: selectOf(select) });
};

// Each read of one provider by name, the first read's; a read that is not a Flow token, or names a
// second provider, adds its finding instead.
const readsOf = (
  at: ReadonlyArray<string>,
  // FLOW_STATE_ALLOW_UNKNOWN: authored tokens, recognised by identity.
  reads: ReadonlyArray<readonly [string, unknown]>,
  findings: Array<Finding>,
) => {
  const known: Array<{ readonly name: string; readonly reader: Reader }> = [];

  for (const [key, token] of reads) {
    const reader = readerOf(token);
    const first = known[0];

    if (Option.isNone(reader)) findings.push(notAToken([...at, "reads", key]));
    else if (first !== undefined && reader.value.owner !== first.reader.owner)
      findings.push(secondProvider([...at, "reads", key], reader.value, first.reader));
    else known.push({ name: key, reader: reader.value });
  }

  return known;
};

const notAToken = (at: ReadonlyArray<string>) =>
  invalid(
    at,
    "WrongKind",
    `${at.join(".")} is not a Flow token`,
    "Read a provider's X.M.field, X.S.STATE or X.state.",
  );

const secondProvider = (at: ReadonlyArray<string>, read: Reader, first: Reader) =>
  invalid(
    at,
    "TwoProviders",
    `${at.join(".")} comes from ${read.provider}, not ${first.provider}`,
    "A slot binds one provider: give the other provider's values a slot of their own.",
  );

// FLOW_STATE_ALLOW_UNKNOWN: a select's result, checked by the slot's Schema when selected.
type Select = (values: Values) => unknown;

// FLOW_STATE_ALLOW_UNKNOWN: a function an author passed as select, checked callable by its caller.
const selectOf = (given: unknown) =>
  // SAFETY: the select an author wrote for these reads, called with exactly their values.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a select's argument type is erased here and restored at its declaration
  given as Select;

/**
 * Flow's markers for definitions and schedules.
 *
 * **When to use**
 *
 * - `Flow.initial(schema, value)`: a memory field that starts at a constant.
 * - `Flow.input(schema)`: a memory field the creator supplies; read-only afterwards.
 * - `Flow.private(field)`: a field kept from outside snapshots.
 * - `Flow.uncertain(fields)`: an internal event an operation's unknown ending maps to.
 * - `Flow.entry`: in a schedule's `armOn`, arm it on its state's entry too.
 * - `Flow.context(X.M.field)`: a context slot that passes a provider's public memory field
 *   through; `Flow.context(X.S.STATE)` reads whether the provider is in a state, and
 *   `Flow.context(X.state)` its state's name. `Flow.context(Schema, { reads, select })` derives a
 *   value from several reads of one provider, recomputed only when one of them changed.
 *
 * **Gotchas**
 *
 * - Every read of one slot comes from one provider: a type error, and a construction error past
 *   the types. Values from two machines need two slots.
 * - `Flow.initial` takes a constant, never a function: a value other fields determine is derived
 *   where it is read, or taken as an input.
 */
export const Flow = {
  initial: builder(
    "Flow.initial",
    // RETURN_TYPE: the marker's Schema type parameter types the memory field.
    <S extends Plain>(schema: S, value: S["Type"]): Initial<S> => ({
      "~flow": "initial",
      schema,
      value,
    }),
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
