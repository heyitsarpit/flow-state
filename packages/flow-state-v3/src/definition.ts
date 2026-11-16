import { type Duration, Option, Predicate, Schema } from "effect";
import type { Action, Compiled, Denial, Guard, Values } from "./core/compiled.ts";
import type { Row } from "./core/rows.ts";
import { atOrBelow, chainOf } from "./core/tree.ts";
import type { Bound, Ending, Fields } from "./contract.ts";
import { flowError } from "./error.ts";
import { readHandle, writeHandle } from "./handles.ts";
import {
  definitionFindings,
  isMarker,
  missingFindings,
  isUncertain,
  type TreeNode,
  treeOf,
} from "./construction.ts";
import type { Entry, Field, Input, Plain, Private, Uncertain } from "./flow.ts";

export type EventFields = Fields | Uncertain;

type FieldsOf<X> = X extends Uncertain<infer F> ? F : X extends Fields ? X : never;

/**
 * The payload an event declares: the decoded record of its fields.
 */
export type PayloadOf<X> = Schema.Struct<FieldsOf<X>>["Type"];

/**
 * A definition's memory fields, each with its one source.
 */
export type MemoryConfig = Readonly<Record<string, Field>>;

type Unwrapped<F> = F extends Private<infer G> ? G : F;

type TypeOf<F> =
  Unwrapped<F> extends { readonly "~flow": string; readonly schema: infer S extends Plain }
    ? S["Type"]
    : Unwrapped<F> extends Plain
      ? Unwrapped<F>["Type"]
      : never;

type OptionalKeys<M> = {
  readonly [K in keyof M]: Unwrapped<M[K]> extends { readonly "~flow": string } ? never : K;
}[keyof M];

type InputKeys<M> = { readonly [K in keyof M]: M[K] extends Input ? K : never }[keyof M];

type Flat<T> = { readonly [K in keyof T]: T[K] };

/**
 * A definition's memory: each field's decoded value; an optional key may be absent.
 */
export type MemoryOf<M> = Flat<
  { readonly [K in Exclude<keyof M, OptionalKeys<M>>]: TypeOf<M[K]> } & {
    readonly [K in OptionalKeys<M>]?: TypeOf<M[K]>;
  }
>;

type PrivateKeys<M> = { readonly [K in keyof M]: M[K] extends Private ? K : never }[keyof M];

/**
 * The memory an outside snapshot shows: every field but the `Flow.private` ones.
 */
export type OutsideOf<M> = Omit<MemoryOf<M>, PrivateKeys<M>>;

/**
 * The memory a handler may write: every field but the input fields, which name the actor.
 */
export type WritableOf<M> = Omit<MemoryOf<M>, InputKeys<M>>;

/**
 * What a creator supplies: the definition's `Flow.input` fields.
 */
export type InputOf<M> = Flat<{ readonly [K in InputKeys<M>]: TypeOf<M[K]> }>;

/**
 * A public event as `send` takes it: its tag and its payload.
 */
export type Envelope<Name extends string = string, P = Values> = { readonly _tag: Name } & P;

/**
 * One event of a definition: a constructor of its envelope that checks the payload, and an ending
 * mapping (`E.X`, `E.X.from(f)`).
 */
export type EventToken<Name extends string, P> = ((
  // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- the Plan's public word: a payload-free constructor takes no argument
  ...payload: Record<never, never> extends P ? [payload?: P] : [payload: P]
) => Envelope<Name, P>) &
  Ending & {
    readonly tag: Name;
    readonly from: <V>(map: (value: V) => P) => Ending;
  };

type Tokens<Ev> = { readonly [K in keyof Ev & string]: EventToken<K, PayloadOf<Ev[K]>> };

/**
 * A state tree: leaf names, and single-key compounds holding their children's list.
 */
export type StateTree = ReadonlyArray<string | { readonly [name: string]: StateTree }>;

type NameOf<X> = X extends string ? X : keyof X & string;

type ChildOf<X, N extends string> = X extends { readonly [K in N]: infer C } ? C : never;

/**
 * The names of a list's direct children.
 */
export type NamesOf<L> = L extends ReadonlyArray<infer X> ? NameOf<X> : never;

/**
 * The child list of a compound named `N` in list `L`; `never` for a leaf.
 */
export type ChildrenOf<L, N extends string> =
  L extends ReadonlyArray<infer X> ? ChildOf<X, N> : never;

