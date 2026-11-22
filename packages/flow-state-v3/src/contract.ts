import { type Context, type Duration, type Effect, Option, Result, Schema, Struct } from "effect";
import { type Walker, walkerOf } from "./core/boundary.ts";
import { writeJson } from "./core/codec.ts";
import type { NotSentWhy } from "./core/cells.ts";
import type { Attempt, Commit, Concurrency, Lookup, Values } from "./core/compiled.ts";
import type { OutcomeFailure, OutcomeUnknown } from "./flow.ts";
import { entry } from "./entry.ts";
import { type Branded, made } from "./made.ts";
import { jsonStructOf } from "./events.ts";

/**
 * The services a contract lists: the Context keys its function calls.
 */
// oxlint-disable-next-line lint-bomb/no-explicit-any -- a service key's identifier and shape vary by service; only its presence is read
export type Services = ReadonlyArray<Context.Key<any, any>>;

/**
 * The services a contract's list names: each key's identifier, so its function may require those
 * and no others.
 */
export type ServiceIds<S extends Services> = IdOf<S[number]>;

// oxlint-disable-next-line lint-bomb/no-explicit-any -- a service key's shape varies by service; only its identifier is read
type IdOf<K> = K extends Context.Key<infer I, any> ? I : never;

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
export type Ending<V = unknown, Id extends string = string> = Branded<"event" | "mapping"> & {
  readonly ending: { readonly event: string };
  // A phantom type: the value its mapper takes, so it maps only an ending of that value.
  // FLOW_STATE_ALLOW_UNKNOWN: a mapper's context is Flow's own and read by no mapper yet.
  readonly "~maps"?: (value: V, context: unknown) => Values;
  // A phantom type: the definition whose event it is, so it maps only onto that definition.
  readonly "~definition"?: Id;
};

/**
 * The ending Compiled and a bound contract hold: every `Ending<V>` assigns to it, since its value
 * type is erased there and restored at its mapper.
 */
export type ErasedEnding = Ending<never>;

/**
 * An unknown ending's target: an uncertain event with no fields, since an unknown ending carries no
 * value to fill them.
 */
// FLOW_STATE_ALLOW_UNKNOWN: an unknown ending has no value, so its target takes any.
export type UnknownEnding<Id extends string = string> = Ending<unknown, Id> & {
  readonly "~uncertain": true;
};

/**
 * The value one failure tag carries: the commit's error of that tag, `Outcome.failure` unwrapped.
 */
export type FailureOf<E, T extends string> = Extract<
  E extends OutcomeUnknown<infer _U> ? never : E extends OutcomeFailure<infer X> ? X : E,
  { readonly _tag: T }
>;

/**
 * A write's endings mapped onto the declarer's events, by origin: `success` takes the commit's
 * value, `failure` is exhaustive over the commit's own failure tags and nothing else, each taking
 * its error; `notSent`, optional, takes Flow's `NotSent` for a commit never sent; `unknown` takes
 * every unknown ending, onto an uncertain event with no fields.
 */
export type WriteEndings<E, A, Id extends string = string> = {
  readonly success: Ending<A, Id>;
  readonly failure: { readonly [T in FailureTag<E>]: Ending<FailureOf<E, T>, Id> };
  readonly notSent?: Ending<{ readonly why: NotSentWhy }, Id>;
  readonly unknown: UnknownEnding<Id>;
};

/**
 * A read's endings mapped onto the declarer's events: its value, each of its failure tags with its
 * error, and Flow's `Defect` and `Interrupted`.
 */
