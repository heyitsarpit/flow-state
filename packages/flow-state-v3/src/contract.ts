import { type Context, type Duration, type Effect, Option, Schema, Struct } from "effect";
import type { Attempt, Commit, Concurrency, Lookup, Values } from "./core/compiled.ts";
import type { OutcomeFailure, OutcomeUnknown } from "./flow.ts";

/**
 * The services a contract lists: the Context keys its function calls.
 */
// oxlint-disable-next-line lint-bomb/no-explicit-any -- a service key's identifier and shape vary by service; only its presence is read
export type Services = ReadonlyArray<Context.Key<any, any>>;

/**
 * A record of field Schemas that decode and encode with no services, as every Flow payload, input
 * and memory field does.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a field Schema may have any type; its type is read where the field is used, never erased.
export type Fields = Readonly<Record<string, Schema.Codec<unknown, unknown>>>;

/**
 * A transaction's input: the decoded record of its input fields.
 */
export type InputOf<F extends Fields> = Schema.Struct<F>["Type"];

/**
 * The failure tags a commit's error channel declares, unwrapping `Outcome.failure` and dropping
 * `Outcome.unknown`.
 */
export type FailureTag<E> =
  E extends OutcomeUnknown<infer _U>
    ? never
    : E extends OutcomeFailure<infer X>
      ? X extends { readonly _tag: infer T extends string }
        ? T
        : never
      : E extends { readonly _tag: infer T extends string }
        ? T
        : never;

/**
 * Where one ending goes: an event token (`E.Voided`) or one with a payload mapper
 * (`E.Declined.from(f)`).
 */
export type Ending = {
  readonly ending: {
    readonly event: string;
    // FLOW_STATE_ALLOW_UNKNOWN: the mapper's parameter is the ending's value, typed where it is written.
    readonly from: Option.Option<(value: never, context: unknown) => Values>;
  };
};

/**
 * A write's endings mapped onto the declarer's events, by origin: `failure` is exhaustive over
 * the commit's own failure tags and nothing else; `notSent`, optional, takes Flow's `NotSent` for a
 * commit never sent; `unknown` takes every unknown ending.
 */
export type WriteEndings<E> = {
  readonly success: Ending;
  readonly failure: { readonly [T in FailureTag<E>]: Ending };
  readonly notSent?: Ending;
  readonly unknown: Ending;
};

/**
 * A read's endings mapped onto the declarer's events: its failure tags and Flow's `Defect` and
 * `Interrupted`.
 */
export type ReadEndings = {
  readonly success: Ending;
  readonly failure: Readonly<Record<string, Ending>>;
};

/**
 * A contract bound to a definition's events: what `operations` declares under one name, in the
 * shape the compiler reads.
 */
export type Bound<K extends "write" | "read" = "write" | "read", R = unknown> = (K extends "write"
  ? BoundFields & {
      readonly kind: "write";
      readonly call: Commit;
      readonly notSent: Option.Option<Ending>;
      readonly unknown: Ending;
    }
  : BoundFields & { readonly kind: "read"; readonly call: Lookup }) & {
  readonly "~requires"?: R;
};

/**
 * The services an operations record's contracts require: the union of each bound contract's
 * Effect requirement.
 */
export type RequirementsOf<O> = Exclude<
  { readonly [K in keyof O]: O[K] extends { readonly "~requires"?: infer R } ? R : never }[keyof O],
  undefined
>;

/**
 * What every bound contract carries, whichever its kind.
 */
type BoundFields = {
  readonly contract: string;
  readonly input: Schema.Codec<Values, Values>;
  readonly inputJson: Schema.Codec<Values, Values>;
  readonly key: ReadonlyArray<string>;
  readonly keyText: Schema.Codec<Values, string>;
  readonly concurrency: Concurrency;
  readonly success: Ending;
  readonly failure: Readonly<Record<string, Ending>>;
};

/**
 * A Schema over a contract's own fields, as the record codec Compiled holds: built once, when the
 * contract is bound.
 */
const recordCodec = <T, S = Schema.Top>(schema: S) =>
  // SAFETY: a Struct of a contract's own field Schemas decodes to a record of those fields, and every Flow field Schema needs no services.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the contract's field types are erased in Compiled
  schema as Schema.Codec<Values, T>;

/**
 * The codecs a bound contract carries: its input, its input as JSON, and its key's canonical text
 * (its key fields in name order, as JSON).
 */
