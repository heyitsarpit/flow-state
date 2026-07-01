import type { Effect, Exit, Layer, ManagedRuntime } from "effect";
import type * as Duration from "effect/Duration";

import type { SelectionSource } from "../shared-contracts.js";
import type { HostSignals } from "../core/runtime/services/host-signals.js";
import type { InspectionLog } from "../core/runtime/services/inspection.js";
import type { NotificationScheduler } from "../core/runtime/services/notification-scheduler.js";
import type { OrchestratorSystem } from "../core/orchestrator/orchestrator-system.js";
import type { ResourceStore } from "../core/runtime/services/resource-store.js";
import type { TraceLog } from "../core/runtime/services/trace.js";
import type {
  FlowActorSnapshotTree,
  FlowChildSnapshot,
  FlowChildLifecycleRetryCause,
  FlowChildLifecycleSpawnReason,
  FlowChildLifecycleStopReason,
  FlowEvent,
  FlowInspectionEvent,
  FlowInspectionExportOptions,
  FlowInspectionFilter,
  FlowInspectionListener,
  FlowInspectionObserver,
  FlowInspectionRetentionPolicy,
  FlowInspectionSnapshot,
  FlowInspectionSubscription,
  FlowIssue,
  FlowIssueSummary,
  FlowReceipt,
  FlowReceiptFacts,
  FlowResourceActivity,
  FlowResourceAvailability,
  FlowResourceFreshnessStatus,
  FlowResourceHydrationEntry,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowResourceStatus,
  FlowRuntimeBootActorSnapshot,
  FlowSeededResource,
  FlowStreamStatus,
  FlowTestStreamSnapshot,
  FlowTimerStatus,
  FlowTimerSnapshot,
  FlowTransactionStatus,
  FlowTransactionSnapshot,
} from "../core/api/data-types.js";
import type {
  FlowMachine,
  FlowSnapshot,
  AnyFlowMachine,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../core/api/machine-types.js";

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
  Meta extends FlowModuleMeta = FlowModuleMeta,
> = Readonly<{
  readonly kind: "module";
  readonly id: Id;
  readonly inventory: () => FlowModuleInventorySummary;
  readonly meta: Meta;
}> &
  Inventory;

export type FlowModuleMap<
  Modules extends ReadonlyArray<FlowModuleDefinition> = ReadonlyArray<FlowModuleDefinition>,
> = Readonly<{
  readonly [Module in Modules[number] as Module["id"]]: Module;
}>;

export type FlowStoreDescriptor = Readonly<{
  readonly kind: "store";
  readonly mode: "memory" | "test";
}>;

export type FlowOrchestratorDescriptor = Readonly<{
  readonly kind: "orchestrators";
  readonly mode: "live" | "test";
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
    | InspectionLog
    | TraceLog
    | Layer.Success<Services[number]>,
    Layer.Error<Services[number]>,
    Layer.Services<Services[number]>
  >;
}>;

export type FlowAppFixtureName<App extends FlowAppDefinition> = Extract<
  App["modules"][number] extends infer Module
    ? Module extends Readonly<{ readonly meta: Readonly<{ readonly fixtures?: infer Fixtures }> }>
      ? Fixtures extends ReadonlyArray<infer Name>
        ? Name
        : never
      : never
    : never,
  string
>;

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
    readonly serialize: () => FlowActorSnapshotTree;
    readonly retryChild: (id: string) => boolean;
    readonly retryTransaction: (id: string) => boolean;
    readonly resetTransaction: (id: string) => boolean;
    readonly dispose: () => Promise<void>;
  }>;

type InferResourceRefValue<Ref extends FlowResourceRef> =
  Ref extends FlowResourceRef<string, ReadonlyArray<unknown>, infer Value> ? Value : never;

