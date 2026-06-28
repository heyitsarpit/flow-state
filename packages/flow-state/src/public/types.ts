import type { Effect, Exit, Layer, ManagedRuntime, Option, Stream } from "effect";
import type * as Duration from "effect/Duration";
import type { HostSignals } from "../services/host-signals.js";
import type { NotificationScheduler } from "../services/notification-scheduler.js";
import type { OrchestratorSystem } from "../services/orchestrator-system.js";
import type { ResourceStore } from "../services/resource-store.js";
import type { TraceLog } from "../services/trace.js";

import type { FlowConcurrencyPolicy, SelectionSource } from "../shared-contracts.js";

export type { FlowConcurrencyPolicy, SelectionSource } from "../shared-contracts.js";

declare const flowKeyBrand: unique symbol;
declare const flowTagBrand: unique symbol;

export type FlowKey = ReadonlyArray<unknown> & {
  readonly [flowKeyBrand]: "FlowKey";
};

export type FlowTag<TId extends string = string> = Readonly<{
  readonly kind: "tag";
  readonly id: TId;
  readonly [flowTagBrand]: "FlowTag";
}>;

export type FlowEvent = Readonly<{
  readonly type: string;
}>;

type BivariantCallback<Args, Result> = {
  bivarianceHack(args: Args): Result;
}["bivarianceHack"];

export type FlowResourceStatus = "idle" | "loading" | "success" | "failure" | "stale";
export type FlowResourceAvailability = "empty" | "value" | "failure";
export type FlowResourceActivity = "idle" | "fetching" | "paused";
export type FlowResourceFreshnessStatus = "fresh" | "stale" | "invalidated";
export type FlowTransactionStatus =
  | "idle"
  | "pending"
  | "success"
  | "failure"
  | "queued"
  | "interrupt";
export type FlowStreamStatus = "idle" | "running" | "success" | "failure" | "interrupt";
export type FlowTimerStatus = "scheduled" | "fired" | "interrupt";

export type FlowReceipt = Readonly<{
  readonly type: string;
  readonly id?: string;
  readonly requestId?: string;
  readonly source?: string;
  readonly [key: string]: unknown;
}>;

export type FlowIssue = Readonly<{
  readonly kind: "failure" | "defect" | "interrupt";
  readonly source: "resource" | "transaction" | "machine" | "stream" | "child";
  readonly id: string;
  readonly error?: unknown;
  readonly cause?: unknown;
  readonly handled?: boolean;
}>;

export type FlowChildSnapshot = Readonly<{
  readonly id: string;
  readonly actorId?: string;
  readonly status: "idle" | "active" | "success" | "failure" | "interrupt" | "stopped";
  readonly state?: string;
  readonly snapshot?: FlowActorSnapshotTree;
  readonly parentState?: string;
  readonly supervision?: "stop-on-failure" | "continue-on-failure";
}>;

