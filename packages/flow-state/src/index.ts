import * as React from "react";
import { Cause, Context, Deferred, Effect, Exit, Layer, Option, Result } from "effect";
import { createMachine, initialTransition } from "xstate";

export type FlowStatePrimitive = "atom" | "resource" | "mutation" | "machine";

export interface FlowStatePackageInfo {
  readonly name: "@flow-state/core";
  readonly status: "smoke-tested";
  readonly primitives: readonly FlowStatePrimitive[];
}

export const packageInfo: FlowStatePackageInfo = {
  name: "@flow-state/core",
  status: "smoke-tested",
  primitives: ["atom", "resource", "mutation", "machine"],
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

export interface FlowInvokeDefinition<TKind extends string, TConfig> {
  readonly kind: TKind;
  readonly config: TConfig;
}

export type FlowEffectDefinition<TConfig> = FlowInvokeDefinition<"effect", TConfig>;
export type FlowQueryDefinition<TConfig> = FlowInvokeDefinition<"query", TConfig>;
export type FlowMutationDefinition<TConfig> = FlowInvokeDefinition<"mutation", TConfig>;
export type FlowStateInvoke =
  | FlowEffectDefinition<unknown>
  | FlowQueryDefinition<unknown>
  | FlowMutationDefinition<unknown>;

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
  resources(): Readonly<Record<string, FlowResourceSnapshot>>;
  mutations(): Readonly<Record<string, FlowMutationSnapshot>>;
  effects(): FlowEffectInspector;
  cache(): FlowCacheInspector;
  receipts(): readonly FlowRuntimeReceipt[];
  issues(): readonly FlowRuntimeIssue[];
  clock(now: () => number): FlowTestHarness<TContext, TEvent, TState>;
}

export interface FlowSettleOptions {
  readonly maxSteps?: number;
}

export interface FlowResourceSnapshot {
  readonly id: string;
  readonly key: string | null;
  readonly status: "idle" | "loading" | "success" | "failure" | "interrupt";
  readonly fetchStatus: "idle" | "fetching";
  readonly requestId: number | null;
  readonly stale: boolean;
  readonly failureCount: number;
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
    | "cache:invalidate";
  readonly id: string;
  readonly requestId: number | null;
  readonly key?: string | undefined;
}