export type FlowRuntimeResources = Readonly<{
  readonly seedResources: (resources: ReadonlyArray<FlowSeededResource>) => void;
  readonly hydrate: (entries: ReadonlyArray<FlowResourceHydrationEntry>) => void;
  readonly dehydrate: () => ReadonlyArray<FlowResourceHydrationEntry>;
  readonly inspect: () => ReadonlyArray<FlowResourceSnapshot>;
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

export type FlowRuntimeInspection = Readonly<{
  readonly entries: (filter?: FlowInspectionFilter) => ReadonlyArray<FlowInspectionEvent>;
  readonly snapshot: (filter?: FlowInspectionFilter) => FlowInspectionSnapshot;
  readonly export: <Redacted = FlowInspectionEvent, Serialized = Redacted>(
    options?: FlowInspectionExportOptions<Redacted, Serialized>,
  ) => ReadonlyArray<Serialized>;
  readonly retention: () => FlowInspectionRetentionPolicy;
  readonly setRetention: (policy?: FlowInspectionRetentionPolicy) => void;
  readonly subscribe: (
    listenerOrObserver: FlowInspectionListener | FlowInspectionObserver,
    filter?: FlowInspectionFilter,
  ) => FlowInspectionSubscription;
}>;

export type FlowRuntimeBootOptions = Readonly<{
  readonly actors?: ReadonlyArray<FlowActor<any, any, any>>;
}>;

export type FlowRuntimeBootPayload = Readonly<{
  readonly version: "flow-state/runtime-boot.v1";
  readonly resources: ReadonlyArray<FlowResourceHydrationEntry>;
  readonly actors: ReadonlyArray<FlowRuntimeBootActorSnapshot>;
}>;

export type FlowRuntimeHydratedBoot = Readonly<{
  readonly payload: FlowRuntimeBootPayload;
  readonly actors: Readonly<Record<string, FlowActorSnapshotTree>>;
  readonly actorSnapshot: (id: string) => FlowActorSnapshotTree | undefined;
}>;

export type FlowActorStartOptions<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly id?: string;
  readonly policy?: string;
  readonly snapshot?:
    | FlowSnapshot<
        InferMachineContext<Machine>,
        InferMachineState<Machine>,
        InferMachineEvent<Machine>
      >
    | FlowActorSnapshotTree
    | undefined;
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
  readonly inspection: FlowRuntimeInspection;
  readonly orchestrators: FlowRuntimeOrchestrators;
  readonly runPromise: <A, E>(
    effect: Effect.Effect<A, E, RuntimeServices>,
    options?: Effect.RunOptions,
  ) => Promise<A>;
  readonly runPromiseExit: <A, E>(
    effect: Effect.Effect<A, E, RuntimeServices>,
    options?: Effect.RunOptions,
  ) => Promise<Exit.Exit<A, LayerError | E>>;
  readonly dehydrateBoot: (options?: FlowRuntimeBootOptions) => FlowRuntimeBootPayload;
  readonly hydrateBoot: (payload: FlowRuntimeBootPayload) => FlowRuntimeHydratedBoot;
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

export type FlowTestPendingMailbox = Readonly<{
  readonly id: string;
  readonly pending: number;
}>;

export type FlowTestPendingTimer = Readonly<{
  readonly id: string;
  readonly dueAt: number;
  readonly parentState?: string;
}>;

export type FlowTestPendingChild = Readonly<{
  readonly id: string;
  readonly actorId?: string;
  readonly status: FlowChildSnapshot["status"];
  readonly state?: string;
  readonly parentState?: string;
}>;

export type FlowTestPendingWork = Readonly<{
  readonly ready: number;
  readonly activeFibers: number;
  readonly mailboxes: ReadonlyArray<FlowTestPendingMailbox>;
  readonly timers: ReadonlyArray<FlowTestPendingTimer>;
  readonly streams: ReadonlyArray<string>;
  readonly transactions: ReadonlyArray<string>;
  readonly children: ReadonlyArray<FlowTestPendingChild>;
  readonly nextAfterMillis?: number;
}>;

export type FlowTestChildTreeNode = Readonly<{
  readonly id: string;
  readonly actorId?: string;
  readonly status: FlowChildSnapshot["status"];
  readonly state?: string;
  readonly parentState?: string;
  readonly supervision?: FlowChildSnapshot["supervision"];
  readonly children: FlowTestChildTree;
}>;

export type FlowTestChildTree = Readonly<Record<string, FlowTestChildTreeNode>>;

export type FlowTestChildSummary = Readonly<{
  readonly idsByStatus: Readonly<Record<FlowChildSnapshot["status"], ReadonlyArray<string>>>;
  readonly outcomes: Readonly<{
    readonly start: ReadonlyArray<string>;
    readonly success: ReadonlyArray<string>;
    readonly failure: ReadonlyArray<string>;
    readonly interrupt: ReadonlyArray<string>;
    readonly stop: ReadonlyArray<string>;
  }>;
  readonly byId: Readonly<
    Record<
      string,
      Readonly<{
        readonly actorId?: string;
        readonly status: FlowChildSnapshot["status"];
        readonly state?: string;
        readonly parentState?: string;
        readonly supervision?: FlowChildSnapshot["supervision"];
      }>
    >
  >;
}>;

export type FlowTestProgressBounds = Readonly<{
  readonly maxTicks: number;
  readonly maxFibers: number;
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
  readonly sendAll: (events: ReadonlyArray<Event>) => FlowTestHarness<Context, Event, State>;
  readonly can: (event: Event) => boolean;
  readonly children: () => Readonly<Record<string, FlowChildSnapshot>>;
  readonly childTree: () => FlowTestChildTree;
  readonly childSummary: () => FlowTestChildSummary;
  readonly cache: () => FlowTestCache;
  readonly transactions: () => FlowTestTransactions;
  readonly timers: () => FlowTestTimers;
  readonly receipts: () => ReadonlyArray<FlowReceipt>;
  readonly receiptSummary: () => FlowReceiptFacts;
  readonly streams: () => Readonly<{
    readonly all: () => Readonly<Record<string, FlowTestStreamSnapshot>>;
    readonly running: (id: string) => FlowTestStreamSnapshot | undefined;
    readonly cancelled: (id: string) => FlowTestStreamSnapshot | undefined;
    readonly events: (id: string) => ReadonlyArray<FlowReceipt>;
  }>;
  readonly issues: () => ReadonlyArray<FlowIssue>;
  readonly issueSummary: () => ReadonlyArray<FlowIssueSummary>;
  readonly pendingWork: () => FlowTestPendingWork;
  readonly retryTransaction: (id: string) => boolean;
  readonly resetTransaction: (id: string) => boolean;
  readonly flush: () => Promise<void>;
  readonly advance: (duration: Duration.Input) => Promise<void>;
  readonly advanceToNextTimer: () => Promise<boolean>;
  readonly advanceUntilIdle: (bounds?: FlowTestProgressBounds) => Promise<void>;
  readonly until: (
    predicate: (harness: FlowTestHarness<Context, Event, State>) => boolean,
    bounds?: FlowTestProgressBounds,
  ) => Promise<void>;
  readonly untilState: (
    target: State | ((state: State, snapshot: FlowSnapshot<Context, State, Event>) => boolean),
    bounds?: FlowTestProgressBounds,
  ) => Promise<void>;
  readonly untilReceipt: (
    predicate: (receipt: FlowReceipt, receipts: ReadonlyArray<FlowReceipt>) => boolean,
    bounds?: FlowTestProgressBounds,
  ) => Promise<void>;
  readonly untilIssue: (
    predicate: (issue: FlowIssue, issues: ReadonlyArray<FlowIssue>) => boolean,
    bounds?: FlowTestProgressBounds,
  ) => Promise<void>;
  readonly trace: <
    Options extends Readonly<Record<string, unknown>> | undefined =
      | Readonly<Record<string, unknown>>
      | undefined,
  >(
    options?: Options,
  ) => FlowTraceDescriptor<FlowSnapshot<Context, State, Event>, Options>;
  readonly captureTrace: <
    Options extends Readonly<Record<string, unknown>> | undefined =
      | Readonly<Record<string, unknown>>
      | undefined,
  >(
    options?: Options,
  ) => FlowTraceDescriptor<FlowSnapshot<Context, State, Event>, Options>;
  readonly traceFor: (
    correlationId: string,
  ) =>
    | FlowTraceDescriptor<
        FlowSnapshot<Context, State, Event>,
        Readonly<{ readonly correlationId: string }>
      >
    | undefined;
  readonly settle: (bounds: FlowTestProgressBounds) => Promise<void>;
}>;

export type FlowRehydratedTestHarness<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  readonly runtime: FlowRuntime<any, any>;
  readonly actor: FlowActor<Context, Event, State>;
  readonly state: () => State;
  readonly context: () => Context;
  readonly snapshot: () => FlowSnapshot<Context, State, Event>;
  readonly send: (event: Event) => FlowRehydratedTestHarness<Context, Event, State>;
  readonly sendAll: (
    events: ReadonlyArray<Event>,
  ) => FlowRehydratedTestHarness<Context, Event, State>;
  readonly can: (event: Event) => boolean;
  readonly children: () => Readonly<Record<string, FlowChildSnapshot>>;
  readonly childTree: () => FlowTestChildTree;
  readonly childSummary: () => FlowTestChildSummary;
  readonly receipts: () => ReadonlyArray<FlowReceipt>;
  readonly receiptSummary: () => FlowReceiptFacts;
  readonly issues: () => ReadonlyArray<FlowIssue>;
  readonly issueSummary: () => ReadonlyArray<FlowIssueSummary>;
  readonly serialize: () => FlowActorSnapshotTree;
  readonly flush: () => Promise<void>;
  readonly advance: (duration: Duration.Input) => Promise<void>;
  readonly dispose: () => Promise<void>;
}>;