export type FlowActorSnapshotTree = Readonly<{
  readonly value: string;
  readonly context: unknown;
  readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
  readonly transactions: Readonly<Record<string, FlowTransactionSnapshot>>;
  readonly streams: Readonly<Record<string, FlowStreamSnapshot>>;
  readonly timers: Readonly<Record<string, FlowTimerSnapshot>>;
  readonly children: Readonly<Record<string, FlowChildSnapshot>>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export type FlowResourceSnapshot<Value = unknown, Error = unknown> = Readonly<{
  readonly id: string;
  readonly status: FlowResourceStatus;
  readonly availability: FlowResourceAvailability;
  readonly activity: FlowResourceActivity;
  readonly freshness: FlowResourceFreshnessStatus;
  readonly value?: Value;
  readonly previousValue?: Value;
  readonly placeholder?: Value;
  readonly error?: Error;
  readonly updatedAt?: number;
  readonly invalidatedAt?: number;
  readonly expiresAt?: number;
  readonly requestId?: string;
  readonly isPlaceholderData: boolean;
}>;

export type FlowTransactionSnapshot<Value = unknown, Error = unknown> = Readonly<{
  readonly id: string;
  readonly status: FlowTransactionStatus;
  readonly value?: Value;
  readonly error?: Error;
}>;

export type FlowStreamSnapshot<Value = unknown, Error = unknown> = Readonly<{
  readonly id: string;
  readonly status: FlowStreamStatus;
  readonly generation?: number;
  readonly emitted?: number;
  readonly value?: Value;
  readonly error?: Error;
}>;

export type FlowTimerSnapshot = Readonly<{
  readonly id: string;
  readonly status: FlowTimerStatus;
  readonly generation: number;
  readonly parentState: string;
  readonly startedAt: number;
  readonly dueAt: number;
  readonly endedAt?: number;
}>;

export type FlowTestStreamSnapshot<Value = unknown, Error = unknown> = FlowStreamSnapshot<
  Value,
  Error
> &
  Readonly<{
    readonly generation: number;
    readonly emitted: number;
  }>;

export type FlowSnapshot<
  Context,
  State extends string,
  Event extends FlowEvent = FlowEvent,
> = Readonly<{
  readonly machine: Readonly<{
    readonly kind: "machine";
    readonly id: string;
    readonly config: Readonly<{
      readonly id: string;
      readonly initial: string;
      readonly context: () => Context;
      readonly states: Readonly<
        Partial<Record<string, FlowMachineStateNode<Context, Event, string>>>
      >;
    }>;
    readonly getInitialSnapshot: () => FlowSnapshot<Context, string, Event>;
  }>;
  readonly value: State;
  readonly context: Context;
  readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
  readonly transactions: Readonly<Record<string, FlowTransactionSnapshot>>;
  readonly streams: Readonly<Record<string, FlowStreamSnapshot>>;
  readonly timers: Readonly<Record<string, FlowTimerSnapshot>>;
  readonly children: Readonly<Record<string, FlowChildSnapshot>>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export type FlowTransitionRuntime = Readonly<{
  readonly now: () => number;
}>;

export type FlowTransitionArgs<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly context: Context;
  readonly event: Event;
  readonly value: State;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly resources: FlowSnapshot<Context, State, Event>["resources"];
  readonly transactions: FlowSnapshot<Context, State, Event>["transactions"];
  readonly streams: FlowSnapshot<Context, State, Event>["streams"];
  readonly timers: FlowSnapshot<Context, State, Event>["timers"];
  readonly children: FlowSnapshot<Context, State, Event>["children"];
  readonly receipts: FlowSnapshot<Context, State, Event>["receipts"];
  readonly runtime: FlowTransitionRuntime;
}>;

export type FlowActionDefinition<
  Context,
  Event extends FlowEvent,
  State extends string,
> = BivariantCallback<
  FlowTransitionArgs<Context, Event, State>,
  void | FlowReceipt | ReadonlyArray<FlowReceipt>
>;

type EffectValue<T> = T extends Effect.Effect<infer Value, unknown, unknown> ? Value : never;
type EffectError<T> = T extends Effect.Effect<unknown, infer Error, unknown> ? Error : never;
type EffectRequirements<T> =
  T extends Effect.Effect<unknown, unknown, infer Requirements> ? Requirements : never;

export type FlowResourceFreshness = Readonly<{
  readonly staleAfter: string | number;
  readonly onInvalidate?: "active" | "lazy" | "never";
}>;

export type FlowResourceConfig<
  Id extends string = string,
  Params extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
  Value = unknown,
  Error = never,
  Requirements = never,
  Schema = unknown,
> = Readonly<{
  readonly id: Id;
  readonly key: (...params: Params) => FlowKey;
  readonly lookup: (...params: Params) => Effect.Effect<Value, Error, Requirements>;
  readonly schema?: Schema;
  readonly tags?: (...params: Params) => ReadonlyArray<FlowTag>;
  readonly placeholder?: (...params: Params) => Option.Option<Value> | Value | null | undefined;
  readonly freshness?: FlowResourceFreshness;
}>;

export type FlowResourceRef<
  Id extends string = string,
  Params extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
  Value = unknown,
> = Readonly<{
  readonly kind: "resourceRef";
  readonly id: Id;
  readonly params: Params;
  readonly key: FlowKey;
  readonly __value?: Value;
}>;

export type FlowResourceDefinition<
  Id extends string = string,
  Params extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
  Value = unknown,
  Error = never,
  Requirements = never,
  Schema = unknown,
> = Readonly<{
  readonly kind: "resource";
  readonly id: Id;
  readonly config: FlowResourceConfig<Id, Params, Value, Error, Requirements, Schema>;
  readonly ref: (...params: Params) => FlowResourceRef<Id, Params, Value>;
}>;

export type FlowSeededResource<Ref extends FlowResourceRef = FlowResourceRef> = Readonly<{
  readonly ref: Ref;
  readonly value: Ref extends FlowResourceRef<string, ReadonlyArray<unknown>, infer Value>
    ? Value
    : never;
}>;

export type FlowInvalidationTarget = FlowKey | FlowTag | FlowResourceRef;

type InferResourceRefValue<Ref extends FlowResourceRef> =
  Ref extends FlowResourceRef<string, ReadonlyArray<unknown>, infer Value> ? Value : never;

export type FlowPreviewPatch<Ref extends FlowResourceRef = FlowResourceRef> =
  | Readonly<{
      readonly ref: Ref;
      readonly replace: InferResourceRefValue<Ref>;
    }>
  | Readonly<{
      readonly ref: Ref;
      readonly patch: unknown;
    }>;

type ValidateFlowPreviewPatch<Patch> = Patch extends {
  readonly ref: infer Ref extends FlowResourceRef;
}
  ? Patch extends { readonly replace: infer Replace }
    ? Replace extends InferResourceRefValue<Ref>
      ? Readonly<{
          readonly ref: Ref;
          readonly replace: Replace;
        }>
      : never
    : Patch extends { readonly patch: infer PatchValue }
      ? Readonly<{
          readonly ref: Ref;
          readonly patch: PatchValue;
        }>
      : never
  : never;

type ValidateFlowPreviewPatches<PreviewPatches extends ReadonlyArray<unknown>> = PreviewPatches &
  ReadonlyArray<ValidateFlowPreviewPatch<PreviewPatches[number]>>;

export type FlowOutcomeTuple<Event extends FlowEvent> = readonly [Event["type"], string?];

export type FlowOutcomeRoutes<Value, Error, Event extends FlowEvent = FlowEvent> = Readonly<{
  readonly success?: BivariantCallback<{ readonly value: Value }, Event> | FlowOutcomeTuple<Event>;
  readonly failure?: BivariantCallback<{ readonly error: Error }, Event> | FlowOutcomeTuple<Event>;
  readonly defect?: BivariantCallback<{ readonly cause: unknown }, Event> | FlowOutcomeTuple<Event>;
  readonly interrupt?:
    | BivariantCallback<{ readonly reason?: unknown }, Event>
    | FlowOutcomeTuple<Event>;
}>;

export type FlowTransactionPreview<
  Params,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
> = Readonly<{
  readonly apply: BivariantCallback<
    { readonly params: Params },
    ValidateFlowPreviewPatches<PreviewPatches>
  >;
}>;

export type FlowTransactionScope = Readonly<{
  readonly id: string;
}>;

export type FlowTransactionConfig<
  Id extends string = string,
  Params = unknown,
  Value = unknown,
  Error = never,
  Requirements = never,
  Event extends FlowEvent = FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
> = Readonly<{
  readonly id: Id;
  readonly params?: BivariantCallback<Record<string, unknown>, Params | null>;
  readonly preview?: FlowTransactionPreview<Params, PreviewPatches>;
  readonly commit: BivariantCallback<Params, Effect.Effect<Value, Error, Requirements>>;
  readonly invalidates?:
    | ReadonlyArray<FlowInvalidationTarget>
    | BivariantCallback<{ readonly params: Params }, ReadonlyArray<FlowInvalidationTarget>>;
  readonly routes?: FlowOutcomeRoutes<Value, Error, Event>;
  readonly scope?: FlowTransactionScope;
  readonly queue?: Readonly<{
    readonly when?: BivariantCallback<Record<string, unknown>, boolean>;
    readonly replay?: BivariantCallback<Record<string, unknown>, boolean>;
    readonly undo?: BivariantCallback<Record<string, unknown>, boolean>;
  }>;
  readonly concurrency?: FlowConcurrencyPolicy;
}>;

export type FlowTransactionDefinition<
  Id extends string = string,
  Params = unknown,
  Value = unknown,
  Error = never,
  Requirements = never,
  Event extends FlowEvent = FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
> = Readonly<{
  readonly kind: "transaction";
  readonly id: Id;
  readonly config: FlowTransactionConfig<
    Id,
    Params,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches
  >;
}>;

export type FlowViewSource =
  | "context"
  | "resources"
  | "transactions"
  | "streams"
  | "timers"
  | "children"
  | "issues"
  | "receipts";

export type FlowViewConfig<
  Id extends string = string,
  Context = unknown,
  State extends string = string,
  Selected = unknown,
> = Readonly<{
  readonly id: Id;
  readonly sources: ReadonlyArray<FlowViewSource>;
  readonly select: BivariantCallback<
    {
      readonly context: Context;
      readonly value: State;
      readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
      readonly transactions: Readonly<Record<string, FlowTransactionSnapshot>>;
      readonly streams: Readonly<Record<string, FlowStreamSnapshot>>;
      readonly timers: Readonly<Record<string, FlowTimerSnapshot>>;
      readonly children: Readonly<Record<string, FlowChildSnapshot>>;
      readonly issues: ReadonlyArray<FlowIssue>;
      readonly receipts: ReadonlyArray<FlowReceipt>;
    },
    Selected
  >;
}>;

export type FlowViewDefinition<
  Context = unknown,
  State extends string = string,
  Selected = unknown,
  Id extends string = string,
> = Readonly<{
  readonly kind: "view";
  readonly id: Id;
  readonly config: FlowViewConfig<Id, Context, State, Selected>;
}>;

export type FlowAfterConfig<
  State extends string = string,
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
> = Readonly<{
  readonly id: string;
  readonly delay: Duration.Input;
  readonly target?: State;
  readonly guard?: BivariantCallback<FlowTransitionArgs<Context, Event, State>, boolean>;
  readonly update?: BivariantCallback<FlowTransitionArgs<Context, Event, State>, Partial<Context>>;
}>;

export type FlowAfterDefinition<
  State extends string = string,
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
> = Readonly<{
  readonly kind: "after";
  readonly id: string;
  readonly config: FlowAfterConfig<State, Context, Event>;
}>;

export type FlowStreamPressure =
  | Readonly<{
      readonly strategy: "queue";
      readonly limit?: number;
    }>
  | Readonly<{
      readonly strategy: "coalesce-latest";
      readonly key: BivariantCallback<unknown, string>;
    }>;

export type FlowStreamConfig<
  Id extends string = string,
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  Params = void,
  Value = unknown,
  Error = never,
  Requirements = never,
> = Readonly<{
  readonly id: Id;
  readonly params?: BivariantCallback<Record<string, unknown>, Params>;
  readonly subscribe: BivariantCallback<
    { readonly params: Params },
    Stream.Stream<Value, Error, Requirements>
  >;
  readonly pressure?: FlowStreamPressure;
  readonly routes?: Readonly<{
    readonly value?: BivariantCallback<Value, Event>;
    readonly done?: () => Event;
    readonly failure?: BivariantCallback<Error, Event>;
    readonly defect?: BivariantCallback<unknown, Event>;
    readonly interrupt?: () => Event;
  }>;
  readonly context?: Context;
}>;

export type FlowStreamDefinition<
  Value = unknown,
  Error = never,
  Params = void,
  Event extends FlowEvent = FlowEvent,
  Context = unknown,
  Id extends string = string,
  Requirements = never,
> = Readonly<{
  readonly kind: "stream";
  readonly id: Id;
  readonly config: FlowStreamConfig<Id, Context, Event, Params, Value, Error, Requirements>;
}>;

type AnyFlowStreamDefinition = FlowStreamDefinition<any, any, any, any, any, any, any>;

export type FlowChildConfig<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly id: string;
  readonly machine: Machine;
  readonly supervision?: "stop-on-failure" | "continue-on-failure";
}>;

