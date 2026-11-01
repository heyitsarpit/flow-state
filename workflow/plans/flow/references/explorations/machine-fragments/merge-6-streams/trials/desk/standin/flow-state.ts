// STAND-IN types for `flow-state`, written from the FINAL proposal-v3.md (3.1 to 3.6). Types only (`declare`): nothing runs. Where
// the spec is silent the guess is marked GUESS and listed in RESULTS.md. Not Flow code.
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
export interface Mapper<in A, in C = Record<string, never>> {
  readonly mapper: (a: A, ctx: C) => unknown;
}
export interface EventHandle<P> {
  (...payload: [keyof P] extends [never] ? [] : [P]): { readonly event: P };
  readonly payload: P;
  from: <A, C = Record<string, never>>(map: (a: A, ctx: C) => P) => Mapper<A, C>;
}
type NoPayload = { readonly payload: Record<string, never> };
type Mapped<A, C = Record<string, never>> = Mapper<A, C> | NoPayload;
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
  readonly missed: Mapped<unknown>;
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

// ---- listen, domain (6.7): unchanged by v3 except `failure` ---------------------------------------------------------------
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
export declare function domain<const D extends Record<string, unknown>>(id: string, entries: D): D;

// ---- transaction (unchanged by v3, 7.3) ---------------------------------------------------------------------------
export declare namespace Outcome {
  interface Unknown<E> {
    readonly unknownOutcome: E;
  }
  interface Failure<E> {
    readonly definite: E;
  }
  function unknown<E>(reason: E): Effect.Effect<never, Unknown<E>>;
  function failure<E>(reason: E): Effect.Effect<never, Failure<E>>;
}
export interface Write<In, Out, Progress> extends Binding<In, "write"> {
  readonly out: Out;
  readonly progressType?: Progress;
  outcomes: (map: {
    readonly success?: Mapper<Out, { readonly progress: Progress | undefined }>;
    readonly failure?: Readonly<
      Record<string, Mapped<never, { readonly progress: Progress | undefined }>>
    >;
    readonly unknown?: Readonly<
      Record<string, Mapped<never, { readonly progress: Progress | undefined }>>
    >;
  }) => Write<In, Out, Progress>;
}
export declare function transaction<
  const In extends Fields,
  const Key extends ReadonlyArray<keyof In>,
  Out extends Schema.Top = Schema.Void,
  Progress extends Fields = Record<never, never>,
>(
  config: Omit<Common<In, Out, Key>, "output"> & {
    readonly output?: Out;
    readonly concurrency?: "reject" | "cancel" | "allow";
    readonly progress?: Progress;
    readonly commit: (
      input: TypeOf<In>,
      context: {
        readonly attempt: { readonly id: string };
        readonly signal: AbortSignal;
        readonly progress: (p: TypeOf<Progress>) => void;
      },
    ) => Effect.Effect<Out["Type"], unknown, unknown>;
  },
): Write<TypeOf<In>, Out["Type"], TypeOf<Progress>>;

// ---- definition, machine ------------------------------------------------------------------------------------------
export interface Marked<T> {
  readonly marked: T;
}
export declare const Flow: {
  input: <S extends Schema.Top>(schema: S) => Marked<S["Type"]>;
  initial: <S extends Schema.Top>(schema: S, value: S["Type"]) => Marked<S["Type"]>;
};
type MemoryOf<M> = {
  readonly [K in keyof M]: M[K] extends Schema.Top
    ? M[K]["Type"]
    : M[K] extends Marked<infer T>
      ? T
      : never;
};
type Row<T = unknown> = {
  readonly connection: "Connecting" | "Live" | "Ended";
  readonly value: T | undefined;
};

export interface Lane<Progress> {
  readonly pending: boolean;
  readonly outstanding?: number;
  readonly progress?: Progress;
}
export interface StreamRow {
  readonly connection: "Connecting" | "Live" | "Ended";
  readonly drop?: { readonly reason: string };
  readonly value?: unknown;
  readonly last?: { readonly value: unknown; readonly at: number };
  readonly catchingUp?: boolean;
}
// GUESS: a stream's row, or a write's lanes. The spec shows `operations.suggest` only in the desk's old tests.
export type RowsOf<Ops> = {
  readonly [K in keyof Ops]: Ops[K] extends Binding<unknown, "stream">
    ? StreamRow | undefined
    : ReadonlyArray<Lane<unknown>>;
};
export interface Snapshot<St extends string, Mem, Ops> {
  readonly state: St;
  readonly memory: Mem;
  readonly operations: RowsOf<Ops>;
}

// 3.6: an array, a Record or a number. A string, boolean, closed struct or optional is not offered. GUESS on how "closed struct" is told
// from a Record: by an index signature.
type FillsKey<Mem> = {
  [K in keyof Mem]-?: Mem[K] extends ReadonlyArray<unknown> | number
    ? K
    : string extends keyof Mem[K]
      ? K
      : never;
}[keyof Mem] &
  string;