export interface FlowRuntimeIssue {
  readonly kind: "failure" | "defect" | "interrupt";
  readonly source: "query" | "mutation" | "effect";
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

export interface FlowCacheInspector {
  query(id: string): FlowResourceSnapshot | null;
  invalidations(): readonly FlowRuntimeReceipt[];
}

export interface FlowMatchHandlers<TSnapshot, TResult> {
  readonly [state: string]: ((snapshot: TSnapshot) => TResult) | undefined;
  readonly _: (snapshot: TSnapshot) => TResult;
}

export interface FlowApi {
  machine<TContext, TEvent extends FlowEvent, TState extends string>(
    config: FlowMachineConfig<TContext, TEvent, TState>,
  ): FlowMachine<TContext, TEvent, TState>;
  assign<TContext, TEvent extends FlowEvent, TState extends string>(
    updater: FlowAssignUpdater<TContext, TEvent, TState>,
  ): FlowAssignAction<TContext, TEvent, TState>;
  guard<TContext, TEvent extends FlowEvent, TState extends string>(
    predicate: FlowGuardPredicate<TContext, TEvent, TState>,
  ): FlowGuard<TContext, TEvent, TState>;
  action<TContext, TEvent extends FlowEvent, TState extends string>(
    fn: FlowActionFunction<TContext, TEvent, TState>,
  ): FlowEffectAction<TContext, TEvent, TState>;
  effect<TConfig>(config: TConfig): FlowEffectDefinition<TConfig>;
  query<TConfig>(config: TConfig): FlowQueryDefinition<TConfig>;
  mutation<TConfig>(config: TConfig): FlowMutationDefinition<TConfig>;
  submit<TContext, TEvent extends FlowEvent, TState extends string>(
    mutation: FlowMutationDefinition<unknown>,
    options?: { readonly target?: TState },
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

export const flow: FlowApi = {
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
  query<TConfig>(config: TConfig): FlowQueryDefinition<TConfig> {
    return { kind: "query", config };
  },
  mutation<TConfig>(config: TConfig): FlowMutationDefinition<TConfig> {
    return { kind: "mutation", config };
  },
  submit<TContext, TEvent extends FlowEvent, TState extends string>(
    mutation: FlowMutationDefinition<unknown>,
    options: { readonly target?: TState } = {},
  ): FlowTransitionConfig<TContext, TEvent, TState> {
    return {
      submit: mutation,
      ...(options.target === undefined ? {} : { target: options.target }),
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
  return {
    now,
    ...(layer === undefined ? {} : { layer }),
  };
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

export function flowTest<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
): FlowTestHarness<TContext, TEvent, TState> {
  let layer: unknown;
  let now = defaultNow;
  let actor = createRuntime(createRuntimeOptions(layer, now)).createActor(machine);

  const createTestActor = (options?: FlowActorOptions<TContext>) =>
    createRuntime(createRuntimeOptions(layer, now)).createActor(machine, options) as LocalFlowActor<
      TContext,
      TEvent,
      TState
    >;

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
    async settle(): Promise<FlowTestHarness<TContext, TEvent, TState>> {
      return harness.flush();
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
          const resource = actor.getSnapshot().resources[id];
          if (resource?.fetchStatus === "fetching") {
            return resource;
          }
          const mutation = actor.getSnapshot().mutations[id];
          return mutation?.status === "running" ? mutation : null;
        },
        completed(id: string): FlowResourceSnapshot | FlowMutationSnapshot | null {
          return actor.getSnapshot().resources[id] ?? actor.getSnapshot().mutations[id] ?? null;
        },
        attempts(id: string): number {
          const resource = actor.getSnapshot().resources[id];
          const mutation = actor.getSnapshot().mutations[id];
          return resource?.failureCount ?? mutation?.failureCount ?? 0;
        },
      };
    },
    cache(): FlowCacheInspector {
      return {
        query(id: string): FlowResourceSnapshot | null {
          return actor.getSnapshot().resources[id] ?? null;
        },
        invalidations(): readonly FlowRuntimeReceipt[] {
          return actor
            .getSnapshot()
            .receipts.filter((receipt) => receipt.type === "cache:invalidate");
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
  };

  #environment = (): FlowRuntimeEnvironment => ({
    now: this.#runtimeOptions.now ?? defaultNow,
  });

  #startStateInvokes = (snapshot: FlowSnapshot<TContext, TState>, event: TEvent | null): void => {
    const stateNode = this.#machine.config.states[snapshot.value];
    for (const invoke of normalizeInvokes(stateNode.invoke)) {
      if (invoke.kind === "query") {
        this.#startQuery(invoke, event);
      }
    }
  };

  #cancelStateInvokes = (state: TState): void => {
    const stateNode = this.#machine.config.states[state];
    for (const invoke of normalizeInvokes(stateNode.invoke)) {
      if (invoke.kind === "query") {
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
      }
    }
  };

  #startQuery = (definition: FlowQueryDefinition<unknown>, event: TEvent | null): void => {
    const config = getQueryConfig(definition);
    const id = config.id;
    const requestId = this.#nextRequestId++;
    const key = toKeyHash(config.key({ context: this.#snapshot.context, event }));
    const generation = requestId;
    this.#activeInvokes.set(id, generation);
    const previous = this.#snapshot.resources[id];

    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      resources: {
        ...this.#snapshot.resources,
        [id]: {
          id,
          key,
          status: "loading",
          fetchStatus: "fetching",
          requestId,
          stale: false,
          failureCount: previous?.failureCount ?? 0,
        },
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

  #finishQuery = (
    config: RuntimeQueryConfig,
    requestId: number,
    key: string | null,
    outcome: FlowEffectOutcome<unknown, unknown>,
  ): void => {
    const previous = this.#snapshot.resources[config.id] ?? createIdleResource(config.id);
    const receipt = toQueryReceipt(config.id, requestId, key, outcome);
    const issue = toRuntimeIssue("query", config.id, requestId, key, outcome);
    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
      resources: {
        ...this.#snapshot.resources,
        [config.id]: toResourceSnapshot(config.id, requestId, key, previous.failureCount, outcome),
      },
      receipts: [...this.#snapshot.receipts, receipt],
      issues: issue === null ? this.#snapshot.issues : [...this.#snapshot.issues, issue],
    });
    const routed = routeOutcome(config.routes, { requestId, key, outcome });
    if (routed !== null) {
      this.send(routed as TEvent);
    }
  };

  #startMutation = (definition: FlowMutationDefinition<unknown>, event: TEvent): void => {
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
    const generation = requestId;
    this.#activeInvokes.set(config.id, generation);
    const key = current?.requestId === null ? null : current?.id;
    this.#snapshot = updateRuntimeSnapshot(this.#snapshot, {
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
      ],
    });