export type FlowChildDefinition<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly kind: "child";
  readonly id: string;
  readonly config: FlowChildConfig<Machine>;
}>;

export type FlowInvokeDescriptor =
  | AnyFlowStreamDefinition
  | FlowChildDefinition
  | Readonly<{ readonly kind: "ensure"; readonly ref: FlowResourceRef }>
  | Readonly<{ readonly kind: "observe"; readonly ref: FlowResourceRef }>
  | Readonly<{ readonly kind: "refresh"; readonly ref: FlowResourceRef }>
  | Readonly<{ readonly kind: "patch"; readonly ref: FlowResourceRef; readonly patch: unknown }>
  | Readonly<{ readonly kind: "invalidate"; readonly target: FlowInvalidationTarget }>
  | Readonly<{
      readonly kind: "run";
      readonly transaction: FlowTransactionDefinition<string, any, any, any, any, FlowEvent>;
    }>;

export type FlowTransitionDefinition<
  Context,
  Event extends FlowEvent,
  State extends string,
> = Readonly<{
  readonly target?: State;
  readonly reenter?: boolean;
  readonly guard?: BivariantCallback<FlowTransitionArgs<Context, Event, State>, boolean>;
  readonly update?: BivariantCallback<FlowTransitionArgs<Context, Event, State>, Partial<Context>>;
  readonly actions?:
    | FlowActionDefinition<Context, Event, State>
    | ReadonlyArray<FlowActionDefinition<Context, Event, State>>;
  readonly submit?: FlowTransactionDefinition<string, any, any, any, any, FlowEvent>;
}>;

