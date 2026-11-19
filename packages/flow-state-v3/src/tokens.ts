import type { Duration, Option } from "effect";
import type { Action, Denial, Guard, Values } from "./core/compiled.ts";
import type { Row } from "./core/rows.ts";
import type { BoundInput, BoundKey, Ending } from "./contract.ts";
import type { ChildrenOf, NamesOf, PayloadOf } from "./definition.ts";
import type { Entry } from "./flow.ts";
import type { GuardArg, SelectArg } from "./handles.ts";
import type { SendToken } from "./send.ts";

/**
 * What a state read takes: a snapshot or a leaf path of the definition's leaves `L`.
 */
export type StateRead<L extends string = string> = L | { readonly state: L };

/**
 * A state of a definition, as a target or a guard element: `Path` its path, `Id` its definition's
 * id, `L` the definition's leaves and `C` its direct children's names.
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
> = {
  readonly "~flow": "state";
  readonly "~path": Path;
  // A phantom type: the definition that made the token, so it fits only that definition's body.
  readonly "~definition"?: Id;
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
> = string extends NamesOf<L> ? Values : StateTokensLiteral<L, P, Id, Leaves>;

type StateTokensLiteral<L, P extends string, Id extends string, Leaves extends string> = {
  readonly [N in NamesOf<L>]: [ChildrenOf<L, N>] extends [never]
    ? StateToken<`${P}${N}`, Id, Leaves, never>
    : StateToken<`${P}${N}`, Id, Leaves, NamesOf<ChildrenOf<L, N>>> &
        StateTokensLiteral<ChildrenOf<L, N>, `${P}${N}.`, Id, Leaves> & {
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
 * A write operation's members, guards and row read (`O.x.get`).
 */
export type WriteHandle<M, I, K = Values, Id extends string = string, L extends string = string> = {
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
  readonly get: (operations: Operations, key: K) => Option.Option<Row>;
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
    ? WriteHandle<M, BoundInput<O[K]>, BoundKey<O[K]>, Id, L>
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
  }) => Partial<W>;
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
