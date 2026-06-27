import * as React from "react";
import {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Option,
  Queue,
  Result,
  Stream,
} from "effect";
import { createMachine, initialTransition } from "xstate";

export type FlowStatePrimitive =
  | "atom"
  | "resource"
  | "mutation"
  | "machine"
  | "cache"
  | "workflow"
  | "tooling"
  | "actor"
  | "trace"
  | "graph";

export interface FlowStatePackageInfo {
  readonly name: "@flow-state/core";
  readonly status: "smoke-tested";
  readonly primitives: readonly FlowStatePrimitive[];
}

export const packageInfo: FlowStatePackageInfo = {
  name: "@flow-state/core",
  status: "smoke-tested",
  primitives: [
    "atom",
    "resource",
    "mutation",
    "machine",
    "cache",
    "workflow",
    "tooling",
    "actor",
    "trace",
    "graph",
  ],
};

const smokeMachine = createMachine({
  id: "flow-state-smoke",
  initial: "idle",
  states: {
    idle: {
      on: {
        START: "running",
      },
    },
    running: {},
  },
});

export interface FlowPreview {
  readonly label: string;
  readonly initialState: string;
  readonly primitives: readonly FlowStatePrimitive[];
}

export function createFlowPreview(): FlowPreview {
  const label = Effect.runSync(Effect.succeed("Effect + XState ready"));
  const [snapshot] = initialTransition(smokeMachine);
  const initialState =
    typeof snapshot.value === "string" ? snapshot.value : JSON.stringify(snapshot.value);

  return {
    label,
    initialState,
    primitives: packageInfo.primitives,
  };
}

export type FlowEvent = { readonly type: string } & Readonly<Record<string, unknown>>;

export interface FlowSnapshot<TContext, TState extends string = string> {
  readonly value: TState;
  readonly context: TContext;
  readonly status: "active";
  readonly changed: boolean;
  readonly event: FlowEvent | null;
  readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
  readonly mutations: Readonly<Record<string, FlowMutationSnapshot>>;
  readonly streams: Readonly<Record<string, FlowStreamSnapshot>>;
  readonly timers: Readonly<Record<string, FlowTimerSnapshot>>;
  readonly children: Readonly<Record<string, FlowChildSnapshot>>;
  readonly receipts: readonly FlowRuntimeReceipt[];
  readonly issues: readonly FlowRuntimeIssue[];
  matches(state: TState): boolean;
  can(event: FlowEvent): boolean;
}

export interface FlowRuntimeEnvironment {
  now(): number;
}

export interface FlowTransitionArgs<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly context: TContext;
  readonly event: TEvent;
  readonly snapshot: FlowSnapshot<TContext, TState>;
  readonly runtime: FlowRuntimeEnvironment;
}

export type FlowGuardPredicate<TContext, TEvent extends FlowEvent, TState extends string> = (
  args: FlowTransitionArgs<TContext, TEvent, TState>,
) => boolean;

export interface FlowGuard<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly kind: "guard";
  readonly predicate: FlowGuardPredicate<TContext, TEvent, TState>;
}

export type FlowActionFunction<TContext, TEvent extends FlowEvent, TState extends string> = (
  args: FlowTransitionArgs<TContext, TEvent, TState>,
) => void;

export type FlowAssignUpdater<TContext, TEvent extends FlowEvent, TState extends string> = (
  args: FlowTransitionArgs<TContext, TEvent, TState>,
) => Partial<TContext> | TContext;

export type FlowUpdateReducer<
  TContext,
  TEvent extends FlowEvent,
  TState extends string,
> = FlowAssignUpdater<TContext, TEvent, TState>;

export interface FlowAssignAction<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly kind: "assign";
  readonly updater: FlowAssignUpdater<TContext, TEvent, TState>;
}

export interface FlowEffectAction<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly kind: "action";
  readonly fn: FlowActionFunction<TContext, TEvent, TState>;
}

export type FlowAction<TContext, TEvent extends FlowEvent, TState extends string> =
  | FlowAssignAction<TContext, TEvent, TState>
  | FlowEffectAction<TContext, TEvent, TState>
  | FlowActionFunction<TContext, TEvent, TState>;

export interface FlowKey<TParts extends readonly unknown[] = readonly unknown[]> {
  readonly kind: "key";
  readonly parts: TParts;
  readonly hash: string;
}

export interface FlowTag<TName extends string = string> {
  readonly kind: "tag";
  readonly name: TName;
}

export interface FlowStatePath<TSegments extends readonly string[] = readonly string[]> {
  readonly kind: "statePath";
  readonly segments: TSegments;
  readonly id: string;
}

export interface FlowInvokeDefinition<TKind extends string, TConfig> {
  readonly kind: TKind;
  readonly config: TConfig;
}

export type FlowEffectDefinition<TConfig> = FlowInvokeDefinition<"effect", TConfig>;
export type FlowResourceDefinition<TConfig> = FlowInvokeDefinition<"resource", TConfig>;
export type FlowQueryDefinition<TConfig> = FlowInvokeDefinition<"query", TConfig>;
export type FlowMutationDefinition<TConfig> = FlowInvokeDefinition<"mutation", TConfig>;
export type FlowRunDefinition<TConfig> = FlowInvokeDefinition<"run", TConfig>;
export type FlowEnsureDefinition<TConfig> = FlowInvokeDefinition<"ensure", TConfig>;
export type FlowObserveDefinition<TConfig> = FlowInvokeDefinition<"observe", TConfig>;
export type FlowRefreshDefinition<TConfig> = FlowInvokeDefinition<"refresh", TConfig>;
export type FlowPatchDefinition<TConfig> = FlowInvokeDefinition<"patch", TConfig>;
export type FlowInvalidateDefinition<TConfig> = FlowInvokeDefinition<"invalidate", TConfig>;
export type FlowStreamDefinition<TConfig> = FlowInvokeDefinition<"stream", TConfig>;
export type FlowAfterDefinition<TConfig> = FlowInvokeDefinition<"after", TConfig>;
export type FlowViewDefinition<TConfig> = FlowInvokeDefinition<"view", TConfig>;
export type FlowSchemaDefinition<TConfig> = FlowInvokeDefinition<"schema", TConfig>;
export type FlowPersistenceDefinition<TConfig> = FlowInvokeDefinition<"persist", TConfig>;
export type FlowHistoryDefinition<TConfig> = FlowInvokeDefinition<"history", TConfig>;

export type FlowChildDefinition<TConfig> = FlowInvokeDefinition<"child", TConfig>;

export interface FlowMutationDescriptorConfig {
  readonly id: string;
  readonly input: (args: never) => unknown;
  readonly effect: (input: never) => Effect.Effect<unknown, unknown, unknown>;
}

export interface FlowStreamDescriptorConfig {
  readonly id: string;
  readonly stream: (args: never) => Stream.Stream<unknown, unknown, unknown>;
}

export type FlowModuleDefinition<TName extends string, TMembers extends object> = TMembers & {
  readonly kind: "module";
  readonly name: TName;
};

export interface FlowResourceRef<TValue = unknown, TFailure = unknown, TRequirements = unknown> {
  readonly kind: "resourceRef";
  readonly id: string;
  readonly key: FlowKey | string;
  readonly args: readonly unknown[];
  readonly definition: FlowResourceDefinition<
    FlowResourceConfig<readonly unknown[], TValue, TFailure, TRequirements>
  >;
}

export interface FlowResourceConfig<
  TArgs extends readonly unknown[] = readonly unknown[],
  TValue = unknown,
  TFailure = unknown,
  TRequirements = unknown,
  TKey = FlowKey | string,
> {
  readonly id?: string;
  readonly key: (...args: TArgs) => TKey;
  readonly lookup: (...args: TArgs) => Effect.Effect<TValue, TFailure, TRequirements>;
  readonly tags?: (...args: TArgs) => readonly FlowTag[];
  readonly cache?: {
    readonly capacity?: number;
    readonly timeToLive?:
      | FlowDurationInput
      | ((exit: Exit.Exit<TValue, TFailure>, key: TKey) => FlowDurationInput);
  };
  readonly freshness?: {
    readonly staleAfter?: FlowDurationInput;
    readonly refresh?: unknown;
    readonly onInvalidate?: "active" | "never";
  };
  readonly placeholder?: (...args: TArgs) => Option.Option<TValue>;
  readonly schema?: unknown;
}

export type FlowResourceCallable<
  TArgs extends readonly unknown[] = readonly unknown[],
  TValue = unknown,
  TFailure = unknown,
  TRequirements = unknown,
> = ((...args: TArgs) => FlowResourceRef<TValue, TFailure, TRequirements>) &
  FlowResourceDefinition<FlowResourceConfig<TArgs, TValue, TFailure, TRequirements>> & {
    ref(...args: TArgs): FlowResourceRef<TValue, TFailure, TRequirements>;
  };

export interface FlowStoreDefinition<TKind extends string, TConfig = unknown> {
  readonly kind: TKind;
  readonly config: TConfig;
}

export interface FlowOrchestratorDefinition<TKind extends string, TConfig = unknown> {
  readonly kind: TKind;
  readonly config: TConfig;
}

export type FlowAnyLayer = Layer.Layer<never, unknown, unknown>;

export interface FlowAppLayerConfig<
  TServices extends readonly FlowAnyLayer[] = readonly FlowAnyLayer[],
> {
  readonly store?: FlowStoreDefinition<string> | FlowAnyLayer;
  readonly orchestrators?: FlowOrchestratorDefinition<string> | FlowAnyLayer;
  readonly services?: TServices;
}

export interface FlowAppDefinition<
  TModules extends readonly FlowModuleDefinition<string, object>[],
> {
  readonly kind: "app";
  readonly modules: TModules;
  layer<const TServices extends readonly FlowAnyLayer[]>(
    config?: FlowAppLayerConfig<TServices>,
  ): FlowAppLayer<TServices>;
}

export type FlowAppLayer<TServices extends readonly FlowAnyLayer[] = readonly FlowAnyLayer[]> =
  Layer.Layer<unknown, unknown, never> & {
    readonly flowAppLayer: {
      readonly kind: "app-layer";
      readonly store?: FlowAppLayerConfig<TServices>["store"];
      readonly orchestrators?: FlowAppLayerConfig<TServices>["orchestrators"];
      readonly services: TServices;
    };
  };

export interface FlowManagedRuntime<TRequirements = unknown, TLayerError = unknown> {
  readonly managedRuntime: ManagedRuntime.ManagedRuntime<TRequirements, TLayerError>;
  runPromise<TValue, TFailure>(
    effect: Effect.Effect<TValue, TFailure, TRequirements>,
  ): Promise<TValue>;
  runPromiseExit<TValue, TFailure>(
    effect: Effect.Effect<TValue, TFailure, TRequirements>,
  ): Promise<Exit.Exit<TValue, TFailure | TLayerError>>;
  dispose(): Promise<void>;
  readonly disposeEffect: Effect.Effect<void>;
}

export interface FlowViewSelectArgs<TContext, TState extends string> {
  readonly snapshot: FlowSnapshot<TContext, TState>;
  readonly context: TContext;
  readonly value: TState;
  readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
  readonly mutations: Readonly<Record<string, FlowMutationSnapshot>>;
  readonly streams: Readonly<Record<string, FlowStreamSnapshot>>;
  readonly timers: Readonly<Record<string, FlowTimerSnapshot>>;
  readonly children: Readonly<Record<string, FlowChildSnapshot>>;
  readonly receipts: readonly FlowRuntimeReceipt[];
  readonly issues: readonly FlowRuntimeIssue[];
}

export interface FlowViewConfig<TContext, TState extends string, TSelected> {
  readonly id: string;
  readonly sources?: readonly (
    | "context"
    | "resources"
    | "mutations"
    | "streams"
    | "timers"
    | "children"
    | "receipts"
    | "issues"
  )[];
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly select: (args: FlowViewSelectArgs<TContext, TState>) => TSelected;
  readonly equality?: (left: TSelected, right: TSelected) => boolean;
}

export type FlowOutcomeRoute<TArgs, TEvent extends FlowEvent> =
  | ((args: TArgs) => TEvent)
  | TEvent["type"]
  | readonly [TEvent["type"], string];

export interface FlowOutcomeRoutesConfig<TValue, TFailure, TEvent extends FlowEvent> {
  readonly success?: FlowOutcomeRoute<
    { readonly requestId: number; readonly value: TValue },
    TEvent
  >;
  readonly failure?: FlowOutcomeRoute<
    { readonly requestId: number; readonly error: TFailure },
    TEvent
  >;
  readonly defect?: FlowOutcomeRoute<
    { readonly requestId: number; readonly defect: unknown },
    TEvent
  >;
  readonly interrupt?: FlowOutcomeRoute<{ readonly requestId: number }, TEvent>;
}

export type FlowSubmitOptions<TContext, TEvent extends FlowEvent, TState extends string> = Omit<
  FlowTransitionConfig<TContext, TEvent, TState>,
  "submit"
>;

export interface FlowChildConfig<
  TParentContext,
  TParentEvent extends FlowEvent,
  TChildContext,
  TChildEvent extends FlowEvent,
  TChildState extends string,
> {
  readonly id: string;
  readonly machine: FlowMachine<TChildContext, TChildEvent, TChildState>;
  readonly input?: (args: {
    readonly context: TParentContext;
    readonly event: TParentEvent | null;
  }) => Partial<TChildContext> | TChildContext | undefined;
  readonly supervision?: "parent" | "detached" | "restart-on-failure" | "stop-on-failure";
  readonly mailbox?: "fifo" | "dropping" | "latest";
  readonly routes?: {
    readonly snapshot?: (snapshot: FlowChildSnapshot<TChildState>) => TParentEvent;
    readonly done?: (snapshot: FlowChildSnapshot<TChildState>) => TParentEvent;
    readonly failure?: (snapshot: FlowChildSnapshot<TChildState>) => TParentEvent;
  };
  readonly meta?: Readonly<Record<string, unknown>>;
}

export type FlowCacheInvalidationTarget =
  | FlowKey
  | FlowTag
  | string
  | {
      readonly kind: "predicate";
      readonly id: string;
      readonly match: (resource: FlowResourceSnapshot) => boolean;
    };

export interface FlowQueryCachePolicy {
  readonly staleTime?: number;
  readonly gcTime?: number;
  readonly keepPreviousData?: boolean;
  readonly refetchOnInvalidate?: "active" | "never";
}

export interface FlowQueryConfig<
  TContext,
  TEvent extends FlowEvent,
  TValue = unknown,
  TFailure = unknown,
  TRequirements = unknown,
> {
  readonly id: string;
  readonly key: (args: {
    readonly context: TContext;
    readonly event: TEvent | null;
  }) => FlowKey | string;
  readonly tags?: readonly FlowTag[];
  readonly effect: (args: {
    readonly context: TContext;
    readonly event: TEvent | null;
  }) => Effect.Effect<TValue, TFailure, TRequirements>;
  readonly cache?: FlowQueryCachePolicy;
  readonly policy?: "cache-first" | "network-first" | "stale-while-revalidate";
  readonly routes?: FlowAsyncRoutes<TValue, TFailure, TEvent>;
}

export interface FlowMutationConfig<
  TContext,
  TEvent extends FlowEvent,
  TInput = unknown,
  TValue = unknown,
  TFailure = unknown,
  TRequirements = unknown,
> {
  readonly id: string;
  readonly input: (args: {
    readonly context: TContext;
    readonly event: TEvent | null;
  }) => TInput | null;
  readonly effect: (input: TInput) => Effect.Effect<TValue, TFailure, TRequirements>;
  readonly invalidates?:
    | readonly FlowCacheInvalidationTarget[]
    | ((args: {
        readonly input: TInput;
        readonly value: TValue;
      }) => readonly FlowCacheInvalidationTarget[]);
  readonly preview?: {
    readonly apply?: (args: { readonly input: TInput }) => readonly FlowResourcePatch[];
    readonly rollback?: (args: {
      readonly input: TInput;
      readonly error: TFailure;
      readonly previewContext: unknown;
    }) => void;
  };
  /** @deprecated Use preview for rollbackable pending ResourceStore patches. */
  readonly optimistic?: {
    readonly apply?: (args: { readonly input: TInput }) => readonly FlowResourcePatch[];
    readonly rollback?: (args: {
      readonly input: TInput;
      readonly error: TFailure;
      readonly optimisticContext: unknown;
    }) => void;
  };
  readonly scope?: string;
  readonly concurrency?: "reject-while-running" | "allow";
  readonly routes?: FlowAsyncRoutes<TValue, TFailure, TEvent>;
}

export interface FlowAsyncRoutes<TValue, TFailure, TEvent extends FlowEvent> {
  readonly success?: (args: { readonly requestId: number; readonly value: TValue }) => TEvent;
  readonly failure?: (args: { readonly requestId: number; readonly error: TFailure }) => TEvent;
  readonly defect?: (args: { readonly requestId: number; readonly defect: unknown }) => TEvent;
  readonly interrupt?: (args: { readonly requestId: number }) => TEvent;
}

export interface FlowPermissionDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface FlowPermissionDefinition<
  TContext,
  TEvent extends FlowEvent,
  TState extends string,
> {
  readonly kind: "permission";
  readonly id: string;
  readonly description?: string;
  readonly path?: FlowStatePath | string;
  readonly event?: TEvent["type"];
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly check: (
    args: FlowTransitionArgs<TContext, TEvent, TState>,
  ) => boolean | FlowPermissionDecision;
}

export interface FlowInvariantDefinition<
  TContext,
  TEvent extends FlowEvent,
  TState extends string,
> {
  readonly kind: "invariant";
  readonly id: string;
  readonly description?: string;
  readonly path?: FlowStatePath | string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly check: (args: FlowTransitionArgs<TContext, TEvent, TState>) => boolean;
  readonly message: string;
  readonly severity?: "error" | "warning";
}

export interface FlowWorkflowPersistenceConfig<TContext, TState extends string> {
  readonly id: string;
  readonly version: number;
  readonly select?: (snapshot: FlowSnapshot<TContext, TState>) => unknown;
  readonly redact?: (value: unknown) => unknown;
  readonly migrate?: (value: unknown, fromVersion: number) => unknown;
}

export type FlowStreamPressure<TValue = unknown> =
  | { readonly strategy: "queue"; readonly limit?: number }
  | { readonly strategy: "coalesce-latest"; readonly key: (value: TValue) => string }
  | { readonly strategy: "drop"; readonly limit?: number }
  | { readonly strategy: "sample"; readonly every: FlowDurationInput };