export type FlowEventTransitions<Context, Event extends FlowEvent, State extends string> =
  | State
  | FlowTransitionDefinition<Context, Event, State>
  | ReadonlyArray<FlowTransitionDefinition<Context, Event, State>>;

type FlowStateTransitions<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly [Type in Event["type"]]?: FlowEventTransitions<
    Context,
    Extract<Event, { readonly type: Type }>,
    State
  >;
}>;

export type FlowMachineStateNode<
  Context,
  Event extends FlowEvent,
  State extends string,
> = Readonly<{
  readonly type?: "final";
  readonly entry?:
    | FlowActionDefinition<Context, Event, State>
    | ReadonlyArray<FlowActionDefinition<Context, Event, State>>;
  readonly exit?:
    | FlowActionDefinition<Context, Event, State>
    | ReadonlyArray<FlowActionDefinition<Context, Event, State>>;
  readonly invoke?: FlowInvokeDescriptor | ReadonlyArray<FlowInvokeDescriptor>;
  readonly after?:
    | FlowAfterDefinition<State, Context, Event>
    | ReadonlyArray<FlowAfterDefinition<State, Context, Event>>;
  readonly always?: FlowEventTransitions<Context, Event, State>;
  readonly on?: FlowStateTransitions<Context, Event, State>;
}>;

