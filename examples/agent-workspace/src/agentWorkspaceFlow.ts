import { Effect, Stream } from "effect";

import { flow, flowExperimental, flowTest } from "@flow-state/core";
import type {
  FlowChildConfig,
  FlowEvent,
  FlowSnapshot,
  FlowStreamConfig,
  FlowTransitionArgs,
} from "@flow-state/core";

import { AgentWorkspaceService } from "./agentWorkspaceApi";
import type { AgentTraceEvent } from "./agentWorkspaceApi";

export type AgentWorkspaceState =
  | "idle"
  | "running"
  | "awaitingApproval"
  | "blocked"
  | "completed"
  | "failed";

export type ChildTaskKind = "research" | "implementation" | "verification";
export type ChildTaskStatus = "queued" | "running" | "done" | "failed";
export type ApprovalDecisionKind = "approved" | "rejected";

export interface AgentProgress {
  readonly step: string;
  readonly message: string;
  readonly percent: number;
}

export interface AgentProgressFailure {
  readonly _tag: "AgentProgressFailure";
  readonly message: string;
}

export interface AgentChildProgress {
  readonly type: "progress";
  readonly childId: string;
  readonly message: string;
  readonly percent: number;
}

export interface AgentChildResult {
  readonly childId: string;
  readonly summary: string;
}

export interface AgentChildFailure {
  readonly type: "failure";
  readonly childId: string;
  readonly message: string;
}

export interface ChildTask {
  readonly id: string;
  readonly kind: ChildTaskKind;
  readonly title: string;
  readonly status: ChildTaskStatus;
  readonly percent: number;
  readonly summary: string | null;
  readonly failure: string | null;
}

export interface ProposedAction {
  readonly id: string;
  readonly label: string;
  readonly risk: "low" | "medium" | "high";
  readonly details: string;
}

export interface ApprovalDecision {
  readonly actionId: string;
  readonly kind: ApprovalDecisionKind;
  readonly reason: string;
  readonly decidedAt: number;
}

export interface AgentWorkspaceContext {
  readonly runId: string | null;
  readonly goal: string;
  readonly progress: readonly AgentProgress[];
  readonly children: readonly ChildTask[];
  readonly proposedAction: ProposedAction | null;
  readonly decisions: readonly ApprovalDecision[];
  readonly trace: readonly AgentTraceEvent[];
  readonly replayCursor: number;
  readonly failure: string | null;
  readonly nextChildId: number;
  readonly nextTraceId: number;
}

export type AgentWorkspaceEvent =
  | ({ readonly type: "START_RUN"; readonly goal: string; readonly runId?: string } & FlowEvent)
  | ({ readonly type: "AGENT_PROGRESS"; readonly progress: AgentProgress } & FlowEvent)
  | ({
      readonly type: "SPAWN_CHILD_TASK";
      readonly kind: ChildTaskKind;
      readonly title: string;
    } & FlowEvent)
  | ({
      readonly type: "CHILD_PROGRESS";
      readonly childId: string;
      readonly progress: AgentChildProgress;
    } & FlowEvent)
  | ({
      readonly type: "CHILD_COMPLETED";
      readonly childId: string;
      readonly result: AgentChildResult;
    } & FlowEvent)
  | ({
      readonly type: "CHILD_FAILED";
      readonly childId: string;
      readonly error: AgentChildFailure;
    } & FlowEvent)
  | ({ readonly type: "PROPOSE_ACTION"; readonly action: ProposedAction } & FlowEvent)
  | ({ readonly type: "APPROVE_ACTION"; readonly reason: string } & FlowEvent)
  | ({ readonly type: "REJECT_ACTION"; readonly reason: string } & FlowEvent)
  | ({ readonly type: "COMPLETE_RUN" } & FlowEvent)
  | ({ readonly type: "FAIL_RUN"; readonly message: string } & FlowEvent)
  | ({ readonly type: "REPLAY_EVENT"; readonly traceId: string } & FlowEvent)
  | ({ readonly type: "RESET_WORKSPACE" } & FlowEvent);

export type AgentWorkspaceSnapshot = FlowSnapshot<AgentWorkspaceContext, AgentWorkspaceState>;
type AgentWorkspaceArgs = FlowTransitionArgs<
  AgentWorkspaceContext,
  AgentWorkspaceEvent,
  AgentWorkspaceState
>;
type AgentTraceDraft = Omit<AgentTraceEvent, "at" | "id">;

