import type { Layer } from "effect";
import type * as Duration from "effect/Duration";

import type {
  FlowAppDefinition,
  FlowChildSnapshot,
  FlowEvent,
  FlowIssue,
  FlowMachine,
  FlowReceipt,
  FlowReceiptFacts,
  FlowResourceSnapshot,
  FlowSeededResource,
  FlowSnapshot,
  FlowStreamSnapshot,
  FlowTimerSnapshot,
  FlowTransactionSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "@flow-state/core";

import { test as internalTest } from "../../flow-state/src/testing/test.js";
import { flowTest as internalFlowTest } from "../../flow-state/src/testing/flow-test.js";

export { createControlledStream } from "../../flow-state/src/testing/controlled-stream.js";
export {
  formatHarnessTracePretty,
  formatPendingWorkPretty,
  formatScenarioTranscript,
  formatTransactionEventsPretty,
} from "../../flow-state/src/testing/debug.js";

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

export type FlowTestStreamSnapshot<Value = unknown, Error = unknown> = FlowStreamSnapshot<
  Value,
  Error
> &
  Readonly<{
    readonly generation: number;
    readonly emitted: number;
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

export type FlowTestProgressBounds = Readonly<{
  readonly maxTicks: number;
  readonly maxFibers: number;
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
  readonly receipts: () => ReadonlyArray<FlowReceipt>;
  readonly streams: () => Readonly<{
    readonly all: () => Readonly<Record<string, FlowTestStreamSnapshot>>;
    readonly running: (id: string) => FlowTestStreamSnapshot | undefined;
    readonly cancelled: (id: string) => FlowTestStreamSnapshot | undefined;
    readonly events: (id: string) => ReadonlyArray<FlowReceipt>;
  }>;
  readonly issues: () => ReadonlyArray<FlowIssue>;
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

export type FlowTestWithConfig<Context, FixtureName extends string = never> = Readonly<{
  readonly input?: Partial<Context>;
  readonly resources?: ReadonlyArray<FlowSeededResource>;
  readonly fixtures?: ReadonlyArray<FixtureName>;
  readonly provide?: Layer.Any | ReadonlyArray<Layer.Any>;
  readonly clock?: () => number;
}>;

export type FlowTestScenarioBuilder<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  FixtureName extends string = never,
> = Readonly<{
  readonly with: (
    config: FlowTestWithConfig<Context, FixtureName>,
  ) => FlowTestScenarioBuilder<Context, Event, State, FixtureName>;
  readonly run: () => FlowTestHarness<Context, Event, State>;
}>;

export type FlowTestAppBuilder<App extends FlowAppDefinition> = Readonly<{
  readonly scenario: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: Readonly<{ readonly input?: Partial<Context> }>,
  ) => FlowTestScenarioBuilder<Context, Event, State, FlowAppFixtureName<App>>;
}>;

export type FlowTestApi = {
  <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: Readonly<{ readonly input?: Partial<Context> }>,
  ): FlowTestScenarioBuilder<Context, Event, State>;
  readonly app: <App extends FlowAppDefinition>(app: App) => FlowTestAppBuilder<App>;
  readonly model: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: Readonly<{ readonly input?: Partial<Context> }>,
  ) => FlowModelDescriptor<FlowMachine<Context, Event, State>>;
};

export type LegacyFlowTestApi = {
  <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
  ): FlowStartedTestBuilder<Context, Event, State>;
} & Readonly<{
  readonly app: <App extends FlowAppDefinition>(app: App) => FlowTestBuilder<App>;
  readonly model: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: Readonly<{ readonly input?: Partial<Context> }>,
  ) => FlowModelDescriptor<FlowMachine<Context, Event, State>>;
}>;

export const test = internalTest as unknown as FlowTestApi;
export const flowTest = internalFlowTest as unknown as LegacyFlowTestApi;