export interface FlowStreamRoutes<TValue, TFailure, TEvent extends FlowEvent> {
  readonly value?: (value: TValue) => TEvent;
  readonly done?: () => TEvent;
  readonly failure?: (error: TFailure) => TEvent;
  readonly defect?: (defect: unknown) => TEvent;
  readonly interrupt?: () => TEvent;
}

export interface FlowStreamConfig<
  TContext,
  TEvent extends FlowEvent,
  TInput = unknown,
  TValue = unknown,
  TFailure = unknown,
  TServices = unknown,
> {
  readonly id: string;
  readonly input?: (args: { readonly context: TContext; readonly event?: TEvent }) => TInput;
  readonly stream: (args: {
    readonly input: TInput;
    readonly services: TServices;
    readonly runtime: FlowRuntimeEnvironment;
  }) => Stream.Stream<TValue, TFailure, TServices>;
  readonly pressure?: FlowStreamPressure<TValue>;
  readonly routes?: FlowStreamRoutes<TValue, TFailure, TEvent>;
  readonly issues?: {
    readonly failure?: "record" | "ignore";
    readonly defect?: "record" | "ignore";
    readonly interrupt?: "record" | "ignore";
  };
}

export interface FlowAfterConfig<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly id: string;
  readonly delay:
    | FlowDurationInput
    | ((args: { readonly context: TContext; readonly event?: TEvent }) => FlowDurationInput);
  readonly target?: TState;
  readonly guard?:
    | FlowGuard<TContext, TEvent, TState>
    | FlowGuardPredicate<TContext, TEvent, TState>;
  readonly update?:
    | FlowUpdateReducer<TContext, TEvent, TState>
    | readonly FlowUpdateReducer<TContext, TEvent, TState>[];
  readonly actions?:
    | FlowAction<TContext, TEvent, TState>
    | readonly FlowAction<TContext, TEvent, TState>[];
  readonly routes?: {
    readonly fired?: () => TEvent;
    readonly interrupt?: () => TEvent;
  };
  readonly receipt?: Readonly<Record<string, unknown>>;
}

export type FlowStateInvoke =
  | FlowEffectDefinition<unknown>
  | FlowResourceDefinition<unknown>
  | FlowQueryDefinition<unknown>
  | FlowMutationDefinition<unknown>
  | FlowRunDefinition<unknown>
  | FlowEnsureDefinition<unknown>
  | FlowObserveDefinition<unknown>
  | FlowRefreshDefinition<unknown>
  | FlowPatchDefinition<unknown>
  | FlowInvalidateDefinition<unknown>
  | FlowStreamDefinition<unknown>
  | FlowChildDefinition<unknown>;

export interface FlowTransitionConfig<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly target?: TState;
  readonly submit?: FlowMutationDefinition<unknown> | readonly FlowMutationDefinition<unknown>[];
  readonly guard?:
    | FlowGuard<TContext, TEvent, TState>
    | FlowGuardPredicate<TContext, TEvent, TState>;
  readonly update?:
    | FlowUpdateReducer<TContext, TEvent, TState>
    | readonly FlowUpdateReducer<TContext, TEvent, TState>[];
  readonly actions?:
    | FlowAction<TContext, TEvent, TState>
    | readonly FlowAction<TContext, TEvent, TState>[];
}

export type FlowTransition<TContext, TEvent extends FlowEvent, TState extends string> =
  | TState
  | FlowTransitionConfig<TContext, TEvent, TState>;

export interface FlowStateNode<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly invoke?: FlowStateInvoke | readonly FlowStateInvoke[];
  readonly after?: FlowAfterDefinition<unknown> | readonly FlowAfterDefinition<unknown>[];
  readonly initial?: string;
  readonly states?: Record<string, FlowStateNode<TContext, TEvent, TState>>;
  readonly type?: "atomic" | "compound" | "parallel" | "final" | "history";
  readonly history?: FlowHistoryDefinition<unknown>;
  readonly permissions?:
    | FlowPermissionDefinition<TContext, TEvent, TState>
    | readonly FlowPermissionDefinition<TContext, TEvent, TState>[];
  readonly invariants?:
    | FlowInvariantDefinition<TContext, TEvent, TState>
    | readonly FlowInvariantDefinition<TContext, TEvent, TState>[];
  readonly on?: Partial<
    Record<
      TEvent["type"],
      FlowTransition<TContext, TEvent, TState> | readonly FlowTransition<TContext, TEvent, TState>[]
    >
  >;
}

export interface FlowMachineConfig<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly id?: string;
  readonly initial: TState;
  readonly context: TContext | (() => TContext);
  readonly states: Record<TState, FlowStateNode<TContext, TEvent, TState>>;
  readonly persist?: FlowPersistenceDefinition<unknown>;
  readonly invariants?:
    | FlowInvariantDefinition<TContext, TEvent, TState>
    | readonly FlowInvariantDefinition<TContext, TEvent, TState>[];
}

export interface FlowMachine<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly id: string | undefined;
  readonly initial: TState;
  readonly config: FlowMachineConfig<TContext, TEvent, TState>;
  getInitialSnapshot(): FlowSnapshot<TContext, TState>;
  transition(
    snapshot: FlowSnapshot<TContext, TState>,
    event: TEvent,
    runtime?: FlowRuntimeEnvironment,
  ): FlowSnapshot<TContext, TState>;
  can(snapshot: FlowSnapshot<TContext, TState>, event: FlowEvent): boolean;
}

export interface FlowActorRef<TContext, TEvent extends FlowEvent, TState extends string> {
  getSnapshot(): FlowSnapshot<TContext, TState>;
  send(event: TEvent): FlowSnapshot<TContext, TState>;
  subscribe(listener: () => void): () => void;
  can(event: FlowEvent): boolean;
}

export interface FlowRuntimeOptions {
  readonly inspect?: (snapshot: FlowSnapshot<unknown>, event: FlowEvent | null) => void;
  readonly layer?: unknown;
  readonly now?: () => number;
}

export interface FlowActorOptions<TContext> {
  readonly context?: Partial<TContext> | ((context: TContext) => TContext);
  readonly resources?: Readonly<Record<string, FlowResourceSnapshot>>;
}

export interface FlowRuntime {
  createActor<TContext, TEvent extends FlowEvent, TState extends string>(
    machine: FlowMachine<TContext, TEvent, TState>,
    options?: FlowActorOptions<TContext>,
  ): FlowActorRef<TContext, TEvent, TState>;
}

export interface FlowProviderProps {
  readonly runtime?: FlowRuntime;
  readonly children?: React.ReactNode;
}

export type FlowPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer TItem)[]
    ? readonly FlowPartial<TItem>[]
    : T extends object
      ? { readonly [TKey in keyof T]?: FlowPartial<T[TKey]> }
      : T;

export interface FlowTestLayer<TIdentifier, TImplementation extends object> {
  readonly kind: "testLayer";
  readonly service: Context.Key<TIdentifier, TImplementation>;
  readonly implementation: TImplementation;
  readonly layer: Layer.Layer<TIdentifier>;
}

export interface ControlledEffectHandle<TSuccess = unknown, TFailure = unknown> {
  readonly kind: "controlledEffect";
  readonly name: string;
  effect(): Effect.Effect<TSuccess, TFailure>;
  succeed(value: TSuccess): void;
  fail(error: TFailure): void;
  die(defect: unknown): void;
  cancel(): void;
  attempts(): number;
  state(): ControlledEffectState<TSuccess, TFailure>;
}

export type ControlledEffectState<TSuccess, TFailure> =
  | { readonly status: "idle"; readonly attempts: number }
  | { readonly status: "running"; readonly attempts: number }
  | { readonly status: "success"; readonly attempts: number; readonly value: TSuccess }
  | { readonly status: "failure"; readonly attempts: number; readonly error: TFailure }
  | { readonly status: "defect"; readonly attempts: number; readonly defect: unknown }
  | { readonly status: "cancelled"; readonly attempts: number };

export interface ControlledStreamHandle<TValue = unknown, TFailure = unknown> {
  readonly kind: "controlledStream";
  readonly name: string;
  stream(): Stream.Stream<TValue, TFailure>;
  emit(value: TValue): void;
  fail(error: TFailure): void;
  die(defect: unknown): void;
  end(): void;
  cancel(): void;
  active(): boolean;
  cancelled(): boolean;
  events(): readonly ControlledStreamEvent<TValue, TFailure>[];
  state(): ControlledStreamState<TValue, TFailure>;
}

export type ControlledStreamState<TValue, TFailure> =
  | { readonly status: "idle"; readonly emitted: number }
  | { readonly status: "running"; readonly emitted: number }
  | { readonly status: "done"; readonly emitted: number }
  | { readonly status: "failure"; readonly emitted: number; readonly error: TFailure }
  | { readonly status: "defect"; readonly emitted: number; readonly defect: unknown }
  | { readonly status: "cancelled"; readonly emitted: number }
  | { readonly status: "value"; readonly emitted: number; readonly latest: TValue };

export type ControlledStreamEvent<TValue, TFailure> =
  | { readonly type: "start" }
  | { readonly type: "value"; readonly value: TValue }
  | { readonly type: "failure"; readonly error: TFailure }
  | { readonly type: "defect"; readonly defect: unknown }
  | { readonly type: "done" }
  | { readonly type: "cancel" };

export type FlowEffectOutcome<TSuccess, TFailure> =
  | { readonly status: "success"; readonly value: TSuccess }
  | { readonly status: "failure"; readonly error: TFailure }
  | { readonly status: "defect"; readonly defect: unknown }
  | { readonly status: "interrupt" };

export interface FlowTestHarness<TContext, TEvent extends FlowEvent, TState extends string> {
  provide<TLayer>(layer: TLayer): FlowTestHarness<TContext, TEvent, TState>;
  start(options?: FlowActorOptions<TContext>): FlowTestHarness<TContext, TEvent, TState>;
  send(event: TEvent): FlowTestHarness<TContext, TEvent, TState>;
  snapshot(): FlowSnapshot<TContext, TState>;
  state(): TState;
  context(): TContext;
  can(event: FlowEvent): boolean;
  flush(): Promise<FlowTestHarness<TContext, TEvent, TState>>;
  settle(options?: FlowSettleOptions): Promise<FlowTestHarness<TContext, TEvent, TState>>;
  advance(duration: FlowDurationInput): Promise<FlowTestHarness<TContext, TEvent, TState>>;
  resources(): Readonly<Record<string, FlowResourceSnapshot>>;
  mutations(): Readonly<Record<string, FlowMutationSnapshot>>;
  effects(): FlowEffectInspector;
  streams(): FlowStreamInspector;
  timers(): FlowTimerInspector;
  cache(): FlowCacheInspector;
  transactions(): FlowTransactionInspector;
  receipts(): readonly FlowRuntimeReceipt[];
  issues(): readonly FlowRuntimeIssue[];
  clock(now: () => number): FlowTestHarness<TContext, TEvent, TState>;
}

export interface FlowSeededResource {
  readonly ref: {
    readonly kind: "resourceRef";
    readonly id: string;
    readonly key: FlowKey | string;
    readonly args: readonly unknown[];
    readonly definition: unknown;
  };
  readonly value: unknown;
}

export type FlowResourcePatch<TValue = unknown> =
  | {
      readonly ref: FlowResourceRef<TValue> | FlowSeededResource["ref"];
      readonly replace: TValue;
    }
  | {
      readonly ref: FlowResourceRef<TValue> | FlowSeededResource["ref"];
      readonly update: (current: TValue | undefined) => TValue;
    };

export interface FlowAppTestHarness<
  TModules extends readonly FlowModuleDefinition<string, object>[],
> {
  seedResource<TValue>(ref: FlowResourceRef<TValue>, value: TValue): FlowAppTestHarness<TModules>;
  seedResources(entries: readonly FlowSeededResource[]): FlowAppTestHarness<TModules>;
  start<TContext, TEvent extends FlowEvent, TState extends string>(
    machine: FlowMachine<TContext, TEvent, TState>,
    options?: FlowActorOptions<TContext>,
  ): FlowTestHarness<TContext, TEvent, TState>;
}

export interface FlowSettleOptions {
  readonly maxSteps?: number;
  readonly maxEvents?: number;
  readonly maxEffects?: number;
  readonly maxStreamEmissions?: number;
  readonly maxVirtualTime?: FlowDurationInput;
}

export type FlowDurationInput = number | string | { readonly millis: number };

export interface FlowResourceSnapshot {
  readonly id: string;
  readonly key: string | null;
  readonly tags?: readonly string[] | undefined;
  readonly status: "idle" | "loading" | "success" | "failure" | "interrupt";
  readonly fetchStatus: "idle" | "fetching";
  readonly requestId: number | null;
  readonly stale: boolean;
  readonly failureCount: number;
  readonly observers?: number | undefined;
  readonly updatedAt?: number | undefined;
  readonly staleAt?: number | undefined;
  readonly gcAt?: number | undefined;
  readonly invalidatedAt?: number | undefined;
  readonly value?: unknown;
  readonly error?: unknown;
}

export interface FlowMutationSnapshot {
  readonly id: string;
  readonly status: "idle" | "running" | "success" | "failure" | "interrupt";
  readonly requestId: number | null;
  readonly variables: unknown;
  readonly failureCount: number;
  readonly value?: unknown;
  readonly error?: unknown;
}

export interface FlowStreamSnapshot {
  readonly id: string;
  readonly status: "idle" | "running" | "done" | "failure" | "defect" | "interrupt";
  readonly latest?: unknown;
  readonly error?: unknown;
  readonly defect?: unknown;
  readonly emitted: number;
  readonly coalesced: number;
  readonly dropped: number;
  readonly startedAt?: number;
  readonly endedAt?: number;
}

export interface FlowTimerSnapshot {
  readonly id: string;
  readonly status: "scheduled" | "fired" | "cancelled";
  readonly delay: FlowDurationInput;
  readonly scheduledAt: number;
  readonly fireAt: number;
  readonly firedAt?: number;
  readonly cancelledAt?: number;
}

export interface FlowChildSnapshot<TState extends string = string> {
  readonly id: string;
  readonly status: "idle" | "starting" | "active" | "done" | "failure" | "stopped";
  readonly state: TState | null;
  readonly parentState?: string | undefined;
  readonly supervision?: "parent" | "detached" | "restart-on-failure" | "stop-on-failure";
  readonly startedAt?: number | undefined;
  readonly stoppedAt?: number | undefined;
  readonly error?: unknown;
}

export interface FlowRuntimeReceipt {
  readonly type:
    | "query:start"
    | "query:success"
    | "query:failure"
    | "query:defect"
    | "query:interrupt"
    | "query:cancel"
    | "mutation:start"
    | "mutation:success"
    | "mutation:failure"
    | "mutation:defect"
    | "mutation:interrupt"
    | "mutation:cancel"
    | "mutation:preview-patch"
    | "mutation:optimistic-patch"
    | "mutation:rollback"
    | "cache:invalidate"
    | "cache:write"
    | "cache:stale"
    | "stream:start"
    | "stream:value"
    | "stream:failure"
    | "stream:defect"
    | "stream:done"
    | "stream:interrupt"
    | "stream:cancel"
    | "stream:coalesce"
    | "stream:drop"
    | "timer:schedule"
    | "timer:fire"
    | "timer:cancel"
    | "child:start"
    | "child:stop"
    | "child:done"
    | "child:failure"
    | "trace:capture";
  readonly id: string;
  readonly requestId?: number | null;
  readonly key?: string | undefined;
  readonly target?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly value?: unknown;
  readonly dueAt?: number | undefined;
  readonly at?: number | undefined;
}

export interface FlowRuntimeIssue {
  readonly kind: "failure" | "defect" | "interrupt";
  readonly source: "query" | "mutation" | "effect" | "stream";
  readonly id: string;
  readonly requestId: number;
  readonly key?: string | undefined;
  readonly error?: unknown;
  readonly defect?: unknown;
  readonly handled: boolean;
}

export interface FlowEffectInspector {
  running(id: string): FlowResourceSnapshot | FlowMutationSnapshot | null;
  completed(id: string): FlowResourceSnapshot | FlowMutationSnapshot | null;
  attempts(id: string): number;
}

export interface FlowStreamInspector {
  get(id: string): FlowStreamSnapshot | null;
  running(id: string): FlowStreamSnapshot | null;
  completed(id: string): FlowStreamSnapshot | null;
  cancelled(id: string): FlowStreamSnapshot | null;
  events(id: string): readonly FlowRuntimeReceipt[];
  diagnostics(id: string): Pick<FlowStreamSnapshot, "coalesced" | "dropped"> | null;
}

export interface FlowTimerInspector {
  get(id: string): FlowTimerSnapshot | null;
  scheduled(id: string): FlowTimerSnapshot | null;
  fired(id: string): FlowTimerSnapshot | null;
  cancelled(id: string): FlowTimerSnapshot | null;
}

export interface FlowCacheInspector {
  get(idOrKey: string | FlowKey): FlowResourceSnapshot | null;
  query(id: string): FlowResourceSnapshot | null;
  stale(idOrKey?: string | FlowKey): readonly FlowResourceSnapshot[];
  invalidations(target?: string | FlowKey | FlowTag): readonly FlowRuntimeReceipt[];
  writes(idOrKey?: string | FlowKey): readonly FlowRuntimeReceipt[];
  snapshot(): Readonly<Record<string, FlowResourceSnapshot>>;
}

export interface FlowTransactionInspector {
  events(id?: string): readonly FlowRuntimeReceipt[];
  previewPatches(id?: string): readonly FlowRuntimeReceipt[];
  /** @deprecated Use previewPatches. */
  optimisticPatches(id?: string): readonly FlowRuntimeReceipt[];
  rollbacks(id?: string): readonly FlowRuntimeReceipt[];
}

export interface FlowFuzzConfig<TEvent extends FlowEvent> {
  readonly events: readonly TEvent[];
  readonly maxEvents?: number;
  readonly iterations?: number;
}

export interface FlowFuzzReport<TState extends string = string> {
  readonly kind: "fuzz";
  readonly iterations: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly finalState: TState | string;
  readonly issues: readonly FlowRuntimeIssue[];
}

export interface FlowGraphState {
  readonly id: string;
  readonly type: "atomic" | "compound" | "parallel" | "final" | "history";
  readonly initial?: string | undefined;
}

