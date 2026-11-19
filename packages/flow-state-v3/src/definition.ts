import { type Duration, Option, Predicate, Result, Schema } from "effect";
import type { Action, Compiled, Denial, Guard, Values } from "./core/compiled.ts";
import type { Row } from "./core/rows.ts";
import { atOrBelow, chainOf } from "./core/tree.ts";
import type { Bound, BoundInput, BoundKey, Ending, Fields } from "./contract.ts";
import { fieldsOf, tokensOf, trusted } from "./events.ts";
import { type GuardArg, readHandle, type SelectArg, writeHandle } from "./handles.ts";
import type { SendToken } from "./send.ts";
import { configFindings, inDeclarationOrder, operationsFindings } from "./config.ts";
import { flowErrorOf, raise, refuse } from "./error.ts";
import { builder, entry } from "./entry.ts";
import {
  definitionFindings,
  isMarker,
  isPrivate,
  schemaOfField,
  type TreeNode,
  treeOf,
  unwrapPrivate,
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
 * A public event of an actor's definition, as `send` takes it.
 */
export type EventOf<D extends AnyDefinition> = {
  readonly [K in keyof D["events"] & string]: Envelope<K, PayloadOf<D["events"][K]>>;
}[keyof D["events"] & string];

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
    readonly from: <V>(map: (value: V) => P) => MappedEvent<Name, V, P>;
  };

/**
 * An event token's mapping (`E.X.from(f)`): an ending's target, or a send's event, whose payload
 * `f` computes from a value of type `V`.
 */
export type MappedEvent<Name extends string, V, P> = {
  readonly ending: { readonly event: Name; readonly from: Option.Option<(value: V) => P> };
};

/**
 * A definition's event tokens, by tag.
 */
export type Tokens<Ev> = { readonly [K in keyof Ev & string]: EventToken<K, PayloadOf<Ev[K]>> };

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
export type ActionToken<P = unknown> = {
  readonly "~flow": "action";
  readonly "~owner": symbol;
  readonly operation: string;
  readonly make: (at: string) => Action;
  // A phantom type: the event its select reads, so it fits only a handler of that event.
  readonly "~event"?: (event: P) => void;
};

/**
 * An operation's guard (`O.x.idle`, `O.x.retryable`) in an alternative's `guard`.
 */
export type GuardToken<P = unknown> = {
  readonly "~flow": "guard";
  readonly "~owner": symbol;
  readonly operation: string;
  readonly make: (at: string) => Guard;
  // A phantom type: the event its key reads, so it fits only a handler of that event.
  readonly "~event"?: (event: P) => void;
};

/**
 * The write lanes a snapshot shows: each operation's rows, keyed by the key's canonical text.
 */
export type Operations = ReadonlyMap<string, ReadonlyMap<string, Row>>;

/**
 * A write operation's members, guards and row read (`O.x.get`).
 */
export type WriteHandle<M, I, K = Values> = {
  readonly commit: <P>(select: (input: SelectArg<M, P>) => I) => ActionToken<P>;
  readonly retry: ActionToken & (<P>(key: (input: SelectArg<M, P>) => K) => ActionToken<P>);
  readonly cancel: ActionToken & (<P>(key: (input: SelectArg<M, P>) => K) => ActionToken<P>);
  readonly idle: <P>(key: (input: GuardArg<M, P>) => K) => GuardToken<P>;
  readonly retryable: {
    (options: { readonly times: number }): GuardToken;
    <P>(key: (input: GuardArg<M, P>) => K, options: { readonly times: number }): GuardToken<P>;
  };
  readonly get: (operations: Operations, key: K) => Option.Option<Row>;
};

/**
 * A read operation's lookup and cancel.
 */
export type ReadHandle<M, I> = {
  readonly lookup: <P>(select: (input: SelectArg<M, P>) => I) => ActionToken<P>;
  readonly cancel: ActionToken;
};

type Handles<O, M> = {
  readonly [K in keyof O]: O[K] extends { readonly kind: "write" }
    ? WriteHandle<M, BoundInput<O[K]>, BoundKey<O[K]>>
    : ReadHandle<M, BoundInput<O[K]>>;
};

