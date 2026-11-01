// STAND-IN types for `flow-state/testing`: `Fake` as spelled in fakes-v2.md section 2, `Story` and the checkpoint reads as in
// stories-amended.md 1.1, 1.2, 2.10.6. Types only. Guesses are marked GUESS and listed in RESULTS.md. Not Flow code.
import type { Duration, Effect, Layer, Schema, Stream } from "effect";
import type { Socket } from "effect/socket";
import type { ActorRef, Binding, Lane, Machine, Write } from "flow-state";

type Fields = Schema.Struct.Fields;
type TypeOf<F extends Fields> = Schema.Struct<F>["Type"];

export interface Step {
  readonly step: string;
}
export interface SendItem {
  readonly send: string;
}

type ParamNames<K extends string> = K extends `${string}:${infer P}/${infer R}`
  ? P | ParamNames<`/${R}`>
  : K extends `${string}:${infer P}`
    ? P
    : never;

// A wire target in a Story: `Chat.socket.hold(...)`.
export interface Target<Req> {
  readonly requestType?: Req;
  hold: (options?: {
    readonly after?: number;
    readonly at?: "open" | "request" | "response";
    readonly match?: { readonly input?: Partial<Req> };
    readonly times?: number | "always";
  }) => Step;
  release: (options?: {
    readonly drop?: boolean;
    readonly nth?: number;
    readonly match?: { readonly input?: Partial<Req> };
  }) => Step;
  drop: (options?: {
    readonly at?: "open" | "request" | "response";
    readonly times?: number | "always";
  }) => Step;
  duplicate: (options?: { readonly times?: number }) => Step;
}
export interface Logged<Req> {
  readonly phase: string;
  readonly input: Req;
  readonly code?: number;
  readonly by?: "server" | "network" | "client";
}
export interface TruthHandle<T> {
  readonly truthType?: T;
}

export declare namespace Fake {
  class Lost {
    readonly _tag: "FakeLost";
  }
  class Refused {
    readonly _tag: "FakeRefused";
    readonly code: number;
  }
  class Closed {
    readonly _tag: "FakeClosed";
    readonly code: number;
    readonly reason?: string;
  }

  interface Result<T> {
    readonly truth?: T;
    readonly send?: ReadonlyArray<SendItem>;
  }
  interface OpenResult<T, Frame> extends Result<T> {
    readonly frames?: ReadonlyArray<Frame>;
    readonly refuse?: number;
    readonly end?: boolean;
  }
  interface StreamEndpoint<Req, Frame, Wire> {
    readonly kind: "stream";
    readonly requestType?: Req;
    readonly wireType?: Wire;
    frames: (where: (connection: Req) => boolean, frames: ReadonlyArray<Frame>) => SendItem;
    close: (where: (connection: Req) => boolean, code: number, reason?: string) => SendItem;
    end: (where: (connection: Req) => boolean) => SendItem;
  }
  interface CallEndpoint<Req> {
    readonly kind: "call";
    readonly requestType?: Req;
  }
  interface Control<A, T> {
    readonly kind: "control";
    readonly argsType?: A;
    readonly truthType?: T;
  }

  function stream<const R extends Fields, Fr, W, T = unknown>(config: {
    readonly request: R;
    readonly frame: Schema.Codec<Fr, W>;
    readonly open: (truth: T, request: TypeOf<R>) => OpenResult<NoInfer<T>, NoInfer<Fr>>;
  }): StreamEndpoint<TypeOf<R>, Fr, W>;

  function call<const R extends Fields, T = unknown>(config: {
    readonly request: R;
    readonly handle: (
      truth: T,
      request: TypeOf<R>,
    ) => Result<T> & {
      readonly response: {
        readonly status: number;
        readonly body?: unknown;
        readonly headers?: Record<string, string>;
      };
    };
  }): CallEndpoint<TypeOf<R>>;

  function control<const A extends Fields, T = unknown>(
    args: A,
    run: (truth: T, args: TypeOf<A>) => Result<T>,
  ): Control<TypeOf<A>, T>;

  type Client<Es> = {
    readonly [K in keyof Es as Es[K] extends { readonly kind: "call" } ? K : never]: Es[K] extends {
      readonly requestType?: infer Req;
    }
      ? (input: Req) => Effect.Effect<{ readonly status: number; readonly body?: unknown }, Lost>
      : never;
  } & {
    readonly [
      K in keyof Es as Es[K] extends { readonly kind: "stream" } ? K : never
    ]: Es[K] extends {
      readonly requestType?: infer Req;
      readonly wireType?: infer Wire;
    }
      ? (input: Req) => Stream.Stream<Wire, Lost | Refused | Closed>
      : never;
  };
  type Targets<Es> = {
    readonly [K in keyof Es]: Es[K] extends { readonly requestType?: infer Req }
      ? Target<Req> & Es[K]
      : never;
  };
  type Controls<Cs> = {
    readonly [K in keyof Cs]: Cs[K] extends { readonly argsType?: infer A }
      ? [keyof A] extends [never]
        ? (args?: A) => Step
        : (args: A) => Step
      : never;
  };
  type Server<Es, Cs, T> = Effect.Effect<Client<Es>> & TruthHandle<T> & Targets<Es> & Controls<Cs>;