type AgentProgressStreamConfig = FlowStreamConfig<
  AgentWorkspaceContext,
  AgentWorkspaceEvent,
  { readonly runId: string | null },
  AgentProgress,
  AgentProgressFailure,
  AgentWorkspaceService
> & {
  readonly id: "agent.run.progress";
  readonly pressure: {
    readonly strategy: "coalesce-latest";
    readonly key: (value: AgentProgress) => string;
  };
  readonly routes: {
    readonly value: (value: AgentProgress) => AgentWorkspaceEvent;
    readonly failure: (error: AgentProgressFailure) => AgentWorkspaceEvent;
    readonly defect: (defect: unknown) => AgentWorkspaceEvent;
    readonly done: () => AgentWorkspaceEvent;
    readonly interrupt: () => AgentWorkspaceEvent;
  };
};

type ChildActorState = "idle" | "working" | "done" | "failed";
type ChildActorEvent =
  | ({ readonly type: "START_CHILD" } & FlowEvent)
  | ({ readonly type: "FINISH_CHILD" } & FlowEvent)
  | ({ readonly type: "FAIL_CHILD"; readonly message: string } & FlowEvent);

interface ChildActorContext {
  readonly runId: string | null;
  readonly kind: ChildTaskKind;
}

type ChildTaskConfig = FlowChildConfig<
  AgentWorkspaceContext,
  AgentWorkspaceEvent,
  ChildActorContext,
  ChildActorEvent,
  ChildActorState
> & {
  readonly id: "agent.child-task";
  readonly supervision: "parent";
  readonly mailbox: "fifo";
};

export const emptyAgentWorkspaceContext: AgentWorkspaceContext = {
  runId: null,
  goal: "",
  progress: [],
  children: [],
  proposedAction: null,
  decisions: [],
  trace: [],
  replayCursor: 0,
  failure: null,
  nextChildId: 1,
  nextTraceId: 1,
};

export const agentProgressStream = flow.stream({
  id: "agent.run.progress",
  input: ({ context }) => ({ runId: context.runId }),
  stream: () => Stream.unwrap(Effect.map(AgentWorkspaceService, (service) => service.progress())),
  pressure: {
    strategy: "coalesce-latest",
    key: (value) => value.step,
  },
  routes: {
    value: (progress) => ({ type: "AGENT_PROGRESS", progress }),
    failure: (error) => ({ type: "FAIL_RUN", message: error.message }),
    defect: (defect) => ({ type: "FAIL_RUN", message: String(defect) }),
    done: () => ({ type: "COMPLETE_RUN" }),
    interrupt: () => ({ type: "FAIL_RUN", message: "Agent progress stream interrupted." }),
  },
} satisfies AgentProgressStreamConfig);

export const childTaskMachine = flow.machine<ChildActorContext, ChildActorEvent, ChildActorState>({
  id: "agent-child-task",
  initial: "idle",
  context: () => ({ runId: null, kind: "research" }),
  states: {
    idle: {
      on: {
        START_CHILD: "working",
      },
    },
    working: {
      on: {
        FINISH_CHILD: "done",
        FAIL_CHILD: "failed",
      },
    },
    done: {
      type: "final",
    },
    failed: {},
  },
});

export const childTaskActor = flow.child<ChildTaskConfig>({
  id: "agent.child-task",
  machine: childTaskMachine,
  input: ({ context }) => ({
    runId: context.runId,
    kind: context.children.at(-1)?.kind ?? "research",
  }),
  supervision: "parent",
  mailbox: "fifo",
  meta: {
    parentEdge: "spawned-by",
    includeInGraph: true,
  },
});

export const agentWorkspaceSchema = flow.schema({
  id: "agent.workspace.schema",
  version: 1,
  fields: {
    runId: "stable parent actor id",
    children: "child actor snapshots projected for rendering",
    trace: "versioned trace events used by devtools, replay, graph coverage, and tests",
    decisions: "human approval and rejection receipts",
  },
});

export const agentWorkspacePersistence = flow.persist({
  id: "agent.workspace.snapshot",
  version: 1,
  select: (snapshot: AgentWorkspaceSnapshot) => ({
    value: snapshot.value,
    context: {
      runId: snapshot.context.runId,
      goal: snapshot.context.goal,
      children: snapshot.context.children,
      decisions: snapshot.context.decisions,
      trace: snapshot.context.trace,
    },
  }),
  redact: redactWorkspaceSnapshot,
});