/**
 * The names of a list's compounds.
 */
export type CompoundNamesOf<L> = {
  readonly [N in NamesOf<L>]: [ChildrenOf<L, N>] extends [never] ? never : N;
}[NamesOf<L>];

/**
 * Every state path of a tree, compounds included (`ON`, `ON.PLAYING`).
 */
export type PathsOf<L, P extends string = ""> =
  string extends NamesOf<L> ? string : PathsOfLiteral<L, P>;

type PathsOfLiteral<L, P extends string> = {
  readonly [N in NamesOf<L>]: `${P}${N}` | PathsOfLiteral<ChildrenOf<L, N>, `${P}${N}.`>;
}[NamesOf<L>];

/**
 * Every leaf path of a tree.
 */
export type LeavesOf<L, P extends string = ""> =
  string extends NamesOf<L> ? string : LeavesOfLiteral<L, P>;

type LeavesOfLiteral<L, P extends string> = {
  readonly [N in NamesOf<L>]: [ChildrenOf<L, N>] extends [never]
    ? `${P}${N}`
    : LeavesOfLiteral<ChildrenOf<L, N>, `${P}${N}.`>;
}[NamesOf<L>];

/**
 * What a state read takes: a snapshot or a leaf path.
 */
export type StateRead = string | { readonly state: string };

/**
 * A state of a definition, as a target or a guard element.
 *
 * **Details**
 *
 * `is(snapshot)` holds at this state or below it; `child(snapshot)` is the active direct child's
 * name, or `undefined`.
 */
export type StateToken<Path extends string = string> = {
  readonly "~flow": "state";
  readonly "~path": Path;
  readonly is: (read: StateRead) => boolean;
  // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- the Plan's public word: child is the name, otherwise undefined
  readonly child: (read: StateRead) => string | undefined;
};

/**
 * A compound's history as a target (`S.X.history`): its last active child, else its default.
 */
export type HistoryToken<Path extends string = string> = {
  readonly "~flow": "history";
  readonly "~path": Path;
};

/**
 * The state tokens of a tree: each state by name, a compound's children under it with its
 * `history`.
 */
export type StateTokens<L, P extends string = ""> =
  string extends NamesOf<L> ? Values : StateTokensLiteral<L, P>;

type StateTokensLiteral<L, P extends string> = {
  readonly [N in NamesOf<L>]: [ChildrenOf<L, N>] extends [never]
    ? StateToken<`${P}${N}`>
    : StateToken<`${P}${N}`> &
        StateTokensLiteral<ChildrenOf<L, N>, `${P}${N}.`> & {
          readonly history: HistoryToken<`${P}${N}`>;
        };
};

/**
 * A lane member or lookup in an alternative's `actions`.
 */
export type ActionToken = {
  readonly "~flow": "action";
  readonly operation: string;
  readonly make: (at: string) => Action;
};

/**
 * An operation's guard (`O.x.idle`, `O.x.retryable`) in an alternative's `guard`.
 */
export type GuardToken = {
  readonly "~flow": "guard";
  readonly operation: string;
  readonly make: (at: string) => Guard;
};

type SelectArg<M> = { readonly memory: M; readonly event: never };

type GuardArg<M, P> = { readonly state: string; readonly memory: M; readonly event: P };

/**
 * The write lanes a snapshot shows: each operation's rows, keyed by the key's canonical text.
 */
export type Operations = ReadonlyMap<string, ReadonlyMap<string, Row>>;

/**
 * A write operation's members, guards and row read (`O.x.get`).
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
 * One alternative of a handler: its target, guards, memory patch and actions.
 */
export type AlternativeConfig<M, P, S extends string, W = M> = {
  readonly target?: StateToken<S> | HistoryToken<S> | "self";
  readonly guard?: GuardElement<M, P> | ReadonlyArray<GuardElement<M, P>>;
  readonly updateMemory?: (input: {
    readonly memory: M;
    readonly event: P;
    readonly now: number;
  }) => Partial<W>;
  readonly actions?: ReadonlyArray<ActionToken>;
};

type OneAlternative<M, P, S extends string, W> =
  | AlternativeConfig<M, P, S, W>
  | StateToken<S>
  | HistoryToken<S>;

export type Handler<M, P, S extends string, W = M> =
  | OneAlternative<M, P, S, W>
  | ReadonlyArray<OneAlternative<M, P, S, W>>;

