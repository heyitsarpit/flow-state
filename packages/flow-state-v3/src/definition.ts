import { Duration, Option, Predicate, Result, Schema } from "effect";
import {
  Action,
  type Compiled,
  type Denial,
  Guard,
  type GuardInput,
  type SelectInput,
  type Values,
} from "./core/compiled.ts";
import type { Row } from "./core/rows.ts";
import type { Bound, Ending, Fields, InputOf } from "./contract.ts";
import type { Entry, Initial, Uncertain } from "./flow.ts";

export type EventFields = Fields | Uncertain;

type FieldsOf<X> = X extends Uncertain<infer F> ? F : X extends Fields ? X : never;

/**
 * The payload an event declares: the decoded record of its fields.
 */
export type PayloadOf<X> = Schema.Struct<FieldsOf<X>>["Type"];

export type MemoryConfig = Readonly<Record<string, Initial>>;

/**
 * A definition's memory: each field's decoded value.
 */
export type MemoryOf<M extends MemoryConfig> = { readonly [K in keyof M]: M[K]["value"] };

/**
 * A public event as `send` takes it: its tag and its payload.
 */
export type Envelope<Name extends string = string, P = Values> = { readonly _tag: Name } & P;

/**
 * One event of a definition: a constructor of its envelope, and an ending mapping (`E.X`,
 * `E.X.from(f)`).
 */
export type EventToken<Name extends string, P> = ((payload: P) => Envelope<Name, P>) &
  Ending & {
    readonly tag: Name;
    readonly from: <V>(map: (value: V) => P) => Ending;
  };

type Tokens<Ev> = { readonly [K in keyof Ev & string]: EventToken<K, PayloadOf<Ev[K]>> };

/**
 * A state of a definition, as a target or a guard element.
 */
export type StateToken<Name extends string = string> = {
  readonly "~flow": "state";
  readonly node: Name;
};

/**
 * A lane member or lookup in an alternative's `actions`.
 */
export type ActionToken = { readonly "~flow": "action"; readonly make: (at: string) => Action };

/**
 * An operation's guard (`O.x.idle`, `O.x.retryable`) in an alternative's `guard`.
 */
export type GuardToken = { readonly "~flow": "guard"; readonly make: (at: string) => Guard };

type SelectArg<M> = { readonly memory: M; readonly event: never };

type GuardArg<M, P> = { readonly state: string; readonly memory: M; readonly event: P };

/**
 * The write lanes a snapshot shows: each operation's rows, keyed by the key's canonical text.
 */
export type Operations = ReadonlyMap<string, ReadonlyMap<string, Row>>;

/**
 * A write operation's members, guards and row read (WriteLanes R7 to R9, O.x.get).
 */
export type WriteHandle<M, I> = {
  readonly commit: (select: (input: SelectArg<M>) => I) => ActionToken;
  readonly retry: ActionToken & ((key: (input: SelectArg<M>) => Values) => ActionToken);
  readonly cancel: ActionToken & ((key: (input: SelectArg<M>) => Values) => ActionToken);
  readonly idle: (key: (input: GuardArg<M, never>) => Values) => GuardToken;
  readonly retryable: {
    (options: { readonly times: number }): GuardToken;
    (key: (input: GuardArg<M, never>) => Values, options: { readonly times: number }): GuardToken;
  };
  readonly get: (operations: Operations, key: Values) => Option.Option<Row>;
};

/**
 * A read operation's lookup and cancel.
 */
export type ReadHandle<M, I> = {
  readonly lookup: (select: (input: SelectArg<M>) => I) => ActionToken;
  readonly cancel: ActionToken;
};

type Handles<O, M> = {
  readonly [K in keyof O]: O[K] extends { readonly kind: "write" }
    ? WriteHandle<M, Values>
    : ReadHandle<M, Values>;
};

export type GuardElement<M, P> =
  | StateToken
  | GuardToken
  | ((input: GuardArg<M, P>) => true | Denial);

/**
 * One alternative of a handler (Machines O2): its target, guards, memory patch and actions.
 */
export type AlternativeConfig<M, P, S extends string> = {
  readonly target?: StateToken<S> | "self";
  readonly guard?: GuardElement<M, P> | ReadonlyArray<GuardElement<M, P>>;
  readonly updateMemory?: (input: {
    readonly memory: M;
    readonly event: P;
    readonly now: number;
  }) => Partial<M>;
  readonly actions?: ReadonlyArray<ActionToken>;
};

type OneAlternative<M, P, S extends string> = AlternativeConfig<M, P, S> | StateToken<S>;