export type FlowStartedTestBuilder<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = FlowTestHarness<Context, Event, State> &
  Readonly<{
    readonly provide: (service: Layer.Any) => FlowStartedTestBuilder<Context, Event, State>;
    readonly clock: (now: () => number) => FlowStartedTestBuilder<Context, Event, State>;
    readonly start: () => FlowTestHarness<Context, Event, State>;
  }>;

export type FlowTestBuilder<App extends FlowAppDefinition | undefined = undefined> = Readonly<{
  readonly app: <NextApp extends FlowAppDefinition>(app: NextApp) => FlowTestBuilder<NextApp>;
  readonly seedResources: (resources: ReadonlyArray<FlowSeededResource>) => FlowTestBuilder<App>;
  readonly seedModuleFixtures: App extends FlowAppDefinition
    ? (fixture: FlowAppFixtureName<App>) => FlowTestBuilder<App>
    : never;
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

export type FlowGraphNode<State extends string = string> = Readonly<{
  readonly id: State;
  readonly terminal: boolean;
  readonly childSpecs: ReadonlyArray<FlowGraphChildSpec>;
  readonly timedTransitions: ReadonlyArray<FlowGraphTimedTransition<State>>;
  readonly eventlessTransitions: ReadonlyArray<FlowGraphEventlessTransition<State>>;
}>;

export type FlowGraphEdge<
  State extends string = string,
  EventType extends string = string,
> = Readonly<{
  readonly id: string;
  readonly source: State;
  readonly target: State;
  readonly eventType: EventType;
  readonly label: EventType;
}>;

export type FlowGraphChildSpec = Readonly<{
  readonly id: string;
  readonly machineId: string;
  readonly supervision?: "stop-on-failure" | "continue-on-failure";
}>;

export type FlowGraphTimedTransition<State extends string = string> = Readonly<{
  readonly id: string;
  readonly delay: Duration.Input;
  readonly target: State;
}>;

export type FlowGraphEventlessTransition<State extends string = string> = Readonly<{
  readonly id: string;
  readonly target: State;
}>;

export type FlowGraphStep<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = FlowModelStep<Context, Event, State>;

export type FlowGraphPath<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = FlowModelPath<Context, Event, State>;

export type FlowGraphTraversalOptions<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = FlowModelTraversalOptions<Context, Event, State>;

export type FlowGraphPathFromEventsOptions<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  readonly fromState?: FlowSnapshot<Context, State, Event>;
  readonly toState?: (snapshot: FlowSnapshot<Context, State, Event>) => boolean;
}>;

export type FlowGraphOwnershipSource = FlowModuleDefinition | FlowAppDefinition;

export type FlowGraphOwnershipOverlay = Readonly<{
  readonly appId?: string;
  readonly moduleId: string;
  readonly modulePath: string;
  readonly ownerPath: string;
  readonly machineName: string;
  readonly screens?: ReadonlyArray<string>;
  readonly tags?: ReadonlyArray<string>;
  readonly dependencies?: ReadonlyArray<string>;
  readonly permissions?: ReadonlyArray<string>;
}>;

export type FlowGraphJsonOptions = Readonly<{
  readonly source?: FlowGraphOwnershipSource;
}>;

export type FlowGraphJsonNode<State extends string = string> = FlowGraphNode<State>;

export type FlowGraphJsonEdge<
  State extends string = string,
  EventType extends string = string,
> = FlowGraphEdge<State, EventType>;