export const agentWorkspaceView = flow.view<
  AgentWorkspaceContext,
  AgentWorkspaceState,
  ReturnType<typeof selectWorkspaceOverview>
>({
  id: "agent.workspace.overview",
  sources: ["context", "children", "receipts"],
  select: ({ snapshot }) => selectWorkspaceOverview(snapshot),
});

export const agentWorkspaceMachine = flow.machine<
  AgentWorkspaceContext,
  AgentWorkspaceEvent,
  AgentWorkspaceState
>({
  id: "example-5-agent-workspace",
  initial: "idle",
  context: createInitialContext,
  persist: agentWorkspacePersistence,
  states: {
    idle: {
      on: {
        START_RUN: {
          target: "running",
          update: startRun,
        },
      },
    },
    running: {
      invoke: [agentProgressStream, childTaskActor],
      on: {
        AGENT_PROGRESS: {
          update: recordAgentProgress,
        },
        SPAWN_CHILD_TASK: {
          update: spawnChildTask,
        },
        CHILD_PROGRESS: {
          update: recordChildProgress,
        },
        CHILD_COMPLETED: {
          update: completeChildTask,
        },
        CHILD_FAILED: {
          target: "failed",
          update: failChildTask,
        },
        PROPOSE_ACTION: {
          target: "awaitingApproval",
          update: proposeAction,
        },
        COMPLETE_RUN: {
          target: "completed",
          update: completeRun,
        },
        FAIL_RUN: {
          target: "failed",
          update: failRun,
        },
        REPLAY_EVENT: {
          update: advanceReplayCursor,
        },
      },
    },
    awaitingApproval: {
      on: {
        APPROVE_ACTION: {
          target: "running",
          guard: hasProposedAction,
          update: approveAction,
        },
        REJECT_ACTION: {
          target: "running",
          guard: hasProposedAction,
          update: rejectAction,
        },
        FAIL_RUN: {
          target: "failed",
          update: failRun,
        },
        REPLAY_EVENT: {
          update: advanceReplayCursor,
        },
      },
    },
    blocked: {
      on: {
        RESET_WORKSPACE: {
          target: "idle",
          update: resetWorkspace,
        },
      },
    },
    completed: {
      on: {
        RESET_WORKSPACE: {
          target: "idle",
          update: resetWorkspace,
        },
      },
    },
    failed: {
      on: {
        RESET_WORKSPACE: {
          target: "idle",
          update: resetWorkspace,
        },
      },
    },
  },
});

export const agentWorkspaceGraph = flowExperimental.graphOf(agentWorkspaceMachine);
export const agentWorkspaceTrace = flowExperimental.captureTrace(
  agentWorkspaceMachine.getInitialSnapshot(),
  {
    includeSnapshots: true,
    redact: (value, path) => (path.includes("context") ? "[redacted-context]" : value),
  },
);
export const agentWorkspaceReplay = flowExperimental.replayTrace(
  agentWorkspaceMachine,
  agentWorkspaceTrace,
);
export const agentWorkspaceTestModel = flowTest.model(agentWorkspaceMachine);
export const agentWorkspaceFuzz = flowTest.fuzz(agentWorkspaceMachine, {
  events: [
    { type: "START_RUN", goal: "Fuzz agent workspace", runId: "run-fuzz" },
    { type: "SPAWN_CHILD_TASK", kind: "verification", title: "Verify replay metadata" },
    {
      type: "PROPOSE_ACTION",
      action: {
        id: "action-fuzz",
        label: "Apply generated patch",
        risk: "medium",
        details: "Generated event sequence.",
      },
    },
    { type: "APPROVE_ACTION", reason: "bounded fuzz path" },
    { type: "COMPLETE_RUN" },
  ],
  maxEvents: 8,
});
export const agentWorkspaceStories = flowExperimental.flowStories(agentWorkspaceMachine, [
  { name: "Idle", state: "idle" },
  { name: "Running with child", state: "running" },
  { name: "Awaiting approval", state: "awaitingApproval" },
]);
export const agentWorkspaceTour = flowExperimental.flowTour<AgentWorkspaceEvent>(
  "agent workspace happy path",
  [
    { name: "start", event: { type: "START_RUN", goal: "Ship Agent Workspace" } },
    {
      name: "spawn child",
      event: { type: "SPAWN_CHILD_TASK", kind: "verification", title: "Verify graph" },
    },
    {
      name: "propose action",
      event: {
        type: "PROPOSE_ACTION",
        action: {
          id: "action-tour",
          label: "Apply docs",
          risk: "medium",
          details: "Patch docs and example wiring.",
        },
      },
    },
  ],
);
export const agentWorkspaceDevtools = flowExperimental.createFlowDevtools();
export const agentWorkspacePlaywright = flowExperimental.playwrightFlow({
  selectors: {
    start: "[data-flow-event='START_RUN']",
    progress: "[data-flow-event='AGENT_PROGRESS']",
    propose: "[data-flow-event='PROPOSE_ACTION']",
    approve: "[data-flow-event='APPROVE_ACTION']",
  },
  events: ["START_RUN", "AGENT_PROGRESS", "SPAWN_CHILD_TASK", "PROPOSE_ACTION", "APPROVE_ACTION"],
});

