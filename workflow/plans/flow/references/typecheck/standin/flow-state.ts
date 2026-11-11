// STAND-IN types for `flow-state`, types only (`declare`): nothing runs and this is not Flow code. Copied from the desk trial
// (merged/streams/trials/desk/standin/) and widened to the whole app surface.
//
// How strict each part is (CONVERSION.md repeats this):
//   STRICT: Feed.*, stream() (delivers, position, catchUp, reconnect, idleTime, failure exhaustive, fills checked against memory),
//           the names of states, events and operations a definition declares, memory field types.
//   LOOSE:  machine bodies, fragments, resources, domains, entities, write and read: `Loose`, so a wrong word inside them still compiles.
// A pass over the LOOSE parts proves nothing about the design.
import type { Duration, Effect, Schema, Scope, Stream } from "effect";

type Fields = Schema.Struct.Fields;
type TypeOf<F extends Fields> = Schema.Struct<F>["Type"];
type Tagged = { readonly _tag: string };

// ---- Feed (3.3, 3.4) ----------------------------------------------------------------------------------------------
export declare namespace Feed {
  // `P` is the position type a signal can carry (`head`, `restartAt`); `never` when it carries none.
  interface Signal<out P = never> {
    readonly signal: "live" | "down" | "ping";
    readonly place?: P;
  }
  function live(): Signal<never>;
  function live(options: { readonly proof: string }): Signal<never>;
  function live<P>(options: { readonly head: P }): Signal<P>;
  function live<P>(options: { readonly restartAt: P }): Signal<P>;
  function down(reason: unknown): Signal<never>;
  const ping: Signal<never>;
  // A read's answer (3.4): one object each.
  interface Page<out Item, out Next, out P> {
    readonly page: "more" | "done" | "gone";
    readonly items: ReadonlyArray<Item>;
    readonly next?: Next;
    readonly through?: P | undefined;
  }
  function more<Item, Next, P = never>(answer: {
    readonly items: ReadonlyArray<Item>;
    readonly next: Next;
    readonly through?: P | undefined;
  }): Page<Item, Next, P>;
  function done<Item, P = never>(answer: {
    readonly items: ReadonlyArray<Item>;
    readonly proof: string;
    readonly through?: P | undefined;
  }): Page<Item, never, P>;
  function gone<Item = never, Next = never, P = never>(answer: {
    readonly reason: string;
    readonly items?: ReadonlyArray<Item>;
    readonly next?: Next;
    readonly through?: P | undefined;
  }): Page<Item, Next, P>;
  // Flow's own failure reasons (Q6).
  type Reason = "Closed" | "Overflow" | "Silent" | "Flapping" | "Defect" | "Interrupted";

  // 3.3: shaped as `Stream.callback<A, E, R>`. GUESS: `emit` takes any signal (unchecked at compile time, as the spec says) and the
  // returned Stream carries `Signal<never>`, so it fits a positioned `subscribe`.
  interface Emit<A, E> {
    (value: A | Signal<unknown>): Promise<void>;
    fail: (error: E) => void;
    end: () => void;
  }
  function callback<A, E = never, R = never>(
    register: (emit: Emit<A, E>) => Effect.Effect<void, never, R | Scope.Scope>,
  ): Stream.Stream<A | Signal<never>, E, Exclude<R, Scope.Scope>>;
}

// ---- Events, mappers --------------------------------------------------------------------------------------------
export interface Mapper<in A, in C = any> {
  readonly mapper: (a: A, ctx: C) => unknown;
}
export interface EventHandle<P> {
  (...payload: [keyof P] extends [never] ? [] : [P]): { readonly event: P };
  readonly is?: unknown;
  readonly payload: P;
  from: <A = any, C = any>(map: (a: A, ctx: C) => P) => Mapper<A, C>;
}
type NoPayload = { readonly payload: Record<string, never> };
type Mapped<A, C = any> = Mapper<A, C> | NoPayload;
type Handles<Ev extends Record<string, Fields>> = {
  readonly [K in keyof Ev]: EventHandle<TypeOf<Ev[K]>>;
};

// ---- stream (3.2) ---------------------------------------------------------------------------------------------------
// `while` and `schedule` are Effect.retry's. GUESS: `schedule` is any object here; the desk writes none.
type Reconnect<E> = { readonly while?: (e: E) => boolean; readonly schedule?: object };
type IdleTime = Duration.Input | "Infinity";

// 3.5: `failure` is exhaustive over E, retried tags included, plus `Feed`.
type FailureMap<E extends Tagged> = {
  readonly [T in E["_tag"]]: Mapped<Extract<E, { readonly _tag: T }>>;
} & { readonly Feed: Mapped<{ readonly _tag: Feed.Reason }> };

