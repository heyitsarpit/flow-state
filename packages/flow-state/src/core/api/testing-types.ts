import type { Layer } from "effect";
import type * as Duration from "effect/Duration";

import type { FlowAppDefinition, FlowAppFixtureName } from "./app-descriptor-types.js";
import type { FlowActor, FlowRuntime } from "./runtime-types.js";
import type { FlowTraceDescriptor } from "./inspect-types.js";
import type {
  FlowIssue,
  FlowIssueSummary,
  FlowReceipt,
  FlowReceiptFacts,
} from "./receipt-types.js";
import type {
  FlowActorSnapshotTree,
  FlowChildSnapshot,
  FlowResourceSnapshot,
  FlowTestStreamSnapshot,
  FlowTimerSnapshot,
  FlowTransactionSnapshot,
} from "./snapshot-types.js";
import type {
  FlowMachine,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "./machine-core-types.js";
import type { FlowEvent, FlowSeededResource } from "./resource-transaction-types.js";
import type { FlowStory } from "./story-types.js";

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
  readonly issues: ReadonlyArray<FlowIssue>;
  readonly issueSummary: ReadonlyArray<FlowIssueSummary>;
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
  readonly replayFlushed: (
    path: FlowModelPath<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >,
    options?: FlowModelReplayConfig,
  ) => Promise<
    FlowTestHarness<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >
  >;
}>;

export type FlowModelReplayConfig = Readonly<{
  readonly provide?: Layer.Any | ReadonlyArray<Layer.Any>;
  readonly clock?: () => number;
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

export type FlowRehydratedTestHarness<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = FlowTestHarness<Context, Event, State> &
  Readonly<{
    readonly runtime: FlowRuntime<any, any>;
    readonly actor: FlowActor<Context, Event, State>;
    readonly serialize: () => FlowActorSnapshotTree;
    readonly dispose: () => Promise<void>;
  }>;