export const agentWorkspaceDescriptor = {
  stream: agentProgressStream,
  child: childTaskActor,
  trace: agentWorkspaceTrace,
  graph: agentWorkspaceGraph,
  replay: agentWorkspaceReplay,
  testModel: agentWorkspaceTestModel,
  fuzz: agentWorkspaceFuzz,
  stories: agentWorkspaceStories,
  tour: agentWorkspaceTour,
  devtools: agentWorkspaceDevtools,
  playwrightFlow: agentWorkspacePlaywright,
  schema: agentWorkspaceSchema,
  persist: agentWorkspacePersistence,
  view: agentWorkspaceView,
} as const;

const requiredGraphEvents = [
  "START_RUN",
  "SPAWN_CHILD_TASK",
  "PROPOSE_ACTION",
  "APPROVE_ACTION",
  "REJECT_ACTION",
] as const;

export function createInitialContext(): AgentWorkspaceContext {
  return emptyAgentWorkspaceContext;
}

export function selectWorkspaceOverview(snapshot: AgentWorkspaceSnapshot): {
  readonly state: AgentWorkspaceState;
  readonly goal: string;
  readonly childCount: number;
  readonly runningChildren: number;
  readonly completedChildren: number;
  readonly progressPercent: number;
  readonly approvals: number;
  readonly rejections: number;
  readonly traceEvents: number;
} {
  const children = snapshot.context.children;
  const latestProgress = snapshot.context.progress.at(-1);

  return {
    state: snapshot.value,
    goal: snapshot.context.goal,
    childCount: children.length,
    runningChildren: children.filter((child) => child.status === "running").length,
    completedChildren: children.filter((child) => child.status === "done").length,
    progressPercent: latestProgress?.percent ?? 0,
    approvals: snapshot.context.decisions.filter((decision) => decision.kind === "approved").length,
    rejections: snapshot.context.decisions.filter((decision) => decision.kind === "rejected")
      .length,
    traceEvents: snapshot.context.trace.length,
  };
}

export function selectGraphSummary(): {
  readonly nodes: number;
  readonly edges: number;
  readonly requiredEdges: readonly string[];
} {
  return {
    nodes: agentWorkspaceGraph.states.length + agentWorkspaceGraph.invokes.length,
    edges: agentWorkspaceGraph.transitions.length,
    requiredEdges: requiredGraphEvents,
  };
}

export function createReplayPlan(snapshot: AgentWorkspaceSnapshot): readonly string[] {
  return snapshot.context.trace.map((event) => `${event.id}:${event.kind}:${event.actorId}`);
}

export function startRun(args: AgentWorkspaceArgs): Partial<AgentWorkspaceContext> {
  const event = args.event as Extract<AgentWorkspaceEvent, { readonly type: "START_RUN" }>;
  const runId = typeof event.runId === "string" ? event.runId : "run-local-1";
  const goal = normalize(event.goal);
  const context: AgentWorkspaceContext = {
    ...emptyAgentWorkspaceContext,
    runId,
    goal,
  };

  return appendTrace(context, args.runtime.now(), {
    kind: "run:start",
    actorId: runId,
    summary: `Started ${goal}`,
  });
}