const codecsOf = <F extends Fields>(fields: F, key: ReadonlyArray<keyof F & string>) => {
  const input = Schema.Struct(fields);

  return {
    input: recordCodec<Values>(input),
    inputJson: recordCodec<Values>(Schema.toCodecJson(input)),
    keyText: recordCodec<string>(
      Schema.fromJsonString(
        Schema.toCodecJson(Schema.Struct(Struct.pick(fields, [...key].toSorted()))),
      ),
    ),
  };
};

/**
 * A call's input as the contract's own type: the runtime decodes every input with the contract's
 * input Schema before it calls.
 */
const trusted = <A>(input: Values) =>
  // SAFETY: the runtime passes only values its operation decoded with this contract's input Schema (core/lane.ts).
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the contract's input type is erased in Compiled and restored here, at the one call boundary
  input as A;

/**
 * A server write, declared once: inert until a machine commits it.
 */
export type Transaction<F extends Fields = Fields, A = never, E = never, R = never> = {
  readonly kind: "transaction";
  readonly id: string;
  readonly input: Schema.Struct<F>;
  readonly key: ReadonlyArray<keyof F & string>;
  readonly concurrency: Concurrency;
  readonly services: Services;
  readonly commit: (
    input: InputOf<F>,
    context: { readonly attempt: Attempt },
  ) => Effect.Effect<A, E, R>;
  readonly outcomes: (endings: WriteEndings<E>) => Bound<"write", R>;
};

/**
 * A server read, declared once: inert until a machine looks it up.
 */
export type Resource<F extends Fields = Fields, A = never, E = never, R = never> = {
  readonly kind: "resource";
  readonly id: string;
  readonly input: Schema.Struct<F>;
  readonly key: ReadonlyArray<keyof F & string>;
  readonly services: Services;
  readonly staleTime: Duration.Input;
  readonly gcTime: Duration.Input;
  readonly lookup: (input: InputOf<F>) => Effect.Effect<A, E, R>;
  readonly outcomes: (endings: ReadEndings) => Bound<"read", R>;
};

/**
 * Declares a transaction: a server write with its key, concurrency and commit.
 *
 * **When to use**
 *
 * In a `*.contracts.ts` file, once per server write; a definition maps its endings with
 * `operations`.
 *
 * **Details**
 *
 * The commit puts `attempt.id` on the wire as the idempotency key; every send of one Attempt
 * carries the same id and input.
 */
// RETURN_TYPE: the exported Transaction contract keeps F, A, E and R for outcomes, handles and the setup's services.
export const transaction = <const F extends Fields, A, E, R>(config: {
  readonly id: string;
  readonly input: F;
  readonly key: ReadonlyArray<keyof F & string>;
  readonly concurrency: Concurrency;
  readonly services: Services;
  readonly commit: (
    input: InputOf<F>,
    context: { readonly attempt: Attempt },
  ) => Effect.Effect<A, E, R>;
}): Transaction<F, A, E, R> => {
  const contract: Transaction<F, A, E, R> = {
    kind: "transaction",
    ...config,
    input: Schema.Struct(config.input),
    outcomes: (endings) => ({
      kind: "write",
      contract: config.id,
      ...codecsOf(config.input, config.key),
      key: config.key,
      concurrency: config.concurrency,
      call: (input, context) => config.commit(trusted<InputOf<F>>(input), context),
      success: endings.success,
      failure: endings.failure,
      notSent: Option.fromUndefinedOr(endings.notSent),
      unknown: endings.unknown,
    }),
  };

  return contract;
};

/**
 * Declares a resource: a server read with its key and lookup.
 *
 * **When to use**
 *
 * In a `*.contracts.ts` file, once per server read; a definition maps its endings with
 * `operations`.
 */
// RETURN_TYPE: the exported Resource contract keeps F, A, E and R for outcomes, handles and the setup's services.
export const resource = <const F extends Fields, A, E, R>(config: {
  readonly id: string;
  readonly input: F;
  readonly key: ReadonlyArray<keyof F & string>;
  readonly services: Services;
  readonly staleTime: Duration.Input;
  readonly gcTime: Duration.Input;
  readonly lookup: (input: InputOf<F>) => Effect.Effect<A, E, R>;
}): Resource<F, A, E, R> => {
  const contract: Resource<F, A, E, R> = {
    kind: "resource",
    ...config,
    input: Schema.Struct(config.input),
    outcomes: (endings) => ({
      kind: "read",
      contract: config.id,
      ...codecsOf(config.input, config.key),
      key: config.key,
      concurrency: "reject",
      call: (input) => config.lookup(trusted<InputOf<F>>(input)),
      success: endings.success,
      failure: endings.failure,
    }),
  };

  return contract;
};
