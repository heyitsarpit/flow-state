// STAND-IN types for `flow-state/testing`: `Fake` and `Story` as machine-design 2.10 spells them. Types only: nothing runs and this is
// not Flow code. Copied from the desk trial's stand-in and widened to every Story kind and step. GUESS marks what 2.10 leaves open.
import type { Duration, Effect, Layer, Schema, Stream } from "effect";
import type { Socket } from "effect/socket";
import type { FetchHttpClient } from "effect/http";
import type { ActorRef, Loose, Machine, Snapshot } from "flow-state";

type Fields = Schema.Struct.Fields;
type TypeOf<F extends Fields> = Schema.Struct<F>["Type"];

export type Address = {
  readonly actor?: unknown;
  readonly instance?: ReadonlyArray<string>;
  readonly copy?: string;
  readonly tab?: string;
  readonly operation?: unknown;
  readonly purpose?: "acknowledge" | "capture" | "flush";
  readonly input?: Readonly<Record<string, unknown>>;
  readonly key?: unknown;
  readonly n?: number;
  readonly schedule?: string;
  readonly timer?: "backoff" | "page" | "healthy" | "idle";
  readonly since?: string;
  readonly [kindField: string]: unknown;
};
export interface WireStep {
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

interface HoldOptions {
  readonly after?: number;
  readonly at?: "request" | "response" | "frames" | "open";
  readonly match?: Address;
  readonly times?: number | "always";
}
export interface Target<Req> {
  readonly requestType?: Req;
  hold: (options?: HoldOptions) => WireStep;
  release: (options?: {
    readonly drop?: boolean;
    readonly nth?: number;
    readonly match?: Address;
  }) => WireStep;
  drop: (options?: {
    readonly at?: "request" | "response" | "open";
    readonly times?: number | "always";
    readonly match?: Address;
  }) => WireStep;
  duplicate: (options?: { readonly times?: number; readonly match?: Address }) => WireStep;
}
export interface HandleTarget {
  hold: (options?: Omit<HoldOptions, "at" | "after">) => WireStep;
  release: (options?: {
    readonly drop?: boolean;
    readonly nth?: number;
    readonly match?: Address;
  }) => WireStep;
  drop: (options?: { readonly times?: number | "always"; readonly match?: Address }) => WireStep;
  duplicate: (options?: { readonly times?: number; readonly match?: Address }) => WireStep;
}
export interface Logged<Req> {
  readonly n: number;
  readonly phase: string;
  readonly input: Req;
  readonly via: Address & {
    readonly attempts?: ReadonlyArray<string>;
    readonly tab: { readonly name: string; readonly open: number };
  };
  readonly code?: number;
  readonly reason?: string;
  readonly by?: "server" | "network" | "client";
}
export interface TruthHandle<T> {
  readonly truthType: T;
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
  interface CallEndpoint<Req, Res> {
    readonly kind: "call";
    readonly requestType?: Req;
    readonly responseType?: Res;
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
    readonly ping?: { readonly every: Duration.Input; readonly frame: NoInfer<Fr> };
  }): StreamEndpoint<TypeOf<R>, Fr, W>;
  // W14: `handle` returns an object. A tuple does not compile.
  function call<const R extends Fields, Res, T = unknown>(config: {
    readonly request: R;
    readonly handle: (
      truth: T,
      request: TypeOf<R>,
    ) => Result<NoInfer<T>> & { readonly response: Res };
  }): CallEndpoint<TypeOf<R>, Res>;
  function control<const A extends Fields, T = unknown>(
    args: A,
    run: (truth: T, args: TypeOf<A>) => Result<NoInfer<T>>,
  ): Control<TypeOf<A>, T>;

  type Client<Es> = {
    readonly [
      K in keyof Es as Es[K] extends { readonly kind: "call" } ? K : never
    ]: Es[K] extends CallEndpoint<infer Req, infer Res>
      ? (input: Req) => Effect.Effect<Res, Lost>
      : never;
  } & {
    readonly [
      K in keyof Es as Es[K] extends { readonly kind: "stream" } ? K : never
    ]: Es[K] extends StreamEndpoint<infer Req, any, infer Wire>
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
        ? (args?: A) => WireStep
        : (args: A) => WireStep
      : never;
  };
  type Server<Es, Cs, T> = Effect.Effect<Client<Es>> &
    TruthHandle<T> &
    Targets<Es> &
    Controls<Cs> &
    HandleTarget;

  function server<
    const Tr extends Fields,
    const Es extends Record<string, { readonly kind: "stream" | "call" }>,
    const Cs extends Record<string, { readonly kind: "control" }> = {},
  >(
    name: string,
    config: {
      readonly truth: Tr;
      readonly initial: NoInfer<TypeOf<Tr>>;
      readonly endpoints: Es;
      readonly controls?: Cs;
    },
  ): Server<Es, Cs, TypeOf<Tr>>;

