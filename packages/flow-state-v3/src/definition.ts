import { Predicate, Result, Schema } from "effect";
import type { Compiled, Values } from "./core/compiled.ts";
import { atOrBelow, chainOf } from "./core/tree.ts";
import type { Bound, Fields } from "./contract.ts";
import { fieldsOf, tokensOf, trusted } from "./events.ts";
import { readHandle, writeHandle } from "./handles.ts";
import { configFindings, inDeclarationOrder, operationsFindings } from "./config.ts";
import { flowErrorOf, raise, refuse } from "./error.ts";
import { entry } from "./entry.ts";
import {
  definitionFindings,
  isMarker,
  isPrivate,
  schemaOfField,
  type TreeNode,
  treeOf,
  unwrapPrivate,
} from "./construction.ts";
import {
  type Field,
  type Input,
  type Plain,
  type Private,
  reading,
  slotReadsOf,
  type Uncertain,
} from "./flow.ts";

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

export type { EventToken, MappedEvent, Tokens } from "./event-tokens.ts";

export type {
  ActionToken,
  AlternativeConfig,
  GuardElement,
  GuardToken,
  Handler,
  HistoryToken,
  On,
  Operations,
  ReadHandle,
  RootToken,
  ScheduleConfig,
  StateConfig,
  StateRead,
  StateToken,
  StateTokens,
  WriteHandle,
} from "./tokens.ts";

import type {
  Handles,
  MemoryToken,
  ReadToken,
  RootToken,
  StateNameToken,
  StateRead,
  StateTokens,
} from "./tokens.ts";

import type { Tokens } from "./event-tokens.ts";

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
 * A context slot (`Flow.context`): a value of its Schema read from one provider's tokens, a
 * pass-through's one token or a derived slot's reads and select. The machine entry or the ref wires
 * which actor provides it.
 */
export type ContextSlot<V = unknown, P = unknown> = {
  readonly "~flow": "context";
  // FLOW_STATE_ALLOW_UNKNOWN: the encoded side of a slot's Schema is the Schema's own.
  readonly schema: Schema.Codec<V, unknown>;
  readonly form: "pass" | "derived";
  // A pass-through's token, or a derived slot's `{ reads, select }`.
  readonly spec: ReadToken | { readonly reads: Readonly<Record<string, ReadToken>> };
  // A phantom type: the provider's state tree and memory, which the wiring's ref must have.
  readonly "~provider"?: P;
};

/**
 * A definition's context slots, by name.
 */
export type ContextConfig = Readonly<Record<string, ContextSlot>>;

/**
 * A provider's state tree and memory, by which a slot's wiring ref is checked.
 */
export type ProvidedBy<States, M> = { readonly states: States; readonly memory: M };

/**
 * The values a definition's context slots select, by slot.
 */
export type ContextOf<Cx> = {
  readonly [K in keyof Cx]: Cx[K] extends ContextSlot<infer V> ? V : never;
};

// What a states list may not hold, by sibling list: a name twice, or a compound with no children.
type ListFault<L, Seen = never> = L extends readonly [infer H, ...infer T]
  ? | (NameOf<H> extends Seen ? "a duplicate state name" : never)
    | (H extends string
        ? never
        : ChildrenOf<readonly [H], NameOf<H>> extends readonly []
          ? "a compound with no children"
          : ListFault<ChildrenOf<readonly [H], NameOf<H>>>)
    | ListFault<T, Seen | NameOf<H>>
  : never;

// A definition's literal checks: its states list kept literal and well formed, and a non-empty id.
type DefinitionCheck<States, Id extends string> = (string extends NamesOf<States>
  ? { readonly states: "a states list widened to string[]: write it inline" }
  : [ListFault<States>] extends [never]
    ? Record<never, never>
    : { readonly states: ListFault<States> }) &
  (Id extends "" ? { readonly id: "a non-empty id" } : Record<never, never>);

type DefinitionConfig<
  States extends StateTree,
  Ev extends Readonly<Record<string, EventFields>>,
  In extends Readonly<Record<string, EventFields>>,
  M extends MemoryConfig,
  O extends Readonly<Record<string, Bound>>,
  Cx extends ContextConfig,
  Id extends string,