export type On<M, Ev, S extends string, W = M> = {
  readonly [K in keyof Ev]?: Handler<M, PayloadOf<Ev[K]>, S, W>;
};

export type ScheduleConfig<M, Ev> = {
  readonly schedule: Duration.Input | ((input: { readonly memory: M }) => number);
  readonly send: { readonly tag: keyof Ev & string } & Ending;
  readonly armOn?: ReadonlyArray<(keyof Ev & string) | Entry>;
};

export type StateConfig<M, Ev, S extends string, W = M> = {
  readonly on?: On<M, Ev, S, W>;
  readonly schedules?: Readonly<Record<string, ScheduleConfig<M, Ev>>>;
};

/**
 * What a provider's selector reads: one complete outside snapshot of the provider.
 */
export type ProviderSnapshot<State = string, Memory = Values> = {
  readonly state: State;
  readonly memory: Memory;
};

/**
 * A context slot: a value selected from one complete snapshot of another definition's actor
 * (`Provider.select(selector)`). The machine entry or the ref wires which actor provides it.
 */
export type ContextSlot<V = unknown> = {
  readonly "~flow": "context";
  readonly provider: string;
  readonly select: (snapshot: ProviderSnapshot<never, never>) => V;
};

/**
 * A definition's context slots, by name.
 */
export type ContextConfig = Readonly<Record<string, ContextSlot>>;

/**
 * The values a definition's context slots select, by slot.
 */
export type ContextOf<Cx> = {
  readonly [K in keyof Cx]: Cx[K] extends ContextSlot<infer V> ? V : never;
};

type DefinitionConfig<
  States extends StateTree,
  Ev extends Readonly<Record<string, EventFields>>,
  In extends Readonly<Record<string, EventFields>>,
  M extends MemoryConfig,
  O extends Readonly<Record<string, Bound>>,
  Cx extends ContextConfig,
> = {
  readonly id: string;
  readonly persist?: boolean;
  readonly states: States;
  readonly events: Ev;
  readonly internalEvents?: In;
  readonly memory?: M;
  readonly context?: Cx;
  readonly operations?: (tokens: { readonly E: Tokens<In> }) => O;
};

/**
 * The root's state reads: `S.root.child(snapshot)` is the active top-level state.
 */
export type RootToken = {
  // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- the Plan's public word: child is the name, otherwise undefined
  readonly child: (read: StateRead) => string | undefined;
};

/**
 * A definition: a machine's structure, before its handlers.
 *
 * **Details**
 *
 * `Event`, `State`, `Input`, `Memory` and `Snapshot` are its Schemas: `Event` decodes its public
 * envelopes, `State` its leaf paths, `Input` what a creator supplies, `Memory` the whole memory and
 * `Snapshot` an outside snapshot's state and memory, without the `Flow.private` fields.
 *
 * `Provider.select(selector)` makes a context slot another definition declares: it selects a value
 * from one complete outside snapshot of the actor that provides it.
 */
export type Definition<
  States extends StateTree = StateTree,
  Ev extends Readonly<Record<string, EventFields>> = Readonly<Record<string, EventFields>>,
  In extends Readonly<Record<string, EventFields>> = Readonly<Record<string, EventFields>>,
  M extends MemoryConfig = MemoryConfig,
  O extends Readonly<Record<string, Bound>> = Readonly<Record<string, Bound>>,
  Cx extends ContextConfig = ContextConfig,
> = {
  readonly id: string;
  readonly persist: boolean;
  readonly states: States;
  readonly events: Ev;
  readonly internalEvents: In;
  readonly memory: M;
  readonly context: Cx;
  readonly operations: O;
  readonly Provider: {
    readonly select: <V>(
      selector: (snapshot: ProviderSnapshot<LeavesOf<States>, OutsideOf<M>>) => V,
    ) => ContextSlot<V>;
  };
  readonly S: StateTokens<States> & { readonly root: RootToken };
  readonly E: Tokens<Ev & In>;
  readonly O: Handles<O, MemoryOf<M>>;
  readonly Event: Schema.Codec<Envelope, Values>;
  readonly State: Schema.Codec<LeavesOf<States>, string>;
  readonly Input: Schema.Codec<InputOf<M>, Values>;
  readonly Memory: Schema.Codec<MemoryOf<M>, Values>;
  readonly Snapshot: Schema.Codec<
    { readonly state: LeavesOf<States>; readonly memory: OutsideOf<M> },
    Values
  >;
};