export interface EveryOutcomes<Out, E extends Tagged, CatchUp, F extends string | false> {
  readonly value: Mapped<Out>;
  readonly pages?: CatchUp extends true ? Mapper<ReadonlyArray<Out>> : never;
  readonly missed: Mapped<{ readonly why: "Unproven" | "Lost" | "Reset" }>;
  readonly fills: F; // 3.6: checked against the memory by `definition`
  readonly failure: FailureMap<E>;
}
export interface LatestOutcomes<Out, E extends Tagged> {
  readonly value?: Mapper<Out>;
  readonly failure?: FailureMap<E>;
}

export interface Binding<In, Kind extends "stream" | "write"> {
  readonly binding: Kind;
  readonly input: In;
}
export interface StreamContract<
  In,
  Out,
  E extends Tagged,
  D extends "every" | "latest",
  CatchUp,
> extends Binding<In, "stream"> {
  readonly out: Out;
  readonly errType?: E;
  outcomes: D extends "every"
    ? <const F extends string | false>(
        map: EveryOutcomes<Out, E, CatchUp, F>,
      ) => Binding<In, "stream"> & { readonly fillsKey: F }
    : (map: LatestOutcomes<Out, E>) => Binding<In, "stream">;
}

type Common<In extends Fields, Out extends Schema.Top, Key extends ReadonlyArray<keyof In>> = {
  readonly id: string;
  readonly input: In;
  readonly output: Out;
  readonly key: Key;
};

// `reconnect` and `idleTime` come together or not at all (3.2). A union by presence, so `while` still gets a contextual `e`.
type Reconnecting<E> =
  | { readonly reconnect: Reconnect<E>; readonly idleTime: IdleTime }
  | { readonly reconnect?: undefined; readonly idleTime?: undefined };

// `catchUp` requires `position` (3.2).
type Positioned<In extends Fields, Out extends Schema.Top, K extends keyof Out["Type"], N, E2> =
  | {
      readonly position: K;
      readonly catchUp?: (
        input: TypeOf<In>,
        context: {
          readonly from: Out["Type"][K] | undefined;
          readonly next: N | undefined;
          readonly signal: AbortSignal;
        },
      ) => Effect.Effect<Feed.Page<Out["Type"], NoInfer<N>, NoInfer<Out["Type"][K]>>, E2, unknown>;
    }
  | { readonly position?: undefined; readonly catchUp?: undefined };

// Property order is the spec's: subscribe, catchUp, then reconnect, idleTime, so `e` in `while` is typed.
export declare function stream<
  const In extends Fields,
  Out extends Schema.Top,
  const Key extends ReadonlyArray<keyof In>,
  E1 extends Tagged,
  E2 extends Tagged = never,
  K extends keyof Out["Type"] = never,
  N = Out["Type"][K],
>(
  config: Common<In, Out, Key> & {
    readonly delivers: "every";
    readonly subscribe: (
      input: TypeOf<In>,
      context: { readonly from: Out["Type"][K] | undefined; readonly signal: AbortSignal },
    ) => Stream.Stream<Out["Type"] | Feed.Signal<Out["Type"][K]>, E1, unknown>;
  } & Positioned<In, Out, K, N, E2> &
    Reconnecting<E1 | E2>,
): StreamContract<TypeOf<In>, Out["Type"], E1 | E2, "every", [K] extends [never] ? false : true>;

export declare function stream<
  const In extends Fields,
  Out extends Schema.Top,
  const Key extends ReadonlyArray<keyof In>,
  E1 extends Tagged,
>(
  config: Common<In, Out, Key> & {
    readonly delivers: "latest";
    readonly subscribe: (
      input: TypeOf<In>,
      context: { readonly signal: AbortSignal },
    ) => Stream.Stream<Out["Type"] | Feed.Signal<never>, E1, unknown>;
  } & Reconnecting<E1>,
): StreamContract<TypeOf<In>, Out["Type"], E1, "latest", false>;

// ---- Loose: a recursive "anything", which still gives callbacks a contextual `any` so bodies compile under noImplicitAny ------
// biome-ignore: stand-in
export type Loose =
  | ((...args: any[]) => any)
  | string
  | number
  | boolean
  | null
  | undefined
  | object
  | ReadonlyArray<Loose>
  | { readonly [key: string]: Loose };

// ---- listen, domain ---------------------------------------------------------------------------------------------
export declare function listen<In, Out, E extends Tagged, CatchUp>(
  contract: StreamContract<In, Out, E, "every", CatchUp>,
): {
  readonly as: (
    entities: ReadonlyArray<unknown>,
    map: (change: Out) => unknown,
  ) => Binding<In, "stream"> & {
    readonly outcomes: (map: { readonly failure: FailureMap<E> }) => Binding<In, "stream">;
  };
};
export declare function domain<const D extends Record<string, unknown>>(
  id: string,
  entries: D,
): any;

