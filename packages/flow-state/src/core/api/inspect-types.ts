import type * as Duration from "effect/Duration";

import type { FlowReceipt, FlowReceiptFacts, FlowIssueSummary } from "./receipt-types.js";
import type {
  FlowInspectionEvent,
  FlowInspectionExportOptions,
  FlowInspectionFilter,
  FlowInspectionListener,
  FlowInspectionObserver,
  FlowInspectionRetentionPolicy,
  FlowInspectionSnapshot,
  FlowInspectionSubscription,
} from "./inspection-event-types.js";
import type {
  FlowAfterDefinition,
  AnyFlowMachine,
  FlowChildDefinition,
  FlowMachine,
  FlowSnapshot,
  FlowStreamDefinition,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "./machine-types.js";
import type {
  FlowActorSnapshotTree,
  FlowChildLifecycleRetryCause,
  FlowChildLifecycleSpawnReason,
  FlowChildLifecycleStopReason,
  FlowChildSnapshot,
  FlowResourceActivity,
  FlowResourceAvailability,
  FlowResourceFreshnessStatus,
  FlowResourceStatus,
  FlowStreamStatus,
  FlowTimerStatus,
  FlowTransactionStatus,
} from "./snapshot-types.js";
import type { FlowAppDefinition, FlowModuleDefinition } from "./app-descriptor-types.js";
import type {
  FlowEnsureDefinition,
  FlowEvent,
  FlowInvalidateDefinition,
  FlowInvalidationTarget,
  FlowObserveDefinition,
  FlowPatchDefinition,
  FlowRefreshDefinition,
  FlowRunDefinition,
  FlowTransactionDefinition,
} from "./resource-transaction-types.js";
import type { FlowStory } from "./story-types.js";
import type { FlowModelPath, FlowModelStep, FlowModelTraversalOptions } from "./testing-types.js";

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

export type FlowTransitionCandidateGuardResult = "pass" | "fail" | "not-applicable" | "skipped";

export type FlowAppliedMicrostepGuardResult = Extract<
  FlowTransitionCandidateGuardResult,
  "pass" | "not-applicable"
>;

export type FlowTransitionActionCounts = Readonly<{
  readonly exit: number;
  readonly transition: number;
  readonly entry: number;
}>;

export type FlowTransitionCandidate<State extends string = string> = Readonly<{
  readonly index: number;
  readonly target: State;
  readonly reenter: boolean;
  readonly guard: FlowTransitionCandidateGuardResult;
  readonly hasUpdate: boolean;
  readonly actionCounts: FlowTransitionActionCounts;
}>;

export type FlowTransitionInspection<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  Machine extends FlowMachine<Context, Event, State> = FlowMachine<Context, Event, State>,
> = Readonly<{
  readonly kind: "transition-inspection";
  readonly machine: Machine;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly event: Event;
  readonly matched: boolean;
  readonly candidates: ReadonlyArray<FlowTransitionCandidate<State>>;
  readonly chosen?: FlowTransitionCandidate<State>;
  readonly target?: State;
  readonly nextSnapshot: FlowSnapshot<Context, State, Event>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export type FlowMicrostepTrigger = "event" | "always" | "after";

export type FlowMicrostepInspectionStep<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  readonly step: number;
  readonly trigger: FlowMicrostepTrigger;
  readonly event: Event;
  readonly from: State;
  readonly to: State;
  readonly index: number;
  readonly reenter: boolean;
  readonly guard: FlowAppliedMicrostepGuardResult;
  readonly hasUpdate: boolean;
  readonly actionCounts: FlowTransitionActionCounts;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export type FlowMicrostepInspectionLimitReached = Readonly<{
  readonly step: number;
  readonly limit: number;
}>;

export type FlowMicrostepInspection<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  Machine extends FlowMachine<Context, Event, State> = FlowMachine<Context, Event, State>,
> = Readonly<{
  readonly kind: "microstep-inspection";
  readonly machine: Machine;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly event: Event;
  readonly matched: boolean;
  readonly steps: ReadonlyArray<FlowMicrostepInspectionStep<Context, Event, State>>;
  readonly nextSnapshot: FlowSnapshot<Context, State, Event>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
  readonly limitReached?: FlowMicrostepInspectionLimitReached;
}>;

export type FlowActionInspectionPhase = "exit" | "transition" | "entry";

export type FlowUpdateInspectionFact<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  readonly kind: "update";
  readonly step: number;
  readonly trigger: FlowMicrostepTrigger;
  readonly event: Event;
  readonly from: State;
  readonly to: State;
  readonly transitionIndex: number;
  readonly index: number;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly receipt: FlowReceipt;
}>;

export type FlowActionInspectionFact<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  readonly kind: "action";
  readonly step: number;
  readonly trigger: FlowMicrostepTrigger;
  readonly event: Event;
  readonly from: State;
  readonly to: State;
  readonly transitionIndex: number;
  readonly phase: FlowActionInspectionPhase;
  readonly index: number;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly receipt: FlowReceipt;
  readonly emitted: ReadonlyArray<FlowReceipt>;
}>;