export function recordAgentProgress(args: AgentWorkspaceArgs): Partial<AgentWorkspaceContext> {
  if (args.event.type !== "AGENT_PROGRESS") {
    return {};
  }

  const progress = {
    ...args.event.progress,
    percent: clampPercent(args.event.progress.percent),
  };
  const context = {
    ...args.context,
    progress: [...args.context.progress, progress],
  };

  return appendTrace(context, args.runtime.now(), {
    kind: "agent:progress",
    actorId: args.context.runId ?? "unknown-run",
    summary: progress.message,
    meta: {
      step: progress.step,
      percent: progress.percent,
    },
  });
}

export function spawnChildTask(args: AgentWorkspaceArgs): Partial<AgentWorkspaceContext> {
  if (args.event.type !== "SPAWN_CHILD_TASK") {
    return {};
  }

  const childId = `child-${args.context.nextChildId}`;
  const child: ChildTask = {
    id: childId,
    kind: args.event.kind,
    title: normalize(args.event.title),
    status: "running",
    percent: 0,
    summary: null,
    failure: null,
  };
  const context = {
    ...args.context,
    children: [...args.context.children, child],
    nextChildId: args.context.nextChildId + 1,
  };

  return appendTrace(
    context,
    args.runtime.now(),
    withTraceParent(args.context.runId, {
      kind: "child:spawn",
      actorId: childId,
      summary: child.title,
      meta: {
        kind: child.kind,
        supervision: childTaskActor.config.supervision,
      },
    }),
  );
}

export function recordChildProgress(args: AgentWorkspaceArgs): Partial<AgentWorkspaceContext> {
  if (args.event.type !== "CHILD_PROGRESS") {
    return {};
  }

  const progress = args.event.progress;
  const context = {
    ...args.context,
    children: args.context.children.map((child) =>
      child.id === args.event.childId
        ? {
            ...child,
            status: "running" as const,
            percent: clampPercent(progress.percent),
            summary: progress.message,
          }
        : child,
    ),
  };

  return appendTrace(
    context,
    args.runtime.now(),
    withTraceParent(args.context.runId, {
      kind: "child:progress",
      actorId: args.event.childId,
      summary: progress.message,
      meta: {
        percent: progress.percent,
      },
    }),
  );
}

export function completeChildTask(args: AgentWorkspaceArgs): Partial<AgentWorkspaceContext> {
  if (args.event.type !== "CHILD_COMPLETED") {
    return {};
  }

  const event = args.event as Extract<AgentWorkspaceEvent, { readonly type: "CHILD_COMPLETED" }>;
  const context = {
    ...args.context,
    children: args.context.children.map((child) =>
      child.id === event.childId
        ? {
            ...child,
            status: "done" as const,
            percent: 100,
            summary: event.result.summary,
          }
        : child,
    ),
  };

  return appendTrace(
    context,
    args.runtime.now(),
    withTraceParent(args.context.runId, {
      kind: "child:complete",
      actorId: event.childId,
      summary: event.result.summary,
    }),
  );
}

export function failChildTask(args: AgentWorkspaceArgs): Partial<AgentWorkspaceContext> {
  if (args.event.type !== "CHILD_FAILED") {
    return {};
  }

  const event = args.event as Extract<AgentWorkspaceEvent, { readonly type: "CHILD_FAILED" }>;
  const context = {
    ...args.context,
    children: args.context.children.map((child) =>
      child.id === event.childId
        ? {
            ...child,
            status: "failed" as const,
            failure: event.error.message,
          }
        : child,
    ),
    failure: event.error.message,
  };

  return appendTrace(
    context,
    args.runtime.now(),
    withTraceParent(args.context.runId, {
      kind: "child:failure",
      actorId: event.childId,
      summary: event.error.message,
    }),
  );
}

export function proposeAction(args: AgentWorkspaceArgs): Partial<AgentWorkspaceContext> {
  if (args.event.type !== "PROPOSE_ACTION") {
    return {};
  }

  const context = {
    ...args.context,
    proposedAction: args.event.action,
  };

  return appendTrace(context, args.runtime.now(), {
    kind: "approval:proposed",
    actorId: args.context.runId ?? "unknown-run",
    summary: args.event.action.label,
    redacted: args.event.action.risk === "high",
    meta: {
      actionId: args.event.action.id,
      risk: args.event.action.risk,
    },
  });
}