export type FlowGraphJson<
  Initial extends string = string,
  State extends string = Initial,
  EventType extends string = string,
> = Readonly<{
  readonly kind: "graph";
  readonly machineId: string;
  readonly initial: Initial;
  readonly nodes: ReadonlyArray<FlowGraphJsonNode<State>>;
  readonly edges: ReadonlyArray<FlowGraphJsonEdge<State, EventType>>;
  readonly ownership?: FlowGraphOwnershipOverlay;
}>;

export type FlowGraphDescriptor<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly kind: "graph";
  readonly machine: Machine;
  readonly initial: Machine["config"]["initial"];
  readonly nodes: ReadonlyArray<FlowGraphNode<InferMachineState<Machine>>>;
  readonly edges: ReadonlyArray<
    FlowGraphEdge<InferMachineState<Machine>, InferMachineEvent<Machine>["type"]>
  >;
  readonly findState: (
    id: InferMachineState<Machine>,
  ) => FlowGraphNode<InferMachineState<Machine>> | undefined;
  readonly incomingEdges: (
    state: InferMachineState<Machine>,
  ) => ReadonlyArray<FlowGraphEdge<InferMachineState<Machine>, InferMachineEvent<Machine>["type"]>>;
  readonly outgoingEvents: (
    state: InferMachineState<Machine>,
  ) => ReadonlyArray<InferMachineEvent<Machine>["type"]>;
  readonly reachableStates: (
    fromState?: InferMachineState<Machine>,
  ) => ReadonlyArray<FlowGraphNode<InferMachineState<Machine>>>;
  readonly shortestPaths: (
    options?: FlowGraphTraversalOptions<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >,
  ) => ReadonlyArray<
    FlowGraphPath<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >
  >;
  readonly simplePaths: (
    options?: FlowGraphTraversalOptions<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >,
  ) => ReadonlyArray<
    FlowGraphPath<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >
  >;
  readonly pathFromEvents: (
    events: ReadonlyArray<InferMachineEvent<Machine>>,
    options?: FlowGraphPathFromEventsOptions<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >,
  ) =>
    | FlowGraphPath<
        InferMachineContext<Machine>,
        InferMachineEvent<Machine>,
        InferMachineState<Machine>
      >
    | undefined;
  readonly storyCoverage: (
    stories: FlowStoriesDescriptor<Machine> | ReadonlyArray<FlowStory<Machine>>,
  ) => FlowStoryCoverageDescriptor<Machine>;
  readonly toJSON: (
    options?: FlowGraphJsonOptions,
  ) => FlowGraphJson<
    Machine["config"]["initial"],
    InferMachineState<Machine>,
    InferMachineEvent<Machine>["type"]
  >;
}>;

export type FlowTraceBuckets = Readonly<{
  readonly events: ReadonlyArray<FlowReceipt>;
  readonly transitions: ReadonlyArray<FlowReceipt>;
  readonly resources: ReadonlyArray<FlowReceipt>;
  readonly transactions: ReadonlyArray<FlowReceipt>;
  readonly streams: ReadonlyArray<FlowReceipt>;
  readonly children: ReadonlyArray<FlowReceipt>;
  readonly timers: ReadonlyArray<FlowReceipt>;
  readonly actors: ReadonlyArray<FlowReceipt>;
  readonly other: ReadonlyArray<FlowReceipt>;
}>;

export type FlowTraceLanes = Readonly<{
  readonly success: ReadonlyArray<FlowReceipt>;
  readonly failure: ReadonlyArray<FlowReceipt>;
  readonly defect: ReadonlyArray<FlowReceipt>;
  readonly interrupt: ReadonlyArray<FlowReceipt>;
}>;

export type FlowTraceSummary = FlowReceiptFacts &
  Readonly<{
    readonly eventType?: string;
  }>;

export type FlowTraceOutcomeKind = "success" | "failure" | "defect" | "interrupt";
export type FlowTraceOutcomeSource = FlowIssueSummary["source"] | "timer";

export type FlowTraceOutcome = Readonly<{
  readonly kind: FlowTraceOutcomeKind;
  readonly source: FlowTraceOutcomeSource;
  readonly type: string;
  readonly id: string;
  readonly correlationId?: string;
  readonly parentState?: string;
}>;

type FlowTraceDetailBase = FlowReceiptFacts &
  Readonly<{
    readonly id: string;
    readonly parentState?: string;
  }>;

export type FlowTraceResourceQueryMode = "ensure" | "observe" | "refresh";

export type FlowTraceResourceFetchOutcome = "success" | "failure" | "defect" | "interrupt";

export type FlowTraceResourceFreshnessReason =
  | "patch"
  | "lookup-success"
  | "lookup-failure"
  | "invalidate:command"
  | "invalidate:transaction";

export type FlowTraceResourceInvalidationReason = "command" | "transaction";

export type FlowTraceResourceFreshnessChange = Readonly<{
  readonly from?: FlowResourceFreshnessStatus;
  readonly to: FlowResourceFreshnessStatus;
  readonly reason?: FlowTraceResourceFreshnessReason;
}>;

export type FlowTraceResourceDetail = FlowTraceDetailBase &
  Readonly<{
    readonly queryModes: ReadonlyArray<FlowTraceResourceQueryMode>;
    readonly fetchOutcomes: ReadonlyArray<FlowTraceResourceFetchOutcome>;
    readonly usedPlaceholder: boolean;
    readonly freshnessChanges: ReadonlyArray<FlowTraceResourceFreshnessChange>;
    readonly invalidationReasons: ReadonlyArray<FlowTraceResourceInvalidationReason>;
    readonly statusAfter?: FlowResourceStatus;
    readonly availabilityAfter?: FlowResourceAvailability;
    readonly activityAfter?: FlowResourceActivity;
    readonly freshnessAfter?: FlowResourceFreshnessStatus;
    readonly updatedAt?: number;
    readonly invalidatedAt?: number;
  }>;

