import type { Duration, Option, Schema } from "effect";
import type { Action, Denial, Guard, Values } from "./core/compiled.ts";
import type { Row } from "./core/rows.ts";
import type { BoundInput, BoundKey, Ending } from "./contract.ts";
import type { ChildrenOf, ContextOf, ContextSlot, NamesOf, PayloadOf } from "./definition.ts";
import type { Entry } from "./flow.ts";
import type { GuardArg, SelectArg } from "./handles.ts";
import type { SendToken } from "./send.ts";

/**
 * What a state read takes: a snapshot or a leaf path of the definition's leaves `L`.
 */
export type StateRead<L extends string = string> = L | { readonly state: L };

/**
 * A state of a definition, as a target, a guard element or a context read: `Path` its path, `Id`
 * its definition's id, `L` the definition's leaves, `C` its direct children's names and `P` what a
 * ref to its definition's actor must have when a slot reads it.
 *
 * **Details**
 *
 * `is(snapshot)` holds at this state or below it; `child(snapshot)` is the active direct child's
 * name, or `undefined`.
 */
export type StateToken<
  Path extends string = string,
  Id extends string = string,
  L extends string = string,
  C extends string = string,
  P = unknown,
> = {
  readonly "~flow": "state";
  readonly "~path": Path;
  // A phantom type: the definition that made the token, so it fits only that definition's body.
  readonly "~definition"?: Id;
  // A phantom type: the provider's state tree and memory, which a slot's wiring ref must have.
  readonly "~provider"?: P;
  // A method, so a token reading its own leaves assigns to one reading any.
  is(read: StateRead<L>): boolean;
  // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- the Plan's public word: child is the name, otherwise undefined
  child(read: StateRead<L>): C | undefined;
};

/**
 * A compound's history as a target (`S.X.history`): its last active child, else its default.
 */
export type HistoryToken<Path extends string = string, Id extends string = string> = {
  readonly "~flow": "history";
  readonly "~path": Path;
  // A phantom type: the definition that made the token.
  readonly "~definition"?: Id;
};

/**
 * The state tokens of a tree: each state by name, a compound's children under it with its
 * `history`.
 */
export type StateTokens<
  L,
  P extends string = "",
  Id extends string = string,
  Leaves extends string = string,
  Pr = unknown,
> = string extends NamesOf<L> ? Values : StateTokensLiteral<L, P, Id, Leaves, Pr>;

type StateTokensLiteral<L, P extends string, Id extends string, Leaves extends string, Pr> = {
  readonly [N in NamesOf<L>]: [ChildrenOf<L, N>] extends [never]
    ? StateToken<`${P}${N}`, Id, Leaves, never, Pr>
    : StateToken<`${P}${N}`, Id, Leaves, NamesOf<ChildrenOf<L, N>>, Pr> &
        StateTokensLiteral<ChildrenOf<L, N>, `${P}${N}.`, Id, Leaves, Pr> & {
          readonly history: HistoryToken<`${P}${N}`, Id>;
        };
};

/**
 * A lane member or lookup in an alternative's `actions`.
 */
export type ActionToken<P = unknown, Id extends string = string> = {
  readonly "~flow": "action";
  readonly "~owner": symbol;
  readonly operation: string;
  readonly make: (at: string) => Action;
  // A phantom type: the event its select reads, so it fits only a handler of that event.
  readonly "~event"?: (event: P) => void;
  // A phantom type: the definition whose operation it is.
  readonly "~definition"?: Id;
};

/**
 * An operation's guard (`O.x.idle`, `O.x.retryable`) in an alternative's `guard`.
 */
export type GuardToken<P = unknown, Id extends string = string> = {
  readonly "~flow": "guard";
  readonly "~owner": symbol;
  readonly operation: string;
  readonly make: (at: string) => Guard;
  // A phantom type: the event its key reads, so it fits only a handler of that event.
  readonly "~event"?: (event: P) => void;
  // A phantom type: the definition whose operation it is.
  readonly "~definition"?: Id;
};

/**
 * The write lanes a snapshot shows: each operation's rows, keyed by the key's canonical text.
 */
export type Operations = ReadonlyMap<string, ReadonlyMap<string, Row>>;

/**
 * A write operation's members, guards and row read (`O.x.get`); `get` reads a snapshot of its own
 * definition, whose operations are `N`.
 */
export type WriteHandle<
  M,
  I,
  K = Values,
  Id extends string = string,
  L extends string = string,
  N extends string = string,
