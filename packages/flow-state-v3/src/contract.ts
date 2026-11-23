import { type Context, Duration, type Effect, Option, Result, Schema, Struct } from "effect";
import { type Walker, walkerOf } from "./core/boundary.ts";
import { writeJson } from "./core/codec.ts";
import type { NotSentWhy } from "./core/cells.ts";
import type { Attempt, Commit, Concurrency, Lookup, ReadWrite, Values } from "./core/compiled.ts";
import type { OutcomeFailure, OutcomeUnknown } from "./flow.ts";
import { entry } from "./entry.ts";
import { slot } from "./handles.ts";
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
export type Ending<V = unknown, Id extends string = string, C = unknown> = Branded<
  "event" | "mapping"
> & {
  readonly ending: { readonly event: string };
  // A phantom type: the value and context its mapper takes, so it maps only an ending of them.
  readonly "~maps"?: (value: V, context: C) => Values;
  // A phantom type: the definition whose event it is, so it maps only onto that definition.
  readonly "~definition"?: Id;
};

/**
 * The ending Compiled and a bound contract hold: every `Ending<V>` assigns to it, since its value
 * type is erased there and restored at its mapper.
 */
export type ErasedEnding = Ending<never, string, never>;

/**
 * An unknown ending's target: an uncertain event with no fields, since an unknown ending carries no
 * value to fill them.
 */