export type FlowTraceTransactionQueueCause = "serialize-overlap";

export type FlowTraceTransactionOverlapCause =
  | "active-attempt"
  | "serialize-scope"
  | "cancel-previous"
  | "reject-while-running";

export type FlowTraceTransactionAttemptTiming = Readonly<{
  readonly generation?: number;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly durationMillis?: number;
}>;

export type FlowTraceTransactionPreviewSummary = Readonly<{
  readonly generation?: number;
  readonly refIds: ReadonlyArray<string>;
}>;

export type FlowTraceTransactionRollbackSummary = Readonly<{
  readonly generation?: number;
  readonly refIds: ReadonlyArray<string>;
}>;

export type FlowTraceTransactionRoutedEvent = Readonly<{
  readonly lane: "success" | "failure" | "defect" | "interrupt";
  readonly eventType: string;
  readonly generation?: number;
}>;

export type FlowTraceTransactionDetail = FlowTraceDetailBase &
  Readonly<{
    readonly statusAfter?: FlowTransactionStatus;
    readonly trigger?: "event" | "state";
    readonly generation?: number;
    readonly queued: boolean;
    readonly dequeued: boolean;
    readonly queueCause?: FlowTraceTransactionQueueCause;
    readonly queueKey?: string;
    readonly overlapCauses: ReadonlyArray<FlowTraceTransactionOverlapCause>;
    readonly attemptTimings: ReadonlyArray<FlowTraceTransactionAttemptTiming>;
    readonly previews: ReadonlyArray<FlowTraceTransactionPreviewSummary>;
    readonly rollbacks: ReadonlyArray<FlowTraceTransactionRollbackSummary>;
    readonly routedEvents: ReadonlyArray<FlowTraceTransactionRoutedEvent>;
    readonly attempts: number;
  }>;

export type FlowTraceStreamCompletion = "done" | "failure" | "defect" | "interrupt";

export type FlowTraceStreamInterruptReason = "state-exit" | "dispose";

export type FlowTraceStreamDetail = FlowTraceDetailBase &
  Readonly<{
    readonly statusAfter?: FlowStreamStatus;
    readonly generation?: number;
    readonly emittedCount?: number;
    readonly completion?: FlowTraceStreamCompletion;
    readonly restored: boolean;
    readonly lastValueAvailable?: boolean;
    readonly interruptReason?: FlowTraceStreamInterruptReason;
  }>;

export type FlowTraceTimerOutcome = "fire" | "interrupt";

export type FlowTraceTimerInterruptReason = "state-exit" | "dispose";

export type FlowTraceTimerDetail = FlowTraceDetailBase &
  Readonly<{
    readonly statusAfter?: FlowTimerStatus;
    readonly generation?: number;
    readonly dueAt?: number;
    readonly startedAt?: number;
    readonly endedAt?: number;
    readonly scheduledMillis?: number;
    readonly elapsedMillis?: number;
    readonly outcome?: FlowTraceTimerOutcome;
    readonly restored: boolean;
    readonly interruptReason?: FlowTraceTimerInterruptReason;
  }>;

export type FlowTraceChildOutcome =
  | "start"
  | "success"
  | "failure"
  | "defect"
  | "interrupt"
  | "stop"
  | "retry";

export type FlowTraceChildSpawnReason = FlowChildLifecycleSpawnReason;

export type FlowTraceChildStopReason = FlowChildLifecycleStopReason;

export type FlowTraceChildRetryCause = FlowChildLifecycleRetryCause;

export type FlowTraceChildDetail = FlowTraceDetailBase &
  Readonly<{
    readonly statusAfter?: FlowChildSnapshot["status"];
    readonly actorId?: string;
    readonly ownerPath?: string;
    readonly stateAfter?: string;
    readonly supervision?: FlowChildSnapshot["supervision"];
    readonly spawnReasons: ReadonlyArray<FlowTraceChildSpawnReason>;
    readonly stopReasons: ReadonlyArray<FlowTraceChildStopReason>;
    readonly retryCauses: ReadonlyArray<FlowTraceChildRetryCause>;
    readonly outcome?: FlowTraceChildOutcome;
  }>;

export type FlowTraceCorrelationDetails = Readonly<{
  readonly resources: ReadonlyArray<FlowTraceResourceDetail>;
  readonly transactions: ReadonlyArray<FlowTraceTransactionDetail>;
  readonly streams: ReadonlyArray<FlowTraceStreamDetail>;
  readonly timers: ReadonlyArray<FlowTraceTimerDetail>;
  readonly children: ReadonlyArray<FlowTraceChildDetail>;
}>;

export type FlowTraceActorNode = Readonly<{
  readonly id: string;
  readonly actorId?: string;
  readonly status?: FlowChildSnapshot["status"];
  readonly state?: string;
  readonly parentState?: string;
  readonly supervision?: FlowChildSnapshot["supervision"];
  readonly children: Readonly<Record<string, FlowTraceActorNode>>;
}>;

export type FlowTraceCorrelation = FlowTraceBuckets &
  Readonly<{
    readonly correlationId: string;
    readonly index: number;
    readonly event: FlowReceipt;
    readonly receipts: ReadonlyArray<FlowReceipt>;
    readonly lanes: FlowTraceLanes;
    readonly details: FlowTraceCorrelationDetails;
    readonly issues: ReadonlyArray<FlowIssueSummary>;
    readonly outcomes: ReadonlyArray<FlowTraceOutcome>;
    readonly summary: FlowTraceSummary;
    readonly stateBefore?: string;
    readonly stateAfter?: string;
    readonly sourceActorId?: string;
    readonly targetActorId?: string;
  }>;