export const fieldsOf = (x: EventFields) => (isUncertain(x) ? x.fields : x);

/**
 * A Struct built over a runtime record of field Schemas, as the record codec Compiled holds.
 */
export const codecOf = <E, S = Schema.Top>(schema: S) =>
  // SAFETY: a Struct of a definition's own field Schemas decodes to a record of those fields, and every Flow field Schema needs no services.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Schema.Struct over a runtime record has no static field types
  schema as Schema.Codec<Values, E>;

// FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
const trusted = <A>(value: unknown) =>
  // SAFETY: a value built from the definition's own keys, whose static type the caller names.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- records built at run time carry no static key types
  value as A;

const invalidEvent = (tag: string, field: ReadonlyArray<string>) =>
  flowError([
    {
      code: "InvalidEvent",
      path: ["E", tag, ...field],
      summary: `E.${tag} was given a payload its Schema refuses`,
      help: "Give the event a payload of its declared fields.",
    },
  ]);

const eventToken = (tag: string, fields: Schema.Struct.Fields) => {
  const ending = { event: tag, from: Option.none() };
  const valid = Schema.is(codecOf<Values>(Schema.Struct(fields)));
  const checks = Object.entries(fields).map(([name, schema]) => [name, Schema.is(schema)] as const);

  const make = (given: Values = {}) => {
    if (!valid(given))
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- E.X's contract: a payload its Schema refuses throws InvalidEvent
      throw invalidEvent(
        tag,
        checks
          .filter(([name, is]) => !is(given[name]))
          .map(([name]) => name)
          .slice(0, 1),
      );

    return { ...given, _tag: tag };
  };

  return Object.assign(make, {
    tag,
    ending,
    from: (map: (value: never) => Values) => ({ ending: { event: tag, from: Option.some(map) } }),
  });
};

const tokensOf = <Ev extends Readonly<Record<string, EventFields>>>(events: Ev) =>
  trusted<Tokens<Ev>>(
    Object.fromEntries(
      Object.entries(events).map(([tag, fields]) => [tag, eventToken(tag, fieldsOf(fields))]),
    ),
  );

// ── the state tree.

const readOf = (read: StateRead) => (Predicate.isString(read) ? read : read.state);

const childUnder = (path: string, read: StateRead) => {
  const state = readOf(read);
  const depth = path === "" ? 0 : chainOf(path).length;

  return path === "" || atOrBelow(state, path) ? state.split(".")[depth] : undefined;
};

// RETURN_TYPE: the StateToken protocol: a target and a guard element with its reads.
const stateToken = (path: string): StateToken => ({
  "~flow": "state",
  "~path": path,
  is: (read) => atOrBelow(readOf(read), path),
  child: (read) => childUnder(path, read),
});

const tokenTree = (nodes: ReadonlyArray<TreeNode>, paths: ReadonlyArray<string>) => {
  const byPath = new Map(nodes.map((n) => [n.path, n]));

  // RETURN_TYPE: recursive: each state's token by name, a compound's children under it.
  const build = (list: ReadonlyArray<string>): Values =>
    Object.fromEntries(
      list.map((path) => {
        const node = byPath.get(path);
        const kids = node?.children ?? [];

        return [
          node?.name ?? path,
          kids.length === 0
            ? stateToken(path)
            : {
                ...build(kids),
                ...stateToken(path),
                history: { "~flow": "history", "~path": path },
              },
        ];
      }),
    );

  return { ...build(paths), root: { child: (read: StateRead) => childUnder("", read) } };
};

/**
 * Declares a machine's structure: its states, events, memory and operations.
 *
 * **When to use**
 *
 * In a `*.definition.ts` file. `machine(definition, body)` then writes its handlers.
 *
 * **Details**
 *
 * `states` is an ordered list of leaf names and single-key compounds (`{ ON: ["PLAYING",
 * "PAUSED"] }`). Each memory field starts from one source: `Flow.input`, `Flow.initial`, or
 * absence for an optional key. Inert: it starts no actor, work, timer or storage access, and runs
 * no default; `operations` runs once, with the internal events' tokens.
 *
 * **Gotchas**
 *
 * - An invalid declaration throws one FlowError listing every violation found, in declaration
 *   order, each with its path.
 */