export type FlowMachineConfig<
  Id extends string = string,
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  Initial extends State = State,
> = Readonly<{
  readonly id: Id;
  readonly initial: Initial;
  readonly context: () => Context;
  readonly states: Readonly<Record<State, FlowMachineStateNode<Context, Event, State>>>;
}>;

export type FlowMachine<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  Initial extends State = State,
  Id extends string = string,
> = Readonly<{
  readonly kind: "machine";
  readonly id: Id;
  readonly config: FlowMachineConfig<Id, Context, Event, State, Initial>;
  readonly getInitialSnapshot: () => FlowSnapshot<Context, Initial, Event>;
}>;

type FlowConfiguredEventType<Node> = Node extends { readonly on?: infer On }
  ? Extract<keyof NonNullable<On>, string>
  : never;

type FlowStateNodeShape = Readonly<{
  readonly on?: object;
  readonly always?: unknown;
}>;

type FlowEventsByState<
  Event extends FlowEvent,
  States extends Readonly<Partial<Record<string, FlowStateNodeShape>>>,
> = {
  readonly [Key in Extract<keyof States, string>]: Extract<
    Event,
    { readonly type: FlowConfiguredEventType<States[Key]> }
  >;
};

export type InferMachineContext<Machine extends FlowMachine> =
  Machine extends FlowMachine<infer Context, any, any, any, any> ? Context : never;

export type InferMachineEvent<Machine extends FlowMachine> =
  Machine extends FlowMachine<any, infer Event, any, any, any> ? Event : never;

export type InferMachineState<Machine extends FlowMachine> =
  Machine extends FlowMachine<any, any, infer State, any, any> ? State : never;

export type FlowEventForState<
  Event extends FlowEvent,
  States extends Readonly<Partial<Record<string, FlowStateNodeShape>>>,
  State extends string,
> = State extends Extract<keyof States, string> ? FlowEventsByState<Event, States>[State] : never;

export type FlowModuleInventory = Readonly<Record<string, unknown>>;

export type FlowModuleMeta = Readonly<{
  readonly dependencies?: ReadonlyArray<string>;
  readonly tags?: ReadonlyArray<string>;
  readonly screens?: ReadonlyArray<string>;
  readonly fixtures?: ReadonlyArray<string>;
  readonly permissions?: ReadonlyArray<string>;
}>;

export type FlowInventoryEntry = Readonly<{
  readonly module: string;
  readonly name: string;
}>;

export type FlowViewByScreenEntry = FlowInventoryEntry &
  Readonly<{
    readonly screen: string;
  }>;

export type FlowModuleInventorySummary = Readonly<{
  readonly name: string;
  readonly resources: ReadonlyArray<string>;
  readonly transactions: ReadonlyArray<string>;
  readonly machines: ReadonlyArray<string>;
  readonly streams: ReadonlyArray<string>;
  readonly views: ReadonlyArray<string>;
  readonly policies: ReadonlyArray<string>;
  readonly dependencies: ReadonlyArray<string>;
  readonly screens: ReadonlyArray<string>;
  readonly fixtures: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly permissions: ReadonlyArray<string>;
}>;