  interface Route<Endpoint extends string, Params extends string> {
    readonly endpoint: Endpoint | ((context: any) => string);
    readonly input: (context: {
      readonly params: { readonly [P in Params]: string };
      readonly query: Readonly<Record<string, string | undefined>>;
      readonly body: any;
      readonly headers: Headers;
    }) => object;
  }
  type Routes<Es, Rs> = {
    readonly [K in keyof Rs]:
      | Route<keyof Es & string, ParamNames<K & string>>
      | (keyof Es & string);
  };
  function webSocket<Es, Cs, T, const Rs extends Record<string, unknown>>(
    server: Server<Es, Cs, T>,
    routes: Rs & Routes<Es, Rs>,
  ): Layer.Layer<Socket.WebSocketConstructor>;
  // W16: `Fake.fetch` routes by method and path. The function form stays.
  function fetch<Es, Cs, T, const Rs extends Record<string, unknown>>(
    server: Server<Es, Cs, T>,
    routes: (Rs & Routes<Es, Rs>) | ((request: Request) => unknown),
  ): Layer.Layer<typeof FetchHttpClient.Fetch>;
  const storage: TruthHandle<ReadonlyArray<unknown>> &
    HandleTarget & {
      readonly write: Target<unknown>;
      readonly read: Target<unknown>;
      seed: (records: Loose) => StorageSeed;
      from: (story: { readonly run: unknown }) => StorageSeed;
    };
}
export interface StorageSeed {
  readonly storage: unknown;
}

// ---- reads ----------------------------------------------------------------------------------------------------
type RecordKind =
  | "step"
  | "verdict"
  | "ending"
  | "lane"
  | "life"
  | "callback"
  | "exit"
  | "listRepair"
  | "drop"
  | "schedule"
  | "queue"
  | "store"
  | "session"
  | "request"
  | "control"
  | "delivery"
  | "issue"
  | "diagnostic"
  | "persistence"
  | "hydration"
  | "entry";
export type EvidenceRecord = {
  readonly seq: number;
  readonly tab: { readonly name: string; readonly open: number };
  readonly [field: string]: any;
};
export interface Reads {
  read: {
    <T>(fake: TruthHandle<T>): T;
    <Req>(endpoint: Target<Req>): ReadonlyArray<Logged<Req>>;
    <D extends { readonly snapshotType?: unknown }>(
      ref: ActorRef<D>,
    ): NonNullable<D["snapshotType"]> | undefined;
    (address: { readonly actor: unknown; readonly tab?: string }): any;
  };
  records: (kind: RecordKind, filter?: Address) => ReadonlyArray<EvidenceRecord>;
  // Every read of `lane` is undefined when the lane does not exist (SC3). GUESS: the row's fields beyond 2.10.6's listing are any.
  lane: (operationOrAddress: unknown, key?: unknown) => any;
  attempt: (operation: unknown, address?: Address) => string | undefined;
  readonly now: number;
  readonly inspection: any;
  readonly tabs: { readonly [name: string]: { readonly inspection: any } | undefined };
  entity: (
    entity: unknown,
    key: unknown,
    options?: { readonly tab?: string },
  ) =>
    | {
        readonly data: any;
        readonly predicted: boolean;
        readonly uncertain: boolean;
        readonly unconfirmed: ReadonlyArray<string>;
      }
    | undefined;
  serverView: (label: string) => any;
}
type SnapOf<M> = M extends Machine<{ readonly snapshotType?: infer Sn }> ? NonNullable<Sn> : any;
// A machine or fragment cut: the reads, plus `state`, `memory`, `operations`, `schedules` and `read()`.
export type Checkpoint<M> = SnapOf<M> &
  Omit<Reads, "read"> & { read: Reads["read"] & (() => SnapOf<M> | undefined) };
export type AppCheckpoint = Reads;

// A step's data form (2.10.1).
export type StepData =
  | WireStep
  | { readonly event: unknown }
  | { readonly send: ReadonlyArray<unknown> }
  | { readonly world: ReadonlyArray<WireStep> }
  | { readonly advance: unknown }
  | { readonly together: ReadonlyArray<unknown> }
  | { readonly ensure: ReadonlyArray<unknown> }
  | { readonly dispose: ReadonlyArray<unknown> }
  | { readonly enter: ReadonlyArray<unknown> }
  | { readonly leave: unknown }
  | { readonly reset: unknown }
  | { readonly guards: unknown }
  | { readonly setContext: unknown }
  | { readonly openTab: ReadonlyArray<unknown> }
  | { readonly closeTab: string }
  | { readonly reload: string }
  | { readonly dehydrate: ReadonlyArray<unknown> }
  | { readonly hydrate: ReadonlyArray<unknown> };