export interface FlowGraphTransition {
  readonly id: string;
  readonly source: string;
  readonly event: string;
  readonly target: string;
  readonly guard: boolean;
  readonly actions: number;
  readonly submits: readonly string[];
}

export interface FlowGraphInvoke {
  readonly id: string;
  readonly source: string;
  readonly kind: FlowStateInvoke["kind"] | "after";
  readonly target?: string | undefined;
}

export interface FlowGraphUnsupportedFeature {
  readonly source: string;
  readonly feature: string;
  readonly reason: string;
}

export interface FlowGraph {
  readonly kind: "graph";
  readonly version: 1;
  readonly machineId?: string | undefined;
  readonly initial: string;
  readonly states: readonly FlowGraphState[];
  readonly transitions: readonly FlowGraphTransition[];
  readonly invokes: readonly FlowGraphInvoke[];
  readonly unsupported: readonly FlowGraphUnsupportedFeature[];
}

export interface FlowGraphDiff {
  readonly kind: "graphDiff";
  readonly addedStates: readonly string[];
  readonly removedStates: readonly string[];
  readonly addedTransitions: readonly string[];
  readonly removedTransitions: readonly string[];
  readonly changedInvokes: readonly string[];
  readonly unsupported: readonly FlowGraphUnsupportedFeature[];
}

export interface FlowTraceEvent<TEvent extends FlowEvent = FlowEvent> {
  readonly index: number;
  readonly event: TEvent;
}

export interface FlowTraceOptions {
  readonly includeSnapshots?: boolean;
  readonly redact?: (value: unknown, path: readonly string[]) => unknown;
}

export interface FlowTraceSession<TContext = unknown, TState extends string = string> {
  readonly kind: "trace";
  readonly version: 1;
  readonly source: "actor" | "snapshot" | "manual";
  readonly events: readonly FlowTraceEvent[];
  readonly receipts: readonly FlowRuntimeReceipt[];
  readonly issues: readonly FlowRuntimeIssue[];
  readonly snapshots: readonly FlowSnapshot<TContext, TState>[];
  readonly redacted: boolean;
}

export interface FlowReplayReport<TState extends string = string> {
  readonly kind: "replay";
  readonly traceVersion: number;
  readonly events: number;
  readonly receipts: number;
  readonly acceptedEvents: number;
  readonly rejectedEvents: number;
  readonly finalState: TState | string;
  readonly unsupportedReceipts: readonly string[];
}

export interface FlowStoryFixture<TState extends string = string> {
  readonly name: string;
  readonly state: TState | string;
  readonly snapshot?: FlowPartial<FlowSnapshot<unknown, TState>>;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface FlowStoryReport {
  readonly kind: "stories";
  readonly machineId?: string | undefined;
  readonly fixtures: readonly FlowStoryFixture[];
  readonly missingStates: readonly string[];
}

export interface FlowTourStep<TEvent extends FlowEvent = FlowEvent> {
  readonly name: string;
  readonly event?: TEvent | undefined;
  readonly advance?: FlowDurationInput | undefined;
  readonly flush?: boolean | undefined;
}

export interface FlowTourReport {
  readonly kind: "tour";
  readonly name: string;
  readonly steps: readonly FlowTourStep[];
  readonly events: number;
}

export interface FlowModelReport {
  readonly kind: "model";
  readonly graph: FlowGraph;
  readonly states: readonly string[];
  readonly transitions: readonly string[];
  readonly unsupported: readonly FlowGraphUnsupportedFeature[];
}

export interface FlowDevtoolsProtocol {
  readonly kind: "devtools";
  readonly version: 1;
  readonly channels: readonly ("snapshot" | "trace" | "graph" | "cache" | "children")[];
}

export interface PlaywrightFlowDriver {
  readonly kind: "playwright-flow";
  readonly selectors: Readonly<Record<string, string>>;
  readonly events: readonly string[];
}

export interface FlowTestApi {
  <TContext, TEvent extends FlowEvent, TState extends string>(
    machine: FlowMachine<TContext, TEvent, TState>,
  ): FlowTestHarness<TContext, TEvent, TState>;
  app<const TModules extends readonly FlowModuleDefinition<string, object>[]>(
    app: FlowAppDefinition<TModules>,
  ): FlowAppTestHarness<TModules>;
  model<TContext, TEvent extends FlowEvent, TState extends string>(
    machine: FlowMachine<TContext, TEvent, TState>,
  ): FlowModelReport;
  replay<TContext, TEvent extends FlowEvent, TState extends string>(
    machine: FlowMachine<TContext, TEvent, TState>,
    trace: FlowTraceSession<TContext, TState>,
  ): FlowReplayReport;
  fuzz<TContext, TEvent extends FlowEvent, TState extends string>(
    machine: FlowMachine<TContext, TEvent, TState>,
    config: FlowFuzzConfig<TEvent>,
  ): FlowFuzzReport<TState>;
}

export interface FlowMatchHandlers<TSnapshot, TResult> {
  readonly [state: string]: ((snapshot: TSnapshot) => TResult) | undefined;
  readonly _: (snapshot: TSnapshot) => TResult;
}

export interface FlowApi {
  module<TName extends string, TMembers extends object>(
    this: void,
    name: TName,
    build: (api: FlowApi) => TMembers,
  ): FlowModuleDefinition<TName, TMembers>;
  app<const TModules extends readonly FlowModuleDefinition<string, object>[]>(config: {
    readonly modules: TModules;
  }): FlowAppDefinition<TModules>;
  runtime<TRequirements, TLayerError>(
    layer: Layer.Layer<TRequirements, TLayerError, never>,
  ): FlowManagedRuntime<TRequirements, TLayerError>;
  readonly store: {
    memory<TConfig = undefined>(config?: TConfig): FlowStoreDefinition<"store:memory", TConfig>;
    test<TConfig = undefined>(config?: TConfig): FlowStoreDefinition<"store:test", TConfig>;
  };
  readonly orchestrators: {
    live<TConfig = undefined>(
      config?: TConfig,
    ): FlowOrchestratorDefinition<"orchestrators:live", TConfig>;
    test<TConfig = undefined>(
      config?: TConfig,
    ): FlowOrchestratorDefinition<"orchestrators:test", TConfig>;
  };
  machine<TContext, TEvent extends FlowEvent, TState extends string>(
    this: void,
    config: FlowMachineConfig<TContext, TEvent, TState>,
  ): FlowMachine<TContext, TEvent, TState>;
  assign<TContext, TEvent extends FlowEvent, TState extends string>(
    this: void,
    updater: FlowAssignUpdater<TContext, TEvent, TState>,
  ): FlowAssignAction<TContext, TEvent, TState>;
  guard<TContext, TEvent extends FlowEvent, TState extends string>(
    this: void,
    predicate: FlowGuardPredicate<TContext, TEvent, TState>,
  ): FlowGuard<TContext, TEvent, TState>;
  action<TContext, TEvent extends FlowEvent, TState extends string>(
    this: void,
    fn: FlowActionFunction<TContext, TEvent, TState>,
  ): FlowEffectAction<TContext, TEvent, TState>;
  effect<TConfig>(this: void, config: TConfig): FlowEffectDefinition<TConfig>;
  resource<TArgs extends readonly unknown[], TValue, TFailure = unknown, TRequirements = unknown>(
    this: void,
    config: FlowResourceConfig<TArgs, TValue, TFailure, TRequirements>,
  ): FlowResourceCallable<TArgs, TValue, TFailure, TRequirements>;
  query<TConfig>(this: void, config: TConfig): FlowQueryDefinition<TConfig>;
  mutation<TConfig extends FlowMutationDescriptorConfig>(
    this: void,
    config: TConfig,
  ): FlowMutationDefinition<TConfig>;
  mutation<
    TContext,
    TEvent extends FlowEvent,
    TInput = unknown,
    TValue = unknown,
    TFailure = unknown,
    TRequirements = unknown,
  >(
    this: void,
    config: FlowMutationConfig<TContext, TEvent, TInput, TValue, TFailure, TRequirements>,
  ): FlowMutationDefinition<
    FlowMutationConfig<TContext, TEvent, TInput, TValue, TFailure, TRequirements>
  >;
  run<TConfig>(
    this: void,
    mutation: FlowMutationDefinition<TConfig>,
    config?: unknown,
  ): FlowRunDefinition<{
    readonly mutation: FlowMutationDefinition<TConfig>;
    readonly config?: unknown;
  }>;
  ensure<TConfig>(
    this: void,
    resource: TConfig,
    config?: unknown,
  ): FlowEnsureDefinition<{
    readonly resource: TConfig;
    readonly config?: unknown;
  }>;
  observe<TConfig>(this: void, resource: TConfig): FlowObserveDefinition<TConfig>;
  refresh<TConfig>(this: void, resource: TConfig): FlowRefreshDefinition<TConfig>;
  patch<TConfig>(
    this: void,
    resource: TConfig,
    patch: unknown,
  ): FlowPatchDefinition<{
    readonly resource: TConfig;
    readonly patch: unknown;
  }>;
  invalidate<TConfig>(this: void, target: TConfig): FlowInvalidateDefinition<TConfig>;
  stream<TConfig extends FlowStreamDescriptorConfig>(
    this: void,
    config: TConfig,
  ): FlowStreamDefinition<TConfig>;
  stream<
    TContext,
    TEvent extends FlowEvent,
    TInput = void,
    TValue = unknown,
    TFailure = unknown,
    TServices = unknown,
  >(
    this: void,
    config: FlowStreamConfig<TContext, TEvent, TInput, TValue, TFailure, TServices>,
  ): FlowStreamDefinition<FlowStreamConfig<TContext, TEvent, TInput, TValue, TFailure, TServices>>;
  child<TConfig>(this: void, config: TConfig): FlowChildDefinition<TConfig>;
  after<TConfig>(this: void, config: TConfig): FlowAfterDefinition<TConfig>;
  use<TContext, TEvent extends FlowEvent, TState extends string>(
    machine: FlowMachine<TContext, TEvent, TState>,
    options?: FlowActorOptions<TContext>,
  ): FlowActorRef<TContext, TEvent, TState>;
  useResource<TValue, TFailure, TRequirements>(
    ref: FlowResourceRef<TValue, TFailure, TRequirements>,
  ): FlowResourceSnapshot | null;
  view<TContext, TState extends string, TSelected>(
    this: void,
    config: FlowViewConfig<TContext, TState, TSelected>,
  ): FlowViewDefinition<FlowViewConfig<TContext, TState, TSelected>>;
  useView<TContext, TEvent extends FlowEvent, TState extends string, TSelected>(
    actorOrSnapshot: FlowActorRef<TContext, TEvent, TState> | FlowSnapshot<TContext, TState>,
    view: FlowViewDefinition<FlowViewConfig<TContext, TState, TSelected>>,
  ): TSelected;
  schema<TConfig>(config: TConfig): FlowSchemaDefinition<TConfig>;
  persist<TConfig>(config: TConfig): FlowPersistenceDefinition<TConfig>;
  history<TConfig>(config: TConfig): FlowHistoryDefinition<TConfig>;
  outcomes<TValue, TFailure, TEvent extends FlowEvent>(
    config: FlowOutcomeRoutesConfig<TValue, TFailure, TEvent>,
  ): FlowAsyncRoutes<TValue, TFailure, TEvent>;
  permission<TContext, TEvent extends FlowEvent, TState extends string>(
    config: Omit<FlowPermissionDefinition<TContext, TEvent, TState>, "kind">,
  ): FlowPermissionDefinition<TContext, TEvent, TState>;
  invariant<TContext, TEvent extends FlowEvent, TState extends string>(
    config: Omit<FlowInvariantDefinition<TContext, TEvent, TState>, "kind">,
  ): FlowInvariantDefinition<TContext, TEvent, TState>;
  submit<TContext, TEvent extends FlowEvent, TState extends string>(
    mutation: FlowMutationDefinition<unknown>,
    options?: FlowSubmitOptions<TContext, TEvent, TState>,
  ): FlowTransitionConfig<TContext, TEvent, TState>;
  can<TContext, TState extends string>(
    actorOrSnapshot: FlowActorRef<TContext, FlowEvent, TState> | FlowSnapshot<TContext, TState>,
    event: FlowEvent,
  ): boolean;
  match<TContext, TState extends string, TResult>(
    snapshot: FlowSnapshot<TContext, TState>,
    handlers: FlowMatchHandlers<FlowSnapshot<TContext, TState>, TResult>,
  ): TResult;
}

const RuntimeContext = React.createContext<FlowRuntime | null>(null);

function defineMutation<TConfig extends FlowMutationDescriptorConfig>(
  config: TConfig,
): FlowMutationDefinition<TConfig>;
function defineMutation<
  TContext,
  TEvent extends FlowEvent,
  TInput = unknown,
  TValue = unknown,
  TFailure = unknown,
>(
  config: FlowMutationConfig<TContext, TEvent, TInput, TValue, TFailure>,
): FlowMutationDefinition<FlowMutationConfig<TContext, TEvent, TInput, TValue, TFailure>>;
function defineMutation(config: unknown): FlowMutationDefinition<unknown> {
  return { kind: "mutation", config };
}

function defineStream<TConfig extends FlowStreamDescriptorConfig>(
  config: TConfig,
): FlowStreamDefinition<TConfig>;
function defineStream<
  TContext,
  TEvent extends FlowEvent,
  TInput = void,
  TValue = unknown,
  TFailure = unknown,
  TServices = unknown,
>(
  config: FlowStreamConfig<TContext, TEvent, TInput, TValue, TFailure, TServices>,
): FlowStreamDefinition<FlowStreamConfig<TContext, TEvent, TInput, TValue, TFailure, TServices>>;
function defineStream(config: unknown): FlowStreamDefinition<unknown> {
  return { kind: "stream", config };
}

export const flow: FlowApi = {
  module<TName extends string, TMembers extends object>(
    name: TName,
    build: (api: FlowApi) => TMembers,
  ): FlowModuleDefinition<TName, TMembers> {
    return Object.assign(build(flow), {
      kind: "module" as const,
      name,
    });
  },
  app<const TModules extends readonly FlowModuleDefinition<string, object>[]>(config: {
    readonly modules: TModules;
  }): FlowAppDefinition<TModules> {
    return {
      kind: "app",
      modules: config.modules,
      layer<const TServices extends readonly FlowAnyLayer[]>(
        layerConfig: FlowAppLayerConfig<TServices> = {},
      ): FlowAppLayer<TServices> {
        const services = (layerConfig.services ?? []) as unknown as TServices;
        const layer =
          services.length === 0
            ? (Layer.empty as unknown as Layer.Layer<unknown, unknown, never>)
            : (Layer.mergeAll(
                ...([...services] as unknown as [
                  Layer.Layer<never, unknown, never>,
                  ...Layer.Layer<never, unknown, never>[],
                ]),
              ) as unknown as Layer.Layer<unknown, unknown, never>);
        // vNext descriptor shim: preserve real Effect Layer composition while the
        // Flow runtime service layer types are still contract-first.
        return Object.assign(layer, {
          flowAppLayer: {
            kind: "app-layer" as const,
            ...(layerConfig.store === undefined ? {} : { store: layerConfig.store }),
            ...(layerConfig.orchestrators === undefined
              ? {}
              : { orchestrators: layerConfig.orchestrators }),
            services,
          },
        });
      },
    };
  },
  runtime<TRequirements, TLayerError>(
    layer: Layer.Layer<TRequirements, TLayerError, never>,
  ): FlowManagedRuntime<TRequirements, TLayerError> {
    const managedRuntime = ManagedRuntime.make(layer);
    return {
      managedRuntime,
      runPromise<TValue, TFailure>(
        effect: Effect.Effect<TValue, TFailure, TRequirements>,
      ): Promise<TValue> {
        return managedRuntime.runPromise(effect);
      },
      runPromiseExit<TValue, TFailure>(
        effect: Effect.Effect<TValue, TFailure, TRequirements>,
      ): Promise<Exit.Exit<TValue, TFailure | TLayerError>> {
        return managedRuntime.runPromiseExit(effect);
      },
      dispose(): Promise<void> {
        return managedRuntime.dispose();
      },
      disposeEffect: managedRuntime.disposeEffect,
    };
  },
  store: {
    memory<TConfig = undefined>(config?: TConfig): FlowStoreDefinition<"store:memory", TConfig> {
      return { kind: "store:memory", config: config as TConfig };
    },
    test<TConfig = undefined>(config?: TConfig): FlowStoreDefinition<"store:test", TConfig> {
      return { kind: "store:test", config: config as TConfig };
    },
  },
  orchestrators: {
    live<TConfig = undefined>(
      config?: TConfig,
    ): FlowOrchestratorDefinition<"orchestrators:live", TConfig> {
      return { kind: "orchestrators:live", config: config as TConfig };
    },
    test<TConfig = undefined>(
      config?: TConfig,
    ): FlowOrchestratorDefinition<"orchestrators:test", TConfig> {
      return { kind: "orchestrators:test", config: config as TConfig };
    },
  },
  machine<TContext, TEvent extends FlowEvent, TState extends string>(
    config: FlowMachineConfig<TContext, TEvent, TState>,
  ): FlowMachine<TContext, TEvent, TState> {
    return createMachineFromConfig(config);
  },
  assign<TContext, TEvent extends FlowEvent, TState extends string>(
    updater: FlowAssignUpdater<TContext, TEvent, TState>,
  ): FlowAssignAction<TContext, TEvent, TState> {
    return { kind: "assign", updater };
  },
  guard<TContext, TEvent extends FlowEvent, TState extends string>(
    predicate: FlowGuardPredicate<TContext, TEvent, TState>,
  ): FlowGuard<TContext, TEvent, TState> {
    return { kind: "guard", predicate };
  },
  action<TContext, TEvent extends FlowEvent, TState extends string>(
    fn: FlowActionFunction<TContext, TEvent, TState>,
  ): FlowEffectAction<TContext, TEvent, TState> {
    return { kind: "action", fn };
  },
  effect<TConfig>(config: TConfig): FlowEffectDefinition<TConfig> {
    return { kind: "effect", config };
  },
  resource<TArgs extends readonly unknown[], TValue, TFailure = unknown, TRequirements = unknown>(
    config: FlowResourceConfig<TArgs, TValue, TFailure, TRequirements>,
  ): FlowResourceCallable<TArgs, TValue, TFailure, TRequirements> {
    const definition = { kind: "resource" as const, config };
    const ref = (...args: TArgs): FlowResourceRef<TValue, TFailure, TRequirements> => {
      const key = config.key(...args);
      return {
        kind: "resourceRef",
        id: config.id ?? toKeyHash(key) ?? JSON.stringify(args),
        key: key as FlowKey | string,
        args,
        definition: definition as FlowResourceDefinition<
          FlowResourceConfig<readonly unknown[], TValue, TFailure, TRequirements>
        >,
      };
    };

    return Object.assign(ref, definition, { ref });
  },
  query<TConfig>(config: TConfig): FlowQueryDefinition<TConfig> {
    return { kind: "query", config };
  },
  mutation: defineMutation,
  run<TConfig>(
    mutation: FlowMutationDefinition<TConfig>,
    config?: unknown,
  ): FlowRunDefinition<{
    readonly mutation: FlowMutationDefinition<TConfig>;
    readonly config?: unknown;
  }> {
    return {
      kind: "run",
      config: { mutation, ...(config === undefined ? {} : { config }) },
    };
  },
  ensure<TConfig>(
    resource: TConfig,
    config?: unknown,
  ): FlowEnsureDefinition<{
    readonly resource: TConfig;
    readonly config?: unknown;
  }> {
    return {
      kind: "ensure",
      config: { resource, ...(config === undefined ? {} : { config }) },
    };
  },
  observe<TConfig>(resource: TConfig): FlowObserveDefinition<TConfig> {
    return { kind: "observe", config: resource };
  },
  refresh<TConfig>(resource: TConfig): FlowRefreshDefinition<TConfig> {
    return { kind: "refresh", config: resource };
  },
  patch<TConfig>(
    resource: TConfig,
    patch: unknown,
  ): FlowPatchDefinition<{
    readonly resource: TConfig;
    readonly patch: unknown;
  }> {
    return { kind: "patch", config: { resource, patch } };
  },
  invalidate<TConfig>(target: TConfig): FlowInvalidateDefinition<TConfig> {
    return { kind: "invalidate", config: target };
  },
  stream: defineStream,
  child<TConfig>(config: TConfig): FlowChildDefinition<TConfig> {
    return { kind: "child", config };
  },
  after<TConfig>(config: TConfig): FlowAfterDefinition<TConfig> {
    return { kind: "after", config };
  },
  use<TContext, TEvent extends FlowEvent, TState extends string>(
    machine: FlowMachine<TContext, TEvent, TState>,
    options?: FlowActorOptions<TContext>,
  ): FlowActorRef<TContext, TEvent, TState> {
    return useFlow(machine, options);
  },
  useResource<TValue, TFailure, TRequirements>(
    ref: FlowResourceRef<TValue, TFailure, TRequirements>,
  ): FlowResourceSnapshot | null {
    React.useDebugValue(ref.id);
    return null;
  },
  view<TContext, TState extends string, TSelected>(
    config: FlowViewConfig<TContext, TState, TSelected>,
  ): FlowViewDefinition<FlowViewConfig<TContext, TState, TSelected>> {
    return { kind: "view", config };
  },
  useView<TContext, TEvent extends FlowEvent, TState extends string, TSelected>(
    actorOrSnapshot: FlowActorRef<TContext, TEvent, TState> | FlowSnapshot<TContext, TState>,
    view: FlowViewDefinition<FlowViewConfig<TContext, TState, TSelected>>,
  ): TSelected {
    return useView(actorOrSnapshot, view);
  },
  schema<TConfig>(config: TConfig): FlowSchemaDefinition<TConfig> {
    return { kind: "schema", config };
  },
  persist<TConfig>(config: TConfig): FlowPersistenceDefinition<TConfig> {
    return { kind: "persist", config };
  },
  history<TConfig>(config: TConfig): FlowHistoryDefinition<TConfig> {
    return { kind: "history", config };
  },
  outcomes<TValue, TFailure, TEvent extends FlowEvent>(
    config: FlowOutcomeRoutesConfig<TValue, TFailure, TEvent>,
  ): FlowAsyncRoutes<TValue, TFailure, TEvent> {
    const routes: {
      success?: FlowAsyncRoutes<TValue, TFailure, TEvent>["success"];
      failure?: FlowAsyncRoutes<TValue, TFailure, TEvent>["failure"];
      defect?: FlowAsyncRoutes<TValue, TFailure, TEvent>["defect"];
      interrupt?: FlowAsyncRoutes<TValue, TFailure, TEvent>["interrupt"];
    } = {};

    if (config.success !== undefined) {
      const success = config.success;
      routes.success = (args) => createOutcomeEvent(success, args, "value");
    }
    if (config.failure !== undefined) {
      const failure = config.failure;
      routes.failure = (args) => createOutcomeEvent(failure, args, "error");
    }
    if (config.defect !== undefined) {
      const defect = config.defect;
      routes.defect = (args) => createOutcomeEvent(defect, args, "defect");
    }
    if (config.interrupt !== undefined) {
      const interrupt = config.interrupt;
      routes.interrupt = (args) => createOutcomeEvent(interrupt, args);
    }

    return routes as FlowAsyncRoutes<TValue, TFailure, TEvent>;
  },
  permission<TContext, TEvent extends FlowEvent, TState extends string>(
    config: Omit<FlowPermissionDefinition<TContext, TEvent, TState>, "kind">,
  ): FlowPermissionDefinition<TContext, TEvent, TState> {
    return { kind: "permission", ...config };
  },
  invariant<TContext, TEvent extends FlowEvent, TState extends string>(
    config: Omit<FlowInvariantDefinition<TContext, TEvent, TState>, "kind">,
  ): FlowInvariantDefinition<TContext, TEvent, TState> {
    return { kind: "invariant", ...config };
  },
  submit<TContext, TEvent extends FlowEvent, TState extends string>(
    mutation: FlowMutationDefinition<unknown>,
    options: FlowSubmitOptions<TContext, TEvent, TState> = {},
  ): FlowTransitionConfig<TContext, TEvent, TState> {
    return {
      ...options,
      submit: mutation,
    };
  },
  can<TContext, TState extends string>(
    actorOrSnapshot: FlowActorRef<TContext, FlowEvent, TState> | FlowSnapshot<TContext, TState>,
    event: FlowEvent,
  ): boolean {
    return isActor(actorOrSnapshot) ? actorOrSnapshot.can(event) : actorOrSnapshot.can(event);
  },
  match<TContext, TState extends string, TResult>(
    snapshot: FlowSnapshot<TContext, TState>,
    handlers: FlowMatchHandlers<FlowSnapshot<TContext, TState>, TResult>,
  ): TResult {
    const stateHandler = handlers[snapshot.value];
    return (stateHandler ?? handlers._)(snapshot);
  },
};

function createOutcomeEvent<TArgs extends { readonly requestId: number }, TEvent extends FlowEvent>(
  route: FlowOutcomeRoute<TArgs, TEvent>,
  args: TArgs,
  payloadKey?: string,
): TEvent {
  if (typeof route === "function") {
    return route(args);
  }

  const type = Array.isArray(route) ? route[0] : route;
  const key = Array.isArray(route) ? route[1] : payloadKey;
  const payload = { type, requestId: args.requestId } as Record<string, unknown>;

  if (key !== undefined && "value" in args) {
    payload[key] = args.value;
  } else if (key !== undefined && "error" in args) {
    payload[key] = args.error;
  } else if (key !== undefined && "defect" in args) {
    payload[key] = args.defect;
  }

  return payload as TEvent;
}

function formatDurationInput(duration: FlowDurationInput): string {
  return typeof duration === "object" ? `${duration.millis}ms` : String(duration);
}

export function createKey<const TParts extends readonly unknown[]>(
  ...parts: TParts
): FlowKey<TParts> {
  return {
    kind: "key",
    parts,
    hash: JSON.stringify(parts),
  };
}

export function createTag<const TName extends string>(name: TName): FlowTag<TName> {
  return {
    kind: "tag",
    name,
  };
}

export function createStatePath<const TSegments extends readonly string[]>(
  ...segments: TSegments
): FlowStatePath<TSegments> {
  return {
    kind: "statePath",
    segments,
    id: segments.join("."),
  };
}

export function createTestLayer<TIdentifier, TImplementation extends object>(
  service: Context.Key<TIdentifier, TImplementation>,
  implementation: TImplementation,
): FlowTestLayer<TIdentifier, TImplementation> {
  return {
    kind: "testLayer",
    service,
    implementation,
    layer: Layer.succeed(service, implementation),
  };
}

export function createControlledEffect<TSuccess = unknown, TFailure = unknown>(
  name: string,
): ControlledEffectHandle<TSuccess, TFailure> {
  let current: ControlledEffectState<TSuccess, TFailure> = {
    status: "idle",
    attempts: 0,
  };
  let pending: readonly Deferred.Deferred<TSuccess, TFailure>[] = [];
  let queuedCompletions: readonly ((
    deferred: Deferred.Deferred<TSuccess, TFailure>,
  ) => Effect.Effect<boolean>)[] = [];

  const completePending = (
    nextState: ControlledEffectState<TSuccess, TFailure>,
    complete: (deferred: Deferred.Deferred<TSuccess, TFailure>) => Effect.Effect<boolean>,
  ): void => {
    current = nextState;

    const [deferred, ...remaining] = pending;
    pending = remaining;
    if (deferred !== undefined) {
      Effect.runSync(complete(deferred));
    } else {
      queuedCompletions = [...queuedCompletions, complete];
    }
  };

  return {
    kind: "controlledEffect",
    name,
    effect(): Effect.Effect<TSuccess, TFailure> {
      current = { status: "running", attempts: current.attempts + 1 };
      const deferred = Effect.runSync(Deferred.make<TSuccess, TFailure>());
      const [queued, ...remaining] = queuedCompletions;
      queuedCompletions = remaining;
      if (queued === undefined) {
        pending = [...pending, deferred];
      } else {
        Effect.runSync(queued(deferred));
      }
      return Deferred.await(deferred);
    },
    succeed(value: TSuccess): void {
      completePending({ status: "success", attempts: current.attempts, value }, (deferred) =>
        Deferred.succeed(deferred, value),
      );
    },
    fail(error: TFailure): void {
      completePending({ status: "failure", attempts: current.attempts, error }, (deferred) =>
        Deferred.fail(deferred, error),
      );
    },
    die(defect: unknown): void {
      completePending({ status: "defect", attempts: current.attempts, defect }, (deferred) =>
        Deferred.die(deferred, defect),
      );
    },
    cancel(): void {
      completePending({ status: "cancelled", attempts: current.attempts }, Deferred.interrupt);
    },
    attempts(): number {
      return current.attempts;
    },
    state(): ControlledEffectState<TSuccess, TFailure> {
      return current;
    },
  };
}

export function createControlledStream<TValue = unknown, TFailure = unknown>(
  name: string,
): ControlledStreamHandle<TValue, TFailure> {
  let current: ControlledStreamState<TValue, TFailure> = { status: "idle", emitted: 0 };
  let eventLog: readonly ControlledStreamEvent<TValue, TFailure>[] = [];
  const queue = Effect.runSync(Queue.unbounded<TValue, TFailure | Cause.Done>());

  const append = (event: ControlledStreamEvent<TValue, TFailure>): void => {
    eventLog = [...eventLog, event];
  };

  return {
    kind: "controlledStream",
    name,
    stream(): Stream.Stream<TValue, TFailure> {
      current = { status: "running", emitted: current.emitted };
      append({ type: "start" });
      return Stream.fromQueue(queue);
    },
    emit(value: TValue): void {
      current = { status: "value", emitted: current.emitted + 1, latest: value };
      append({ type: "value", value });
      Queue.offerUnsafe(queue, value);
    },
    fail(error: TFailure): void {
      current = { status: "failure", emitted: current.emitted, error };
      append({ type: "failure", error });
      Queue.failCauseUnsafe(queue, Cause.fail(error));
    },
    die(defect: unknown): void {
      current = { status: "defect", emitted: current.emitted, defect };
      append({ type: "defect", defect });
      Queue.failCauseUnsafe(queue, Cause.die(defect));
    },
    end(): void {
      current = { status: "done", emitted: current.emitted };
      append({ type: "done" });
      Queue.endUnsafe(queue);
    },
    cancel(): void {
      current = { status: "cancelled", emitted: current.emitted };
      append({ type: "cancel" });
      Effect.runSync(Queue.interrupt(queue));
    },
    active(): boolean {
      return current.status === "running" || current.status === "value";
    },
    cancelled(): boolean {
      return current.status === "cancelled";
    },
    events(): readonly ControlledStreamEvent<TValue, TFailure>[] {
      return eventLog;
    },
    state(): ControlledStreamState<TValue, TFailure> {
      return current;
    },
  };
}

export function inspectEffectExit<TSuccess, TFailure>(
  exit: Exit.Exit<TSuccess, TFailure>,
): FlowEffectOutcome<TSuccess, TFailure> {
  if (Exit.isSuccess(exit)) {
    return { status: "success", value: exit.value };
  }

  const failure = Cause.findErrorOption(exit.cause);
  if (Option.isSome(failure)) {
    return { status: "failure", error: failure.value };
  }

  const defect = Cause.findDefect(exit.cause);
  if (Result.isSuccess(defect)) {
    return { status: "defect", defect: Result.getOrUndefined(defect) };
  }

  return { status: "interrupt" };
}

export async function runEffectExit<TSuccess, TFailure>(
  effect: Effect.Effect<TSuccess, TFailure>,
): Promise<FlowEffectOutcome<TSuccess, TFailure>> {
  const exit = await Effect.runPromiseExit(effect);
  return inspectEffectExit(exit);
}

export async function runEffectWithLayerExit<TSuccess, TFailure, TRequirements, TLayerError>(
  effect: Effect.Effect<TSuccess, TFailure, TRequirements>,
  layer: Layer.Layer<TRequirements, TLayerError>,
): Promise<FlowEffectOutcome<TSuccess, TFailure | TLayerError>> {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, layer));
  return inspectEffectExit(exit);
}