// RETURN_TYPE: the exported Definition keeps every literal type for S, E and O.
export const definition = <
  const States extends StateTree,
  const Ev extends Readonly<Record<string, EventFields>>,
  // RETURN_TYPE: the exported Definition keeps every literal type for S, E and O.
  const In extends Readonly<Record<string, EventFields>> = Record<never, never>,
  M extends MemoryConfig = Record<never, never>,
  O extends Readonly<Record<string, Bound>> = Record<never, never>,
  Cx extends ContextConfig = Record<never, never>,
>(
  config: DefinitionConfig<States, Ev, In, M, O, Cx>,
): Definition<States, Ev, In, M, O, Cx> => {
  const internal = config.internalEvents ?? trusted<In>({});
  const context = config.context ?? trusted<Cx>({});
  const memory = config.memory ?? trusted<M>({});
  const operations = config.operations?.({ E: tokensOf(internal) }) ?? trusted<O>({});
  const tree = treeOf(config.states);

  const findings = [
    ...missingFindings(config),
    ...Object.keys(config).flatMap((key) =>
      definitionFindings(
        key,
        { ...config, persist: config.persist, internalEvents: internal, memory },
        tree.findings,
        operations,
      ),
    ),
  ];

  const [first, ...rest] = findings;

  if (first !== undefined)
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- an invalid definition throws one FlowError before any work
    throw flowError([first, ...rest]);

  const handles = Object.fromEntries(
    Object.entries(operations).map(([name, bound]) => [
      name,
      bound.kind === "write" ? writeHandle(name, bound.keyText) : readHandle(name),
    ]),
  );

  const unwrap = (raw: Field) => (isMarker(raw) && raw["~flow"] === "private" ? raw.field : raw);

  const schemaOf = (raw: Field) => {
    const field = unwrap(raw);

    return isMarker(field) ? field.schema : field;
  };

  const leaves = tree.nodes.filter((n) => n.children.length === 0).map((n) => n.path);

  const envelopes = Object.entries(config.events).map(([tag, fields]) =>
    Schema.Struct({ ...fieldsOf(fields), _tag: Schema.Literal(tag) }),
  );

  const inputs = Object.fromEntries(
    Object.entries(memory).flatMap(([name, raw]) => {
      const field = unwrap(raw);

      return isMarker(field) && field["~flow"] === "input" ? [[name, field.schema]] : [];
    }),
  );

  return {
    id: config.id,
    persist: config.persist ?? false,
    states: config.states,
    events: config.events,
    internalEvents: internal,
    memory,
    context,
    operations,
    Provider: {
      select: (selector) => ({ "~flow": "context", provider: config.id, select: selector }),
    },
    S: trusted(tokenTree(tree.nodes, tree.top)),
    E: tokensOf({ ...config.events, ...internal }),
    O: trusted(handles),
    Event: trusted(Schema.Union(envelopes)),
    State: trusted(Schema.Literals(leaves)),
    Input: trusted(Schema.Struct(inputs)),
    Memory: trusted(
      Schema.Struct(Object.fromEntries(Object.entries(memory).map(([k, f]) => [k, schemaOf(f)]))),
    ),
    Snapshot: trusted(
      Schema.Struct({
        state: Schema.Literals(leaves),
        memory: Schema.Struct(
          Object.fromEntries(
            Object.entries(memory).flatMap(([k, f]) =>
              isMarker(f) && f["~flow"] === "private" ? [] : [[k, schemaOf(f)]],
            ),
          ),
        ),
      }),
    ),
  };
};

/**
 * The declared tree of a definition, in declaration order: what `machine` compiles.
 */
export const treeOfDefinition = (definition: AnyDefinition) => treeOf(definition.states);

/**
 * What every definition has, whatever its literal types: what `machine` and the Runtime read.
 */
export type AnyDefinition = {
  readonly id: string;
  readonly persist: boolean;
  readonly states: StateTree;
  readonly events: Readonly<Record<string, EventFields>>;
  readonly internalEvents: Readonly<Record<string, EventFields>>;
  readonly memory: MemoryConfig;
  readonly context: ContextConfig;
  readonly operations: Readonly<Record<string, Bound>>;
  readonly S: Values;
  readonly E: Values;
  readonly O: Values;
};

/**
 * A compiled machine: its definition and its Compiled data.
 */
export type Machine<D extends AnyDefinition = AnyDefinition> = {
  readonly definition: D;
  readonly compiled: Compiled;
};

/**
 * Re-exported for the type of `O.x.get`'s row.
 */
export type { Row };