// ---- Outcome, transaction, resource ---------------------------------------------------------------------------
export declare namespace Outcome {
  interface Unknown<E> {
    readonly _tag: "Flow/Unknown";
    readonly reason: E;
  }
  interface Failure<E> {
    readonly _tag: "Flow/Failure";
    readonly reason: E;
  }
  function success<A>(value: A): Effect.Effect<A>;
  function unknown<E>(reason: E): Effect.Effect<never, Unknown<E>>;
  function failure<E>(reason: E): Effect.Effect<never, Failure<E>>;
}
export interface Write<In, Out, Progress> extends Binding<In, "write"> {
  readonly out: Out;
  readonly progressType?: Progress;
  outcomes: (map: Loose, options?: Loose) => Write<In, Out, Progress>;
  [member: string]: any;
}
type InType<I> = I extends Schema.Top ? I["Type"] : I extends Fields ? TypeOf<I> : never;
export declare function transaction<
  const In extends Fields | Schema.Top,
  Out extends Schema.Top = Schema.Void,
  Progress extends Fields = Record<never, never>,
>(config: {
  readonly id: string;
  readonly input: In;
  readonly key: ReadonlyArray<keyof InType<In> & string>;
  readonly output?: Out;
  readonly concurrency: "reject" | "latest" | "serialize" | "cancel" | "allow";
  readonly progress?: Progress;
  readonly orphaned?: Loose;
  readonly commit: (
    input: InType<In>,
    context: {
      readonly attempt: { readonly id: string; readonly mayHaveApplied: boolean };
      readonly signal: AbortSignal;
      readonly progress: (p: TypeOf<Progress>) => void;
    },
  ) => Effect.Effect<any, any, any>;
}): Write<InType<In>, Out["Type"], TypeOf<Progress>>;
// LOOSE: a resource is any-valued. Its members (outcomes, invalidate, setData, ...) are not checked.
export declare function resource(config: Loose): any;

// ---- Flow marks --------------------------------------------------------------------------------------------------
export interface Marked<T> {
  readonly marked: T;
}
export declare const Flow: {
  input: <S extends Schema.Top>(schema: S) => Marked<S["Type"]>;
  initial: <S extends Schema.Top>(
    schema: S,
    value: S["Type"] | ((...args: any[]) => S["Type"]),
  ) => Marked<S["Type"]>;
  optional: <S extends Schema.Top>(schema: S) => Marked<S["Type"] | undefined>;
  private: <S>(mark: S) => S;
  uncertain: <F>(fields: F) => F;
  Exit: <F>(fields: F) => any;
  Callback: <F>(fields?: F) => any;
  Guard: (...args: any[]) => any;
  entry: (...args: any[]) => any;
  state: <C>(config: C, ...rest: any[]) => C;
  annotate: (...args: any[]) => any;
  Denial: any;
};
export type Denial = { readonly _tag: "Denial"; readonly code: string };
export declare const deny: (reason: string, data?: unknown) => false & Denial;
export declare const check: (...args: any[]) => any;
export declare const inspect: (...args: any[]) => any;
export declare const send: (...args: any[]) => any;
export declare class FlowError extends Error {
  readonly code: string;
  readonly diagnostics: ReadonlyArray<any>;
  readonly [field: string]: any;
}
export declare const and: any,
  or: any,
  eq: any,
  lt: any,
  isNull: any,
  asc: any,
  desc: any,
  contains: any,
  read: any,
  write: any,
  entity: any,
  serverMatches: any;
export declare const app: (config: Loose) => any;
export declare const runtimeSetup: (config: Loose) => any;
export declare const trait: (config: Loose, build?: (context: any) => Loose) => any;
export declare const subroutine: (config: Loose, build?: (context: any) => Loose) => any;

// ---- definition, machine ------------------------------------------------------------------------------------------
type MemoryOf<M> = {
  readonly [K in keyof M]: M[K] extends Schema.Top
    ? M[K]["Type"]
    : M[K] extends Marked<infer T>
      ? T
      : any;
};

export interface StreamRow {
  readonly key?: unknown;
  readonly connection: "Connecting" | "Live" | "Ended";
  readonly drop?: { readonly reason: string; readonly at?: number };
  readonly failure?: unknown;
  readonly value?: any;
  readonly last?: { readonly value: any; readonly at: number };
  readonly catchingUp?: boolean;
}
// A stream's row is typed; every other row is any (LOOSE).
type RowsOf<Ops> = {
  readonly [K in keyof Ops]: Ops[K] extends { readonly binding: "stream"; readonly each?: never }
    ? StreamRow | undefined
    : any;
};
export interface Snapshot<St extends string, Mem, Ops, Nested extends string = never> {
  readonly state: St;
  readonly memory: Mem;
  readonly operations: RowsOf<Ops> & { readonly [K in Nested]: any }; // a fragment's rows: s.operations.<instance>.<name>
  readonly schedules: any;
}