const defaultNow = (): number => Date.now();

const defaultRuntimeEnvironment: FlowRuntimeEnvironment = {
  now: defaultNow,
};

function createRuntimeOptions(layer: unknown, now: () => number): FlowRuntimeOptions {
  const runtimeLayer = toEffectLayer(layer);
  return {
    now,
    ...(runtimeLayer === undefined ? {} : { layer: runtimeLayer }),
  };
}

function toEffectLayer(layer: unknown): unknown {
  if (isRecord(layer) && layer.kind === "testLayer") {
    return layer.layer;
  }

  return layer;
}

const pendingSubmits = new WeakMap<
  FlowSnapshot<unknown>,
  readonly FlowMutationDefinition<unknown>[]
>();
const reenteredSnapshots = new WeakMap<FlowSnapshot<unknown>, boolean>();

export function createRuntime(options: FlowRuntimeOptions = {}): FlowRuntime {
  return {
    createActor<TContext, TEvent extends FlowEvent, TState extends string>(
      machine: FlowMachine<TContext, TEvent, TState>,
      actorOptions?: FlowActorOptions<TContext>,
    ): FlowActorRef<TContext, TEvent, TState> {
      return new LocalFlowActor(machine, options, actorOptions);
    },
  };
}

export function FlowProvider(props: FlowProviderProps): React.ReactElement {
  const runtime = React.useMemo(() => props.runtime ?? createRuntime(), [props.runtime]);

  return React.createElement(RuntimeContext.Provider, { value: runtime }, props.children);
}

export function useFlow<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
  options?: FlowActorOptions<TContext>,
): FlowActorRef<TContext, TEvent, TState> {
  const runtime = React.useContext(RuntimeContext) ?? defaultRuntime;
  const actorRef = React.useRef<FlowActorRef<TContext, TEvent, TState> | null>(null);

  if (actorRef.current === null) {
    actorRef.current = runtime.createActor(machine, options);
  }

  const actor = actorRef.current;

  React.useSyncExternalStore(
    (listener) => actor.subscribe(listener),
    () => actor.getSnapshot(),
    () => actor.getSnapshot(),
  );

  return actor;
}

export function useSelector<TContext, TEvent extends FlowEvent, TState extends string, TSelected>(
  actorOrSnapshot: FlowActorRef<TContext, TEvent, TState> | FlowSnapshot<TContext, TState>,
  selector: (snapshot: FlowSnapshot<TContext, TState>) => TSelected,
  equality: (left: TSelected, right: TSelected) => boolean = Object.is,
): TSelected {
  const selectedRef = React.useRef<TSelected | null>(null);

  const snapshot = isActor(actorOrSnapshot)
    ? React.useSyncExternalStore(
        (listener) => actorOrSnapshot.subscribe(listener),
        () => actorOrSnapshot.getSnapshot(),
        () => actorOrSnapshot.getSnapshot(),
      )
    : actorOrSnapshot;

  const selected = selector(snapshot);
  if (selectedRef.current === null || !equality(selectedRef.current, selected)) {
    selectedRef.current = selected;
  }

  return selectedRef.current;
}

export function useView<TContext, TEvent extends FlowEvent, TState extends string, TSelected>(
  actorOrSnapshot: FlowActorRef<TContext, TEvent, TState> | FlowSnapshot<TContext, TState>,
  view: FlowViewDefinition<FlowViewConfig<TContext, TState, TSelected>>,
): TSelected {
  return useSelector(
    actorOrSnapshot,
    (snapshot) => selectView(snapshot, view),
    view.config.equality,
  );
}

export function selectView<TContext, TState extends string, TSelected>(
  snapshot: FlowSnapshot<TContext, TState>,
  view: FlowViewDefinition<FlowViewConfig<TContext, TState, TSelected>>,
): TSelected {
  return view.config.select({
    snapshot,
    context: snapshot.context,
    value: snapshot.value,
    resources: snapshot.resources,
    mutations: snapshot.mutations,
    streams: snapshot.streams,
    timers: snapshot.timers,
    children: snapshot.children,
    receipts: snapshot.receipts,
    issues: snapshot.issues,
  });
}