export type Handler<M, P, S extends string> =
  | OneAlternative<M, P, S>
  | ReadonlyArray<OneAlternative<M, P, S>>;

export type On<M, Ev, S extends string> = {
  readonly [K in keyof Ev]?: Handler<M, PayloadOf<Ev[K]>, S>;
};

export type ScheduleConfig<M, Ev> = {
  readonly schedule: Duration.Input | ((input: { readonly memory: M }) => number);
  readonly send: EventToken<keyof Ev & string, Values> | Ending;
  readonly armOn?: ReadonlyArray<(keyof Ev & string) | Entry>;
};

export type StateConfig<M, Ev, S extends string> = {
  readonly on?: On<M, Ev, S>;
  readonly schedules?: Readonly<Record<string, ScheduleConfig<M, Ev>>>;
};

type DefinitionConfig<
  States extends ReadonlyArray<string>,
  Ev extends Readonly<Record<string, EventFields>>,
  In extends Readonly<Record<string, EventFields>>,
  M extends MemoryConfig,
  O extends Readonly<Record<string, Bound>>,
> = {
  readonly id: string;
  readonly persist?: boolean;
  readonly states: States;
  readonly events: Ev;
  readonly internalEvents?: In;
  readonly memory: M;
  readonly operations?: (tokens: { readonly E: Tokens<In> }) => O;
};

/**
 * A definition: a machine's structure, before its handlers (Machines O1).
 */
export type Definition<
  States extends ReadonlyArray<string> = ReadonlyArray<string>,
  Ev extends Readonly<Record<string, EventFields>> = Readonly<Record<string, EventFields>>,
  In extends Readonly<Record<string, EventFields>> = Readonly<Record<string, EventFields>>,
  M extends MemoryConfig = MemoryConfig,
  O extends Readonly<Record<string, Bound>> = Readonly<Record<string, Bound>>,
> = {
  readonly id: string;
  readonly persist: boolean;
  readonly states: States;
  readonly events: Ev;
  readonly internalEvents: In;
  readonly memory: M;
  readonly operations: O;
  readonly S: { readonly [K in States[number]]: StateToken<K> };
  readonly E: Tokens<Ev & In>;
  readonly O: Handles<O, MemoryOf<M>>;
};

export const erase = <I, R>(run: (input: never) => R) =>
  // SAFETY: a callback written for its handler's event and memory; the turn passes exactly those.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the definition's payload and memory types are erased in Compiled and restored by the turn
  run as (input: I) => R;

// RETURN_TYPE: a type guard over event fields.
const isUncertain = (x: EventFields): x is Uncertain => Predicate.hasProperty(x, "~flow");

export const fieldsOf = (x: EventFields) => (isUncertain(x) ? x.fields : x);

const eventToken = (tag: string) => {
  const ending = { event: tag, from: Option.none() };
  const make = (payload: Values) => ({ ...payload, _tag: tag });

  return Object.assign(make, {
    tag,
    ending,
    from: (map: (value: never) => Values) => ({ ending: { event: tag, from: Option.some(map) } }),
  });
};

const tokensOf = <Ev extends Readonly<Record<string, EventFields>>>(events: Ev) =>
  trusted<Tokens<Ev>>(Object.fromEntries(Object.keys(events).map((tag) => [tag, eventToken(tag)])));

// RETURN_TYPE: the ActionToken protocol every member returns.
const member = (make: (at: string) => Action): ActionToken => ({ "~flow": "action", make });

const keyed =
  (kind: "Retry" | "Cancel", operation: string) =>
  (key: Option.Option<(input: SelectArg<Values>) => Values>) =>
    member((at) =>
      Action[kind]({
        operation,
        key: Option.map(key, (run) => ({
          slot: `${at}.key`,
          run: erase<SelectInput, Values>(run),
        })),
      }),
    );

const keylessOrKeyed = (kind: "Retry" | "Cancel", operation: string) => {
  const of = keyed(kind, operation);

  return Object.assign(
    (key: (input: SelectArg<Values>) => Values) => of(Option.some(key)),
    of(Option.none()),
  );
};