export function approveAction(args: AgentWorkspaceArgs): Partial<AgentWorkspaceContext> {
  if (args.event.type !== "APPROVE_ACTION" || args.context.proposedAction === null) {
    return {};
  }

  const decision = createDecision(
    args.context.proposedAction.id,
    "approved",
    args.event.reason,
    args.runtime.now(),
  );
  const context = {
    ...args.context,
    proposedAction: null,
    decisions: [...args.context.decisions, decision],
  };

  return appendTrace(context, args.runtime.now(), {
    kind: "approval:approved",
    actorId: args.context.runId ?? "unknown-run",
    summary: decision.reason,
    meta: {
      actionId: decision.actionId,
    },
  });
}

export function rejectAction(args: AgentWorkspaceArgs): Partial<AgentWorkspaceContext> {
  if (args.event.type !== "REJECT_ACTION" || args.context.proposedAction === null) {
    return {};
  }

  const decision = createDecision(
    args.context.proposedAction.id,
    "rejected",
    args.event.reason,
    args.runtime.now(),
  );
  const context = {
    ...args.context,
    proposedAction: null,
    decisions: [...args.context.decisions, decision],
    progress: [
      ...args.context.progress,
      {
        step: "replan",
        message: `Rejected ${decision.actionId}; agent should replan.`,
        percent: selectWorkspaceOverview(args.snapshot).progressPercent,
      },
    ],
  };

  return appendTrace(context, args.runtime.now(), {
    kind: "approval:rejected",
    actorId: args.context.runId ?? "unknown-run",
    summary: decision.reason,
    meta: {
      actionId: decision.actionId,
    },
  });
}

export function completeRun(args: AgentWorkspaceArgs): Partial<AgentWorkspaceContext> {
  const context = {
    ...args.context,
    proposedAction: null,
    progress: [
      ...args.context.progress,
      {
        step: "complete",
        message: "Agent run completed.",
        percent: 100,
      },
    ],
  };

  return appendTrace(context, args.runtime.now(), {
    kind: "run:complete",
    actorId: args.context.runId ?? "unknown-run",
    summary: "Agent run completed.",
  });
}

export function failRun(args: AgentWorkspaceArgs): Partial<AgentWorkspaceContext> {
  if (args.event.type !== "FAIL_RUN") {
    return {};
  }

  const context = {
    ...args.context,
    failure: args.event.message,
  };

  return appendTrace(context, args.runtime.now(), {
    kind: "run:failure",
    actorId: args.context.runId ?? "unknown-run",
    summary: args.event.message,
  });
}

export function advanceReplayCursor(args: AgentWorkspaceArgs): Partial<AgentWorkspaceContext> {
  if (args.event.type !== "REPLAY_EVENT") {
    return {};
  }

  const index = args.context.trace.findIndex((event) => event.id === args.event.traceId);
  return {
    replayCursor: index < 0 ? args.context.replayCursor : index + 1,
  };
}

export function resetWorkspace(): AgentWorkspaceContext {
  return createInitialContext();
}

export function hasProposedAction(args: AgentWorkspaceArgs): boolean {
  return args.context.proposedAction !== null;
}

export function formatPercent(value: number): string {
  return `${clampPercent(value)}%`;
}

function appendTrace(
  context: AgentWorkspaceContext,
  at: number,
  event: AgentTraceDraft,
): Partial<AgentWorkspaceContext> {
  const traceEvent: AgentTraceEvent = {
    ...event,
    id: `trace-${context.nextTraceId}`,
    at,
  };

  return {
    ...context,
    trace: [...context.trace, traceEvent],
    nextTraceId: context.nextTraceId + 1,
  };
}

function withTraceParent(parentId: string | null, event: AgentTraceDraft): AgentTraceDraft {
  if (parentId === null) {
    return event;
  }

  return {
    ...event,
    parentId,
  };
}

function createDecision(
  actionId: string,
  kind: ApprovalDecisionKind,
  reason: string,
  decidedAt: number,
): ApprovalDecision {
  return {
    actionId,
    kind,
    reason: normalize(reason),
    decidedAt,
  };
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function redactWorkspaceSnapshot(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("context" in value)) {
    return value;
  }

  const contextValue = (value as { readonly context?: unknown }).context;
  if (typeof contextValue !== "object" || contextValue === null) {
    return value;
  }

  return {
    ...value,
    context: {
      ...contextValue,
      goal: "[redacted]",
      trace: Array.isArray((contextValue as AgentWorkspaceContext).trace)
        ? (contextValue as AgentWorkspaceContext).trace.map((event) =>
            event.redacted === true ? { ...event, summary: "[redacted]" } : event,
          )
        : [],
    },
  };
}