function createFlowTestHarness<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
  seededResources: Readonly<Record<string, FlowResourceSnapshot>> = {},
): FlowTestHarness<TContext, TEvent, TState> {
  let layer: unknown;
  let now = defaultNow;
  let actor = createRuntime(createRuntimeOptions(layer, now)).createActor(machine);

  const createTestActor = (options?: FlowActorOptions<TContext>) =>
    createRuntime(createRuntimeOptions(layer, now)).createActor(machine, {
      ...options,
      resources: {
        ...seededResources,
        ...options?.resources,
      },
    }) as LocalFlowActor<TContext, TEvent, TState>;

  const harness: FlowTestHarness<TContext, TEvent, TState> = {
    provide<TLayer>(nextLayer: TLayer): FlowTestHarness<TContext, TEvent, TState> {
      layer = nextLayer;
      actor = createTestActor();
      return harness;
    },
    start(options?: FlowActorOptions<TContext>): FlowTestHarness<TContext, TEvent, TState> {
      actor = createTestActor(options);
      return harness;
    },
    send(event: TEvent): FlowTestHarness<TContext, TEvent, TState> {
      actor.send(event);
      return harness;
    },
    snapshot(): FlowSnapshot<TContext, TState> {
      return actor.getSnapshot();
    },
    state(): TState {
      return actor.getSnapshot().value;
    },
    context(): TContext {
      return actor.getSnapshot().context;
    },
    can(event: FlowEvent): boolean {
      return actor.can(event);
    },
    async flush(): Promise<FlowTestHarness<TContext, TEvent, TState>> {
      if (actor instanceof LocalFlowActor) {
        await actor.flush();
      }
      return harness;
    },
    async settle(options?: FlowSettleOptions): Promise<FlowTestHarness<TContext, TEvent, TState>> {
      throw new Error(
        `flowTest.settle is not implemented in the current runtime slice. Use flush() for ready microtasks; bounded settle options were ${JSON.stringify(options ?? {})}.`,
      );
    },
    async advance(duration: FlowDurationInput): Promise<FlowTestHarness<TContext, TEvent, TState>> {
      throw new Error(
        `flowTest.advance is not implemented in the current runtime slice. Virtual time support is required before advancing ${formatDurationInput(duration)}.`,
      );
    },
    resources(): Readonly<Record<string, FlowResourceSnapshot>> {
      return actor.getSnapshot().resources;
    },
    mutations(): Readonly<Record<string, FlowMutationSnapshot>> {
      return actor.getSnapshot().mutations;
    },
    effects(): FlowEffectInspector {
      return {
        running(id: string): FlowResourceSnapshot | FlowMutationSnapshot | null {
          const resource = findResource(actor.getSnapshot().resources, id);
          if (resource?.fetchStatus === "fetching") {
            return resource;
          }
          const mutation = actor.getSnapshot().mutations[id];
          return mutation?.status === "running" ? mutation : null;
        },
        completed(id: string): FlowResourceSnapshot | FlowMutationSnapshot | null {
          return (
            findResource(actor.getSnapshot().resources, id) ??
            actor.getSnapshot().mutations[id] ??
            null
          );
        },
        attempts(id: string): number {
          const resource = findResource(actor.getSnapshot().resources, id);
          const mutation = actor.getSnapshot().mutations[id];
          return resource?.failureCount ?? mutation?.failureCount ?? 0;
        },
      };
    },
    streams(): FlowStreamInspector {
      return {
        get(id: string): FlowStreamSnapshot | null {
          return actor.getSnapshot().streams[id] ?? null;
        },
        running(id: string): FlowStreamSnapshot | null {
          const stream = actor.getSnapshot().streams[id];
          return stream?.status === "running" ? stream : null;
        },
        completed(id: string): FlowStreamSnapshot | null {
          const stream = actor.getSnapshot().streams[id];
          if (
            stream?.status === "done" ||
            stream?.status === "failure" ||
            stream?.status === "defect" ||
            stream?.status === "interrupt"
          ) {
            return stream;
          }
          return null;
        },
        cancelled(id: string): FlowStreamSnapshot | null {
          const stream = actor.getSnapshot().streams[id];
          return stream?.status === "interrupt" ? stream : null;
        },
        events(id: string): readonly FlowRuntimeReceipt[] {
          return actor
            .getSnapshot()
            .receipts.filter((receipt) => receipt.id === id && receipt.type.startsWith("stream:"));
        },
        diagnostics(id: string): Pick<FlowStreamSnapshot, "coalesced" | "dropped"> | null {
          const stream = actor.getSnapshot().streams[id];
          return stream === undefined
            ? null
            : {
                coalesced: stream.coalesced,
                dropped: stream.dropped,
              };
        },
      };
    },
    timers(): FlowTimerInspector {
      return {
        get(id: string): FlowTimerSnapshot | null {
          return actor.getSnapshot().timers[id] ?? null;
        },
        scheduled(id: string): FlowTimerSnapshot | null {
          const timer = actor.getSnapshot().timers[id];
          return timer?.status === "scheduled" ? timer : null;
        },
        fired(id: string): FlowTimerSnapshot | null {
          const timer = actor.getSnapshot().timers[id];
          return timer?.status === "fired" ? timer : null;
        },
        cancelled(id: string): FlowTimerSnapshot | null {
          const timer = actor.getSnapshot().timers[id];
          return timer?.status === "cancelled" ? timer : null;
        },
      };
    },
    cache(): FlowCacheInspector {
      return {
        get(idOrKey: string | FlowKey): FlowResourceSnapshot | null {
          return findResource(actor.getSnapshot().resources, idOrKey);
        },
        query(id: string): FlowResourceSnapshot | null {
          return findResource(actor.getSnapshot().resources, id);
        },
        stale(idOrKey?: string | FlowKey): readonly FlowResourceSnapshot[] {
          const resources = Object.values(actor.getSnapshot().resources).filter(
            (resource) => resource.stale,
          );
          if (idOrKey === undefined) {
            return resources;
          }
          const target = toKeyHash(idOrKey);
          return resources.filter((resource) => resource.id === target || resource.key === target);
        },
        invalidations(target?: string | FlowKey | FlowTag): readonly FlowRuntimeReceipt[] {
          const receipts = actor
            .getSnapshot()
            .receipts.filter((receipt) => receipt.type === "cache:invalidate");
          if (target === undefined) {
            return receipts;
          }
          const targetKey = invalidationTargetId(target);
          return receipts.filter(
            (receipt) => receipt.target === targetKey || receipt.key === targetKey,
          );
        },
        writes(idOrKey?: string | FlowKey): readonly FlowRuntimeReceipt[] {
          const receipts = actor
            .getSnapshot()
            .receipts.filter((receipt) => receipt.type === "cache:write");
          if (idOrKey === undefined) {
            return receipts;
          }
          const target = toKeyHash(idOrKey);
          return receipts.filter((receipt) => receipt.id === target || receipt.key === target);
        },
        snapshot(): Readonly<Record<string, FlowResourceSnapshot>> {
          return actor.getSnapshot().resources;
        },
      };
    },
    transactions(): FlowTransactionInspector {
      const transactionReceipts = (id: string | undefined, type?: FlowRuntimeReceipt["type"]) =>
        actor
          .getSnapshot()
          .receipts.filter(
            (receipt) =>
              receipt.type.startsWith("mutation:") &&
              (id === undefined || receipt.id === id) &&
              (type === undefined || receipt.type === type),
          );

      return {
        events(id?: string): readonly FlowRuntimeReceipt[] {
          return transactionReceipts(id);
        },
        previewPatches(id?: string): readonly FlowRuntimeReceipt[] {
          return transactionReceipts(id, "mutation:preview-patch");
        },
        optimisticPatches(id?: string): readonly FlowRuntimeReceipt[] {
          return [
            ...transactionReceipts(id, "mutation:preview-patch"),
            ...transactionReceipts(id, "mutation:optimistic-patch"),
          ];
        },
        rollbacks(id?: string): readonly FlowRuntimeReceipt[] {
          return transactionReceipts(id, "mutation:rollback");
        },
      };
    },
    receipts(): readonly FlowRuntimeReceipt[] {
      return actor.getSnapshot().receipts;
    },
    issues(): readonly FlowRuntimeIssue[] {
      return actor.getSnapshot().issues;
    },
    clock(nextNow: () => number): FlowTestHarness<TContext, TEvent, TState> {
      now = nextNow;
      actor = createTestActor();
      return harness;
    },
  };

  return harness;
}

function createFlowAppTestHarness<TModules extends readonly FlowModuleDefinition<string, object>[]>(
  app: FlowAppDefinition<TModules>,
): FlowAppTestHarness<TModules> {
  void app;
  let seededResources: Readonly<Record<string, FlowResourceSnapshot>> = {};

  const harness: FlowAppTestHarness<TModules> = {
    seedResource<TValue>(
      ref: FlowResourceRef<TValue>,
      value: TValue,
    ): FlowAppTestHarness<TModules> {
      seededResources = {
        ...seededResources,
        [resourceStorageKey(ref)]: seededResourceSnapshot(ref, value),
      };
      return harness;
    },
    seedResources(entries: readonly FlowSeededResource[]): FlowAppTestHarness<TModules> {
      seededResources = {
        ...seededResources,
        ...Object.fromEntries(
          entries.map((entry) => [
            resourceStorageKey(entry.ref),
            seededResourceSnapshot(entry.ref, entry.value),
          ]),
        ),
      };
      return harness;
    },
    start<TContext, TEvent extends FlowEvent, TState extends string>(
      machine: FlowMachine<TContext, TEvent, TState>,
      options?: FlowActorOptions<TContext>,
    ): FlowTestHarness<TContext, TEvent, TState> {
      return createFlowTestHarness(machine, seededResources).start(options);
    },
  };

  return harness;
}

export const flowTest: FlowTestApi = Object.assign(createFlowTestHarness, {
  app: createFlowAppTestHarness,
  model: createFlowModelReport,
  replay: replayTrace,
  fuzz: fuzzFlow,
});

export function graphOf<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
): FlowGraph {
  const stateEntries = Object.entries(machine.config.states) as readonly [
    string,
    FlowStateNode<TContext, TEvent, TState>,
  ][];

  const states = stateEntries.map(([id, stateNode]) => ({
    id,
    type: stateNode.type ?? (stateNode.states === undefined ? "atomic" : "compound"),
    initial: stateNode.initial,
  })) satisfies readonly FlowGraphState[];

  const transitions = stateEntries.flatMap(([source, stateNode]) =>
    Object.entries(stateNode.on ?? {}).flatMap(([event, transition]) =>
      normalizeTransitions(
        transition as
          | FlowTransition<TContext, TEvent, TState>
          | readonly FlowTransition<TContext, TEvent, TState>[],
      ).map((item, index) => ({
        id: `${source}.${event}.${index}`,
        source,
        event,
        target: transitionTarget(item, source),
        guard: transitionGuarded(item),
        actions: normalizeActions(transitionActions(item)).length,
        submits: normalizeSubmits(transitionSubmits(item)).map((submit) =>
          descriptorId(submit, "mutation"),
        ),
      })),
    ),
  ) satisfies readonly FlowGraphTransition[];

  const invokes = stateEntries.flatMap(([source, stateNode]) => [
    ...normalizeInvokes(stateNode.invoke).map((invoke) => ({
      source,
      id: descriptorId(invoke, invoke.kind),
      kind: invoke.kind,
      target: invoke.kind === "child" ? childTarget(invoke) : undefined,
    })),
    ...normalizeAfters(stateNode.after).map((after) => ({
      source,
      id: descriptorId(after, "after"),
      kind: "after" as const,
      target: afterTarget(after),
    })),
  ]) satisfies readonly FlowGraphInvoke[];

  const unsupported = states
    .filter((state) => state.type === "parallel" || state.type === "history")
    .map((state) => ({
      source: state.id,
      feature: state.type,
      reason: `${state.type} states are graph metadata only in this slice.`,
    })) satisfies readonly FlowGraphUnsupportedFeature[];

  return {
    kind: "graph",
    version: 1,
    machineId: machine.id,
    initial: machine.initial,
    states,
    transitions,
    invokes,
    unsupported,
  };
}

export function diffGraphs(before: FlowGraph, after: FlowGraph): FlowGraphDiff {
  const beforeStates = new Set(before.states.map((state) => state.id));
  const afterStates = new Set(after.states.map((state) => state.id));
  const beforeTransitions = new Set(before.transitions.map(transitionKey));
  const afterTransitions = new Set(after.transitions.map(transitionKey));
  const beforeInvokes = new Map(before.invokes.map((invoke) => [invokeKey(invoke), invoke.kind]));
  const afterInvokes = new Map(after.invokes.map((invoke) => [invokeKey(invoke), invoke.kind]));

  return {
    kind: "graphDiff",
    addedStates: [...afterStates].filter((state) => !beforeStates.has(state)),
    removedStates: [...beforeStates].filter((state) => !afterStates.has(state)),
    addedTransitions: [...afterTransitions].filter(
      (transition) => !beforeTransitions.has(transition),
    ),
    removedTransitions: [...beforeTransitions].filter(
      (transition) => !afterTransitions.has(transition),
    ),
    changedInvokes: [...afterInvokes]
      .filter(([key, kind]) => beforeInvokes.has(key) && beforeInvokes.get(key) !== kind)
      .map(([key]) => key),
    unsupported: [...before.unsupported, ...after.unsupported],
  };
}

export function formatGraphDiff(diff: FlowGraphDiff): string {
  return [
    `+ states: ${diff.addedStates.join(", ") || "none"}`,
    `- states: ${diff.removedStates.join(", ") || "none"}`,
    `+ transitions: ${diff.addedTransitions.join(", ") || "none"}`,
    `- transitions: ${diff.removedTransitions.join(", ") || "none"}`,
    `changed invokes: ${diff.changedInvokes.join(", ") || "none"}`,
  ].join("\n");
}

export function captureTrace<TContext, TEvent extends FlowEvent, TState extends string>(
  source:
    | FlowActorRef<TContext, TEvent, TState>
    | FlowSnapshot<TContext, TState>
    | readonly FlowRuntimeReceipt[],
  options: FlowTraceOptions = {},
): FlowTraceSession<TContext, TState> {
  if (Array.isArray(source)) {
    const receipts =
      options.redact === undefined
        ? source
        : (options.redact(source, ["receipts"]) as readonly FlowRuntimeReceipt[]);

    return {
      kind: "trace",
      version: 1,
      source: "manual",
      events: [],
      receipts,
      issues: [],
      snapshots: [],
      redacted: options.redact !== undefined,
    };
  }

  const actorOrSnapshot = source as
    | FlowActorRef<TContext, TEvent, TState>
    | FlowSnapshot<TContext, TState>;
  const sourceKind = isActor(actorOrSnapshot) ? "actor" : "snapshot";
  const snapshot = isActor(actorOrSnapshot) ? actorOrSnapshot.getSnapshot() : actorOrSnapshot;
  const receipts = snapshot.receipts;
  const issues = snapshot.issues;
  const redactedReceipts =
    options.redact === undefined
      ? receipts
      : (options.redact(receipts, ["receipts"]) as readonly FlowRuntimeReceipt[]);
  const snapshots =
    snapshot !== undefined && options.includeSnapshots === true
      ? [redactSnapshot(snapshot, options.redact)]
      : [];

  return {
    kind: "trace",
    version: 1,
    source: sourceKind,
    events: [],
    receipts: redactedReceipts,
    issues,
    snapshots,
    redacted: options.redact !== undefined,
  };
}

export function replayTrace<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
  trace: FlowTraceSession<TContext, TState>,
): FlowReplayReport<TState> {
  let snapshot = machine.getInitialSnapshot();
  let acceptedEvents = 0;
  let rejectedEvents = 0;

  for (const item of trace.events) {
    const next = machine.transition(snapshot, item.event as TEvent);
    if (next === snapshot) {
      rejectedEvents += 1;
    } else {
      acceptedEvents += 1;
      snapshot = next;
    }
  }

  const knownReceiptPrefixes = [
    "query:",
    "mutation:",
    "cache:",
    "stream:",
    "timer:",
    "child:",
    "trace:",
  ];

  return {
    kind: "replay",
    traceVersion: trace.version,
    events: trace.events.length,
    receipts: trace.receipts.length,
    acceptedEvents,
    rejectedEvents,
    finalState: snapshot.value,
    unsupportedReceipts: trace.receipts
      .map((receipt) => receipt.type)
      .filter((type) => !knownReceiptPrefixes.some((prefix) => type.startsWith(prefix))),
  };
}

export function fuzzFlow<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
  config: FlowFuzzConfig<TEvent>,
): FlowFuzzReport<TState> {
  const iterations = config.iterations ?? 1;
  const maxEvents = config.maxEvents ?? config.events.length;
  let accepted = 0;
  let rejected = 0;
  let snapshot = machine.getInitialSnapshot();

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const event of config.events.slice(0, maxEvents)) {
      const next = machine.transition(snapshot, event);
      if (next === snapshot) {
        rejected += 1;
      } else {
        accepted += 1;
        snapshot = next;
      }
    }
  }

  return {
    kind: "fuzz",
    iterations,
    accepted,
    rejected,
    finalState: snapshot.value,
    issues: snapshot.issues,
  };
}

export function createFlowDevtools(): FlowDevtoolsProtocol {
  return {
    kind: "devtools",
    version: 1,
    channels: ["snapshot", "trace", "graph", "cache", "children"],
  };
}

export function playwrightFlow(config: {
  readonly selectors: Readonly<Record<string, string>>;
  readonly events: readonly string[];
}): PlaywrightFlowDriver {
  return {
    kind: "playwright-flow",
    selectors: config.selectors,
    events: config.events,
  };
}

export function flowStories<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
  fixtures: readonly FlowStoryFixture<TState>[],
): FlowStoryReport {
  const fixtureStates = new Set(fixtures.map((fixture) => fixture.state));
  return {
    kind: "stories",
    machineId: machine.id,
    fixtures,
    missingStates: Object.keys(machine.config.states).filter((state) => !fixtureStates.has(state)),
  };
}

export function flowTour<TEvent extends FlowEvent>(
  name: string,
  steps: readonly FlowTourStep<TEvent>[],
): FlowTourReport {
  return {
    kind: "tour",
    name,
    steps,
    events: steps.filter((step) => step.event !== undefined).length,
  };
}

export const flowExperimental = {
  graphOf,
  diffGraphs,
  formatGraphDiff,
  captureTrace,
  replayTrace,
  fuzzFlow,
  flowStories,
  flowTour,
  createFlowDevtools,
  playwrightFlow,
} as const;

function createFlowModelReport<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
): FlowModelReport {
  const graph = graphOf(machine);
  return {
    kind: "model",
    graph,
    states: graph.states.map((state) => state.id),
    transitions: graph.transitions.map((transition) => transition.id),
    unsupported: graph.unsupported,
  };
}