export type FlowTraceReport = FlowTraceBuckets &
  Readonly<{
    readonly lanes: FlowTraceLanes;
    readonly correlations: ReadonlyArray<FlowTraceCorrelation>;
    readonly timeline: ReadonlyArray<FlowTraceCorrelation>;
    readonly issues: ReadonlyArray<FlowIssueSummary>;
    readonly outcomes: ReadonlyArray<FlowTraceOutcome>;
    readonly summary: FlowTraceSummary;
  }>;

export type FlowTraceDescriptor<
  Snapshot extends FlowSnapshot<any, any, any> = FlowSnapshot<any, any, any>,
  Options extends Readonly<Record<string, unknown>> | undefined =
    | Readonly<Record<string, unknown>>
    | undefined,
> = Readonly<{
  readonly kind: "trace";
  readonly snapshot: Snapshot;
  readonly actorHierarchy: FlowTraceActorNode;
  readonly receipts: Snapshot["receipts"];
  readonly report: FlowTraceReport;
  readonly options?: Options;
}>;

export type FlowTraceAnalysisDescriptor<
  Machine extends AnyFlowMachine = AnyFlowMachine,
  Trace extends FlowTraceDescriptor<any, any> = FlowTraceDescriptor<any, any>,
> = Readonly<{
  readonly kind: "trace-analysis";
  readonly machine: Machine;
  readonly graph: FlowGraphDescriptor<Machine>;
  readonly trace: Trace;
  readonly receipts: Trace["receipts"];
  readonly report: Trace["report"];
}>;

export type FlowTraceDiffSectionName =
  | "event-sequence"
  | "transitions"
  | "state-changes"
  | "issues"
  | "resource-patches"
  | "resource-freshness"
  | "transaction-outcomes"
  | "stream-outcomes"
  | "child-outcomes"
  | "timer-behavior";

export type FlowTraceDiffSection<Item = unknown> = Readonly<{
  readonly left: ReadonlyArray<Item>;
  readonly right: ReadonlyArray<Item>;
  readonly matches: boolean;
  readonly firstDifferenceIndex?: number;
}>;

export type FlowTraceDiffSummary = Readonly<{
  readonly matches: boolean;
  readonly changedSections: ReadonlyArray<FlowTraceDiffSectionName>;
}>;

export type FlowTraceStateChange = Readonly<{
  readonly correlationId: string;
  readonly eventType?: string;
  readonly stateBefore?: string;
  readonly stateAfter?: string;
}>;

export type FlowTraceDiffDescriptor<
  Left extends FlowTraceDescriptor = FlowTraceDescriptor,
  Right extends FlowTraceDescriptor = FlowTraceDescriptor,
> = Readonly<{
  readonly kind: "trace-diff";
  readonly left: Left;
  readonly right: Right;
  readonly summary: FlowTraceDiffSummary;
  readonly eventSequence: FlowTraceDiffSection<FlowReceipt>;
  readonly transitions: FlowTraceDiffSection<FlowReceipt>;
  readonly stateChanges: FlowTraceDiffSection<FlowTraceStateChange>;
  readonly issues: FlowTraceDiffSection<FlowIssueSummary>;
  readonly resourcePatches: FlowTraceDiffSection<FlowReceipt>;
  readonly resourceFreshness: FlowTraceDiffSection<FlowTraceResourceDetail>;
  readonly transactionOutcomes: FlowTraceDiffSection<FlowTraceOutcome>;
  readonly streamOutcomes: FlowTraceDiffSection<FlowTraceStreamDetail>;
  readonly childOutcomes: FlowTraceDiffSection<FlowTraceChildDetail>;
  readonly timerBehavior: FlowTraceDiffSection<FlowTraceTimerDetail>;
}>;

export type FlowTraceArtifactVersion = "flow-state/trace-artifact.v1";

export type FlowTraceArtifactOptions = Readonly<Record<string, unknown>>;

export type FlowTraceArtifactSnapshot = FlowActorSnapshotTree &
  Readonly<{
    readonly machineId: string;
  }>;

export type FlowTraceArtifact = Readonly<{
  readonly kind: "trace-artifact";
  readonly version: FlowTraceArtifactVersion;
  readonly snapshot: FlowTraceArtifactSnapshot;
  readonly options?: FlowTraceArtifactOptions;
}>;

export type FlowTraceIncidentOutcomeCounts = Readonly<{
  readonly success: number;
  readonly failure: number;
  readonly defect: number;
  readonly interrupt: number;
}>;

export type FlowTraceIncidentBucketCounts = Readonly<{
  readonly events: number;
  readonly transitions: number;
  readonly resources: number;
  readonly transactions: number;
  readonly streams: number;
  readonly children: number;
  readonly timers: number;
  readonly actors: number;
  readonly other: number;
}>;

export type FlowTraceIncidentStep = Readonly<{
  readonly correlationId: string;
  readonly headline: string;
  readonly eventType?: string;
  readonly stateBefore?: string;
  readonly stateAfter?: string;
  readonly receiptCount: number;
  readonly issueCount: number;
  readonly outcomeCounts: FlowTraceIncidentOutcomeCounts;
  readonly receiptTypes: ReadonlyArray<string>;
  readonly relatedIds: ReadonlyArray<string>;
}>;