export type GuardElement<M, P> =
  | StateToken
  | GuardToken<P>
  | ((input: GuardArg<M, P>) => true | Denial);

/**
 * One alternative of a handler: its target, guards, memory patch and actions: lane members,
 * lookups and sends, in written order.
 */
export type AlternativeConfig<M, P, S extends string, W = M> = {
  readonly target?: StateToken<S> | HistoryToken<S> | "self";
  readonly guard?: GuardElement<M, P> | ReadonlyArray<GuardElement<M, P>>;
  readonly updateMemory?: (input: {
    readonly memory: M;
    readonly event: P;
    readonly now: number;
  }) => Partial<W>;
  readonly actions?: ReadonlyArray<ActionToken<P> | SendToken<M, P>>;
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
 * A context slot: a value of its Schema, selected from one complete snapshot of another
 * definition's actor (`Provider.select(schema, selector)`). The machine entry or the ref wires
 * which actor provides it.
 */
export type ContextSlot<V = unknown, P = unknown> = {
  readonly "~flow": "context";
  readonly provider: string;
  // FLOW_STATE_ALLOW_UNKNOWN: the encoded side of a slot's Schema is the Schema's own.
  readonly schema: Schema.Codec<V, unknown>;
  readonly select: (snapshot: ProviderSnapshot<never, never>) => V;
  // A phantom type: the provider's state tree and memory, which the wiring's ref must have.
  readonly "~provider"?: P;
};

/**
 * A definition's context slots, by name.
 */
export type ContextConfig = Readonly<Record<string, ContextSlot>>;

/**
 * What a slot keeps of its provider: its state tree and memory, the parts its selector reads.
 */
export type ProvidedBy<States, M> = { readonly states: States; readonly memory: M };

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
 * `Provider.select(schema, selector)` makes a context slot another definition declares: it selects
 * a value of `schema` from one complete outside snapshot of the actor that provides it. A selection
 * passes through the Schema's JSON form once, so a consumer reads, saves and compares the same
 * value live and after a reload; a selection the Schema cannot encode is the selector's defect.
 *
 * ```ts
 * context: { user: Session.Provider.select(Schema.UndefinedOr(Schema.String), (s) => s.memory.user) }
 * ```
 */
export type Definition<
  States extends StateTree = StateTree,
  Ev extends Readonly<Record<string, EventFields>> = Readonly<Record<string, EventFields>>,
  In extends Readonly<Record<string, EventFields>> = Readonly<Record<string, EventFields>>,
  M extends MemoryConfig = MemoryConfig,
  O extends Readonly<Record<string, Bound>> = Readonly<Record<string, Bound>>,
  Cx extends ContextConfig = ContextConfig,
> = {
  readonly "~owner": symbol;
  readonly id: string;
  readonly persist: boolean;
  readonly states: States;
  readonly events: Ev;
  readonly internalEvents: In;
  readonly memory: M;
  readonly context: Cx;
  readonly operations: O;
  readonly Provider: {
    readonly select: <V, I>(
      schema: Schema.Codec<V, I>,
      selector: (snapshot: ProviderSnapshot<LeavesOf<States>, OutsideOf<M>>) => NoInfer<V>,
    ) => ContextSlot<V, ProvidedBy<States, M>>;
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

const pick = <T>(tokens: Values, names: ReadonlyArray<string>) =>
  trusted<T>(Object.fromEntries(names.map((name) => [name, tokens[name]])));

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
  is: entry(`S.${path}.is`, (read: StateRead) => atOrBelow(readOf(read), path)),
  child: entry(`S.${path}.child`, (read: StateRead) => childUnder(path, read)),
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

  return {
    ...build(paths),
    root: { child: entry("S.root.child", (read: StateRead) => childUnder("", read)) },
  };
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
export const definition = entry(
  "definition",
  // RETURN_TYPE: the exported Definition keeps every literal type for S, E and O.
  <
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
    const keys = Predicate.isObject(config) ? Object.keys(config) : [];

    refuse(inDeclarationOrder(keys, configFindings(config)));

    const owner = Symbol(config.id);
    const internal = config.internalEvents ?? trusted<In>({});
    const context = config.context ?? trusted<Cx>({});
    const memory = config.memory ?? trusted<M>({});
    const E = tokensOf(config.id, { ...config.events, ...internal });
    const declare = config.operations;

    const called =
      declare === undefined
        ? Result.succeed(trusted<O>({}))
        : Result.try({
            try: () => declare({ E: pick<Tokens<In>>(E, Object.keys(internal)) }),
            // FLOW_STATE_ALLOW_UNKNOWN: what an author's callback threw, kept whole as the cause.
            catch: (cause: unknown) => cause,
          });

    if (Result.isFailure(called))
      return raise(
        flowErrorOf(
          [
            {
              code: "Defect",
              path: ["operations"],
              summary: "the operations callback threw",
              help: "Fix the operations callback; what it threw is this error's cause.",
            },
          ],
          called.failure,
        ),
      );

    const malformed = operationsFindings(called.success);
    const operations = malformed.length === 0 ? called.success : trusted<O>({});
    const tree = treeOf(config.states);

    refuse(
      inDeclarationOrder(keys, [
        ...malformed,
        ...definitionFindings(
          { id: config.id, events: config.events, internalEvents: internal, memory, context },
          tree.findings,
          operations,
          keys,
        ),
      ]),
    );

    const handles = Object.fromEntries(
      Object.entries(operations).map(([name, bound]) => [
        name,
        bound.kind === "write"
          ? writeHandle(name, bound.textOfKey, owner)
          : readHandle(name, owner),
      ]),
    );

    const leaves = tree.nodes.filter((n) => n.children.length === 0).map((n) => n.path);

    const envelopes = Object.entries(config.events).map(([tag, fields]) =>
      Schema.Struct({ ...fieldsOf(fields), _tag: Schema.Literal(tag) }),
    );

    const inputs = Object.fromEntries(
      Object.entries(memory).flatMap(([name, raw]) => {
        const field = unwrapPrivate(raw);

        return isMarker(field) && field["~flow"] === "input" ? [[name, field.schema]] : [];
      }),
    );

    return {
      "~owner": owner,
      id: config.id,
      persist: config.persist ?? false,
      states: config.states,
      events: config.events,
      internalEvents: internal,
      memory,
      context,
      operations,
      Provider: {
        select: builder("Provider.select", (schema, selector) => ({
          "~flow": "context",
          provider: config.id,
          schema: trusted(schema),
          select: selector,
        })),
      },
      S: trusted(tokenTree(tree.nodes, tree.top)),
      E,
      O: trusted(handles),
      Event: trusted(Schema.Union(envelopes)),
      State: trusted(Schema.Literals(leaves)),
      Input: trusted(Schema.Struct(inputs)),
      Memory: trusted(
        Schema.Struct(
          Object.fromEntries(Object.entries(memory).map(([k, f]) => [k, schemaOfField(f)])),
        ),
      ),
      Snapshot: trusted(
        Schema.Struct({
          state: Schema.Literals(leaves),
          memory: Schema.Struct(
            Object.fromEntries(
              Object.entries(memory).flatMap(([k, f]) =>
                isPrivate(f) ? [] : [[k, schemaOfField(f)]],
              ),
            ),
          ),
        }),
      ),
    };
  },
);

/**
 * The declared tree of a definition, in declaration order: what `machine` compiles.
 */
export const treeOfDefinition = (definition: AnyDefinition) => treeOf(definition.states);

/**
 * What every definition has, whatever its literal types: what `machine` and the Runtime read.
 */
export type AnyDefinition = {
  readonly "~owner": symbol;
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
 * A shared actor's name: its machine and either the literal name of a machine with no input, or
 * the value that carries a machine's input fields.
 */
export type ActorRef<D extends AnyDefinition = AnyDefinition> = {
  readonly machine: Machine<D>;
  // FLOW_STATE_ALLOW_UNKNOWN: a value ref's value is the caller's, checked at the boundary that uses it.
  readonly value: unknown;
  readonly context: Readonly<Record<string, ActorRef>>;
};