export type FlowActionFact<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> =
  | FlowUpdateInspectionFact<Context, Event, State>
  | FlowActionInspectionFact<Context, Event, State>;

export type FlowPlannedEffectOperation = "start" | "stop" | "apply" | "interrupt";

type FlowPlannedEffectBase<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  Operation extends FlowPlannedEffectOperation = FlowPlannedEffectOperation,
> = Readonly<{
  readonly operation: Operation;
  readonly from: State;
  readonly to: State;
  readonly ownerState: State;
  readonly reenter: boolean;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
}>;

export type FlowResourceQueryMode = "ensure" | "observe" | "refresh";

export type FlowResourceQueryInspectionFact<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = FlowPlannedEffectBase<Context, Event, State, "start"> &
  Readonly<{
    readonly kind: "resource-query";
    readonly mode: FlowResourceQueryMode;
    readonly definition: FlowEnsureDefinition | FlowObserveDefinition | FlowRefreshDefinition;
  }>;

export type FlowResourceCommandInspectionFact<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = FlowPlannedEffectBase<Context, Event, State, "apply"> &
  Readonly<{
    readonly kind: "resource-command";
    readonly command: "patch" | "invalidate";
    readonly definition: FlowPatchDefinition | FlowInvalidateDefinition<FlowInvalidationTarget>;
  }>;

export type FlowTransactionInspectionFact<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = FlowPlannedEffectBase<Context, Event, State, "start" | "interrupt"> &
  Readonly<{
    readonly kind: "transaction";
    readonly definition: FlowRunDefinition<FlowTransactionDefinition>;
  }>;

export type FlowStreamInspectionFact<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = FlowPlannedEffectBase<Context, Event, State, "start" | "interrupt"> &
  Readonly<{
    readonly kind: "stream";
    readonly definition: FlowStreamDefinition;
  }>;

export type FlowTimerInspectionFact<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = FlowPlannedEffectBase<Context, Event, State, "start" | "interrupt"> &
  Readonly<{
    readonly kind: "timer";
    readonly definition: FlowAfterDefinition<State, Context, Event>;
  }>;

export type FlowChildInspectionFact<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = FlowPlannedEffectBase<Context, Event, State, "start" | "stop"> &
  Readonly<{
    readonly kind: "child";
    readonly definition: FlowChildDefinition;
  }>;

export type FlowPlannedEffectFact<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> =
  | FlowResourceQueryInspectionFact<Context, Event, State>
  | FlowResourceCommandInspectionFact<Context, Event, State>
  | FlowTransactionInspectionFact<Context, Event, State>
  | FlowStreamInspectionFact<Context, Event, State>
  | FlowTimerInspectionFact<Context, Event, State>
  | FlowChildInspectionFact<Context, Event, State>;

export type FlowActionInspection<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  Machine extends FlowMachine<Context, Event, State> = FlowMachine<Context, Event, State>,
> = Readonly<{
  readonly kind: "action-inspection";
  readonly machine: Machine;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly event: Event;
  readonly matched: boolean;
  readonly facts: ReadonlyArray<FlowActionFact<Context, Event, State>>;
  readonly effects: ReadonlyArray<FlowPlannedEffectFact<Context, Event, State>>;
  readonly nextSnapshot: FlowSnapshot<Context, State, Event>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export type FlowNoTransitionReason =
  | "unknown"
  | "ignored-in-state"
  | "blocked-by-guard"
  | "stopped-by-microstep-limit";

export type FlowNoTransitionExplanation<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  Machine extends FlowMachine<Context, Event, State> = FlowMachine<Context, Event, State>,
> = Readonly<{
  readonly kind: "no-transition-explanation";
  readonly machine: Machine;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly event: Event;
  readonly reason: FlowNoTransitionReason;
  readonly state: State;
  readonly availableInStates: ReadonlyArray<State>;
  readonly guardFailures: ReadonlyArray<number>;
  readonly nextSnapshot: FlowSnapshot<Context, State, Event>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
  readonly limitReached?: FlowMicrostepInspectionLimitReached;
}>;

export type FlowInspectionSink<Message = FlowInspectionEvent> = FlowInspectionObserver<Message>;

export type FlowInspectionSinkTarget<Message = FlowInspectionEvent> =
  | FlowInspectionListener<Message>
  | FlowInspectionSink<Message>;

export type FlowInspectionSinkOptions<
  Redacted = FlowInspectionEvent,
  Serialized = Redacted,
> = FlowInspectionExportOptions<Redacted, Serialized> &
  Readonly<{
    readonly includeHistory?: boolean;
  }>;

export type FlowInspectionBufferSink<Message = FlowInspectionEvent> = FlowInspectionSink<Message> &
  Readonly<{
    readonly messages: () => ReadonlyArray<Message>;
    readonly clear: () => void;
  }>;

export type FlowInspectionSinkConnector = <Redacted = FlowInspectionEvent, Serialized = Redacted>(
  inspection: FlowRuntimeInspection,
  sink: FlowInspectionSinkTarget<Serialized>,
  options?: FlowInspectionSinkOptions<Redacted, Serialized>,
) => FlowInspectionSubscription;

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