export type ReadEndings<E, A, Id extends string = string> = {
  readonly success: Ending<A, Id>;
  readonly failure: { readonly [T in FailureTag<E>]: Ending<FailureOf<E, T>, Id> } & {
    // FLOW_STATE_ALLOW_UNKNOWN: Flow's defect and interruption carry no value a mapper reads.
    readonly Defect?: Ending<unknown, Id>;
    // FLOW_STATE_ALLOW_UNKNOWN: as above.
    readonly Interrupted?: Ending<unknown, Id>;
  };
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
  Id extends string = string,
> = (K extends "write"
  ? BoundFields & {
      readonly kind: "write";
      readonly notSent: Option.Option<ErasedEnding>;
      readonly unknown: ErasedEnding;
    }
  : BoundFields & { readonly kind: "read" }) &
  Branded<"bound"> & {
    readonly "~requires"?: R;
    readonly "~input"?: I;
    readonly "~key"?: Ky;
    // A phantom type: the definition whose events its endings map onto.
    readonly "~definition"?: Id;
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

/**
 * What an ending's mapper reads beside the value: the call's input `I` and its picked key record
 * `K`, each typed from the contract, as `E.X.from((value, { input, key }) => ...)` receives them.
 *
 * **Details**
 *
 * For a bound contract `B`, `MapperContext<BoundInput<B>, BoundKey<B>>`.
 */
export type MapperContext<I, K> = { readonly input: I; readonly key: K };

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
  const endings: Array<readonly [ReadonlyArray<string>, ErasedEnding]> = [
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
 * What a bound contract keeps for the core: its call and its key's text from a value's key fields.
 */
export type BoundInternals = (
  | { readonly kind: "write"; readonly call: (...args: ReadonlyArray<never>) => ReturnType<Commit> }
  | { readonly kind: "read"; readonly call: (...args: ReadonlyArray<never>) => ReturnType<Lookup> }
) & { readonly textOfKey: (value: Values) => Option.Option<string> };

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
  readonly concurrency: Concurrency;
  readonly success: ErasedEnding;
  readonly failure: Readonly<Record<string, ErasedEnding>>;
};

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
  const keyJson = jsonStructOf(Struct.pick(fields, [...key].toSorted()));

  return {
    face: {
      input,
      inputJson: jsonStructOf(fields),
      keyText: Schema.fromJsonString(keyJson),
      keyJson,
    },
    textOfKey: keyTextBy(walkerOf(keyJson), key),
  };
};

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
  readonly outcomes: <Id extends string = string>(
    endings: WriteEndings<E, A, Id>,
  ) => Bound<"write", R, StructType<F>, KeyRecord<F, Key>, Id>;
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
  readonly outcomes: <Id extends string = string>(
    endings: ReadEndings<E, A, Id>,
  ) => Bound<"read", R, StructType<F>, KeyRecord<F, Key>, Id>;
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
  <
    const F extends Fields,
    const Key extends KeyFields<F>,
    A,
    E,
    const S extends Services,
    R extends ServiceIds<S>,
  >(config: {
    readonly id: string;
    readonly input: F;
    readonly key: Key;
    readonly concurrency: Concurrency;
    readonly services: S;
    readonly commit: (
      input: StructType<F>,
      context: { readonly attempt: Attempt<StructType<F>, KeyRecord<F, Key>> },
    ) => Effect.Effect<A, E, R>;
  }): Transaction<F, A, E, R, Key> => {
    const identity = Symbol(config.id);
    const codecs = codecsOf(config.input, config.key);

    const contract: Transaction<F, A, E, R, Key> = made(
      "contract",
      identity,
      {
        kind: "transaction",
        id: config.id,
        input: Schema.Struct(config.input),
        key: config.key,
        concurrency: config.concurrency,
        services: config.services,
        commit: entry(`${config.id}.commit`, config.commit),
        outcomes: entry(
          `${config.id}.outcomes`,
          // RETURN_TYPE: the bound contract carries its declarer's phantom types.
          <Id extends string>(
            endings: WriteEndings<E, A, Id>,
          ): Bound<"write", R, StructType<F>, KeyRecord<F, Key>, Id> =>
            made(
              "bound",
              identity,
              {
                kind: "write",
                contract: config.id,
                identity,
                ...codecs.face,
                key: config.key,
                concurrency: config.concurrency,
                success: endings.success,
                failure: endings.failure,
                notSent: Option.fromUndefinedOr(endings.notSent),
                unknown: endings.unknown,
              },
              {
                kind: "write",
                call: config.commit,
                textOfKey: codecs.textOfKey,
              } satisfies BoundInternals,
            ),
        ),
      },
      {},
    );

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
  <
    const F extends Fields,
    const Key extends KeyFields<F>,
    A,
    E,
    const S extends Services,
    R extends ServiceIds<S>,
  >(config: {
    readonly id: string;
    readonly input: F;
    readonly key: Key;
    readonly services: S;
    readonly staleTime: Duration.Input;
    readonly gcTime: Duration.Input;
    readonly lookup: (input: StructType<F>) => Effect.Effect<A, E, R>;
  }): Resource<F, A, E, R, Key> => {
    const identity = Symbol(config.id);
    const codecs = codecsOf(config.input, config.key);

    const contract: Resource<F, A, E, R, Key> = made(
      "contract",
      identity,
      {
        kind: "resource",
        id: config.id,
        input: Schema.Struct(config.input),
        key: config.key,
        services: config.services,
        staleTime: config.staleTime,
        gcTime: config.gcTime,
        lookup: entry(`${config.id}.lookup`, config.lookup),
        outcomes: entry(
          `${config.id}.outcomes`,
          // RETURN_TYPE: the bound contract carries its declarer's phantom types.
          <Id extends string>(
            endings: ReadEndings<E, A, Id>,
          ): Bound<"read", R, StructType<F>, KeyRecord<F, Key>, Id> =>
            made(
              "bound",
              identity,
              {
                kind: "read",
                contract: config.id,
                identity,
                ...codecs.face,
                key: config.key,
                concurrency: "reject",
                success: endings.success,
                failure: endings.failure,
              },
              {
                kind: "read",
                call: config.lookup,
                textOfKey: codecs.textOfKey,
              } satisfies BoundInternals,
            ),
        ),
      },
      {},
    );

    return contract;
  },
);