export type FlowAppInventorySummary = Readonly<{
  readonly modules: ReadonlyArray<FlowModuleInventorySummary>;
  readonly resources: ReadonlyArray<FlowInventoryEntry>;
  readonly transactions: ReadonlyArray<FlowInventoryEntry>;
  readonly actors: ReadonlyArray<FlowInventoryEntry>;
  readonly streams: ReadonlyArray<FlowInventoryEntry>;
  readonly views: ReadonlyArray<FlowInventoryEntry>;
  readonly viewsByScreen: ReadonlyArray<FlowViewByScreenEntry>;
  readonly fixtures: ReadonlyArray<FlowInventoryEntry>;
}>;

export type FlowModuleDefinition<
  Id extends string = string,
  Inventory extends FlowModuleInventory = FlowModuleInventory,
> = Readonly<{
  readonly kind: "module";
  readonly id: Id;
  readonly inventory: () => FlowModuleInventorySummary;
  readonly meta: FlowModuleMeta;
}> &
  Inventory;

export type FlowModuleMap<
  Modules extends ReadonlyArray<FlowModuleDefinition> = ReadonlyArray<FlowModuleDefinition>,
> = Readonly<{
  readonly [Id in Modules[number]["id"]]: Extract<Modules[number], { readonly id: Id }>;
}>;

export type FlowStoreDescriptor = Readonly<{
  readonly kind: "store";
  readonly mode: "memory" | "test";
  readonly namespace: string;
}>;

export type FlowOrchestratorDescriptor = Readonly<{
  readonly kind: "orchestrators";
  readonly mode: "live" | "test";
  readonly options: Readonly<Record<string, unknown>>;
}>;

export type FlowAppLayerConfig<
  Services extends ReadonlyArray<Layer.Any> = ReadonlyArray<Layer.Any>,
> = Readonly<{
  readonly store: FlowStoreDescriptor;
  readonly orchestrators: FlowOrchestratorDescriptor;
  readonly services?: Services;
}>;

export type FlowAppDefinition<
  Modules extends ReadonlyArray<FlowModuleDefinition> = ReadonlyArray<FlowModuleDefinition>,
> = Readonly<{
  readonly kind: "app";
  readonly id: string;
  readonly modules: Modules;
  readonly moduleMap: FlowModuleMap<Modules>;
  readonly inventory: () => FlowAppInventorySummary;
  readonly layer: <Services extends ReadonlyArray<Layer.Any> = readonly []>(
    config: FlowAppLayerConfig<Services>,
  ) => Layer.Layer<
    | NotificationScheduler
    | ResourceStore
    | OrchestratorSystem
    | HostSignals
    | TraceLog
    | Layer.Success<Services[number]>,
    Layer.Error<Services[number]>,
    Layer.Services<Services[number]>
  >;
}>;

export type FlowActor<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = SelectionSource<FlowSnapshot<Context, State, Event>> &
  Readonly<{
    readonly id: string;
    readonly machine: FlowMachine<Context, Event, State>;
    readonly send: (event: Event) => FlowActor<Context, Event, State>;
    readonly snapshot: () => FlowSnapshot<Context, State, Event>;
    readonly getSnapshot: () => FlowSnapshot<Context, State, Event>;
    readonly flush: () => Promise<void>;
    readonly children: () => Readonly<Record<string, FlowChildSnapshot>>;
    readonly receipts: () => ReadonlyArray<FlowReceipt>;
    readonly issues: () => ReadonlyArray<FlowIssue>;
    readonly retryChild: (id: string) => boolean;
    readonly retryTransaction: (id: string) => boolean;
    readonly resetTransaction: (id: string) => boolean;
    readonly dispose: () => Promise<void>;
  }>;

export type FlowRuntimeResources = Readonly<{
  readonly seedResources: (resources: ReadonlyArray<FlowSeededResource>) => void;
  readonly subscribe: <Ref extends FlowResourceRef>(
    ref: Ref,
    listener: (snapshot: FlowResourceSnapshot<InferResourceRefValue<Ref>>) => void,
  ) => () => void;
  readonly patch: (
    ref: FlowResourceRef,
    updater: (current: Record<string, unknown>) => Record<string, unknown>,
  ) => void;
  readonly get: <Ref extends FlowResourceRef>(
    ref: Ref,
  ) => FlowResourceSnapshot<InferResourceRefValue<Ref>> | null;
}>;

export type FlowActorStartOptions<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly id?: string;
  readonly policy?: string;
  readonly snapshot?: FlowSnapshot<
    InferMachineContext<Machine>,
    InferMachineState<Machine>,
    InferMachineEvent<Machine>
  >;
}>;