function descriptorId(
  definition: FlowInvokeDefinition<string, unknown>,
  fallback?: string,
): string {
  const config = definition.config as { readonly id?: string };
  return config.id ?? fallback ?? definition.kind;
}

function childTarget(definition: FlowChildDefinition<unknown>): string | undefined {
  const config = definition.config as {
    readonly machine?: { readonly id?: string | undefined };
  };
  return config.machine?.id;
}

function afterTarget(definition: FlowAfterDefinition<unknown>): string | undefined {
  const config = definition.config as { readonly target?: string | undefined };
  return config.target;
}

function transitionTarget<TContext, TEvent extends FlowEvent, TState extends string>(
  transition: FlowTransition<TContext, TEvent, TState>,
  fallback: string,
): string {
  return typeof transition === "string" ? transition : (transition.target ?? fallback);
}

function transitionGuarded<TContext, TEvent extends FlowEvent, TState extends string>(
  transition: FlowTransition<TContext, TEvent, TState>,
): boolean {
  return typeof transition === "string" ? false : transition.guard !== undefined;
}

function transitionActions<TContext, TEvent extends FlowEvent, TState extends string>(
  transition: FlowTransition<TContext, TEvent, TState>,
):
  | FlowAction<TContext, TEvent, TState>
  | readonly FlowAction<TContext, TEvent, TState>[]
  | undefined {
  return typeof transition === "string" ? undefined : transition.actions;
}

function transitionSubmits<TContext, TEvent extends FlowEvent, TState extends string>(
  transition: FlowTransition<TContext, TEvent, TState>,
): FlowMutationDefinition<unknown> | readonly FlowMutationDefinition<unknown>[] | undefined {
  return typeof transition === "string" ? undefined : transition.submit;
}

function normalizeAfters(
  after: FlowAfterDefinition<unknown> | readonly FlowAfterDefinition<unknown>[] | undefined,
): readonly FlowAfterDefinition<unknown>[] {
  if (after === undefined) {
    return [];
  }

  return Array.isArray(after) ? after : [after as FlowAfterDefinition<unknown>];
}

function transitionKey(transition: FlowGraphTransition): string {
  return `${transition.source}:${transition.event}->${transition.target}`;
}

function invokeKey(invoke: FlowGraphInvoke): string {
  return `${invoke.source}:${invoke.kind}:${invoke.id}`;
}

function redactSnapshot<TContext, TState extends string>(
  snapshot: FlowSnapshot<TContext, TState>,
  redact: FlowTraceOptions["redact"],
): FlowSnapshot<TContext, TState> {
  if (redact === undefined) {
    return snapshot;
  }

  return {
    ...snapshot,
    context: redact(snapshot.context, ["context"]) as TContext,
    resources: redact(snapshot.resources, ["resources"]) as Readonly<
      Record<string, FlowResourceSnapshot>
    >,
    mutations: redact(snapshot.mutations, ["mutations"]) as Readonly<
      Record<string, FlowMutationSnapshot>
    >,
    streams: redact(snapshot.streams, ["streams"]) as Readonly<Record<string, FlowStreamSnapshot>>,
    timers: redact(snapshot.timers, ["timers"]) as Readonly<Record<string, FlowTimerSnapshot>>,
    children: redact(snapshot.children, ["children"]) as Readonly<
      Record<string, FlowChildSnapshot>
    >,
    receipts: redact(snapshot.receipts, ["receipts"]) as readonly FlowRuntimeReceipt[],
    issues: redact(snapshot.issues, ["issues"]) as readonly FlowRuntimeIssue[],
  };
}

function normalizeTransitions<TContext, TEvent extends FlowEvent, TState extends string>(
  transition:
    | FlowTransition<TContext, TEvent, TState>
    | readonly FlowTransition<TContext, TEvent, TState>[]
    | undefined,
): readonly FlowTransitionConfig<TContext, TEvent, TState>[] {
  if (transition === undefined) {
    return [];
  }

  const transitions = Array.isArray(transition) ? transition : [transition];
  return transitions.map((item) => (typeof item === "string" ? { target: item } : item));
}

const defaultRuntime = createRuntime();

class LocalFlowActor<
  TContext,
  TEvent extends FlowEvent,
  TState extends string,
> implements FlowActorRef<TContext, TEvent, TState> {
  readonly #machine: FlowMachine<TContext, TEvent, TState>;
  readonly #runtimeOptions: FlowRuntimeOptions;
  readonly #listeners = new Set<() => void>();
  readonly #activeInvokes = new Map<string, number>();
  readonly #activeMutationRollbacks = new Map<number, readonly FlowResourceRollback[]>();
  readonly #activeStreamCancels = new Map<string, () => void>();
  readonly #activeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  #nextRequestId = 1;
  #snapshot: FlowSnapshot<TContext, TState>;

  constructor(
    machine: FlowMachine<TContext, TEvent, TState>,
    runtimeOptions: FlowRuntimeOptions,
    actorOptions: FlowActorOptions<TContext> | undefined,
  ) {
    this.#machine = machine;
    this.#runtimeOptions = runtimeOptions;
    this.#snapshot = applyActorOptions(machine.getInitialSnapshot(), actorOptions);
    this.#runtimeOptions.inspect?.(this.#snapshot, null);
    this.#startStateInvokes(this.#snapshot, null);
  }

  getSnapshot = (): FlowSnapshot<TContext, TState> => this.#snapshot;

  send = (event: TEvent): FlowSnapshot<TContext, TState> => {
    const previousSnapshot = this.#snapshot;
    const nextSnapshot = this.#machine.transition(this.#snapshot, event, this.#environment());

    if (nextSnapshot !== this.#snapshot) {
      this.#snapshot = withRuntimeState(nextSnapshot, this.#snapshot);
      const submits = pendingSubmits.get(nextSnapshot as FlowSnapshot<unknown>) ?? [];
      for (const submit of submits) {
        this.#startMutation(submit, event);
      }
      const reentered = reenteredSnapshots.get(nextSnapshot as FlowSnapshot<unknown>) ?? false;
      if (previousSnapshot.value !== this.#snapshot.value || reentered) {
        this.#cancelStateInvokes(previousSnapshot.value);
        this.#startStateInvokes(this.#snapshot, event);
      }
      this.#runtimeOptions.inspect?.(this.#snapshot, event);
      for (const listener of this.#listeners) {
        listener();
      }
    }

    return this.#snapshot;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  can = (event: FlowEvent): boolean => this.#machine.can(this.#snapshot, event);

  flush = async (): Promise<void> => {
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  #environment = (): FlowRuntimeEnvironment => ({
    now: this.#runtimeOptions.now ?? defaultNow,
  });

  #startStateInvokes = (snapshot: FlowSnapshot<TContext, TState>, event: TEvent | null): void => {
    const stateNode = this.#machine.config.states[snapshot.value];
    for (const invoke of normalizeInvokes(stateNode.invoke)) {
      if (invoke.kind === "query" || invoke.kind === "ensure" || invoke.kind === "observe") {
        this.#startQuery(invoke, event);
      } else if (invoke.kind === "child") {
        this.#startChild(invoke, snapshot.value);
      } else if (invoke.kind === "run") {
        this.#startMutation(invoke.config.mutation as FlowMutationDefinition<unknown>, event);
      } else if (invoke.kind === "stream") {
        this.#startStream(invoke, event);
      }
    }
    for (const after of normalizeAfters(stateNode.after)) {
      this.#startTimer(after, snapshot.value, event);
    }
  };

  #cancelStateInvokes = (state: TState): void => {
    const stateNode = this.#machine.config.states[state];
    for (const invoke of normalizeInvokes(stateNode.invoke)) {
      if (invoke.kind === "query" || invoke.kind === "ensure" || invoke.kind === "observe") {
        const config = getQueryConfig(invoke);
        const id = config.id;
        const generation = this.#activeInvokes.get(id);
        if (generation !== undefined) {
          this.#activeInvokes.delete(id);
          const resource = this.#snapshot.resources[id];
          this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
            resources: {
              ...this.#snapshot.resources,
              [id]: {
                ...(resource ?? createIdleResource(id)),
                status: "interrupt",
                fetchStatus: "idle",
                requestId: null,
              },
            },
            receipts: [
              ...this.#snapshot.receipts,
              {
                type: "query:cancel",
                id,
                requestId: resource?.requestId ?? null,
                key: resource?.key ?? undefined,
              },
            ],
          });
        }
      } else if (invoke.kind === "child") {
        this.#stopChild(invoke, state);
      } else if (invoke.kind === "stream") {
        this.#cancelStream(invoke);
      }
    }
    for (const after of normalizeAfters(stateNode.after)) {
      this.#cancelTimer(after);
    }
  };

  #startChild = (definition: FlowChildDefinition<unknown>, parentState: TState): void => {
    const config = getChildConfig(definition);
    const childMachine = config.machine as FlowMachine<unknown, FlowEvent, string> | undefined;
    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      children: {
        ...this.#snapshot.children,
        [config.id]: {
          id: config.id,
          status: "active",
          state: childMachine?.initial ?? null,
          parentState,
          supervision: config.supervision ?? "parent",
          startedAt: this.#environment().now(),
        },
      },
      receipts: [
        ...this.#snapshot.receipts,
        {
          type: "child:start",
          id: config.id,
          target: parentState,
          at: this.#environment().now(),
        },
      ],
    });
  };

  #stopChild = (definition: FlowChildDefinition<unknown>, parentState: TState): void => {
    const config = getChildConfig(definition);
    const child = this.#snapshot.children[config.id];
    if (child === undefined || child.status === "stopped") {
      return;
    }

    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      children: {
        ...this.#snapshot.children,
        [config.id]: {
          ...child,
          status: "stopped",
          stoppedAt: this.#environment().now(),
        },
      },
      receipts: [
        ...this.#snapshot.receipts,
        {
          type: "child:stop",
          id: config.id,
          target: parentState,
          at: this.#environment().now(),
        },
      ],
    });
  };

  #startQuery = (
    definition:
      | FlowQueryDefinition<unknown>
      | FlowEnsureDefinition<unknown>
      | FlowObserveDefinition<unknown>,
    event: TEvent | null,
  ): void => {
    const config = getQueryConfig(definition);
    const id = config.id;
    const requestId = this.#nextRequestId++;
    const key = toKeyHash(config.key({ context: this.#snapshot.context, event }));
    const generation = requestId;
    this.#activeInvokes.set(id, generation);
    const previous = this.#snapshot.resources[id];
    const now = this.#environment().now();

    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      resources: {
        ...this.#snapshot.resources,
        [id]: toLoadingResource(config, requestId, key, previous, now),
      },
      receipts: [
        ...this.#snapshot.receipts,
        { type: "query:start", id, requestId, key: key ?? undefined },
      ],
    });

    void this.#runEffect(config.effect({ context: this.#snapshot.context, event })).then(
      (outcome) => {
        if (this.#activeInvokes.get(id) !== generation) {
          return;
        }
        this.#activeInvokes.delete(id);
        this.#finishQuery(config, requestId, key, outcome);
      },
    );
  };

  #startStream = (definition: FlowStreamDefinition<unknown>, event: TEvent | null): void => {
    const config = getStreamConfig(definition);
    const requestId = this.#nextRequestId++;
    this.#activeInvokes.set(config.id, requestId);
    const now = this.#environment().now();
    const previous = this.#snapshot.streams[config.id];
    const input =
      config.input?.({ context: this.#snapshot.context, event }) ?? (undefined as unknown);

    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      streams: {
        ...this.#snapshot.streams,
        [config.id]: {
          id: config.id,
          status: "running",
          latest: previous?.latest,
          emitted: previous?.emitted ?? 0,
          coalesced: previous?.coalesced ?? 0,
          dropped: previous?.dropped ?? 0,
          startedAt: now,
        },
      },
      receipts: [
        ...this.#snapshot.receipts,
        { type: "stream:start", id: config.id, requestId, at: now },
      ],
    });

    const effect = Stream.runForEach(
      config.stream({ input, services: undefined, runtime: this.#environment() }),
      (value) =>
        Effect.sync(() => {
          this.#recordStreamValue(config, requestId, value);
        }),
    );
    const runnable = this.#provideEffect(effect);
    const fiber = Effect.runFork(runnable);
    this.#activeStreamCancels.set(config.id, () => {
      Effect.runFork(Fiber.interrupt(fiber));
    });
    fiber.addObserver((exit) => {
      if (this.#activeInvokes.get(config.id) !== requestId) {
        return;
      }
      this.#activeInvokes.delete(config.id);
      this.#activeStreamCancels.delete(config.id);
      this.#finishStream(config, requestId, inspectEffectExit(exit));
    });
  };

  #recordStreamValue = (config: RuntimeStreamConfig, requestId: number, value: unknown): void => {
    if (this.#activeInvokes.get(config.id) !== requestId) {
      return;
    }
    const previous = this.#snapshot.streams[config.id] ?? createIdleStream(config.id);
    const now = this.#environment().now();
    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      streams: {
        ...this.#snapshot.streams,
        [config.id]: {
          ...previous,
          status: "running",
          latest: value,
          emitted: previous.emitted + 1,
        },
      },
      receipts: [
        ...this.#snapshot.receipts,
        { type: "stream:value", id: config.id, requestId, value, at: now },
      ],
    });
    const routed = config.routes?.value?.(value);
    if (routed !== undefined) {
      this.send(routed as TEvent);
    }
  };

  #finishStream = (
    config: RuntimeStreamConfig,
    requestId: number,
    outcome: FlowEffectOutcome<unknown, unknown>,
  ): void => {
    const previous = this.#snapshot.streams[config.id] ?? createIdleStream(config.id);
    const now = this.#environment().now();
    const status = streamStatusFromOutcome(outcome);
    const receipt = toStreamReceipt(config.id, requestId, outcome, now);
    const issue = toRuntimeIssue("stream", config.id, requestId, null, outcome);
    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      streams: {
        ...this.#snapshot.streams,
        [config.id]: {
          ...previous,
          status,
          endedAt: now,
          ...(outcome.status === "failure" ? { error: outcome.error } : {}),
          ...(outcome.status === "defect" ? { defect: outcome.defect } : {}),
        },
      },
      receipts: [...this.#snapshot.receipts, receipt],
      issues: issue === null ? this.#snapshot.issues : [...this.#snapshot.issues, issue],
    });
    const routed = routeStreamOutcome(config.routes, outcome);
    if (routed !== null) {
      this.send(routed as TEvent);
    }
  };

  #cancelStream = (definition: FlowStreamDefinition<unknown>): void => {
    const config = getStreamConfig(definition);
    const cancel = this.#activeStreamCancels.get(config.id);
    const stream = this.#snapshot.streams[config.id];
    if (cancel === undefined || stream === undefined || stream.status !== "running") {
      return;
    }
    this.#activeStreamCancels.delete(config.id);
    this.#activeInvokes.delete(config.id);
    cancel();
    const now = this.#environment().now();
    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      streams: {
        ...this.#snapshot.streams,
        [config.id]: { ...stream, status: "interrupt", endedAt: now },
      },
      receipts: [...this.#snapshot.receipts, { type: "stream:cancel", id: config.id, at: now }],
    });
  };

  #startTimer = (
    definition: FlowAfterDefinition<unknown>,
    state: TState,
    event: TEvent | null,
  ): void => {
    const config = getAfterConfig(definition);
    const delay = resolveTimerDelay(config, this.#snapshot.context, event);
    const delayMs = durationToMillis(delay);
    const scheduledAt = this.#environment().now();
    const fireAt = scheduledAt + delayMs;
    this.#activeTimers.set(
      config.id,
      setTimeout(() => {
        if (!this.#activeTimers.has(config.id)) {
          return;
        }
        this.#activeTimers.delete(config.id);
        this.#fireTimer(config, state);
      }, delayMs),
    );
    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      timers: {
        ...this.#snapshot.timers,
        [config.id]: {
          id: config.id,
          status: "scheduled",
          delay,
          scheduledAt,
          fireAt,
        },
      },
      receipts: [
        ...this.#snapshot.receipts,
        { type: "timer:schedule", id: config.id, dueAt: fireAt, at: scheduledAt },
      ],
    });
  };

  #fireTimer = (config: RuntimeAfterConfig, state: TState): void => {
    const timer = this.#snapshot.timers[config.id];
    if (timer === undefined || timer.status !== "scheduled" || this.#snapshot.value !== state) {
      return;
    }
    const now = this.#environment().now();
    const event = (config.routes?.fired?.() ?? {
      type: `flow.after.${config.id}`,
    }) as TEvent;
    const firedSnapshot = updateRuntimeSnapshot(this.#snapshot, {
      timers: {
        ...this.#snapshot.timers,
        [config.id]: { ...timer, status: "fired", firedAt: now },
      },
      receipts: [...this.#snapshot.receipts, { type: "timer:fire", id: config.id, at: now }],
    });
    this.#snapshot = firedSnapshot;
    if (!allowsAfter(config, firedSnapshot, event, this.#environment())) {
      return;
    }
    this.#applyAfterTransition(config, event);
  };

  #cancelTimer = (definition: FlowAfterDefinition<unknown>): void => {
    const config = getAfterConfig(definition);
    const timeout = this.#activeTimers.get(config.id);
    if (timeout === undefined) {
      return;
    }
    clearTimeout(timeout);
    this.#activeTimers.delete(config.id);
    const timer = this.#snapshot.timers[config.id];
    const now = this.#environment().now();
    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      timers: {
        ...this.#snapshot.timers,
        [config.id]: {
          ...(timer ?? {
            id: config.id,
            delay: 0,
            scheduledAt: now,
            fireAt: now,
          }),
          status: "cancelled",
          cancelledAt: now,
        },
      },
      receipts: [...this.#snapshot.receipts, { type: "timer:cancel", id: config.id, at: now }],
    });
    const routed = config.routes?.interrupt?.();
    if (routed !== undefined) {
      this.send(routed as TEvent);
    }
  };

  #applyAfterTransition = (config: RuntimeAfterConfig, event: TEvent): void => {
    const previousSnapshot = this.#snapshot;
    const target = (config.target ?? previousSnapshot.value) as TState;
    let context: TContext = previousSnapshot.context;
    const runtime = this.#environment();
    const nextBase = createSnapshot(this.#machine, target, context, true, event);

    for (const update of normalizeUpdates(
      config.update as FlowAfterConfig<TContext, TEvent, TState>["update"],
    )) {
      const patch = update({ context, event, snapshot: nextBase, runtime });
      context = mergeContext(context, patch);
    }

    for (const action of normalizeActions(
      config.actions as FlowAfterConfig<TContext, TEvent, TState>["actions"],
    )) {
      if (isAssignAction(action)) {
        const patch = action.updater({ context, event, snapshot: nextBase, runtime });
        context = mergeContext(context, patch);
      } else if (isEffectAction(action)) {
        action.fn({
          context,
          event,
          snapshot: createSnapshot(this.#machine, target, context, true, event),
          runtime,
        });
      } else {
        action({
          context,
          event,
          snapshot: createSnapshot(this.#machine, target, context, true, event),
          runtime,
        });
      }
    }

    this.#snapshot = withRuntimeState(
      createSnapshot(this.#machine, target, context, true, event),
      previousSnapshot,
    );
    if (previousSnapshot.value !== this.#snapshot.value) {
      this.#cancelStateInvokes(previousSnapshot.value);
      this.#startStateInvokes(this.#snapshot, event);
    }
    this.#runtimeOptions.inspect?.(this.#snapshot, event);
    for (const listener of this.#listeners) {
      listener();
    }
  };

  #finishQuery = (
    config: RuntimeQueryConfig,
    requestId: number,
    key: string | null,
    outcome: FlowEffectOutcome<unknown, unknown>,
  ): void => {
    const previous = this.#snapshot.resources[config.id] ?? createIdleResource(config.id);
    const receipt = toQueryReceipt(config.id, requestId, key, outcome);
    const writeReceipt = toCacheWriteReceipt(
      config,
      requestId,
      key,
      outcome,
      this.#environment().now(),
    );
    const issue = toRuntimeIssue("query", config.id, requestId, key, outcome);
    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      resources: {
        ...this.#snapshot.resources,
        [config.id]: toResourceSnapshot(
          config,
          requestId,
          key,
          previous.failureCount,
          outcome,
          this.#environment().now(),
        ),
      },
      receipts: [
        ...this.#snapshot.receipts,
        receipt,
        ...(writeReceipt === null ? [] : [writeReceipt]),
      ],
      issues: issue === null ? this.#snapshot.issues : [...this.#snapshot.issues, issue],
    });
    const routed = routeOutcome(config.routes, { requestId, key, outcome });
    if (routed !== null) {
      this.send(routed as TEvent);
    }
  };

  #startMutation = (definition: FlowMutationDefinition<unknown>, event: TEvent | null): void => {
    const config = getMutationConfig(definition);
    const input = config.input({ context: this.#snapshot.context, event });
    if (input === null || input === undefined) {
      return;
    }
    const current = this.#snapshot.mutations[config.id];
    if (current?.status === "running" && config.concurrency === "reject-while-running") {
      return;
    }

    const requestId = this.#nextRequestId++;
    const previewPatches = (config.preview ?? config.optimistic)?.apply?.({ input });
    const previewResult =
      previewPatches === undefined
        ? { resources: this.#snapshot.resources, rollbacks: [] as const }
        : patchResources(this.#snapshot.resources, previewPatches, requestId);
    if (previewPatches !== undefined) {
      this.#activeMutationRollbacks.set(requestId, previewResult.rollbacks);
    }
    const key = current?.requestId === null ? null : current?.id;
    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      resources: previewResult.resources,
      mutations: {
        ...this.#snapshot.mutations,
        [config.id]: {
          id: config.id,
          status: "running",
          requestId,
          variables: input,
          failureCount: current?.failureCount ?? 0,
        },
      },
      receipts: [
        ...this.#snapshot.receipts,
        { type: "mutation:start", id: config.id, requestId, key: key ?? undefined },
        ...(previewPatches === undefined
          ? []
          : [
              {
                type: "mutation:preview-patch" as const,
                id: config.id,
                requestId,
                value: previewPatches,
              },
            ]),
      ],
    });

    void this.#runEffect(config.effect(input)).then((outcome) => {
      this.#finishMutation(config, requestId, input, outcome);
    });
  };

  #finishMutation = (
    config: RuntimeMutationConfig,
    requestId: number,
    variables: unknown,
    outcome: FlowEffectOutcome<unknown, unknown>,
  ): void => {
    const previous = this.#snapshot.mutations[config.id] ?? createIdleMutation(config.id);
    const receipt = toMutationReceipt(config.id, requestId, outcome);
    const rollback = this.#activeMutationRollbacks.get(requestId);
    this.#activeMutationRollbacks.delete(requestId);
    const shouldRollback = outcome.status !== "success" && rollback !== undefined;
    if (shouldRollback) {
      this.#rebasePendingRollbacks(rollback);
    }
    const invalidationTargets =
      outcome.status === "success"
        ? resolveInvalidationTargets(config, variables, outcome.value)
        : [];
    const invalidations = invalidationReceipts(config, requestId, invalidationTargets);
    const issue = toRuntimeIssue("mutation", config.id, requestId, null, outcome);
    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      mutations: {
        ...this.#snapshot.mutations,
        [config.id]: toMutationSnapshot(
          config.id,
          requestId,
          variables,
          previous.failureCount,
          outcome,
        ),
      },
      resources: shouldRollback
        ? rollbackResources(this.#snapshot.resources, rollback)
        : invalidationTargets.length === 0
          ? this.#snapshot.resources
          : markInvalidatedResources(
              this.#snapshot.resources,
              invalidationTargets,
              this.#environment().now(),
            ),
      receipts: [
        ...this.#snapshot.receipts,
        receipt,
        ...(shouldRollback
          ? [
              {
                type: "mutation:rollback" as const,
                id: config.id,
                requestId,
              },
            ]
          : []),
        ...invalidations,
        ...staleReceipts(this.#snapshot.resources, invalidationTargets, requestId, config.id),
      ],
      issues: issue === null ? this.#snapshot.issues : [...this.#snapshot.issues, issue],
    });
    const routed = routeOutcome(config.routes, { requestId, key: null, outcome });
    if (routed !== null) {
      this.send(routed as TEvent);
    }
  };

  #rebasePendingRollbacks = (failedRollbacks: readonly FlowResourceRollback[]): void => {
    for (const failed of failedRollbacks) {
      for (const [requestId, rollbacks] of this.#activeMutationRollbacks) {
        this.#activeMutationRollbacks.set(
          requestId,
          rollbacks.map((rollback) =>
            rollback.key === failed.key && rollback.previous === failed.patched
              ? { ...rollback, previous: failed.previous }
              : rollback,
          ),
        );
      }
    }
  };

  #provideEffect = (
    effect: Effect.Effect<unknown, unknown, unknown>,
  ): Effect.Effect<unknown, unknown, never> =>
    this.#runtimeOptions.layer === undefined
      ? (effect as Effect.Effect<unknown, unknown, never>)
      : Effect.provide(effect, this.#runtimeOptions.layer as Layer.Layer<unknown, unknown, never>);

  #runEffect = async (
    effect: Effect.Effect<unknown, unknown, unknown>,
  ): Promise<FlowEffectOutcome<unknown, unknown>> => {
    const runnable = this.#provideEffect(effect);
    return inspectEffectExit(await Effect.runPromiseExit(runnable));
  };
}

