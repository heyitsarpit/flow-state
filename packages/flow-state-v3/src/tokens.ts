import type { Duration, Option, Schedule, Schema } from "effect";
import type { Denial, Values } from "./core/compiled.ts";
import type { Row } from "./core/rows.ts";
import type { BoundInput, BoundKey, Ending, Fields } from "./contract.ts";
import type { ChildrenOf, ContextOf, ContextSlot, NamesOf } from "./definition.ts";
import type { PayloadOf } from "./derive.ts";
import type { Entry, Plain } from "./flow.ts";
import type { GuardArg, SelectArg } from "./handles.ts";
import type { Branded } from "./made.ts";
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
> = Branded<"state"> & {
  // A phantom type: the state's path, so a token fits only where its path does.
  readonly "~state"?: Path;
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
export type HistoryToken<
  Path extends string = string,
  Id extends string = string,
> = Branded<"history"> & {
  // A phantom type: the compound's path.
  readonly "~state"?: Path;
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
export type ActionToken<P = unknown, Id extends string = string> = Branded<"action"> & {
  readonly operation: string;
  // A phantom type: the event its select reads, so it fits only a handler of that event.
  readonly "~event"?: (event: P) => void;
  // A phantom type: the definition whose operation it is.
  readonly "~definition"?: Id;
};

/**
 * An operation's guard (`O.x.idle`, `O.x.retryable`) in an alternative's `guard`.
 */
export type GuardToken<P = unknown, Id extends string = string> = Branded<"guard"> & {
  readonly operation: string;
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
  Cx = Values,
> = StateToken<S, Id> | GuardToken<P, Id> | ((input: GuardArg<M, P, L, Cx>) => true | Denial);

/**
 * One alternative of a handler: its target, guards, memory patch and actions: lane members,
 * lookups and sends, in written order. `S` is the definition's paths, `W` its writable memory, `Id`
 * its id, `L` its leaves and `Cx` its context.
 */
export type AlternativeConfig<
  M,
  P,
  S extends string,
  W = M,
  Id extends string = string,
  L extends string = string,
  Cx = Values,
> = {
  readonly target?: StateToken<S, Id> | HistoryToken<S, Id> | "self";
  readonly guard?:
    | GuardElement<M, P, S, Id, L, Cx>
    | ReadonlyArray<GuardElement<M, P, S, Id, L, Cx>>;
  readonly updateMemory?: (input: {
    readonly memory: M;
    readonly event: P;
    readonly context: Cx;
    readonly now: number;
  }) => Partial<W> & { readonly [K in Exclude<keyof M, keyof W>]?: never };
  readonly actions?: ReadonlyArray<ActionToken<P, Id> | SendToken<M, P>>;
};

type OneAlternative<M, P, S extends string, W, Id extends string, L extends string, Cx> =
  | AlternativeConfig<M, P, S, W, Id, L, Cx>
  | StateToken<S, Id>
  | HistoryToken<S, Id>;

export type Handler<
  M,
  P,
  S extends string,
  W = M,
  Id extends string = string,
  L extends string = string,
  Cx = Values,
> = OneAlternative<M, P, S, W, Id, L, Cx> | ReadonlyArray<OneAlternative<M, P, S, W, Id, L, Cx>>;

export type On<
  M,
  Ev,
  S extends string,
  W = M,
  Id extends string = string,
  L extends string = string,
  Cx = Values,
> = {
  readonly [K in keyof Ev]?: Handler<M, PayloadOf<Ev[K]>, S, W, Id, L, Cx>;
};

/**
 * One schedule as its definition declares it: the fields of its key when it has a timer per key,
 * the reasons that pause it, and the Schema of its `restartOn` selection. `{}` declares a plain
 * schedule.
 */
export type ScheduleDecl = {
  readonly key?: Fields;
  readonly pausedBy?: ReadonlyArray<string>;
  readonly restartOn?: Plain;
};

/**
 * A definition's schedules, by name.
 */
export type ScheduleDecls = Readonly<Record<string, ScheduleDecl>>;

/**
 * A declared schedule's key: the record of its key fields, or `undefined` for an unkeyed one.
 */
export type KeyOfDecl<Dc> = Dc extends { readonly key: infer F extends Schema.Struct.Fields }
  ? Schema.Struct<F>["Type"]
  : undefined;

// A keyed declaration's key record; `never` for an unkeyed one.
type KeyRecordOf<Dc> = Dc extends { readonly key: infer F extends Schema.Struct.Fields }
  ? Schema.Struct<F>["Type"]
  : never;

/**
 * A declared schedule's pause reasons, as a union of their names.
 */
export type ReasonOfDecl<Dc> = Dc extends {
  readonly pausedBy: ReadonlyArray<infer R extends string>;
}
  ? R
  : never;

/**
 * A declared schedule's `restartOn` selection, or `never` when it declares none.
 */
export type SelOfDecl<Dc> = Dc extends { readonly restartOn: infer S extends Schema.Top }
  ? S["Type"]
  : never;

/**
 * What a schedule's send maps from: the firing's metadata, times in Runtime Clock milliseconds,
 * its name and its key `K` as declared.
 */
export type ScheduleMetadata<K = unknown> = {
  readonly attempt: number;
  readonly armedAt: number;
  readonly dueAt: number;
  readonly firedAt: number;
  // FLOW_STATE_ALLOW_UNKNOWN: an Effect Schedule's output, whatever its type; a Duration has none.
  readonly output: unknown;
  readonly key: K;
};

// What a schedule's functions read: its key `K` (keyed schedules), the after memory, the context
// `Cx` and, for the delay, the arming turn's now.
type ScheduleInput<M, Cx, K> = {
  readonly key: K;
  readonly memory: M;
  readonly context: Cx;
  readonly now: number;
};

// The write lanes a schedule's keys and pause reasons read, by `O.x.get`.
type ScheduleOperations = ReadonlyMap<never, ReadonlyMap<string, Row>>;

// An event of this definition in `armOn` or `disarmOn`: its token.
type ScheduleEvent<Ev, Id extends string> = {
  readonly tag: keyof Ev & string;
  readonly "~definition"?: Id;
};

// FLOW_STATE_ALLOW_UNKNOWN: any Effect Schedule, whatever its output; the host reads only its delays.
type AnySchedule = Schedule.Schedule<unknown>;

type In<M, Cx, Dc> = Omit<ScheduleInput<M, Cx, KeyOfDecl<Dc>>, "now">;

/**
 * A placement of a declared schedule in a state: its delay, the event it sends, what arms
 * and disarms it, and, as its declaration `Dc` requires, its `keys`, its `restartOn` selection
 * and a callback for each of its pause reasons. Every callback reads the declared key.
 */
export type ScheduleBodyOf<M, Ev, Id extends string, Cx, Dc> = {
  readonly schedule:
    | Duration.Input
    | AnySchedule
    | ((input: ScheduleInput<M, Cx, KeyOfDecl<Dc>>) => Duration.Input | AnySchedule);
  readonly send: (
    | { readonly tag: keyof Ev & string }
    | { readonly ending: { readonly event: keyof Ev & string } }
  ) &
    Ending<ScheduleMetadata<KeyOfDecl<Dc>>, Id>;
  readonly armOn?: ReadonlyArray<ScheduleEvent<Ev, Id> | Entry>;
  readonly disarmOn?: ReadonlyArray<ScheduleEvent<Ev, Id>>;
} & ([KeyOfDecl<Dc>] extends [undefined]
  ? { readonly keys?: never }
  : {
      readonly keys: (input: {
        readonly memory: M;
        readonly operations: ScheduleOperations;
      }) => ReadonlyArray<KeyRecordOf<Dc>>;
    }) &
  ([SelOfDecl<Dc>] extends [never]
    ? { readonly restartOn?: never }
    : { readonly restartOn: (input: In<M, Cx, Dc>) => SelOfDecl<Dc> }) &
  ([ReasonOfDecl<Dc>] extends [never]
    ? { readonly paused?: never }
    : {
        readonly paused: {
          readonly [P in ReasonOfDecl<Dc>]: (
            input: In<M, Cx, Dc> & { readonly operations: ScheduleOperations },
          ) => boolean;
        };
      });

/**
 * A state's `schedules`: a placement of each declared schedule it arms, by name.
 */
export type SchedulesOf<M, Ev, Id extends string, Cx, Sch> = {
  readonly [N in keyof Sch & string]?: ScheduleBodyOf<M, Ev, Id, Cx, Sch[N]>;
};

/**
 * A placement as the compiler reads it, its literal types erased: every callback takes `never`, so
 * each placement a body writes assigns to it, and only `slot` hands one to the core.
 */
export type ErasedPlacement = {
  // FLOW_STATE_ALLOW_UNKNOWN: a computed delay's value, checked when it is planned.
  readonly schedule: Duration.Input | AnySchedule | ((input: never) => unknown);
  // FLOW_STATE_ALLOW_UNKNOWN: an ending, read as made when it compiles.
  readonly send: unknown;
  // FLOW_STATE_ALLOW_UNKNOWN: event tokens and Flow.entry, read as made when it compiles.
  readonly armOn?: ReadonlyArray<unknown>;
  // FLOW_STATE_ALLOW_UNKNOWN: event tokens, read as made when it compiles.
  readonly disarmOn?: ReadonlyArray<unknown>;
  readonly keys?: (input: never) => ReadonlyArray<Values>;
  // FLOW_STATE_ALLOW_UNKNOWN: a selection of any type, compared by Equal.equals.
  readonly restartOn?: (input: never) => unknown;
  readonly paused?: Readonly<Record<string, (input: never) => boolean>>;
};

export type StateConfig<
  M,
  Ev,
  S extends string,
  W = M,
  Id extends string = string,
  L extends string = string,
  Cx = Values,
  Sch = ScheduleDecls,
> = {
  readonly on?: On<M, Ev, S, W, Id, L, Cx>;
  readonly schedules?: SchedulesOf<M, Ev, Id, Cx, Sch>;
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
 * definition's id `Id` and what a ref to its provider must have, `P`. Its Schema stays with the
 * definition; the whole memory's is `X.Memory`.
 */
export type MemoryToken<
  V = unknown,
  Id extends string = string,
  P = unknown,
> = Branded<"memory"> & {
  /**
   * The field's type, for code written apart from a body: `typeof Room.M.sensors.Type`.
   *
   * **Gotchas**
   *
   * - Type only, as a Schema's `Type` is: it holds no value at run time.
   */
  readonly Type: V;
  // A phantom type: the definition that made the token.
  readonly "~definition"?: Id;
  // A phantom type: the provider's state tree and memory, which the wiring's ref must have.
  readonly "~provider"?: P;
};

/**
 * A definition's current state name, read as context (`X.state`): one of its leaf paths `L`.
 */
export type StateNameToken<
  L extends string = string,
  Id extends string = string,
  P = unknown,
> = Branded<"stateName"> & {
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
export type ReadToken = Branded<"memory" | "stateName" | "state">;

/**
 * The value a read gives a derived slot's select.
 */
export type ValueOfRead<T> =
  T extends MemoryToken<infer V>
    ? V
    : T extends StateNameToken<infer L>
      ? L
      : T extends Branded<"state">
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
export type Change = Branded<"change"> & { readonly slot: string };

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