> = {
  readonly commit: <P>(select: (input: SelectArg<M, P>) => I) => ActionToken<P, Id>;
  // FLOW_STATE_ALLOW_UNKNOWN: a keyless member reads no event, so it fits a handler of any.
  readonly retry: ActionToken<unknown, Id> &
    (<P>(key: (input: SelectArg<M, P>) => K) => ActionToken<P, Id>);
  // FLOW_STATE_ALLOW_UNKNOWN: as above.
  readonly cancel: ActionToken<unknown, Id> &
    (<P>(key: (input: SelectArg<M, P>) => K) => ActionToken<P, Id>);
  readonly idle: <P>(key: (input: GuardArg<M, P, L>) => K) => GuardToken<P, Id>;
  readonly retryable: {
    // FLOW_STATE_ALLOW_UNKNOWN: a keyless guard reads no event, so it fits a handler of any.
    (options: { readonly times: number }): GuardToken<unknown, Id>;
    <P>(
      key: (input: GuardArg<M, P, L>) => K,
      options: { readonly times: number },
    ): GuardToken<P, Id>;
  };
  readonly get: (
    operations: ReadonlyMap<N, ReadonlyMap<string, Row>>,
    key: K,
  ) => Option.Option<Row>;
};

/**
 * A read operation's lookup and cancel.
 */
export type ReadHandle<M, I, Id extends string = string> = {
  readonly lookup: <P>(select: (input: SelectArg<M, P>) => I) => ActionToken<P, Id>;
  // FLOW_STATE_ALLOW_UNKNOWN: a keyless member reads no event, so it fits a handler of any.
  readonly cancel: ActionToken<unknown, Id>;
};

export type Handles<O, M, Id extends string, L extends string> = {
  readonly [K in keyof O]: O[K] extends { readonly kind: "write" }
    ? WriteHandle<M, BoundInput<O[K]>, BoundKey<O[K]>, Id, L, keyof O & string>
    : ReadHandle<M, BoundInput<O[K]>, Id>;
};

export type GuardElement<
  M,
  P,
  S extends string = string,
  Id extends string = string,
  L extends string = string,
> = StateToken<S, Id> | GuardToken<P, Id> | ((input: GuardArg<M, P, L>) => true | Denial);

/**
 * One alternative of a handler: its target, guards, memory patch and actions: lane members,
 * lookups and sends, in written order. `S` is the definition's paths, `W` its writable memory, `Id`
 * its id and `L` its leaves.
 */
export type AlternativeConfig<
  M,
  P,
  S extends string,
  W = M,
  Id extends string = string,
  L extends string = string,
> = {
  readonly target?: StateToken<S, Id> | HistoryToken<S, Id> | "self";
  readonly guard?: GuardElement<M, P, S, Id, L> | ReadonlyArray<GuardElement<M, P, S, Id, L>>;
  readonly updateMemory?: (input: {
    readonly memory: M;
    readonly event: P;
    readonly now: number;
  }) => Partial<W> & { readonly [K in Exclude<keyof M, keyof W>]?: never };
  readonly actions?: ReadonlyArray<ActionToken<P, Id> | SendToken<M, P>>;
};

type OneAlternative<M, P, S extends string, W, Id extends string, L extends string> =
  | AlternativeConfig<M, P, S, W, Id, L>
  | StateToken<S, Id>
  | HistoryToken<S, Id>;

export type Handler<
  M,
  P,
  S extends string,
  W = M,
  Id extends string = string,
  L extends string = string,
> = OneAlternative<M, P, S, W, Id, L> | ReadonlyArray<OneAlternative<M, P, S, W, Id, L>>;

export type On<
  M,
  Ev,
  S extends string,
  W = M,
  Id extends string = string,
  L extends string = string,
> = {
  readonly [K in keyof Ev]?: Handler<M, PayloadOf<Ev[K]>, S, W, Id, L>;
};

export type ScheduleConfig<M, Ev, Id extends string = string> = {
  readonly schedule: Duration.Input | ((input: { readonly memory: M }) => number);
  readonly send: { readonly tag: keyof Ev & string } & Ending<void, Id>;
  readonly armOn?: ReadonlyArray<(keyof Ev & string) | Entry>;
};

export type StateConfig<
  M,
  Ev,
  S extends string,
  W = M,
  Id extends string = string,
  L extends string = string,
> = {
  readonly on?: On<M, Ev, S, W, Id, L>;
  readonly schedules?: Readonly<Record<string, ScheduleConfig<M, Ev, Id>>>;
};

/**
 * The root's state reads: `S.root.child(snapshot)` is the active top-level state.
 */
export type RootToken<L extends string = string, C extends string = string> = {
  // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- the Plan's public word: child is the name, otherwise undefined
  child(read: StateRead<L>): C | undefined;
};