interface RuntimeInvokeArgs {
  readonly context: unknown;
  readonly event: FlowEvent | null;
}

interface RuntimeRouteArgs {
  readonly requestId: number;
  readonly key: string | null;
  readonly outcome: FlowEffectOutcome<unknown, unknown>;
}

interface RuntimeRoutes {
  readonly success?: (args: { readonly requestId: number; readonly value: unknown }) => FlowEvent;
  readonly failure?: (args: { readonly requestId: number; readonly error: unknown }) => FlowEvent;
  readonly defect?: (args: { readonly requestId: number; readonly defect: unknown }) => FlowEvent;
  readonly interrupt?: (args: { readonly requestId: number }) => FlowEvent;
}

interface RuntimeQueryConfig {
  readonly id: string;
  readonly key: (args: RuntimeInvokeArgs) => FlowKey | string | null;
  readonly tags?: readonly FlowTag[];
  readonly effect: (args: RuntimeInvokeArgs) => Effect.Effect<unknown, unknown, unknown>;
  readonly cache?: FlowQueryCachePolicy;
  readonly policy?: "cache-first" | "network-first" | "stale-while-revalidate";
  readonly routes?: RuntimeRoutes;
}

interface RuntimeMutationConfig {
  readonly id: string;
  readonly input: (args: {
    readonly context: unknown;
    readonly event: FlowEvent | null;
  }) => unknown;
  readonly effect: (input: unknown) => Effect.Effect<unknown, unknown, unknown>;
  readonly routes?: RuntimeRoutes;
  readonly preview?: {
    readonly apply?: (args: { readonly input: unknown }) => readonly FlowResourcePatch[];
  };
  /** @deprecated Use preview for rollbackable pending ResourceStore patches. */
  readonly optimistic?: {
    readonly apply?: (args: { readonly input: unknown }) => readonly FlowResourcePatch[];
  };
  readonly invalidates?:
    | readonly FlowCacheInvalidationTarget[]
    | ((args: {
        readonly input: unknown;
        readonly value: unknown;
      }) => readonly FlowCacheInvalidationTarget[]);
  readonly concurrency?: "reject-while-running" | "allow";
}

interface FlowResourceRollback {
  readonly requestId: number;
  readonly key: string;
  readonly previous: FlowResourceSnapshot | undefined;
  readonly patched: FlowResourceSnapshot;
}

interface RuntimeChildConfig {
  readonly id: string;
  readonly machine?: FlowMachine<unknown, FlowEvent, string>;
  readonly supervision?: "parent" | "detached" | "restart-on-failure" | "stop-on-failure";
}

interface RuntimeStreamConfig {
  readonly id: string;
  readonly input?: (args: RuntimeInvokeArgs) => unknown;
  readonly stream: (args: {
    readonly input: unknown;
    readonly services: undefined;
    readonly runtime: FlowRuntimeEnvironment;
  }) => Stream.Stream<unknown, unknown, unknown>;
  readonly pressure?: FlowStreamPressure<unknown>;
  readonly routes?: FlowStreamRoutes<unknown, unknown, FlowEvent>;
}

interface RuntimeAfterConfig {
  readonly id: string;
  readonly delay:
    | FlowDurationInput
    | ((args: {
        readonly context: unknown;
        readonly event: FlowEvent | null;
      }) => FlowDurationInput);
  readonly target?: string;
  readonly guard?:
    | FlowGuard<unknown, FlowEvent, string>
    | FlowGuardPredicate<unknown, FlowEvent, string>;
  readonly update?:
    | FlowUpdateReducer<unknown, FlowEvent, string>
    | readonly FlowUpdateReducer<unknown, FlowEvent, string>[];
  readonly actions?:
    | FlowAction<unknown, FlowEvent, string>
    | readonly FlowAction<unknown, FlowEvent, string>[];
  readonly routes?: {
    readonly fired?: () => FlowEvent;
    readonly interrupt?: () => FlowEvent;
  };
}

function withRuntimeState<TContext, TState extends string>(
  next: FlowSnapshot<TContext, TState>,
  previous: FlowSnapshot<TContext, TState>,
): FlowSnapshot<TContext, TState> {
  return updateRuntimeSnapshot(next, {
    resources: previous.resources,
    mutations: previous.mutations,
    streams: previous.streams,
    timers: previous.timers,
    children: previous.children,
    receipts: previous.receipts,
    issues: previous.issues,
  });
}

function updateRuntimeSnapshot<TContext, TState extends string>(
  snapshot: FlowSnapshot<TContext, TState>,
  runtime: {
    readonly resources?: Readonly<Record<string, FlowResourceSnapshot>>;
    readonly mutations?: Readonly<Record<string, FlowMutationSnapshot>>;
    readonly streams?: Readonly<Record<string, FlowStreamSnapshot>>;
    readonly timers?: Readonly<Record<string, FlowTimerSnapshot>>;
    readonly children?: Readonly<Record<string, FlowChildSnapshot>>;
    readonly receipts?: readonly FlowRuntimeReceipt[];
    readonly issues?: readonly FlowRuntimeIssue[];
  },
): FlowSnapshot<TContext, TState> {
  return {
    ...snapshot,
    resources: runtime.resources ?? snapshot.resources,
    mutations: runtime.mutations ?? snapshot.mutations,
    streams: runtime.streams ?? snapshot.streams,
    timers: runtime.timers ?? snapshot.timers,
    children: runtime.children ?? snapshot.children,
    receipts: runtime.receipts ?? snapshot.receipts,
    issues: runtime.issues ?? snapshot.issues,
  };
}

function normalizeInvokes(invoke: FlowStateInvoke | readonly FlowStateInvoke[] | undefined) {
  if (invoke === undefined) {
    return [];
  }

  return Array.isArray(invoke) ? invoke : [invoke];
}

function normalizeSubmits(
  submit: FlowMutationDefinition<unknown> | readonly FlowMutationDefinition<unknown>[] | undefined,
): readonly FlowMutationDefinition<unknown>[] {
  if (submit === undefined) {
    return [];
  }

  return Array.isArray(submit) ? submit : [submit as FlowMutationDefinition<unknown>];
}

function getQueryConfig(
  definition:
    | FlowQueryDefinition<unknown>
    | FlowEnsureDefinition<unknown>
    | FlowObserveDefinition<unknown>,
): RuntimeQueryConfig {
  if (definition.kind === "ensure") {
    const config = definition.config as {
      readonly resource: FlowResourceRef | FlowResourceCallable;
    };
    return resourceRefToQueryConfig(toResourceRef(config.resource));
  }

  if (definition.kind === "observe") {
    return resourceRefToQueryConfig(
      toResourceRef(definition.config as FlowResourceRef | FlowResourceCallable),
    );
  }

  const config = definition.config as RuntimeQueryConfig;
  return config;
}

function getMutationConfig(definition: FlowMutationDefinition<unknown>): RuntimeMutationConfig {
  const config = definition.config as RuntimeMutationConfig;
  return config;
}

function getChildConfig(definition: FlowChildDefinition<unknown>): RuntimeChildConfig {
  const config = definition.config as RuntimeChildConfig;
  return config;
}

function getStreamConfig(definition: FlowStreamDefinition<unknown>): RuntimeStreamConfig {
  const config = definition.config as RuntimeStreamConfig;
  return config;
}

function getAfterConfig(definition: FlowAfterDefinition<unknown>): RuntimeAfterConfig {
  const config = definition.config as RuntimeAfterConfig;
  return config;
}

function toResourceRef(resource: FlowResourceRef | FlowResourceCallable): FlowResourceRef {
  return typeof resource === "function" ? resource.ref() : resource;
}

function resourceRefToQueryConfig(ref: FlowResourceRef): RuntimeQueryConfig {
  const definition = ref.definition as FlowResourceDefinition<FlowResourceConfig>;
  const config = definition.config;
  const tags = config.tags?.(...ref.args);
  const cache =
    config.freshness?.onInvalidate === undefined
      ? undefined
      : { refetchOnInvalidate: config.freshness.onInvalidate };
  return {
    id: ref.id,
    key: () => ref.key,
    effect: () => config.lookup(...ref.args),
    ...(tags === undefined ? {} : { tags }),
    ...(cache === undefined ? {} : { cache }),
  };
}

function toKeyHash(key: FlowKey | string | null): string | null {
  if (key === null) {
    return null;
  }

  return typeof key === "string" ? key : key.hash;
}

function findResource(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  idOrKey: string | FlowKey,
): FlowResourceSnapshot | null {
  const target = toKeyHash(idOrKey);
  return (
    Object.values(resources).find(
      (resource) => resource.id === target || resource.key === target,
    ) ?? null
  );
}

function createIdleResource(id: string): FlowResourceSnapshot {
  return {
    id,
    key: null,
    status: "idle",
    fetchStatus: "idle",
    requestId: null,
    stale: false,
    failureCount: 0,
    observers: 0,
  };
}

function seededResourceSnapshot<TValue>(
  ref: FlowSeededResource["ref"] | FlowResourceRef<TValue>,
  value: TValue,
): FlowResourceSnapshot {
  const definition = ref.definition as {
    readonly config?: {
      readonly tags?: (...args: readonly unknown[]) => readonly FlowTag[];
    };
  };
  const tags = definition.config?.tags?.(...ref.args);

  return {
    id: ref.id,
    key: toKeyHash(ref.key),
    tags: tagNames(tags),
    status: "success",
    fetchStatus: "idle",
    requestId: null,
    stale: false,
    failureCount: 0,
    observers: 0,
    value,
  };
}

function resourceStorageKey(ref: FlowSeededResource["ref"] | FlowResourceRef): string {
  return toKeyHash(ref.key) ?? ref.id;
}

function createIdleMutation(id: string): FlowMutationSnapshot {
  return {
    id,
    status: "idle",
    requestId: null,
    variables: null,
    failureCount: 0,
  };
}

function createIdleStream(id: string): FlowStreamSnapshot {
  return {
    id,
    status: "idle",
    emitted: 0,
    coalesced: 0,
    dropped: 0,
  };
}

function toLoadingResource(
  config: RuntimeQueryConfig,
  requestId: number,
  key: string | null,
  previous: FlowResourceSnapshot | undefined,
  now: number,
): FlowResourceSnapshot {
  const keepPrevious =
    previous?.status === "success" &&
    (config.cache?.keepPreviousData === true || config.policy === "stale-while-revalidate");

  return {
    id: config.id,
    key,
    tags: tagNames(config.tags),
    status: keepPrevious ? "success" : "loading",
    fetchStatus: "fetching",
    requestId,
    stale: previous?.stale ?? false,
    failureCount: previous?.failureCount ?? 0,
    observers: 1,
    updatedAt: previous?.updatedAt,
    staleAt: previous?.staleAt,
    gcAt: previous?.gcAt,
    invalidatedAt: previous?.invalidatedAt,
    ...(keepPrevious && "value" in previous ? { value: previous.value } : {}),
    ...(keepPrevious && "error" in previous ? { error: previous.error } : {}),
    ...(previous === undefined ? { updatedAt: now } : {}),
  };
}