> = {
  readonly id: Id;
  readonly persist?: boolean;
  readonly states: States;
  readonly events: Ev;
  readonly internalEvents?: In;
  readonly memory?: M;
  readonly context?: Cx;
  readonly operations?: (tokens: { readonly E: Tokens<In, Id> }) => O;
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
 * `M`, `S` and `state` are what another definition's context slots read: `M` has one token per
 * public memory field (a `Flow.private` field has none), `S` each state, true while the actor is in
 * it or below it, and `state` the current state's name. A slot's value passes through its Schema's
 * JSON form once, so a consumer reads, saves and compares the same value live and after a reload.
 *
 * ```ts
 * context: { user: Flow.context(Session.M.user), signedIn: Flow.context(Session.S.SIGNED_IN) }
 * ```
 */
export type Definition<
  States extends StateTree = StateTree,
  Ev extends Readonly<Record<string, EventFields>> = Readonly<Record<string, EventFields>>,
  In extends Readonly<Record<string, EventFields>> = Readonly<Record<string, EventFields>>,
  M extends MemoryConfig = MemoryConfig,
  O extends Readonly<Record<string, Bound>> = Readonly<Record<string, Bound>>,
  Cx extends ContextConfig = ContextConfig,
  Id extends string = string,
> = {
  readonly "~owner": symbol;
  readonly id: Id;
  readonly persist: boolean;
  readonly states: States;
  readonly events: Ev;
  readonly internalEvents: In;
  readonly memory: M;
  readonly context: Cx;
  readonly operations: O;
  readonly M: {
    readonly [K in keyof OutsideOf<M> & string]-?: MemoryToken<
      OutsideOf<M>[K],
      Id,
      ProvidedBy<States, M>
    >;
  };
  readonly state: StateNameToken<LeavesOf<States>, Id, ProvidedBy<States, M>>;
  readonly S: StateTokens<States, "", Id, LeavesOf<States>, ProvidedBy<States, M>> & {
    readonly root: RootToken<LeavesOf<States>, NamesOf<States>>;
  };
  readonly E: Tokens<Ev & In, Id>;
  readonly O: Handles<O, MemoryOf<M>, Id, LeavesOf<States>>;
  readonly Event: Schema.Codec<
    { readonly [K in keyof Ev & string]: Envelope<K, PayloadOf<Ev[K]>> }[keyof Ev & string],
    Values
  >;
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

// What a state token holds: its path and its reads, before it is recorded as a context read.
const stateParts = (path: string) => ({
  "~flow": "state" as const,
  "~path": path,
  is: entry(`S.${path}.is`, (read: StateRead) => atOrBelow(readOf(read), path)),
  child: entry(`S.${path}.child`, (read: StateRead) => childUnder(path, read)),
});

// The definition a context read comes from: by identity and by id.
type Origin = { readonly owner: symbol; readonly provider: string };

// A state token, recorded as a context read of its definition: true at the state or below it.
// RETURN_TYPE: the token as given, with whatever its compound holds beside it.
const asRead = <T extends { readonly "~path": string }>(token: T, origin: Origin): T =>
  reading(token, {
    ...origin,
    schema: Schema.Boolean,
    read: { kind: "state", path: token["~path"] },
  });

const tokenTree = (
  nodes: ReadonlyArray<TreeNode>,
  paths: ReadonlyArray<string>,
  origin: Origin,
) => {
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
            ? asRead(stateParts(path), origin)
            : asRead(
                {
                  ...build(kids),
                  ...stateParts(path),
                  history: { "~flow": "history", "~path": path },
                },
                origin,
              ),
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
    O extends Readonly<Record<string, Bound<"write" | "read", unknown, Values, Values, Id>>> =
      Record<never, never>,
    Cx extends ContextConfig = Record<never, never>,
    const Id extends string = string,
  >(
    config: DefinitionConfig<States, Ev, In, M, O, Cx, Id> & DefinitionCheck<States, Id>,
  ): Definition<States, Ev, In, M, O, Cx, Id> => {
    type Made = Definition<States, Ev, In, M, O, Cx, Id>;

    const keys = Predicate.isObject(config) ? Object.keys(config) : [];

    refuse(inDeclarationOrder(keys, configFindings(config)));

    const owner = Symbol(config.id);
    const origin = { owner, provider: config.id };
    const internal = config.internalEvents ?? trusted<In>({});
    const context = config.context ?? trusted<Cx>({});
    const memory = config.memory ?? trusted<M>({});
    const E = tokensOf(config.id, { ...config.events, ...internal });
    const declare = config.operations;

    const called =
      declare === undefined
        ? Result.succeed(trusted<O>({}))
        : Result.try({
            try: () => declare({ E: pick<Tokens<In, Id>>(E, Object.keys(internal)) }),
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
        ...Object.entries(context).flatMap(([name, slot]) =>
          Result.match(slotReadsOf(name, slot), { onFailure: (f) => f, onSuccess: () => [] }),
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
      M: trusted<Made["M"]>(
        Object.fromEntries(
          Object.entries(memory).flatMap(([name, field]) =>
            isPrivate(field)
              ? []
              : [
                  [
                    name,
                    reading(
                      { "~flow": "memory", "~field": name, schema: schemaOfField(field) },
                      {
                        ...origin,
                        schema: schemaOfField(field),
                        read: { kind: "memory", field: name },
                      },
                    ),
                  ],
                ],
          ),
        ),
      ),
      state: trusted<Made["state"]>(
        reading(
          { "~flow": "stateName", schema: Schema.Literals(leaves) },
          { ...origin, schema: Schema.Literals(leaves), read: { kind: "stateName" } },
        ),
      ),
      S: trusted<Made["S"]>(tokenTree(tree.nodes, tree.top, origin)),
      E,
      O: trusted<Made["O"]>(handles),
      Event: trusted<Made["Event"]>(Schema.Union(envelopes)),
      State: trusted<Made["State"]>(Schema.Literals(leaves)),
      Input: trusted<Made["Input"]>(Schema.Struct(inputs)),
      Memory: trusted<Made["Memory"]>(
        Schema.Struct(
          Object.fromEntries(Object.entries(memory).map(([k, f]) => [k, schemaOfField(f)])),
        ),
      ),
      Snapshot: trusted<Made["Snapshot"]>(
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