/**
 * A public memory field of a definition, read as context (`X.M.field`): its value's type `V`, its
 * definition's id `Id` and what a ref to its provider must have, `P`.
 */
export type MemoryToken<V = unknown, Id extends string = string, P = unknown> = {
  readonly "~flow": "memory";
  readonly "~field": string;
  // FLOW_STATE_ALLOW_UNKNOWN: the encoded side of a field's Schema is the field's own.
  readonly schema: Schema.Codec<V, unknown>;
  // A phantom type: the definition that made the token.
  readonly "~definition"?: Id;
  // A phantom type: the provider's state tree and memory, which the wiring's ref must have.
  readonly "~provider"?: P;
};

/**
 * A definition's current state name, read as context (`X.state`): one of its leaf paths `L`.
 */
export type StateNameToken<L extends string = string, Id extends string = string, P = unknown> = {
  readonly "~flow": "stateName";
  readonly schema: Schema.Codec<L, string>;
  // A phantom type: the definition that made the token.
  readonly "~definition"?: Id;
  // A phantom type: the provider's state tree and memory, which the wiring's ref must have.
  readonly "~provider"?: P;
};

/**
 * What a derived slot may read: a memory field, a state (true while the provider is in it or
 * below it) or the state's name.
 */
export type ReadToken = { readonly "~flow": "memory" | "stateName" | "state" };

/**
 * The value a read gives a derived slot's select.
 */
export type ValueOfRead<T> =
  T extends MemoryToken<infer V>
    ? V
    : T extends StateNameToken<infer L>
      ? L
      : T extends { readonly "~flow": "state" }
        ? boolean
        : never;

type ProviderOfRead<T> = T extends { readonly "~provider"?: infer P }
  ? Exclude<P, undefined>
  : never;

type IdOfRead<T> = T extends { readonly "~definition"?: infer Id } ? Exclude<Id, undefined> : never;

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;

// Reads of two definitions, whose ids form a union: a slot binds one provider.
type OneProvider<R> =
  true extends IsUnion<IdOfRead<R[keyof R]>>
    ? {
        readonly "~error": "every read of one slot comes from one provider: use a slot per provider";
      }
    : Record<never, never>;

type ReadValues<R> = { readonly [K in keyof R]: ValueOfRead<R[K]> };

/**
 * `Flow.context`: a context slot read from one provider's tokens.
 */
export type ContextOfTokens = {
  <V, Id extends string, P>(token: MemoryToken<V, Id, P>): ContextSlot<V, P>;
  <L extends string, Id extends string, P>(token: StateNameToken<L, Id, P>): ContextSlot<L, P>;
  <Id extends string, P>(token: StateToken<string, Id, string, string, P>): ContextSlot<boolean, P>;
  <V, I, const R extends Readonly<Record<string, ReadToken>>>(
    schema: Schema.Codec<V, I>,
    spec: {
      readonly reads: R & OneProvider<R>;
      readonly select: (values: ReadValues<R>) => NoInfer<V>;
    },
    // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- a slot's phantom provider is the optional key ContextSlot declares
  ): ContextSlot<V, ProviderOfRead<R[keyof R]>>;
};

/**
 * A reaction to a slot's change, as `C.slot.change` makes it.
 */
export type Change = {
  readonly "~flow": "change";
  readonly slot: string;
  // FLOW_STATE_ALLOW_UNKNOWN: the authored when, decoded by the machine that receives it.
  readonly when: Option.Option<unknown>;
  // FLOW_STATE_ALLOW_UNKNOWN: the authored event, decoded by the machine that receives it.
  readonly event: unknown;
};

/**
 * What `C.slot.change` takes: when a change of the slot's value `V` counts, and the event it
 * enqueues, mapped from the value.
 *
 * **Gotchas**
 *
 * - `previous` is `undefined` when there is no earlier value: the slot's first good value after
 *   its select failed at admission, which `when` still decides. A slot whose own values include
 *   `undefined` cannot tell that apart from an earlier `undefined`.
 */
export type ChangeSpec<V, Memory, Id extends string> = {
  readonly when?: (
    current: V,
    // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- previous is a plain undefined when no earlier value exists, so a when compares it directly rather than through Option
    previous: V | undefined,
    extra: { readonly memory: Memory },
  ) => boolean;
  readonly event: Ending<V, Id>;
};

/**
 * A machine's context tokens: one per declared slot, each with `.change`.
 */
export type ContextTokens<Cx, Memory, Id extends string> = {
  readonly [K in keyof Cx & string]: {
    readonly change: (spec: ChangeSpec<ContextOf<Cx>[K], Memory, Id>) => Change;
  };
};