function toResourceSnapshot(
  config: RuntimeQueryConfig,
  requestId: number,
  key: string | null,
  previousFailureCount: number,
  outcome: FlowEffectOutcome<unknown, unknown>,
  now: number,
): FlowResourceSnapshot {
  if (outcome.status === "success") {
    return {
      id: config.id,
      key,
      tags: tagNames(config.tags),
      status: "success",
      fetchStatus: "idle",
      requestId: null,
      stale: false,
      failureCount: 0,
      observers: 1,
      updatedAt: now,
      staleAt: addDuration(now, config.cache?.staleTime),
      gcAt: addDuration(now, config.cache?.gcTime),
      value: outcome.value,
    };
  }

  if (outcome.status === "failure") {
    return {
      id: config.id,
      key,
      tags: tagNames(config.tags),
      status: "failure",
      fetchStatus: "idle",
      requestId: null,
      stale: false,
      failureCount: previousFailureCount + 1,
      observers: 1,
      updatedAt: now,
      error: outcome.error,
    };
  }

  if (outcome.status === "defect") {
    return {
      id: config.id,
      key,
      tags: tagNames(config.tags),
      status: "failure",
      fetchStatus: "idle",
      requestId: null,
      stale: false,
      failureCount: previousFailureCount + 1,
      observers: 1,
      updatedAt: now,
      error: outcome.defect,
    };
  }

  return {
    id: config.id,
    key,
    tags: tagNames(config.tags),
    status: "interrupt",
    fetchStatus: "idle",
    requestId,
    stale: false,
    failureCount: previousFailureCount,
    observers: 0,
    updatedAt: now,
  };
}

function toMutationSnapshot(
  id: string,
  requestId: number,
  variables: unknown,
  previousFailureCount: number,
  outcome: FlowEffectOutcome<unknown, unknown>,
): FlowMutationSnapshot {
  if (outcome.status === "success") {
    return {
      id,
      status: "success",
      requestId: null,
      variables,
      failureCount: previousFailureCount,
      value: outcome.value,
    };
  }

  if (outcome.status === "failure") {
    return {
      id,
      status: "failure",
      requestId: null,
      variables,
      failureCount: previousFailureCount + 1,
      error: outcome.error,
    };
  }

  if (outcome.status === "defect") {
    return {
      id,
      status: "failure",
      requestId: null,
      variables,
      failureCount: previousFailureCount + 1,
      error: outcome.defect,
    };
  }

  return {
    id,
    status: "interrupt",
    requestId,
    variables,
    failureCount: previousFailureCount,
  };
}

function toQueryReceipt(
  id: string,
  requestId: number,
  key: string | null,
  outcome: FlowEffectOutcome<unknown, unknown>,
): FlowRuntimeReceipt {
  return {
    type: `query:${outcome.status === "interrupt" ? "interrupt" : outcome.status}` as
      | "query:success"
      | "query:failure"
      | "query:defect"
      | "query:interrupt",
    id,
    requestId,
    key: key ?? undefined,
  };
}

function toMutationReceipt(
  id: string,
  requestId: number,
  outcome: FlowEffectOutcome<unknown, unknown>,
): FlowRuntimeReceipt {
  return {
    type: `mutation:${outcome.status === "interrupt" ? "interrupt" : outcome.status}` as
      | "mutation:success"
      | "mutation:failure"
      | "mutation:defect"
      | "mutation:interrupt",
    id,
    requestId,
  };
}

function toStreamReceipt(
  id: string,
  requestId: number,
  outcome: FlowEffectOutcome<unknown, unknown>,
  at: number,
): FlowRuntimeReceipt {
  if (outcome.status === "success") {
    return { type: "stream:done", id, requestId, at };
  }

  if (outcome.status === "failure") {
    return { type: "stream:failure", id, requestId, value: outcome.error, at };
  }

  if (outcome.status === "defect") {
    return { type: "stream:defect", id, requestId, value: outcome.defect, at };
  }

  return { type: "stream:interrupt", id, requestId, at };
}

function streamStatusFromOutcome(
  outcome: FlowEffectOutcome<unknown, unknown>,
): FlowStreamSnapshot["status"] {
  if (outcome.status === "success") {
    return "done";
  }

  if (outcome.status === "failure") {
    return "failure";
  }

  if (outcome.status === "defect") {
    return "defect";
  }

  return "interrupt";
}

function routeStreamOutcome(
  routes: FlowStreamRoutes<unknown, unknown, FlowEvent> | undefined,
  outcome: FlowEffectOutcome<unknown, unknown>,
): FlowEvent | null {
  if (routes === undefined) {
    return null;
  }

  if (outcome.status === "success") {
    return routes.done?.() ?? null;
  }

  if (outcome.status === "failure") {
    return routes.failure?.(outcome.error) ?? null;
  }

  if (outcome.status === "defect") {
    return routes.defect?.(outcome.defect) ?? null;
  }

  return routes.interrupt?.() ?? null;
}

function toCacheWriteReceipt(
  config: RuntimeQueryConfig,
  requestId: number,
  key: string | null,
  outcome: FlowEffectOutcome<unknown, unknown>,
  now: number,
): FlowRuntimeReceipt | null {
  if (outcome.status !== "success") {
    return null;
  }

  return {
    type: "cache:write",
    id: config.id,
    requestId,
    key: key ?? undefined,
    tags: tagNames(config.tags),
    value: outcome.value,
    at: now,
  };
}

function invalidationReceipts(
  config: RuntimeMutationConfig,
  requestId: number,
  targets: readonly FlowCacheInvalidationTarget[],
): readonly FlowRuntimeReceipt[] {
  return targets.map((item) => ({
    type: "cache:invalidate",
    id: config.id,
    requestId,
    target: invalidationTargetId(item),
    key: invalidationTargetId(item),
  }));
}

function staleReceipts(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  targets: readonly FlowCacheInvalidationTarget[],
  requestId: number,
  mutationId: string,
): readonly FlowRuntimeReceipt[] {
  if (targets.length === 0) {
    return [];
  }

  return Object.values(resources)
    .filter((resource) => targets.some((target) => matchesInvalidation(resource, target)))
    .map((resource) => ({
      type: "cache:stale" as const,
      id: mutationId,
      requestId,
      key: resource.key ?? undefined,
      target: resource.id,
      tags: resource.tags,
    }));
}

function resolveInvalidationTargets(
  config: RuntimeMutationConfig,
  input: unknown,
  value: unknown,
): readonly FlowCacheInvalidationTarget[] {
  if (config.invalidates === undefined) {
    return [];
  }

  return typeof config.invalidates === "function"
    ? config.invalidates({ input, value })
    : config.invalidates;
}

function markInvalidatedResources(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  targets: readonly FlowCacheInvalidationTarget[],
  now: number,
): Readonly<Record<string, FlowResourceSnapshot>> {
  return Object.fromEntries(
    Object.entries(resources).map(([id, resource]) => [
      id,
      targets.some((target) => matchesInvalidation(resource, target))
        ? { ...resource, stale: true, invalidatedAt: now }
        : resource,
    ]),
  );
}

function patchResources(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  patches: readonly FlowResourcePatch[],
  requestId: number,
): {
  readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
  readonly rollbacks: readonly FlowResourceRollback[];
} {
  let nextResources = resources;
  const rollbacks: FlowResourceRollback[] = [];

  for (const patch of patches) {
    const key = resourceStorageKey(patch.ref);
    const previous = nextResources[key];
    const value = "replace" in patch ? patch.replace : patch.update(previous?.value);
    const patched =
      previous === undefined
        ? seededResourceSnapshot(patch.ref, value)
        : {
            ...previous,
            value,
            stale: false,
          };
    rollbacks.push({ requestId, key, previous, patched });
    nextResources = {
      ...nextResources,
      [key]: patched,
    };
  }

  return { resources: nextResources, rollbacks };
}

function rollbackResources(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  rollbacks: readonly FlowResourceRollback[],
): Readonly<Record<string, FlowResourceSnapshot>> {
  let nextResources = resources;
  for (const rollback of rollbacks) {
    if (nextResources[rollback.key] !== rollback.patched) {
      continue;
    }
    if (rollback.previous === undefined) {
      const { [rollback.key]: _removed, ...rest } = nextResources;
      nextResources = rest;
    } else {
      nextResources = {
        ...nextResources,
        [rollback.key]: rollback.previous,
      };
    }
  }
  return nextResources;
}

function matchesInvalidation(
  resource: FlowResourceSnapshot,
  target: FlowCacheInvalidationTarget,
): boolean {
  if (typeof target === "string") {
    return (
      resource.id === target || resource.key === target || resource.tags?.includes(target) === true
    );
  }

  if (target.kind === "key") {
    return resource.key === target.hash;
  }

  if (target.kind === "tag") {
    return resource.tags?.includes(target.name) === true;
  }

  return target.match(resource);
}

function invalidationTargetId(target: FlowCacheInvalidationTarget): string {
  if (typeof target === "string") {
    return target;
  }

  if (target.kind === "key") {
    return target.hash;
  }

  if (target.kind === "tag") {
    return `tag:${target.name}`;
  }

  return `predicate:${target.id}`;
}

function tagNames(tags: readonly FlowTag[] | undefined): readonly string[] | undefined {
  return tags === undefined ? undefined : tags.map((tag) => tag.name);
}

function addDuration(now: number, duration: number | undefined): number | undefined {
  return duration === undefined ? undefined : now + duration;
}

function toRuntimeIssue(
  source: "query" | "mutation" | "stream",
  id: string,
  requestId: number,
  key: string | null,
  outcome: FlowEffectOutcome<unknown, unknown>,
): FlowRuntimeIssue | null {
  if (outcome.status === "failure") {
    return {
      kind: "failure",
      source,
      id,
      requestId,
      key: key ?? undefined,
      error: outcome.error,
      handled: true,
    };
  }

  if (outcome.status === "defect") {
    return {
      kind: "defect",
      source,
      id,
      requestId,
      key: key ?? undefined,
      defect: outcome.defect,
      handled: false,
    };
  }

  if (outcome.status === "interrupt") {
    return {
      kind: "interrupt",
      source,
      id,
      requestId,
      key: key ?? undefined,
      handled: true,
    };
  }

  return null;
}

function resolveTimerDelay(
  config: RuntimeAfterConfig,
  context: unknown,
  event: FlowEvent | null,
): FlowDurationInput {
  return typeof config.delay === "function" ? config.delay({ context, event }) : config.delay;
}

function durationToMillis(duration: FlowDurationInput): number {
  if (typeof duration === "number") {
    return duration;
  }

  if (typeof duration === "object") {
    return duration.millis;
  }

  const match = /^(\d+(?:\.\d+)?)\s*(ms|millis|milliseconds?|s|sec|secs|seconds?)$/i.exec(
    duration.trim(),
  );
  if (match === null) {
    return Number(duration);
  }

  const [, rawValue = "0", rawUnit = "ms"] = match;
  const value = Number(rawValue);
  const unit = rawUnit.toLowerCase();
  return unit === "ms" || unit.startsWith("milli") ? value : value * 1_000;
}

function allowsAfter<TContext, TEvent extends FlowEvent, TState extends string>(
  config: RuntimeAfterConfig,
  snapshot: FlowSnapshot<TContext, TState>,
  event: TEvent,
  runtime: FlowRuntimeEnvironment,
): boolean {
  if (config.guard === undefined) {
    return true;
  }

  const predicate = typeof config.guard === "function" ? config.guard : config.guard.predicate;
  return predicate({ context: snapshot.context, event, snapshot, runtime });
}

function routeOutcome(routes: RuntimeRoutes | undefined, args: RuntimeRouteArgs): FlowEvent | null {
  if (routes === undefined) {
    return null;
  }

  if (args.outcome.status === "success") {
    return routes.success?.({ requestId: args.requestId, value: args.outcome.value }) ?? null;
  }

  if (args.outcome.status === "failure") {
    return routes.failure?.({ requestId: args.requestId, error: args.outcome.error }) ?? null;
  }

  if (args.outcome.status === "defect") {
    return routes.defect?.({ requestId: args.requestId, defect: args.outcome.defect }) ?? null;
  }

  return routes.interrupt?.({ requestId: args.requestId }) ?? null;
}

function createMachineFromConfig<TContext, TEvent extends FlowEvent, TState extends string>(
  config: FlowMachineConfig<TContext, TEvent, TState>,
): FlowMachine<TContext, TEvent, TState> {
  const machine: FlowMachine<TContext, TEvent, TState> = {
    id: config.id,
    initial: config.initial,
    config,
    getInitialSnapshot(): FlowSnapshot<TContext, TState> {
      return createSnapshot(machine, config.initial, createInitialContext(config), false, null);
    },
    transition(
      snapshot: FlowSnapshot<TContext, TState>,
      event: TEvent,
      runtime: FlowRuntimeEnvironment = defaultRuntimeEnvironment,
    ): FlowSnapshot<TContext, TState> {
      const transition = selectTransition(machine, snapshot, event, runtime);
      if (transition === null) {
        return snapshot;
      }

      let context = snapshot.context;
      const target = transition.target ?? snapshot.value;
      const nextBase = createSnapshot(machine, target, context, true, event);

      for (const update of normalizeUpdates(transition.update)) {
        const patch = update({ context, event, snapshot: nextBase, runtime });
        context = mergeContext(context, patch);
      }

      for (const action of normalizeActions(transition.actions)) {
        if (isAssignAction(action)) {
          const patch = action.updater({ context, event, snapshot: nextBase, runtime });
          context = mergeContext(context, patch);
        } else if (isEffectAction(action)) {
          action.fn({
            context,
            event,
            snapshot: createSnapshot(machine, target, context, true, event),
            runtime,
          });
        } else {
          action({
            context,
            event,
            snapshot: createSnapshot(machine, target, context, true, event),
            runtime,
          });
        }
      }

      const result = createSnapshot(machine, target, context, true, event);
      const submits = normalizeSubmits(transition.submit);
      if (submits.length > 0) {
        pendingSubmits.set(result as FlowSnapshot<unknown>, submits);
      }
      reenteredSnapshots.set(result as FlowSnapshot<unknown>, transition.target !== undefined);
      return result;
    },
    can(snapshot: FlowSnapshot<TContext, TState>, event: FlowEvent): boolean {
      return (
        selectTransition(machine, snapshot, event as TEvent, defaultRuntimeEnvironment) !== null
      );
    },
  };

  return machine;
}

function createSnapshot<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
  value: TState,
  context: TContext,
  changed: boolean,
  event: FlowEvent | null,
): FlowSnapshot<TContext, TState> {
  return {
    value,
    context,
    status: "active",
    changed,
    event,
    resources: {},
    mutations: {},
    streams: {},
    timers: {},
    children: {},
    receipts: [],
    issues: [],
    matches(state: TState): boolean {
      return value === state;
    },
    can(candidate: FlowEvent): boolean {
      return machine.can(this, candidate);
    },
  };
}

function createInitialContext<TContext, TEvent extends FlowEvent, TState extends string>(
  config: FlowMachineConfig<TContext, TEvent, TState>,
): TContext {
  const context = config.context;
  return typeof context === "function" ? (context as () => TContext)() : context;
}

function applyActorOptions<TContext, TState extends string>(
  snapshot: FlowSnapshot<TContext, TState>,
  options: FlowActorOptions<TContext> | undefined,
): FlowSnapshot<TContext, TState> {
  const withResources =
    options?.resources === undefined
      ? snapshot
      : updateRuntimeSnapshot(snapshot, { resources: options.resources });

  if (options?.context === undefined) {
    return withResources;
  }

  const context =
    typeof options.context === "function"
      ? options.context(withResources.context)
      : mergeContext(withResources.context, options.context);

  return {
    ...withResources,
    context,
  };
}

function selectTransition<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
  snapshot: FlowSnapshot<TContext, TState>,
  event: TEvent,
  runtime: FlowRuntimeEnvironment = defaultRuntimeEnvironment,
): FlowTransitionConfig<TContext, TEvent, TState> | null {
  const stateNode = machine.config.states[snapshot.value];
  const candidate = stateNode.on?.[event.type as TEvent["type"]];
  const transitions = normalizeTransitions(candidate);

  for (const transition of transitions) {
    if (allowsTransition(transition, snapshot, event, runtime)) {
      return transition;
    }
  }

  return null;
}

function allowsTransition<TContext, TEvent extends FlowEvent, TState extends string>(
  transition: FlowTransitionConfig<TContext, TEvent, TState>,
  snapshot: FlowSnapshot<TContext, TState>,
  event: TEvent,
  runtime: FlowRuntimeEnvironment,
): boolean {
  if (transition.guard === undefined) {
    return true;
  }

  const predicate =
    typeof transition.guard === "function" ? transition.guard : transition.guard.predicate;

  return predicate({ context: snapshot.context, event, snapshot, runtime });
}

function normalizeUpdates<TContext, TEvent extends FlowEvent, TState extends string>(
  update:
    | FlowUpdateReducer<TContext, TEvent, TState>
    | readonly FlowUpdateReducer<TContext, TEvent, TState>[]
    | undefined,
): readonly FlowUpdateReducer<TContext, TEvent, TState>[] {
  if (update === undefined) {
    return [];
  }

  if (Array.isArray(update)) {
    return update;
  }

  return [update as FlowUpdateReducer<TContext, TEvent, TState>];
}

function normalizeActions<TContext, TEvent extends FlowEvent, TState extends string>(
  actions:
    | FlowAction<TContext, TEvent, TState>
    | readonly FlowAction<TContext, TEvent, TState>[]
    | undefined,
): readonly FlowAction<TContext, TEvent, TState>[] {
  if (actions === undefined) {
    return [];
  }

  if (Array.isArray(actions)) {
    return actions as readonly FlowAction<TContext, TEvent, TState>[];
  }

  return [actions as FlowAction<TContext, TEvent, TState>];
}

function isAssignAction<TContext, TEvent extends FlowEvent, TState extends string>(
  action: FlowAction<TContext, TEvent, TState>,
): action is FlowAssignAction<TContext, TEvent, TState> {
  return typeof action === "object" && action.kind === "assign";
}

function isEffectAction<TContext, TEvent extends FlowEvent, TState extends string>(
  action: FlowAction<TContext, TEvent, TState>,
): action is FlowEffectAction<TContext, TEvent, TState> {
  return typeof action === "object" && action.kind === "action";
}

function mergeContext<TContext>(context: TContext, patch: Partial<TContext> | TContext): TContext {
  if (isRecord(context) && isRecord(patch)) {
    return { ...context, ...patch };
  }

  return patch as TContext;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActor<TContext, TEvent extends FlowEvent, TState extends string>(
  value: FlowActorRef<TContext, TEvent, TState> | FlowSnapshot<TContext, TState>,
): value is FlowActorRef<TContext, TEvent, TState> {
  return "send" in value && "subscribe" in value;
}