export declare namespace Story {
  type Step = StepData;
  type Frame<M = never> = [M] extends [never] ? AppCheckpoint : Checkpoint<M>;
}
type Advance = Duration.Input | { readonly next: Address } | { readonly to: number };
export interface RunResult<C, Names extends string> {
  readonly checkpoints: { readonly [N in Names]: C };
  readonly end: C;
  readonly frames: ReadonlyArray<C> & { readonly truncated: boolean };
  readonly evidence: ReadonlyArray<EvidenceRecord>;
  readonly payloads: Readonly<Record<string, unknown>>;
  readonly steps: ReadonlyArray<unknown>;
  readonly trace: unknown;
}
type CheckpointName<N extends string> = N extends "end" ? never : N;
type CheckpointAt = { readonly at?: Loose };
interface Common<Self, C, Names extends string> {
  world: (...controls: ReadonlyArray<WireStep>) => Self;
  advance: (to: Advance, options?: { readonly suspended: boolean | string }) => Self;
  together: (...inputs: ReadonlyArray<StepData>) => Self;
  run: () => Promise<RunResult<C, Names>>;
}
export interface MachineStory<M, Names extends string> extends Common<
  MachineStory<M, Names>,
  Checkpoint<M>,
  Names
> {
  send: (...events: ReadonlyArray<{ readonly event: unknown }>) => MachineStory<M, Names>;
  setContext: (context: Loose) => MachineStory<M, Names>;
  dispose: (options?: { readonly how: "now" | "forget" }) => MachineStory<M, Names>;
  ensure: () => MachineStory<M, Names>;
  checkpoint: <N extends string>(
    name: CheckpointName<N>,
    options?: CheckpointAt,
  ) => MachineStory<M, Names | N>;
}
export interface FragmentStory<F, Names extends string> extends Common<
  FragmentStory<F, Names>,
  any,
  Names
> {
  send: (...events: ReadonlyArray<{ readonly event: unknown }>) => FragmentStory<F, Names>;
  enter: (input?: Loose, options?: { readonly subject?: string }) => FragmentStory<F, Names>;
  leave: (options?: { readonly end: boolean }) => FragmentStory<F, Names>;
  guards: (answers: Loose) => FragmentStory<F, Names>;
  reset: (subject: string) => FragmentStory<F, Names>;
  checkpoint: <N extends string>(
    name: CheckpointName<N>,
    options?: CheckpointAt,
  ) => FragmentStory<F, Names | N>;
}
export interface AppStory<Names extends string> extends Common<
  AppStory<Names>,
  AppCheckpoint,
  Names
> {
  ensure: (ref: unknown, options?: Loose) => AppStory<Names>;
  dispose: (ref: unknown, options?: { readonly how: "now" | "forget" }) => AppStory<Names>;
  send: (target: unknown, ...events: ReadonlyArray<{ readonly event: unknown }>) => AppStory<Names>;
  openTab: (name: string, options?: { readonly from?: string }) => AppStory<Names>;
  closeTab: (name: string) => AppStory<Names>;
  reload: (name?: string) => AppStory<Names>;
  dehydrate: (label: string, options: { readonly within: Duration.Input }) => AppStory<Names>;
  hydrate: (source: AppStory<any>, label?: string) => AppStory<Names>;
  checkpoint: <N extends string>(
    name: CheckpointName<N>,
    options?: CheckpointAt,
  ) => AppStory<Names | N>;
}
type Fixture = Layer.Layer<any, any, any>;
interface Options {
  readonly id: string;
  readonly fixtures?: ReadonlyArray<Fixture>;
  readonly world?: ReadonlyArray<StepData>;
  readonly seed?: number;
}
export declare namespace Story {
  function app(
    setup: unknown,
    options: Options & { readonly storage?: StorageSeed },
  ): AppStory<never>;
  function machine<D>(
    machine: Machine<D>,
    options: Options & { readonly input?: Loose; readonly context?: Loose },
  ): MachineStory<Machine<D>, never>;
  function fragment<F>(fragment: F, options: Options): FragmentStory<F, never>;
}

// ---- propertyTest (2.10.16) -------------------------------------------------------------------------------------
type Violation = (frame: any) => unknown;
export declare function propertyTest(
  story: { readonly run: unknown },
  options: {
    readonly steps: ReadonlyArray<
      ReadonlyArray<StepData> | { readonly sample: Loose; readonly shrink?: Loose }
    >;
    readonly properties?: Readonly<Record<string, Violation>>;
    readonly whenQuiet?: Readonly<Record<string, Violation>>;
    readonly seed: number;
    readonly runs?: number;
    readonly length?: number;
    readonly quietWithin?: Duration.Input;
  },
): Promise<{ readonly _tag: "Pass"; readonly seed: number; readonly runs: number }>;
export declare function domainPropertyOptions(
  domains: ReadonlyArray<unknown>,
  inputs?: Loose,
): {
  readonly steps: ReadonlyArray<ReadonlyArray<StepData>>;
  readonly properties: Readonly<Record<string, Violation>>;
  readonly whenQuiet: Readonly<Record<string, Violation>>;
  readonly quietWithin: Duration.Input;
};

// ---- the rest of the module: unchecked -----------------------------------------------------------------------------
export declare const StoryFrame: any;
export type Step = StepData;
export declare const StoryPlayer: any;
export declare const defineConfig: (config: Loose) => any;
export declare const definePresentation: (...args: any[]) => any;