// FLOW_STATE_ALLOW_UNKNOWN: an unknown ending has no value, so its target takes any.
export type UnknownEnding<Id extends string = string, C = unknown> = Ending<unknown, Id, C> & {
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
 * every unknown ending, onto an uncertain event with no fields. Every mapper also takes `C`, the
 * call's {@link MapperContext}.
 */
export type WriteEndings<E, A, Id extends string = string, C = unknown> = {
  readonly success: Ending<A, Id, C>;
  readonly failure: { readonly [T in FailureTag<E>]: Ending<FailureOf<E, T>, Id, C> };
  readonly notSent?: Ending<{ readonly why: NotSentWhy }, Id, C>;
  readonly unknown: UnknownEnding<Id, C>;
};

/**
 * A read's endings mapped onto the declarer's events: its data, by the read's one verb, each of its
 * failure tags with its error, and Flow's `Defect` and `Interrupted`. Every mapper also takes `C`,
 * the call's {@link MapperContext}.
 *
 * **Details**
 *
 * `success` maps a lookup's answer, so the read is asked with `O.x.lookup`; `value` maps the data a
 * placement shows, so the read is placed with `O.x.subscribe`, and its mapper's context also says
 * whether the value is the placement's `placeholder`. A read declares one of the two.
 */
export type ReadEndings<E, A, Id extends string = string, C = unknown> = (
  | LookupEndings<A, Id, C>
  | PlacedEndings<A, Id, C>
) &
  ReadFailures<E, Id, C>;

/**
 * A looked-up read's data mapping: `success`, the lookup's answer.
 */
export type LookupEndings<A, Id extends string = string, C = unknown> = {
  readonly success: Ending<A, Id, C>;
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the other verb's key, never written beside this one
  readonly value?: never;
};

/**
 * A placed read's data mapping: `value`, each change of the data its placement shows.
 */
export type PlacedEndings<A, Id extends string = string, C = unknown> = {
  readonly value: Ending<A, Id, C & PlacedContext>;
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the other verb's key, never written beside this one
  readonly success?: never;
};

/**
 * What a `value` mapper reads beside the call's input and key: whether the value is the
 * placement's `placeholder` for a key that has no data yet.
 */
export type PlacedContext = { readonly placeholder: boolean };

/**
 * A read's failure mappings: each of its own failure tags, and Flow's `Defect` and `Interrupted`.
 */
export type ReadFailures<E, Id extends string = string, C = unknown> = {
  readonly failure: { readonly [T in FailureTag<E>]: Ending<FailureOf<E, T>, Id, C> } & {
    // FLOW_STATE_ALLOW_UNKNOWN: Flow's defect and interruption carry no value a mapper reads.
    readonly Defect?: Ending<unknown, Id, C>;
    // FLOW_STATE_ALLOW_UNKNOWN: as above.
    readonly Interrupted?: Ending<unknown, Id, C>;
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
  : BoundFields & { readonly kind: "read"; readonly verb: Verb }) &
  Branded<"bound"> & {
    readonly "~requires"?: R;
    readonly "~input"?: I;
    readonly "~key"?: Ky;
    // A phantom type: the definition whose events its endings map onto.
    readonly "~definition"?: Id;
  };

/**
 * How a read is used: asked with `O.x.lookup`, or placed with `O.x.subscribe`.
 */
export type Verb = "lookup" | "subscribe";

/**
 * A read bound with `success`: asked by its states' lookups.
 */
export type LookedUp = {
  // A phantom type: the verb its handle offers.
  readonly "~verb"?: "lookup";
};

/**
 * A read bound with `value`: placed by its states, with data of type `A`.
 */
export type Placed<A> = {
  // A phantom type: the verb its handle offers.
  readonly "~verb"?: "subscribe";
  // A phantom type: the data a placement's `placeholder` gives.
  readonly "~value"?: A;
};

// A read's data mapping by its verb, as the bound read holds it.
const dataOf = (
  endings:
    | { readonly success: ErasedEnding; readonly value?: undefined }
    | { readonly value: ErasedEnding; readonly success?: undefined },
) =>
  endings.value === undefined
    ? { verb: "lookup" as const, success: endings.success }
    : { verb: "subscribe" as const, success: endings.value };

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
 * The key a bound contract's data mapping is written under: a placed read's `value`, else
 * `success`.
 */
export const dataKeyOf = (bound: Bound) =>
  bound.kind === "read" && bound.verb === "subscribe" ? "value" : "success";

/**
 * Every ending a bound contract maps, each with its place in the contract's endings: `success`,
 * each `failure` tag, and a write's `notSent` and `unknown`.
 */
export const endingsOf = (bound: Bound) => {
  const endings: Array<readonly [ReadonlyArray<string>, ErasedEnding]> = [
    [[dataKeyOf(bound)], bound.success],
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
 * What a bound contract keeps for the core: its call, its key's text from a value's key fields,
 * and the services its call needs, which the boot checks the Runtime provides.
 */
export type BoundInternals = (
  | {
      readonly kind: "write";
      readonly call: (...args: ReadonlyArray<never>) => ReturnType<Commit>;
      readonly idempotency: "attempt" | ReadonlyArray<string>;
      readonly writes: Option.Option<(...args: ReadonlyArray<never>) => ReadonlyArray<ReadWrite>>;
    }
  | {
      readonly kind: "read";
      readonly call: (...args: ReadonlyArray<never>) => ReturnType<Lookup>;
      readonly staleTime: number;
      readonly gcTime: number;
    }
) & {
  readonly textOfKey: (value: Values) => Option.Option<string>;
  readonly services: Services;
};

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
 * A key record with no field beyond `T`'s: each extra field must be `never`.
 */
export type Exactly<K, T> = { readonly [P in Exclude<keyof K, keyof T>]: never };

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
  P = never,
> = {
  readonly kind: "transaction";
  readonly id: string;
  readonly input: Schema.Struct<F>;
  readonly key: Key;
  readonly concurrency: Concurrency;
  readonly services: Services;
  readonly idempotency: Idempotency<F>;
  readonly commit: (
    input: StructType<F>,
    context: CommitContextOf<F, Key, P>,
  ) => Effect.Effect<A, E, R>;
  readonly outcomes: {
    <Id extends string = string>(
      endings: WriteEndings<E, A, Id, MapperContext<StructType<F>, KeyRecord<F, Key>>>,
    ): Bound<"write", R, StructType<F>, KeyRecord<F, Key>, Id>;
    <Id extends string = string>(
      endings: WriteEndings<E, A, Id, MapperContext<StructType<F>, KeyRecord<F, Key>>>,
      options: WriteOptions<A, StructType<F>>,
    ): Bound<"write", R, StructType<F>, KeyRecord<F, Key>, Id>;
  };
};

/**
 * A write operation's options: `writes`, the read changes its success makes, from its answer and
 * input, each named by `resource.set(key, value)` or `resource.update(key, update)`.
 */
export type WriteOptions<A, I> = {
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: an operation without writes changes no read on success
  readonly writes?: (success: { readonly value: A; readonly input: I }) => ReadonlyArray<ReadWrite>;
};

/**
 * A write's progress Schema: what its commit reports with `progress(p)`, of type `P`.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a progress Schema's encoded side is never read; its type P is.
export type ProgressSchema<P> = Schema.Codec<P, unknown>;

/**
 * What the server keys a write by: the Attempt's id, or the input fields that name it.
 */
export type Idempotency<F extends Fields> = "attempt" | ReadonlyArray<keyof F & string>;

/**
 * What a commit receives beside its input: its Attempt, and `progress(p)` to report how far it got
 * in the type its contract's `progress` Schema declares (`never`, so not callable, without one).
 */
export type CommitContextOf<F extends Fields, Key extends ReadonlyArray<string>, P> = {
  readonly attempt: Attempt<StructType<F>, KeyRecord<F, Key>>;
  readonly progress: (value: P) => void;
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
  readonly outcomes: <
    Id extends string = string,
    const X extends ReadEndings<E, A, Id, MapperContext<StructType<F>, KeyRecord<F, Key>>> =
      ReadEndings<E, A, Id, MapperContext<StructType<F>, KeyRecord<F, Key>>>,
  >(
    endings: X,
  ) => Bound<"read", R, StructType<F>, KeyRecord<F, Key>, Id> &
    (X extends { readonly value: unknown } ? Placed<A> : LookedUp);
  /**
   * A change of this read's entry at a key that replaces its data, for a commit's `optimistic` or
   * an operation's `writes`, as `Ref.set` replaces a Ref's value.
   *
   * **Gotchas**
   *
   * - The key holds exactly the read's key fields.
   */
  readonly set: <const K extends KeyRecord<F, Key>>(
    key: K & Exactly<K, KeyRecord<F, Key>>,
    value: A,
  ) => ReadWrite;
  /**
   * A change of this read's entry at a key that derives its data from the current data, as
   * `Ref.update` does: the update returns the new data and never changes the current.
   *
   * **Gotchas**
   *
   * - The key holds exactly the read's key fields.
   * - An update never declines: it returns the new data whatever the current is.
   */
  readonly update: <const K extends KeyRecord<F, Key>>(
    key: K & Exactly<K, KeyRecord<F, Key>>,
    update: (current: Readonly<A>) => A,
  ) => ReadWrite;
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
    P = never,
  >(config: {
    readonly id: string;
    readonly input: F;
    readonly key: Key;
    readonly concurrency: Concurrency;
    readonly services: S;
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: an omitted option takes its default, the Attempt's id
    readonly idempotency?: Idempotency<F>;
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: a write without progress reports none
    readonly progress?: ProgressSchema<P>;
    readonly commit: (
      input: StructType<F>,
      context: CommitContextOf<F, Key, P>,
    ) => Effect.Effect<A, E, R>;
  }): Transaction<F, A, E, R, Key, P> => {
    const identity = Symbol(config.id);
    const codecs = codecsOf(config.input, config.key);

    const contract: Transaction<F, A, E, R, Key, P> = made(
      "contract",
      identity,
      {
        kind: "transaction",
        id: config.id,
        input: Schema.Struct(config.input),
        key: config.key,
        concurrency: config.concurrency,
        services: config.services,
        idempotency: config.idempotency ?? "attempt",
        commit: entry(`${config.id}.commit`, config.commit),
        outcomes: entry(
          `${config.id}.outcomes`,
          // RETURN_TYPE: the bound contract carries its declarer's phantom types.
          <Id extends string>(
            endings: WriteEndings<E, A, Id, MapperContext<StructType<F>, KeyRecord<F, Key>>>,
            options: WriteOptions<A, StructType<F>> = {},
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
                idempotency: config.idempotency ?? "attempt",
                writes: Option.fromUndefinedOr(options.writes),
                textOfKey: codecs.textOfKey,
                services: config.services,
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
        set: entry(`${config.id}.set`, (key: KeyRecord<F, Key>, value: A) => ({
          contract: config.id,
          keyText: codecs.textOfKey(key),
          update: () => value,
          replaces: true,
        })),
        update: entry(
          `${config.id}.update`,
          (key: KeyRecord<F, Key>, update: (current: Readonly<A>) => A) => ({
            contract: config.id,
            keyText: codecs.textOfKey(key),
            update: slot<ReadWrite["update"]>(`${config.id}.update`, update).run,
            replaces: false,
          }),
        ),
        outcomes: entry(
          `${config.id}.outcomes`,
          // RETURN_TYPE: the bound contract carries its declarer's phantom types.
          <Id extends string>(
            endings: ReadEndings<E, A, Id, MapperContext<StructType<F>, KeyRecord<F, Key>>>,
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
                ...dataOf(endings),
                failure: endings.failure,
              },
              {
                kind: "read",
                call: config.lookup,
                staleTime: Duration.toMillis(config.staleTime),
                gcTime: Duration.toMillis(config.gcTime),
                textOfKey: codecs.textOfKey,
                services: config.services,
              } satisfies BoundInternals,
            ),
        ),
      },
      {},
    );

    return contract;
  },
);