export type FlowTraceIncidentSummary = Readonly<{
  readonly kind: "trace-summary";
  readonly machineId: string;
  readonly finalState: string;
  readonly headline: string;
  readonly receiptCount: number;
  readonly correlationCount: number;
  readonly issueCount: number;
  readonly bucketCounts: FlowTraceIncidentBucketCounts;
  readonly outcomeCounts: FlowTraceIncidentOutcomeCounts;
  readonly receiptTypes: ReadonlyArray<string>;
  readonly relatedIds: ReadonlyArray<string>;
  readonly issues: ReadonlyArray<FlowIssueSummary>;
  readonly correlations: ReadonlyArray<FlowTraceIncidentStep>;
  readonly options?: Readonly<Record<string, unknown>>;
}>;

export type FlowLocalInspectionProof = Readonly<{
  readonly kind: "local-inspection-proof";
  readonly machineId: string;
  readonly actorTree: FlowTraceActorNode;
  readonly eventTimeline: ReadonlyArray<FlowInspectionEvent>;
  readonly correlations: ReadonlyArray<FlowTraceCorrelation>;
  readonly traceArtifact: FlowTraceArtifact;
  readonly formatted: Readonly<{
    readonly eventTimeline: string;
    readonly trace: string;
  }>;
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
  readonly replay: (
    path: FlowModelPath<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >,
    options?: FlowModelReplayConfig,
  ) => FlowTestHarness<
    InferMachineContext<Machine>,
    InferMachineEvent<Machine>,
    InferMachineState<Machine>
  >;
}>;

export type FlowModelReplayConfig = Readonly<{
  readonly provide?: Layer.Any | ReadonlyArray<Layer.Any>;
  readonly clock?: () => number;
}>;

export type FlowStoryExpectedFacts = Readonly<{
  readonly receiptTypes?: ReadonlyArray<string>;
  readonly relatedIds?: ReadonlyArray<string>;
  readonly issueKinds?: ReadonlyArray<FlowIssueSummary["kind"]>;
  readonly issueSources?: ReadonlyArray<FlowIssueSummary["source"]>;
  readonly outcomeKinds?: ReadonlyArray<FlowTraceOutcomeKind>;
  readonly outcomeSources?: ReadonlyArray<FlowTraceOutcomeSource>;
}>;

export type FlowStorySeed<FixtureName extends string = string> = Readonly<{
  readonly resources?: ReadonlyArray<FlowSeededResource>;
  readonly fixtures?: ReadonlyArray<FixtureName>;
  readonly boot?: FlowRuntimeBootPayload;
  readonly actorId?: string;
}>;

export type FlowStorySetup = Readonly<{
  readonly kind: "setup";
  readonly description: string;
}>;

export type FlowStoryStart<Machine extends FlowMachine = FlowMachine> =
  | Readonly<{
      readonly kind: "snapshot";
      readonly snapshot: FlowSnapshot<
        InferMachineContext<Machine>,
        string,
        InferMachineEvent<Machine>
      >;
    }>
  | FlowStorySetup;

export type FlowStory<
  Machine extends FlowMachine = FlowMachine,
  FixtureName extends string = string,
> = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly seed?: FlowStorySeed<FixtureName>;
  readonly start?: FlowStoryStart<Machine>;
  readonly events: ReadonlyArray<InferMachineEvent<Machine>>;
  readonly expectedState?: InferMachineState<Machine>;
  readonly expectedFacts?: FlowStoryExpectedFacts;
  readonly tags?: ReadonlyArray<string>;
}>;

export type FlowStoryRunBlockedReason =
  | "setup-description"
  | "explicit-start-requires-machine"
  | "fixtures-require-app"
  | "boot-actor-selection-required"
  | "boot-actor-not-found";

export type FlowStoryRunBlocked<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly kind: "story-run-blocked";
  readonly story: FlowStory<Machine>;
  readonly reason: FlowStoryRunBlockedReason;
}>;

export type FlowStoryRunResult<
  Machine extends FlowMachine = FlowMachine,
  Snapshot extends FlowSnapshot<InferMachineContext<Machine>, string, InferMachineEvent<Machine>> =
    FlowSnapshot<InferMachineContext<Machine>, string, InferMachineEvent<Machine>>,
> = Readonly<{
  readonly kind: "story-run";
  readonly story: FlowStory<Machine>;
  readonly finalSnapshot: Snapshot;
  readonly receipts: Snapshot["receipts"];
  readonly issues: ReadonlyArray<FlowIssue>;
  readonly trace: FlowTraceDescriptor<Snapshot, Readonly<{ readonly storyId: string }>>;
}>;

export type FlowStoryRunOutcome<Machine extends FlowMachine = FlowMachine> =
  | FlowStoryRunResult<Machine>
  | FlowStoryRunBlocked<Machine>;

export type FlowStoryDocSeed<FixtureName extends string = string> = Readonly<{
  readonly label: string;
  readonly resourceCount: number;
  readonly fixtures: ReadonlyArray<FixtureName>;
  readonly hasBoot: boolean;
  readonly actorId?: string;
}>;

export type FlowStoryDocStart<Machine extends FlowMachine = FlowMachine> =
  | Readonly<{
      readonly kind: "default";
      readonly label: string;
    }>
  | Readonly<{
      readonly kind: "snapshot";
      readonly label: string;
      readonly state: string;
      readonly snapshot: FlowSnapshot<
        InferMachineContext<Machine>,
        string,
        InferMachineEvent<Machine>
      >;
    }>
  | Readonly<{
      readonly kind: "setup";
      readonly label: string;
      readonly description: string;
    }>;

export type FlowStoryDocEvent<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly index: number;
  readonly event: InferMachineEvent<Machine>;
  readonly label: string;
}>;