export type FlowRuntimeOrchestrators = Readonly<{
  readonly start: <Machine extends FlowMachine>(
    machine: Machine,
    options?: FlowActorStartOptions<Machine>,
  ) => FlowActor<
    InferMachineContext<Machine>,
    InferMachineEvent<Machine>,
    InferMachineState<Machine>
  >;
  readonly get: (id: string) => FlowActor | null;
  readonly stop: (id: string) => Promise<void>;
}>;

export type FlowRuntime<RuntimeServices = never, LayerError = never> = Readonly<{
  readonly kind: "runtime";
  readonly managedRuntime: ManagedRuntime.ManagedRuntime<RuntimeServices, LayerError>;
  readonly resources: FlowRuntimeResources;
  readonly orchestrators: FlowRuntimeOrchestrators;
  readonly runPromise: <A, E>(
    effect: Effect.Effect<A, E, RuntimeServices>,
    options?: Effect.RunOptions,
  ) => Promise<A>;
  readonly runPromiseExit: <A, E>(
    effect: Effect.Effect<A, E, RuntimeServices>,
    options?: Effect.RunOptions,
  ) => Promise<Exit.Exit<A, LayerError | E>>;
  readonly dispose: () => Promise<void>;
  readonly createActor: <Machine extends FlowMachine>(
    machine: Machine,
    options?: FlowActorStartOptions<Machine>,
  ) => FlowActor<
    InferMachineContext<Machine>,
    InferMachineEvent<Machine>,
    InferMachineState<Machine>
  >;
}>;

export type FlowTestCache = Readonly<{
  readonly query: (id: string) => FlowResourceSnapshot | undefined;
}>;

export type FlowTestTransactions = Readonly<{
  readonly all: () => Readonly<Record<string, FlowTransactionSnapshot>>;
  readonly get: (id: string) => FlowTransactionSnapshot | undefined;
  readonly events: (id: string) => ReadonlyArray<FlowReceipt>;
  readonly previewPatches: (id: string) => ReadonlyArray<FlowReceipt>;
  readonly rollbacks: (id: string) => ReadonlyArray<FlowReceipt>;
  readonly queued: (id: string) => ReadonlyArray<FlowReceipt>;
}>;

export type FlowTestTimers = Readonly<{
  readonly all: () => Readonly<Record<string, FlowTimerSnapshot>>;
  readonly get: (id: string) => FlowTimerSnapshot | undefined;
  readonly active: (id: string) => FlowTimerSnapshot | undefined;
  readonly fired: (id: string) => FlowTimerSnapshot | undefined;
  readonly cancelled: (id: string) => FlowTimerSnapshot | undefined;
  readonly events: (id: string) => ReadonlyArray<FlowReceipt>;
}>;

export type FlowTestHarness<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  readonly state: () => State;
  readonly context: () => Context;
  readonly snapshot: () => FlowSnapshot<Context, State, Event>;
  readonly send: (event: Event) => FlowTestHarness<Context, Event, State>;
  readonly can: (event: Event) => boolean;
  readonly cache: () => FlowTestCache;
  readonly transactions: () => FlowTestTransactions;
  readonly timers: () => FlowTestTimers;
  readonly streams: () => Readonly<{
    readonly all: () => Readonly<Record<string, FlowTestStreamSnapshot>>;
    readonly running: (id: string) => FlowTestStreamSnapshot | undefined;
    readonly cancelled: (id: string) => FlowTestStreamSnapshot | undefined;
    readonly events: (id: string) => ReadonlyArray<FlowReceipt>;
  }>;
  readonly issues: () => ReadonlyArray<FlowIssue>;
  readonly retryTransaction: (id: string) => boolean;
  readonly resetTransaction: (id: string) => boolean;
  readonly flush: () => Promise<void>;
  readonly advance: (duration: Duration.Input) => Promise<void>;
  readonly settle: (bounds: {
    readonly maxTicks: number;
    readonly maxFibers: number;
  }) => Promise<void>;
}>;

export type FlowStartedTestBuilder<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = FlowTestHarness<Context, Event, State> &
  Readonly<{
    readonly provide: (service: unknown) => FlowStartedTestBuilder<Context, Event, State>;
    readonly clock: (now: () => number) => FlowStartedTestBuilder<Context, Event, State>;
    readonly start: () => FlowTestHarness<Context, Event, State>;
  }>;

export type FlowTestBuilder = Readonly<{
  readonly app: (app: FlowAppDefinition) => FlowTestBuilder;
  readonly seedResources: (resources: ReadonlyArray<FlowSeededResource>) => FlowTestBuilder;
  readonly seedModuleFixtures: (fixture: string) => FlowTestBuilder;
  readonly start: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: Readonly<{ readonly input?: Partial<Context> }>,
  ) => FlowStartedTestBuilder<Context, Event, State>;
  readonly model: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: Readonly<{ readonly input?: Partial<Context> }>,
  ) => FlowModelDescriptor<FlowMachine<Context, Event, State>>;
}>;