export interface Definition<
  St extends string,
  Ev extends Record<string, Fields>,
  Iev extends Record<string, Fields>,
  Mem,
  Ops,
> {
  readonly S: { readonly [K in St]: K };
  readonly E: Handles<Ev>;
  readonly O: { readonly [K in keyof Ops]: OpHandle<Ops[K], Mem> };
  readonly mem?: Mem;
  readonly iev?: Iev;
  readonly snapshotType?: Snapshot<St, Mem, Ops>;
}
// GUESS: the spec never says how `O.x.commit(select)` types `event`; the desk reads `event.prompt`, `event.memberId`. Loosened here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvent = { readonly [key: string]: any };
export interface OpHandle<B, Mem> {
  subscribe: B extends Binding<infer In, "stream">
    ? (select: (s: { readonly memory: Mem }) => In) => unknown
    : never;
  // 3.7: existing word, new meaning on a stream: forget the bookmark and read now.
  refetch: B extends Binding<infer In, "stream">
    ? (select?: (s: { readonly memory: Mem }) => Partial<In>) => unknown
    : never;
  commit: B extends Binding<infer In, "write">
    ? (select: (s: { readonly memory: Mem; readonly event: AnyEvent }) => In) => unknown
    : never;
  cancel: B extends Binding<unknown, "write">
    ? (select?: (s: { readonly memory: Mem }) => object) => unknown
    : never;
  readonly brand?: B;
}
export declare function definition<
  const St extends string,
  const Ev extends Record<string, Fields>,
  const Iev extends Record<string, Fields>,
  const M extends Record<string, Schema.Top | Marked<unknown>>,
  Ops extends Record<
    string,
    Binding<unknown, "stream" | "write"> & { readonly fillsKey?: FillsKey<MemoryOf<M>> | false }
  >,
  const Tr extends Record<string, { readonly copy: object }> = Record<never, never>,
>(config: {
  readonly id: string;
  readonly states: ReadonlyArray<St>;
  readonly events: Ev;
  readonly internalEvents: Iev;
  readonly memory: M;
  readonly traits?: Tr;
  readonly operations: (context: { readonly E: Handles<Iev> }) => Ops;
}): Definition<
  St,
  Ev & Iev,
  Iev,
  MemoryOf<M> & { readonly [K in keyof Tr]: ReadonlyArray<Tr[K]["copy"]> },
  Ops
>;

export declare function deny(reason: string): false;

type Guard<Mem, P> = (s: {
  readonly memory: Mem;
  readonly event: P;
  readonly operations: Record<string, Row | undefined>;
}) => boolean;
type Handler<St extends string, Mem, P> =
  | St
  | "self"
  | {
      readonly target: St | "self";
      readonly guard?: Guard<Mem, P> | ReadonlyArray<Guard<Mem, P>>;
      readonly updateMemory?: (s: { readonly memory: Mem; readonly event: P }) => Partial<Mem>;
      readonly actions?: ReadonlyArray<unknown>;
    };
type Handlers<St extends string, Ev extends Record<string, Fields>, Mem> = {
  readonly [K in keyof Ev]?:
    | Handler<St, Mem, TypeOf<Ev[K]>>
    | ReadonlyArray<Handler<St, Mem, TypeOf<Ev[K]>>>;
};
type Schedules<Mem> = Readonly<
  Record<
    string,
    {
      readonly schedule: Duration.Input | ((s: { readonly memory: Mem }) => Duration.Duration);
      readonly send: unknown;
    }
  >
>;
export interface Machine<D> {
  readonly definition: D;
}
export declare function machine<
  St extends string,
  Ev extends Record<string, Fields>,
  Iev extends Record<string, Fields>,
  Mem,
  Ops,
>(
  definition: Definition<St, Ev, Iev, Mem, Ops>,
  build: (context: {
    readonly S: { readonly [K in St]: K };
    readonly E: Handles<Iev>;
    readonly O: Definition<St, Ev, Iev, Mem, Ops>["O"];
  }) => {
    readonly default: St;
    readonly on?: Handlers<St, Ev, Mem>;
    readonly states: {
      readonly [K in St]: {
        readonly activities?: ReadonlyArray<unknown>;
        readonly schedules?: Schedules<Mem>;
        readonly on?: Handlers<St, Ev, Mem>;
      };
    };
  },
): Machine<Definition<St, Ev, Iev, Mem, Ops>>;

export interface ActorRef<D> {
  readonly actor: D;
}
export declare function actorRef<D>(
  machine: Machine<D>,
  key: string | ReadonlyArray<string>,
  options?: { readonly persist?: boolean; readonly retain?: Duration.Input },
): ActorRef<D>;