export type FlowStoryDocExpectation<Machine extends FlowMachine = FlowMachine> =
  | Readonly<{
      readonly kind: "state";
      readonly label: string;
      readonly state: InferMachineState<Machine>;
    }>
  | Readonly<{
      readonly kind: "receipt-types";
      readonly label: string;
      readonly receiptTypes: ReadonlyArray<string>;
    }>
  | Readonly<{
      readonly kind: "related-ids";
      readonly label: string;
      readonly relatedIds: ReadonlyArray<string>;
    }>
  | Readonly<{
      readonly kind: "issue-kinds";
      readonly label: string;
      readonly issueKinds: ReadonlyArray<FlowIssueSummary["kind"]>;
    }>
  | Readonly<{
      readonly kind: "issue-sources";
      readonly label: string;
      readonly issueSources: ReadonlyArray<FlowIssueSummary["source"]>;
    }>
  | Readonly<{
      readonly kind: "outcome-kinds";
      readonly label: string;
      readonly outcomeKinds: ReadonlyArray<FlowTraceOutcomeKind>;
    }>
  | Readonly<{
      readonly kind: "outcome-sources";
      readonly label: string;
      readonly outcomeSources: ReadonlyArray<FlowTraceOutcomeSource>;
    }>;

export type FlowStoryDocDescriptor<
  Machine extends FlowMachine = FlowMachine,
  FixtureName extends string = string,
> = Readonly<{
  readonly kind: "story-doc";
  readonly story: FlowStory<Machine, FixtureName>;
  readonly headline: string;
  readonly seed?: FlowStoryDocSeed<FixtureName>;
  readonly start: FlowStoryDocStart<Machine>;
  readonly events: ReadonlyArray<FlowStoryDocEvent<Machine>>;
  readonly expectations: ReadonlyArray<FlowStoryDocExpectation<Machine>>;
  readonly tags: ReadonlyArray<string>;
}>;

export type FlowStoryTestCheckKind =
  | "execution"
  | "expected-state"
  | "receipt-types"
  | "related-ids"
  | "issue-kinds"
  | "issue-sources"
  | "outcome-kinds"
  | "outcome-sources";

export type FlowStoryTestCheck = Readonly<{
  readonly kind: FlowStoryTestCheckKind;
  readonly label: string;
  readonly ok: boolean;
  readonly expected?: string | ReadonlyArray<string>;
  readonly actual?: string | ReadonlyArray<string>;
}>;

export type FlowStoryTestReport<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly kind: "story-test";
  readonly story: FlowStory<Machine>;
  readonly outcome: FlowStoryRunOutcome<Machine>;
  readonly ok: boolean;
  readonly checks: ReadonlyArray<FlowStoryTestCheck>;
  readonly failures: ReadonlyArray<FlowStoryTestCheck>;
}>;

export type FlowStoryCoverageReason =
  | "setup-description"
  | "path-not-found"
  | "expected-state-mismatch";

export type FlowStoryCoverageStatus = "covered" | "mismatch" | "blocked";

export type FlowStoryCoverageStory<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly story: FlowStory<Machine>;
  readonly status: FlowStoryCoverageStatus;
  readonly startState?: InferMachineState<Machine>;
  readonly finalState?: InferMachineState<Machine>;
  readonly stateIds: ReadonlyArray<InferMachineState<Machine>>;
  readonly transitionIds: ReadonlyArray<string>;
  readonly issueKinds: ReadonlyArray<FlowIssueSummary["kind"]>;
  readonly issueSources: ReadonlyArray<FlowIssueSummary["source"]>;
  readonly outcomeKinds: ReadonlyArray<FlowTraceOutcomeKind>;
  readonly outcomeSources: ReadonlyArray<FlowTraceOutcomeSource>;
  readonly reason?: FlowStoryCoverageReason;
  readonly path?: FlowGraphPath<
    InferMachineContext<Machine>,
    InferMachineEvent<Machine>,
    InferMachineState<Machine>
  >;
}>;

export type FlowStoryCoverageSummary = Readonly<{
  readonly totalStories: number;
  readonly coveredStories: number;
  readonly mismatchStories: number;
  readonly blockedStories: number;
  readonly coveredStateCount: number;
  readonly uncoveredStateCount: number;
  readonly coveredTransitionCount: number;
  readonly uncoveredTransitionCount: number;
}>;

export type FlowStoryCoverageDescriptor<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly kind: "story-coverage";
  readonly graph: FlowGraphDescriptor<Machine>;
  readonly stories: ReadonlyArray<FlowStoryCoverageStory<Machine>>;
  readonly coveredStates: ReadonlyArray<FlowGraphNode<InferMachineState<Machine>>>;
  readonly uncoveredStates: ReadonlyArray<FlowGraphNode<InferMachineState<Machine>>>;
  readonly coveredTransitions: ReadonlyArray<
    FlowGraphEdge<InferMachineState<Machine>, InferMachineEvent<Machine>["type"]>
  >;
  readonly uncoveredTransitions: ReadonlyArray<
    FlowGraphEdge<InferMachineState<Machine>, InferMachineEvent<Machine>["type"]>
  >;
  readonly coveredIssueKinds: ReadonlyArray<FlowIssueSummary["kind"]>;
  readonly coveredIssueSources: ReadonlyArray<FlowIssueSummary["source"]>;
  readonly coveredOutcomeKinds: ReadonlyArray<FlowTraceOutcomeKind>;
  readonly coveredOutcomeSources: ReadonlyArray<FlowTraceOutcomeSource>;
  readonly summary: FlowStoryCoverageSummary;
}>;

export type FlowStoriesDescriptor<
  Machine extends FlowMachine = FlowMachine,
  FixtureName extends string = string,
> = Readonly<{
  readonly kind: "stories";
  readonly machine: Machine;
  readonly stories: ReadonlyArray<FlowStory<Machine, FixtureName>>;
}>;