// 2.11.7: an array, a Record or a number. Not a string, boolean, closed struct, optional or NullOr. A closed struct is told by no index signature.
type FillsKey<Mem> = {
  [K in keyof Mem]-?: Mem[K] extends ReadonlyArray<unknown> | number
    ? K
    : string extends keyof Mem[K]
      ? K
      : never;
}[keyof Mem] &
  string;

// 2.11.7: a stream operation's `fills` names a fillable field of this memory, or `false`. A wrong one does not compile.
type FillsChecked<Ops, Mem> = {
  readonly [K in keyof Ops]: Ops[K] extends { readonly fillsKey: infer F }
    ? F extends FillsKey<Mem> | false
      ? unknown
      : { readonly fills_must_name_a_list_record_or_number_field_of_memory: never }
    : unknown;
};
type NamesOfState<S> = S extends string ? S : S extends object ? keyof S & string : never;
// Instances declared on nested states (`Flow.state({ traits })`, a state holding `states`) address like root ones.
type IsAny<V> = 0 extends 1 & V ? true : false;
type DeepInstances<V> =
  IsAny<V> extends true
    ? never
    : V extends ReadonlyArray<infer I>
      ? DeepInstances<I>
      : V extends object
        ?
            | (V extends { readonly traits: infer T } ? keyof T & string : never)
            | { [K in keyof V]: DeepInstances<V[K]> }[keyof V]
        : never;
type NestedOfState<S> = S extends object ? (keyof S & string) | DeepInstances<S> : never;
type StatesOf<C> = C extends ReadonlyArray<infer S> ? S : C;

export interface OpHandle<B, Mem> {
  subscribe: B extends Binding<infer In, "stream">
    ? ((
        select: (s: { readonly memory: Mem; readonly [k: string]: any }) => In,
        options?: Loose,
      ) => unknown) & {
        each: (
          select: (s: { readonly memory: Mem; readonly [k: string]: any }) => ReadonlyArray<In>,
          options?: Loose,
        ) => unknown;
      }
    : any;
  refetch: any;
  bookmark: any;
  commit: any;
  lookup: any;
  retry: any;
  retryable: any;
  cancel: any;
  idle: any;
  get: any;
  readonly brand?: B;
  readonly [member: string]: any;
}
export interface Definition<St extends string, Ev, Iev, Mem, Ops, Nested extends string> {
  readonly S: { readonly [K in St]: any } & { readonly [K in Nested]: any } & {
    readonly root: any;
  };
  readonly E: Handles<Ev & Iev & {}> & { readonly [K in Nested]: any };
  readonly O: { readonly [K in keyof Ops]: OpHandle<Ops[K], Mem> };
  readonly Memory: { readonly Type: Mem };
  readonly mem?: Mem;
  readonly iev?: Iev;
  readonly snapshotType?: Snapshot<St, Mem, Ops, Nested>;
  readonly [member: string]: any;
}
export declare function definition<
  const States,
  const Ev extends Record<string, Fields> = {},
  const Iev extends Record<string, Fields> = {},
  const M extends Record<string, unknown> = {},
  Ops extends Record<string, unknown> = {},
  const Tr extends Record<string, unknown> = {},
>(config: {
  readonly id: string;
  readonly states: States;
  readonly events?: Ev;
  readonly internalEvents?: Iev;
  readonly memory?: M;
  readonly traits?: Tr;
  readonly operations?: (context: {
    readonly E: Handles<Iev>;
  }) => Ops & FillsChecked<Ops, MemoryOf<M>>;
  readonly [other: string]: any;
}): Definition<
  NamesOfState<StatesOf<States>> & string,
  Ev,
  Iev,
  MemoryOf<M> & { readonly [K in keyof Tr]: any } & {
    readonly [K in NestedOfState<StatesOf<States>>]: any;
  },
  Ops,
  (keyof Tr & string) | NestedOfState<StatesOf<States>>
>;

export interface Machine<D> {
  readonly definition: D;
}
// LOOSE: a machine's body is `Loose`. `S` and `O` are typed, so a wrong state or operation name fails; a wrong field in a handler does not.
export declare function machine<
  D extends { readonly S: unknown; readonly E: unknown; readonly O: unknown },
>(
  definition: D,
  build: (context: {
    readonly S: D["S"];
    readonly E: D["E"];
    readonly O: D["O"];
    readonly [k: string]: any;
  }) => Loose,
): Machine<D>;

export interface ActorRef<D> {
  readonly actor: D;
}
export declare function actorRef<D>(
  machine: Machine<D>,
  key: string | ReadonlyArray<string>,
  options?: { readonly persist?: boolean; readonly retain?: Duration.Input },
): ActorRef<D>;