    void this.#runEffect(config.effect(input)).then((outcome) => {
      if (this.#activeInvokes.get(config.id) !== generation) {
        return;
      }
      this.#activeInvokes.delete(config.id);
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
    const invalidations =
      outcome.status === "success" ? invalidationReceipts(config, requestId) : [];
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
      receipts: [...this.#snapshot.receipts, receipt, ...invalidations],
      issues: issue === null ? this.#snapshot.issues : [...this.#snapshot.issues, issue],
    });
    const routed = routeOutcome(config.routes, { requestId, key: null, outcome });
    if (routed !== null) {
      this.send(routed as TEvent);
    }
  };

  #runEffect = async (
    effect: Effect.Effect<unknown, unknown, unknown>,
  ): Promise<FlowEffectOutcome<unknown, unknown>> => {
    const runnable =
      this.#runtimeOptions.layer === undefined
        ? (effect as Effect.Effect<unknown, unknown, never>)
        : Effect.provide(
            effect,
            this.#runtimeOptions.layer as Layer.Layer<unknown, unknown, never>,
          );
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
  readonly effect: (args: RuntimeInvokeArgs) => Effect.Effect<unknown, unknown, unknown>;
  readonly routes?: RuntimeRoutes;
}

interface RuntimeMutationConfig {
  readonly id: string;
  readonly input: (args: { readonly context: unknown; readonly event: FlowEvent }) => unknown;
  readonly effect: (input: unknown) => Effect.Effect<unknown, unknown, unknown>;
  readonly routes?: RuntimeRoutes;
  readonly invalidates?: readonly (FlowKey | FlowTag | string)[];
  readonly concurrency?: "reject-while-running" | "allow";
}

function withRuntimeState<TContext, TState extends string>(
  next: FlowSnapshot<TContext, TState>,
  previous: FlowSnapshot<TContext, TState>,
): FlowSnapshot<TContext, TState> {
  return updateRuntimeSnapshot(next, {
    resources: previous.resources,
    mutations: previous.mutations,
    receipts: previous.receipts,
    issues: previous.issues,
  });
}

function updateRuntimeSnapshot<TContext, TState extends string>(
  snapshot: FlowSnapshot<TContext, TState>,
  runtime: {
    readonly resources?: Readonly<Record<string, FlowResourceSnapshot>>;
    readonly mutations?: Readonly<Record<string, FlowMutationSnapshot>>;
    readonly receipts?: readonly FlowRuntimeReceipt[];
    readonly issues?: readonly FlowRuntimeIssue[];
  },
): FlowSnapshot<TContext, TState> {
  return {
    ...snapshot,
    resources: runtime.resources ?? snapshot.resources,
    mutations: runtime.mutations ?? snapshot.mutations,
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

function getQueryConfig(definition: FlowQueryDefinition<unknown>): RuntimeQueryConfig {
  const config = definition.config as RuntimeQueryConfig;
  return config;
}

function getMutationConfig(definition: FlowMutationDefinition<unknown>): RuntimeMutationConfig {
  const config = definition.config as RuntimeMutationConfig;
  return config;
}

function toKeyHash(key: FlowKey | string | null): string | null {
  if (key === null) {
    return null;
  }

  return typeof key === "string" ? key : key.hash;
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
  };
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

function toResourceSnapshot(
  id: string,
  requestId: number,
  key: string | null,
  previousFailureCount: number,
  outcome: FlowEffectOutcome<unknown, unknown>,
): FlowResourceSnapshot {
  if (outcome.status === "success") {
    return {
      id,
      key,
      status: "success",
      fetchStatus: "idle",
      requestId: null,
      stale: false,
      failureCount: 0,
      value: outcome.value,
    };
  }

  if (outcome.status === "failure") {
    return {
      id,
      key,
      status: "failure",
      fetchStatus: "idle",
      requestId: null,
      stale: false,
      failureCount: previousFailureCount + 1,
      error: outcome.error,
    };
  }

  if (outcome.status === "defect") {
    return {
      id,
      key,
      status: "failure",
      fetchStatus: "idle",
      requestId: null,
      stale: false,
      failureCount: previousFailureCount + 1,
      error: outcome.defect,
    };
  }

  return {
    id,
    key,
    status: "interrupt",
    fetchStatus: "idle",
    requestId,
    stale: false,
    failureCount: previousFailureCount,
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

function invalidationReceipts(
  config: RuntimeMutationConfig,
  requestId: number,
): readonly FlowRuntimeReceipt[] {
  return (config.invalidates ?? []).map((item) => ({
    type: "cache:invalidate",
    id: config.id,
    requestId,
    key: typeof item === "string" ? item : item.kind === "key" ? item.hash : `tag:${item.name}`,
  }));
}

function toRuntimeIssue(
  source: "query" | "mutation",
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
  if (options?.context === undefined) {
    return snapshot;
  }

  const context =
    typeof options.context === "function"
      ? options.context(snapshot.context)
      : mergeContext(snapshot.context, options.context);

  return {
    ...snapshot,
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