export type FlowModelStep<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  readonly event: Event;
  readonly state: FlowSnapshot<Context, State, Event>;
}>;

export type FlowModelPath<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  readonly state: FlowSnapshot<Context, State, Event>;
  readonly steps: ReadonlyArray<FlowModelStep<Context, Event, State>>;
  readonly weight: number;
  readonly description: string;
}>;

export type FlowModelTraversalOptions<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  readonly events?:
    | ReadonlyArray<Event>
    | ((snapshot: FlowSnapshot<Context, State, Event>) => ReadonlyArray<Event>);
  readonly filterEvents?: (snapshot: FlowSnapshot<Context, State, Event>, event: Event) => boolean;
  readonly fromState?: FlowSnapshot<Context, State, Event>;
  readonly toState?: (snapshot: FlowSnapshot<Context, State, Event>) => boolean;
  readonly maxDepth?: number;
  readonly limit?: number;
  readonly allowDuplicatePaths?: boolean;
  readonly serializeState?: (snapshot: FlowSnapshot<Context, State, Event>) => string;
  readonly serializeEvent?: (event: Event) => string;
}>;

export type FlowGraphDescriptor<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly kind: "graph";
  readonly machine: Machine;
}>;

export type FlowTraceReport = Readonly<{
  readonly events: ReadonlyArray<FlowReceipt>;
  readonly transitions: ReadonlyArray<FlowReceipt>;
  readonly resources: ReadonlyArray<FlowReceipt>;
  readonly transactions: ReadonlyArray<FlowReceipt>;
  readonly streams: ReadonlyArray<FlowReceipt>;
  readonly children: ReadonlyArray<FlowReceipt>;
  readonly timers: ReadonlyArray<FlowReceipt>;
  readonly actors: ReadonlyArray<FlowReceipt>;
  readonly other: ReadonlyArray<FlowReceipt>;
  readonly lanes: Readonly<{
    readonly success: ReadonlyArray<FlowReceipt>;
    readonly failure: ReadonlyArray<FlowReceipt>;
    readonly defect: ReadonlyArray<FlowReceipt>;
    readonly interrupt: ReadonlyArray<FlowReceipt>;
  }>;
}>;

export type FlowTraceDescriptor<
  Snapshot extends FlowSnapshot<unknown, string> = FlowSnapshot<unknown, string>,
> = Readonly<{
  readonly kind: "trace";
  readonly snapshot: Snapshot;
  readonly receipts: Snapshot["receipts"];
  readonly report: FlowTraceReport;
  readonly options?: Readonly<Record<string, unknown>>;
}>;

export type FlowReplayDescriptor<
  Machine extends FlowMachine = FlowMachine,
  Trace extends FlowTraceDescriptor = FlowTraceDescriptor,
> = Readonly<{
  readonly kind: "replay";
  readonly machine: Machine;
  readonly trace: Trace;
  readonly receipts: Trace["receipts"];
  readonly report: Trace["report"];
}>;

export type FlowModelDescriptor<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly kind: "model";
  readonly machine: Machine;
  readonly getShortestPaths: (
    options?: FlowModelTraversalOptions<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >,
  ) => ReadonlyArray<
    FlowModelPath<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >
  >;
  readonly getSimplePaths: (
    options?: FlowModelTraversalOptions<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >,
  ) => ReadonlyArray<
    FlowModelPath<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >
  >;
}>;

export type FlowStoriesDescriptor<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly kind: "stories";
  readonly machine: Machine;
  readonly stories: ReadonlyArray<Readonly<Record<string, unknown>>>;
}>;

export type InferResourceValue<Resource extends FlowResourceDefinition> =
  Resource extends FlowResourceDefinition<
    string,
    ReadonlyArray<unknown>,
    infer Value,
    unknown,
    unknown
  >
    ? Value
    : never;

export type InferResourceSchema<Resource extends FlowResourceDefinition> =
  Resource extends FlowResourceDefinition<
    string,
    ReadonlyArray<unknown>,
    unknown,
    unknown,
    unknown,
    infer Schema
  >
    ? Schema
    : never;

export type InferEffectValue<F> = EffectValue<F>;
export type InferEffectError<F> = EffectError<F>;
export type InferEffectRequirements<F> = EffectRequirements<F>;
