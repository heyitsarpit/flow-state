import type { Effect, Exit, Layer, ManagedRuntime } from "effect";
import type * as Duration from "effect/Duration";

import type { SelectionSource } from "../shared-contracts.js";
import type { HostSignals } from "../services/host-signals.js";
import type { InspectionLog } from "../services/inspection.js";
import type { NotificationScheduler } from "../services/notification-scheduler.js";
import type { OrchestratorSystem } from "../services/orchestrator-system.js";
import type { ResourceStore } from "../services/resource-store.js";
import type { TraceLog } from "../services/trace.js";
import type {
  FlowActorSnapshotTree,
  FlowChildSnapshot,
  FlowEvent,
  FlowInspectionEvent,
  FlowInspectionFilter,
  FlowInspectionListener,
  FlowInspectionObserver,
  FlowInspectionSubscription,
  FlowIssue,
  FlowIssueSummary,
  FlowReceipt,
  FlowReceiptFacts,
  FlowResourceHydrationEntry,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowRuntimeBootActorSnapshot,
  FlowSeededResource,
  FlowTestStreamSnapshot,
  FlowTimerSnapshot,
  FlowTransactionSnapshot,
} from "./data-types.js";
import type {
  FlowMachine,
  FlowSnapshot,
  AnyFlowMachine,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "./machine-types.js";

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

export type FlowGraphDescriptor<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly kind: "graph";
  readonly machine: Machine;
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

export type FlowTraceCorrelation = FlowTraceBuckets &
  Readonly<{
    readonly correlationId: string;
    readonly event: FlowReceipt;
    readonly receipts: ReadonlyArray<FlowReceipt>;
    readonly lanes: FlowTraceLanes;
    readonly summary: FlowTraceSummary;
    readonly sourceActorId?: string;
    readonly targetActorId?: string;
  }>;

export type FlowTraceReport = FlowTraceBuckets &
  Readonly<{
    readonly lanes: FlowTraceLanes;
    readonly correlations: ReadonlyArray<FlowTraceCorrelation>;
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
  readonly receipts: Snapshot["receipts"];
  readonly report: FlowTraceReport;
  readonly options?: Options;
}>;

export type FlowReplayDescriptor<
  Machine extends AnyFlowMachine = AnyFlowMachine,
  Trace extends FlowTraceDescriptor<any, any> = FlowTraceDescriptor<any, any>,
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

export type FlowStoriesDescriptor<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly kind: "stories";
  readonly machine: Machine;
  readonly stories: ReadonlyArray<Readonly<Record<string, unknown>>>;
}>;