const writeHandle = (operation: string, key: Schema.Codec<Values, string>) => ({
  commit: (select: (input: SelectArg<Values>) => Values) =>
    member((at) =>
      Action.Commit({ operation, select: { slot: `${at}.select`, run: erase(select) } }),
    ),
  retry: keylessOrKeyed("Retry", operation),
  cancel: keylessOrKeyed("Cancel", operation),
  // RETURN_TYPE: the GuardToken protocol every guard returns.
  idle: (select: (input: GuardArg<Values, never>) => Values): GuardToken => ({
    "~flow": "guard",
    make: (at) => Guard.Idle({ operation, key: { slot: `${at}.key`, run: erase(select) } }),
  }),
  // RETURN_TYPE: the GuardToken protocol every guard returns.
  retryable: (
    first: ((input: GuardArg<Values, never>) => Values) | { readonly times: number },
    second: { readonly times: number } = { times: 0 },
  ): GuardToken => ({
    "~flow": "guard",
    make: (at) =>
      Predicate.isFunction(first)
        ? Guard.Retryable({
            operation,
            key: Option.some({ slot: `${at}.key`, run: erase<GuardInput, Values>(first) }),
            times: second.times,
          })
        : Guard.Retryable({ operation, key: Option.none(), times: first.times }),
  }),
  get: (operations: Operations, value: Values) =>
    Option.flatMap(Option.fromUndefinedOr(operations.get(operation)), (rows) =>
      Option.flatMap(Result.getSuccess(Schema.encodeResult(key)(value)), (text) =>
        Option.fromUndefinedOr(rows.get(text)),
      ),
    ),
});

const readHandle = (operation: string) => ({
  lookup: (select: (input: SelectArg<Values>) => Values) =>
    member((at) =>
      Action.Lookup({ operation, select: { slot: `${at}.select`, run: erase(select) } }),
    ),
  cancel: keyed("Cancel", operation)(Option.none()),
});

/**
 * A Struct built over a runtime record of field Schemas, as the record codec Compiled holds.
 */
export const codecOf = <E, S = Schema.Top>(schema: S) =>
  // SAFETY: a Struct of a definition's own field Schemas decodes to a record of those fields, and every Flow field Schema needs no services.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Schema.Struct over a runtime record has no static field types
  schema as Schema.Codec<Values, E>;

/**
 * Declares a machine's structure: its states, events, memory and operations (Machines O1).
 *
 * **When to use**
 *
 * In a `*.definition.ts` file. `machine(definition, body)` then writes its handlers.
 *
 * **Details**
 *
 * Inert: it starts no actor, work, timer or storage access. `operations` runs once, with the
 * internal events' tokens.
 */
// RETURN_TYPE: the exported Definition keeps every literal type for S, E and O.
export const definition = <
  const States extends ReadonlyArray<string>,
  const Ev extends Readonly<Record<string, EventFields>>,
  // RETURN_TYPE: the exported Definition keeps every literal type for S, E and O.
  const In extends Readonly<Record<string, EventFields>>,
  M extends MemoryConfig,
  O extends Readonly<Record<string, Bound>>,
>(
  config: DefinitionConfig<States, Ev, In, M, O>,
): Definition<States, Ev, In, M, O> => {
  const internal = config.internalEvents ?? trusted<In>({});
  const operations = config.operations?.({ E: tokensOf(internal) }) ?? trusted<O>({});

  const handles = Object.fromEntries(
    Object.entries(operations).map(([name, bound]) => [
      name,
      bound.kind === "write" ? writeHandle(name, bound.keyText) : readHandle(name),
    ]),
  );

  return {
    id: config.id,
    persist: config.persist ?? false,
    states: config.states,
    events: config.events,
    internalEvents: internal,
    memory: config.memory,
    operations,
    S: trusted(Object.fromEntries(config.states.map((node) => [node, { "~flow": "state", node }]))),
    E: tokensOf({ ...config.events, ...internal }),
    O: trusted(handles),
  };
};

const trusted = <A>(value: Values) =>
  // SAFETY: a record built from the definition's own keys, whose static type the caller names.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- records built by Object.fromEntries carry no static key types
  value as A;

/**
 * What every definition has, whatever its literal types: what `machine` and the Runtime read.
 */
export type AnyDefinition = {
  readonly id: string;
  readonly persist: boolean;
  readonly states: ReadonlyArray<string>;
  readonly events: Readonly<Record<string, EventFields>>;
  readonly internalEvents: Readonly<Record<string, EventFields>>;
  readonly memory: MemoryConfig;
  readonly operations: Readonly<Record<string, Bound>>;
  readonly S: Values;
  readonly E: Values;
  readonly O: Values;
};

/**
 * A compiled machine: its definition and its Compiled data (Runtime O1).
 */
export type Machine<D extends AnyDefinition = AnyDefinition> = {
  readonly definition: D;
  readonly compiled: Compiled;
};

/**
 * Re-exported for the type of `O.x.get`'s row and a shared select's input.
 */
export type { InputOf, Row };