  function server<
    const Es extends Record<string, { readonly kind: "stream" | "call" }>,
    const Cs extends Record<string, { readonly kind: "control" }>,
    const Tr extends Fields,
  >(
    name: string,
    config: {
      readonly truth: Tr;
      readonly initial: TypeOf<Tr>;
      readonly endpoints: Es;
      readonly controls?: Cs;
    },
  ): Server<Es, Cs, TypeOf<Tr>>;

  interface Route<Endpoint extends string, Params extends string> {
    readonly endpoint: Endpoint;
    readonly input: (context: {
      readonly params: { readonly [P in Params]: string };
      readonly query: Readonly<Record<string, string | undefined>>;
    }) => object;
  }
  function webSocket<Es, Cs, T, const Rs extends Record<string, unknown>>(
    server: Server<Es, Cs, T>,
    routes: Rs & { readonly [K in keyof Rs]: Route<keyof Es & string, ParamNames<K & string>> },
  ): Layer.Layer<Socket.WebSocketConstructor>;
}

// ---- Story --------------------------------------------------------------------------------------------------------
interface Reads {
  read: {
    <Req>(target: Target<Req>): ReadonlyArray<Logged<Req>>;
    <T>(target: TruthHandle<T>): T;
  };
  // Inspection at this cut. GUESS on the shape beyond `lanes`.
  readonly inspection: { readonly lanes: ReadonlyArray<unknown> };
  records: (
    kind: string,
    filter?: Readonly<Record<string, unknown>>,
  ) => ReadonlyArray<Readonly<Record<string, unknown>>>;
  lane: <B extends Binding<unknown, "write">>(
    op: { readonly brand?: B },
    key?: Readonly<Record<string, string>>,
  ) => (B extends Write<unknown, unknown, infer P> ? Lane<P> : never) | undefined;
}
type SnapOf<M> = M extends Machine<{ readonly snapshotType?: infer Sn }> ? Sn : never;
export type Checkpoint<M> = SnapOf<M> & Reads;
export interface AppCheckpoint extends Reads {
  // The Ticket record as a view reads it. GUESS on `entity`'s argument types.
  entity: (
    entity: object,
    key: Readonly<Record<string, string>>,
  ) => { readonly data: { readonly title: string } } | undefined;
  readonly read: Reads["read"] &
    (<D>(
      ref: ActorRef<D>,
    ) => (D extends { readonly snapshotType?: infer Sn } ? Sn : never) | undefined);
}

type Fixture = Layer.Layer<never, unknown, unknown>;
export interface StoryBuilder<M, Names extends string> {
  send: (...events: ReadonlyArray<{ readonly event: unknown }>) => StoryBuilder<M, Names>;
  world: (...steps: ReadonlyArray<Step>) => StoryBuilder<M, Names>;
  advance: (
    to: Duration.Input | { readonly next: { readonly operation: unknown; readonly timer: string } },
  ) => StoryBuilder<M, Names>;
  reload: (tab?: string) => StoryBuilder<M, Names>;
  checkpoint: <N extends string>(name: N) => StoryBuilder<M, Names | N>;
  run: () => Promise<{ readonly checkpoints: { readonly [N in Names]: Checkpoint<M> } }>;
}
export interface AppBuilder<Names extends string> {
  ensure: <D>(
    ref: ActorRef<D>,
    options: { readonly input: Readonly<Record<string, string>> },
  ) => AppBuilder<Names>;
  send: <D>(
    ref: ActorRef<D>,
    ...events: ReadonlyArray<{ readonly event: unknown }>
  ) => AppBuilder<Names>;
  world: (...steps: ReadonlyArray<Step>) => AppBuilder<Names>;
  advance: (
    to: Duration.Input | { readonly next: { readonly operation: unknown; readonly timer: string } },
  ) => AppBuilder<Names>;
  reload: (tab?: string) => AppBuilder<Names>;
  checkpoint: <N extends string>(name: N) => AppBuilder<Names | N>;
  run: () => Promise<{ readonly checkpoints: { readonly [N in Names]: AppCheckpoint } }>;
}
export declare namespace Story {
  function machine<M>(
    machine: M,
    options: {
      readonly id: string;
      readonly input?: Readonly<Record<string, string>>;
      readonly fixtures?: ReadonlyArray<Fixture>;
      readonly world?: ReadonlyArray<Step>;
    },
  ): StoryBuilder<M, never>;
  function app(
    setup: object,
    options: {
      readonly id: string;
      readonly fixtures?: ReadonlyArray<Fixture>;
      readonly world?: ReadonlyArray<Step>;
    },
  ): AppBuilder<never>;
}
