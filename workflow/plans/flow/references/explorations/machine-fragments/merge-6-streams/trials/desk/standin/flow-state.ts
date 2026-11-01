// STAND-IN types for `flow-state`, written from proposal-v3.md sections 4, 7 and 2.1. Types only (`declare`): nothing
// runs. Where the spec is silent the guess is marked GUESS and listed in RESULTS.md. Not Flow code.
import type { Duration, Effect, Schema, Scope, Stream } from "effect";

type Fields = Schema.Struct.Fields;
type TypeOf<F extends Fields> = Schema.Struct<F>["Type"];
type ErrorClass = abstract new (...args: never[]) => { readonly _tag: string };
type TagsOf<Errs extends ReadonlyArray<ErrorClass>> = InstanceType<Errs[number]>["_tag"];
type ErrorsOf<Errs extends ReadonlyArray<ErrorClass>> = InstanceType<Errs[number]>;

// ---- Feed (4. Signals, 3. Q3) -------------------------------------------------------------------------------------
export declare namespace Feed {
  // `P` is the position type a signal can carry (`at`, `restartAt`); `never` when it carries none.
  interface Signal<out P> {
    readonly signal: "live" | "down" | "ping";
    readonly place?: P;
  }
  function live(): Signal<never>;
  function live(options: { readonly proof: string }): Signal<never>;
  function live<P>(options: { readonly at: P }): Signal<P>;
  function live<P>(options: { readonly restartAt: P }): Signal<P>;
  function down(reason: unknown): Signal<never>;
  const ping: Signal<never>;
  // A read's answer (R7). `Next` is the token the next read gets as `next`.
  interface Page<out Item, out Next, out P> {
    readonly page: "more" | "done" | "gone";
    readonly items: ReadonlyArray<Item>;
    readonly next?: Next;
    readonly at?: P | undefined;
  }
  function more<Item, Next, P = never>(
    items: ReadonlyArray<Item>,
    next: Next,
    options?: { readonly at?: P | undefined },
  ): Page<Item, Next, P>;
  function done<Item, P = never>(
    items: ReadonlyArray<Item>,
    options?: { readonly at?: P | undefined },
  ): Page<Item, never, P>;
  function gone<Item = never, Next = never, P = never>(
    reason: string,
    options?: {
      readonly items?: ReadonlyArray<Item>;
      readonly next?: Next;
      readonly at?: P | undefined;
    },
  ): Page<Item, Next, P>;
  // Flow's own failure reasons (Q6). GUESS: the spec lists the names, not the class.
  type Reason = "Closed" | "Overflow" | "Silent" | "Flapping" | "Defect" | "Interrupted";
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

// ---- stream (4. The API) ----------------------------------------------------------------------------------------
type Reconnect<Errs extends ReadonlyArray<ErrorClass>> = {
  readonly while: ReadonlyArray<TagsOf<Errs>>;
  readonly schedule?: object; // GUESS: Effect's Schedule; not exercised by the desk
};
type Timing<Rc, Idle extends Duration.Input | "never"> = [Rc] extends [undefined]
  ? { readonly idle?: undefined }
  : { readonly idle: Idle };
type Retried<Rc> = Rc extends { readonly schedule: object }
  ? never
  : Rc extends { readonly while: ReadonlyArray<infer T extends string> }
    ? T
    : never;

export interface Emit<Out, P, Errs> {
  (value: Out | Feed.Signal<P>): Promise<void>; // 4. "emit resolves when there is room"
  fail: (error: Errs) => void;
  end: () => void;
}
export interface Context<Out, P, Next, Errs> {
  readonly from: P | undefined;
  readonly signal: AbortSignal;
  readonly callback: <R>(
    register: (emit: Emit<Out, P, Errs>) => Effect.Effect<void, never, R | Scope.Scope>,
  ) => Stream.Stream<Out | Feed.Signal<P>, Errs, Exclude<R, Scope.Scope>>;
  readonly _next?: Next;
}

type FailureMap<Errs extends ReadonlyArray<ErrorClass>, Rc> = {
  readonly [T in Exclude<TagsOf<Errs>, Retried<Rc>>]: Mapped<
    Extract<ErrorsOf<Errs>, { readonly _tag: T }>
  >;
} & { readonly Feed: Mapped<{ readonly _tag: Feed.Reason }> };

export interface EveryOutcomes<Out, Errs extends ReadonlyArray<ErrorClass>, Rc, CatchUp> {
  readonly value: Mapped<Out>;
  readonly pages?: CatchUp extends true ? Mapper<ReadonlyArray<Out>> : never;
  readonly missed: Mapped<unknown>;
  // GUESS: `fills` is a memory field name (or false). The spec does not say how `outcomes` sees the memory, so the stand-in
  // cannot check the name or that the field has an emptiness. See RESULTS.md.
  readonly fills: string | false;
  readonly failure: FailureMap<Errs, Rc>;
}
export interface LatestOutcomes<Out, Errs extends ReadonlyArray<ErrorClass>, Rc> {
  readonly value?: Mapper<Out>;
  readonly failure?: FailureMap<Errs, Rc>;
}

export interface Binding<In, Kind extends "stream" | "write"> {
  readonly binding: Kind;
  readonly input: In;
}
export interface StreamContract<
  In,
  Out,
  Errs extends ReadonlyArray<ErrorClass>,
  D extends "every" | "latest",
  Rc,
  CatchUp,
> extends Binding<In, "stream"> {
  readonly out: Out;
  readonly errsType?: Errs;
  readonly rcType?: Rc;
  outcomes: (
    map: D extends "every" ? EveryOutcomes<Out, Errs, Rc, CatchUp> : LatestOutcomes<Out, Errs, Rc>,
  ) => Binding<In, "stream">;
}

type Common<In extends Fields, Out extends Schema.Top, Key extends ReadonlyArray<keyof In>> = {
  readonly id: string;
  readonly input: In;
  readonly output: Out;
  readonly key: Key;
};

export declare function stream<
  const In extends Fields,
  Out extends Schema.Top,
  const Key extends ReadonlyArray<keyof In>,
  const Errs extends ReadonlyArray<ErrorClass> = readonly [],
  const Rc extends Reconnect<Errs> | undefined = undefined,
  const Idle extends Duration.Input | "never" = "never",
  K extends keyof Out["Type"] = never,
  N = Out["Type"][K],
>(
  config: Common<In, Out, Key> & {
    readonly delivers: "every";
    readonly errors?: Errs;
    readonly reconnect?: Rc;
    readonly position?: K;
    readonly subscribe: (
      input: TypeOf<In>,
      context: Context<Out["Type"], Out["Type"][K], N, ErrorsOf<Errs>>,
    ) => Stream.Stream<Out["Type"] | Feed.Signal<Out["Type"][K]>, ErrorsOf<Errs>, unknown>;
    readonly catchUp?: [K] extends [never]
      ? undefined
      : (
          input: TypeOf<In>,
          context: {
            readonly from: Out["Type"][K] | undefined;
            readonly next: N | undefined;
            readonly signal: AbortSignal;
          },
        ) => Effect.Effect<
          Feed.Page<Out["Type"], NoInfer<N>, NoInfer<Out["Type"][K]>>,
          ErrorsOf<Errs>,
          unknown
        >;
  } & Timing<Rc, Idle>,
): StreamContract<TypeOf<In>, Out["Type"], Errs, "every", Rc, [K] extends [never] ? false : true>;

export declare function stream<
  const In extends Fields,
  Out extends Schema.Top,
  const Key extends ReadonlyArray<keyof In>,
  const Errs extends ReadonlyArray<ErrorClass> = readonly [],
  const Rc extends Reconnect<Errs> | undefined = undefined,
  const Idle extends Duration.Input | "never" = "never",
>(
  config: Common<In, Out, Key> & {
    readonly delivers: "latest";
    readonly errors?: Errs;
    readonly reconnect?: Rc;
    readonly subscribe: (
      input: TypeOf<In>,
      context: Context<Out["Type"], never, never, ErrorsOf<Errs>>,
    ) => Stream.Stream<Out["Type"] | Feed.Signal<never>, ErrorsOf<Errs>, unknown>;
  } & Timing<Rc, Idle>,
): StreamContract<TypeOf<In>, Out["Type"], Errs, "latest", Rc, false>;

// ---- listen, domain (7.5): unchanged by v3 except `failure` ---------------------------------------------------------------
export interface ListenContract<In> extends Binding<In, "stream"> {
  outcomes: (map: {
    readonly failure: Readonly<Record<string, Mapped<never>>>;
  }) => Binding<In, "stream">;
}
export declare function listen<In, Out, Errs extends ReadonlyArray<ErrorClass>, Rc, CatchUp>(
  contract: StreamContract<In, Out, Errs, "every", Rc, CatchUp>,
): {
  readonly as: (
    entities: ReadonlyArray<unknown>,
    map: (change: Out) => unknown,
  ) => ListenContract<In> & {
    readonly outcomes: (map: { readonly failure: FailureMap<Errs, Rc> }) => Binding<In, "stream">;
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
  Ops extends Record<string, Binding<unknown, "stream" | "write">>,
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
type Schedules = Readonly<
  Record<
    string,
    {
      readonly schedule: Duration.Input | ((s: never) => Duration.Duration);
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
        readonly schedules?: Schedules;
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
