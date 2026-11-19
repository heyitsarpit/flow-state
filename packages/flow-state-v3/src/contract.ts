import { type Context, type Duration, type Effect, Option, Result, Schema, Struct } from "effect";
import { type Walker, walkerOf } from "./core/boundary.ts";
import { writeJson } from "./core/codec.ts";
import type { Attempt, Commit, Concurrency, Lookup, Values } from "./core/compiled.ts";
import type { OutcomeFailure, OutcomeUnknown } from "./flow.ts";
import { entry, inert } from "./entry.ts";

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
export type StructType<F extends Fields> = Schema.Struct<F>["Type"];

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
export type Bound<
  K extends "write" | "read" = "write" | "read",
  R = unknown,
  I = Values,
  Ky = Values,
> = (K extends "write"
  ? BoundFields & {
      readonly kind: "write";
      readonly call: Commit;
      readonly notSent: Option.Option<Ending>;
      readonly unknown: Ending;
    }
  : BoundFields & { readonly kind: "read"; readonly call: Lookup }) & {
  readonly "~requires"?: R;
  readonly "~input"?: I;
  readonly "~key"?: Ky;
};

/**
 * The decoded input a bound contract takes, as its handles' selects return it.
 */
export type BoundInput<B> = B extends { readonly "~input"?: infer I }
  ? Exclude<I, undefined>
  : never;

/**
 * The key fields of a bound contract's input, as its handles' key callbacks return them.
 */
export type BoundKey<B> = B extends { readonly "~key"?: infer Ky } ? Exclude<Ky, undefined> : never;

type RequiredKeyOf<T> = {
  readonly [P in keyof T]-?: Record<never, never> extends Pick<T, P> ? never : P;
}[keyof T];

/**
 * The fields a contract's key may name: its input's required fields.
 */
export type KeyFields<F extends Fields> = ReadonlyArray<RequiredKeyOf<StructType<F>> & string>;

/**
 * A key as a record: the input's key fields and their values.
 */
export type KeyRecord<F extends Fields, Key extends ReadonlyArray<string>> = Pick<
  StructType<F>,
  Key[number] & keyof StructType<F>
>;

/**
 * Every ending a bound contract maps, each with its place in the contract's endings: `success`,
 * each `failure` tag, and a write's `notSent` and `unknown`.
 */
export const endingsOf = (bound: Bound) => {
  const endings: Array<readonly [ReadonlyArray<string>, Ending]> = [
    [["success"], bound.success],
    ...Object.entries(bound.failure).map(([tag, e]) => [["failure", tag], e] as const),
  ];

  if (bound.kind === "write")
    endings.push(...Option.toArray(Option.map(bound.notSent, (e) => [["notSent"], e] as const)), [
      ["unknown"],
      bound.unknown,
    ]);

  return endings;
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
  readonly identity: symbol;
  readonly input: Schema.Codec<Values, Values>;
  readonly inputJson: Schema.Codec<Values, Values>;
  readonly key: ReadonlyArray<string>;
  readonly keyText: Schema.Codec<Values, string>;
  readonly keyJson: Schema.Codec<Values, Values>;
  readonly textOfKey: (value: Values) => Option.Option<string>;
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

// A key's text from a value's key fields, by its key's walker: its key fields in name order as
// JSON text, the bytes `JSON.stringify` writes, with no call stack; none when they have no encoded
// form.
const keyTextBy =
  // FLOW_STATE_ALLOW_UNKNOWN: a key's walker, typed by its key fields.
  (key: Walker<unknown, unknown>, fields: ReadonlyArray<string>) => (value: Values) =>
    Result.getSuccess(Result.flatMap(key.encode(Struct.pick(value, fields)), writeJson));

/**
 * The codecs a bound contract carries: its input, its input as JSON, and its key's text (its key
 * fields in name order, as JSON), with the JSON form that text is written from.
 */
const codecsOf = <F extends Fields>(fields: F, key: ReadonlyArray<keyof F & string>) => {
  const input = Schema.Struct(fields);
  const keyJson = Schema.toCodecJson(Schema.Struct(Struct.pick(fields, [...key].toSorted())));

  return {
    input: recordCodec<Values>(input),
    inputJson: recordCodec<Values>(Schema.toCodecJson(input)),
    keyText: recordCodec<string>(Schema.fromJsonString(keyJson)),
    keyJson: recordCodec<Values>(keyJson),
    textOfKey: keyTextBy(walkerOf(keyJson), key),
  };
};

/**
 * A call's input as the contract's own type: the runtime decodes every input with the contract's
 * input Schema before it calls.
 */
const trusted = <A>(input: Values) =>
  // SAFETY: the runtime passes only inputs its operation's input walker checked at the commit (core/lanes.ts) or decoded from a lane record (core/record.ts).
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the contract's input type is erased in Compiled and restored here, at the one call boundary
  input as A;

/**
 * A commit's Attempt as the contract's own types: its input and key are the call's input, which
 * the runtime checked, and that input's key fields.
 */
const trustedAttempt = <I, K>(context: { readonly attempt: Attempt }) =>
  // SAFETY: the host builds the Attempt's input and key from the call's input, checked as above, and the operation's key fields.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the Attempt's input and key types are erased in Compiled and restored here, at the one call boundary
  context as { readonly attempt: Attempt<I, K> };

/**
 * A server write, declared once: inert until a machine commits it.
 */
export type Transaction<
  F extends Fields = Fields,
  A = never,
  E = never,
  R = never,
  Key extends ReadonlyArray<string> = ReadonlyArray<keyof F & string>,
> = {
  readonly kind: "transaction";
  readonly id: string;
  readonly input: Schema.Struct<F>;
  readonly key: Key;
  readonly concurrency: Concurrency;
  readonly services: Services;
  readonly commit: (
    input: StructType<F>,
    context: { readonly attempt: Attempt<StructType<F>, KeyRecord<F, Key>> },
  ) => Effect.Effect<A, E, R>;
  readonly outcomes: (
    endings: WriteEndings<E>,
  ) => Bound<"write", R, StructType<F>, KeyRecord<F, Key>>;
};

/**
 * A server read, declared once: inert until a machine looks it up.
 */
export type Resource<
  F extends Fields = Fields,
  A = never,
  E = never,
  R = never,
  Key extends ReadonlyArray<string> = ReadonlyArray<keyof F & string>,
> = {
  readonly kind: "resource";
  readonly id: string;
  readonly input: Schema.Struct<F>;
  readonly key: Key;
  readonly services: Services;
  readonly staleTime: Duration.Input;
  readonly gcTime: Duration.Input;
  readonly lookup: (input: StructType<F>) => Effect.Effect<A, E, R>;
  readonly outcomes: (endings: ReadEndings) => Bound<"read", R, StructType<F>, KeyRecord<F, Key>>;
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
export const transaction = entry(
  "transaction",
  // RETURN_TYPE: the exported Transaction contract keeps F, A, E and R for outcomes, handles and the setup's services.
  <const F extends Fields, const Key extends KeyFields<F>, A, E, R>(config: {
    readonly id: string;
    readonly input: F;
    readonly key: Key;
    readonly concurrency: Concurrency;
    readonly services: Services;
    readonly commit: (
      input: StructType<F>,
      context: { readonly attempt: Attempt<StructType<F>, KeyRecord<F, Key>> },
    ) => Effect.Effect<A, E, R>;
  }): Transaction<F, A, E, R, Key> => {
    const identity = Symbol(config.id);

    const contract: Transaction<F, A, E, R, Key> = {
      kind: "transaction",
      id: config.id,
      input: Schema.Struct(config.input),
      key: config.key,
      concurrency: config.concurrency,
      services: config.services,
      commit: entry(`${config.id}.commit`, config.commit),
      outcomes: entry(`${config.id}.outcomes`, (endings: WriteEndings<E>) =>
        inert<Bound<"write", R, StructType<F>, KeyRecord<F, Key>>>({
          kind: "write",
          contract: config.id,
          identity,
          ...codecsOf(config.input, config.key),
          key: config.key,
          concurrency: config.concurrency,
          call: (input, context) =>
            config.commit(
              trusted<StructType<F>>(input),
              trustedAttempt<StructType<F>, KeyRecord<F, Key>>(context),
            ),
          success: endings.success,
          failure: endings.failure,
          notSent: Option.fromUndefinedOr(endings.notSent),
          unknown: endings.unknown,
        }),
      ),
    };

    return contract;
  },
);

/**
 * Declares a resource: a server read with its key and lookup.
 *
 * **When to use**
 *
 * In a `*.contracts.ts` file, once per server read; a definition maps its endings with
 * `operations`.
 */
export const resource = entry(
  "resource",
  // RETURN_TYPE: the exported Resource contract keeps F, A, E and R for outcomes, handles and the setup's services.
  <const F extends Fields, const Key extends KeyFields<F>, A, E, R>(config: {
    readonly id: string;
    readonly input: F;
    readonly key: Key;
    readonly services: Services;
    readonly staleTime: Duration.Input;
    readonly gcTime: Duration.Input;
    readonly lookup: (input: StructType<F>) => Effect.Effect<A, E, R>;
  }): Resource<F, A, E, R, Key> => {
    const identity = Symbol(config.id);

    const contract: Resource<F, A, E, R, Key> = {
      kind: "resource",
      id: config.id,
      input: Schema.Struct(config.input),
      key: config.key,
      services: config.services,
      staleTime: config.staleTime,
      gcTime: config.gcTime,
      lookup: entry(`${config.id}.lookup`, config.lookup),
      outcomes: entry(`${config.id}.outcomes`, (endings: ReadEndings) =>
        inert<Bound<"read", R, StructType<F>, KeyRecord<F, Key>>>({
          kind: "read",
          contract: config.id,
          identity,
          ...codecsOf(config.input, config.key),
          key: config.key,
          concurrency: "reject",
          call: (input) => config.lookup(trusted<StructType<F>>(input)),
          success: endings.success,
          failure: endings.failure,
        }),
      ),
    };

    return contract;
  },
);
