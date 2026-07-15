import { Effect, Option } from "effect";

import * as flow from "flow-state";
import type { FlowAppDefinition, FlowEvent, FlowTransitionArgs } from "flow-state";
import { analyzeTrace, captureTrace, flowStories, graphOf } from "flow-state/inspect";
import type { FlowGraphDescriptor, FlowTraceAnalysisDescriptor } from "flow-state/inspect";
import { test } from "flow-state/testing";

import { fixtureApproval, fixtureProject, fixtureProjectId, projectDraftFrom } from "./domain";
import type {
  ApprovalDenied,
  ApprovalRequest,
  LaunchAsset,
  LaunchChecklistItem,
  LaunchProject,
  LaunchProjectId,
  ProjectDraft,
  ProjectSaveError,
  ReadinessMetric,
  SaveProjectParams,
} from "./domain";
import { ApprovalApi, LaunchWorkspaceTestServices, saveProject } from "./services";
import type { AssistantProgress } from "./services";
import { Approval } from "./launchWorkspaceApproval";
import { Assistant, assistantChild } from "./launchWorkspaceAssistant";
import { canRequestApproval, canSaveProject, resourceValue } from "./launchWorkspaceGuards";
import { Chat } from "./launchWorkspaceChat";
import { launchWorkspaceDebugView } from "./launchWorkspaceDebug";
import { Project } from "./launchWorkspaceProject";
import { assistantProgressStream, tokenStream, uploadStream } from "./launchWorkspaceStreams";
import { Assets, Checklist, Readiness, Session } from "./launchWorkspaceSupport";
import { Launch, Trace } from "./launchWorkspaceViews";
import {
  approvalResource,
  approvalTag,
  assetsResource,
  launchWorkspaceSeed,
  permissionsResource,
  projectResource,
  projectTag,
  readinessResource,
} from "./launchWorkspaceResources";

export type LaunchWorkspaceState =
  | "ready"
  | "saving"
  | "saveConflict"
  | "requestingApproval"
  | "runningAssistant";

export type LaunchConnectionState = "online" | "offline";

export type LaunchWorkspaceTab =
  | "overview"
  | "editor"
  | "assets"
  | "approval"
  | "assistant"
  | "chat"
  | "trace";

export interface LaunchWorkspaceContext {
  readonly activeTab: LaunchWorkspaceTab;
  readonly activeProjectId: LaunchProjectId;
  readonly draft: ProjectDraft;
  readonly checklist: readonly LaunchChecklistItem[];
  readonly assistantTasks: readonly string[];
  readonly connection: LaunchConnectionState;
  readonly saveError: Option.Option<ProjectSaveError>;
  readonly lastSavedAt: Option.Option<number>;
  readonly lastTraceEvent: Option.Option<string>;
}

export type LaunchWorkspaceEvent =
  | ({ readonly type: "NAVIGATE"; readonly tab: LaunchWorkspaceTab } & FlowEvent)
  | ({ readonly type: "GO_OFFLINE" } & FlowEvent)
  | ({ readonly type: "RECONNECT" } & FlowEvent)
  | ({ readonly type: "EDIT_PROJECT"; readonly draft: ProjectDraft } & FlowEvent)
  | ({ readonly type: "SAVE_PROJECT" } & FlowEvent)
  | ({ readonly type: "PROJECT_SAVED"; readonly project: LaunchProject } & FlowEvent)
  | ({ readonly type: "PROJECT_SAVE_FAILED"; readonly error: ProjectSaveError } & FlowEvent)
  | ({ readonly type: "REQUEST_APPROVAL" } & FlowEvent)
  | ({ readonly type: "APPROVAL_REQUESTED"; readonly approval: ApprovalRequest } & FlowEvent)
  | ({ readonly type: "APPROVAL_REQUEST_FAILED"; readonly error: ApprovalDenied } & FlowEvent)
  | ({ readonly type: "RUN_ASSISTANT" } & FlowEvent)
  | ({ readonly type: "ASSISTANT_PROGRESS"; readonly event: AssistantProgress } & FlowEvent)
  | ({ readonly type: "ASSISTANT_STEP"; readonly title: string } & FlowEvent)
  | ({ readonly type: "ASSISTANT_DONE" } & FlowEvent);

type LaunchWorkspaceArgs = FlowTransitionArgs<
  LaunchWorkspaceContext,
  LaunchWorkspaceEvent,
  LaunchWorkspaceState
>;

const requestApprovalParams = ({ context }: { readonly context: LaunchWorkspaceContext }) => ({
  ...fixtureApproval,
  projectId: context.activeProjectId,
});

const commitApprovalRequest = (request: ApprovalRequest) =>
  Effect.gen(function* () {
    const api = yield* ApprovalApi;
    return yield* api.submitApproval(request);
  });

export const requestApprovalTransaction = flow.transaction({
  id: "launch.request-approval",
  params: requestApprovalParams,
  commit: commitApprovalRequest,
  invalidates: [projectTag, approvalTag],
  routes: flow.outcomes<ApprovalRequest, ApprovalDenied, LaunchWorkspaceEvent>({
    success: ({ value }) => ({ type: "APPROVAL_REQUESTED", approval: value }),
    failure: ["APPROVAL_REQUEST_FAILED", "error"],
  }),
});

const saveLaunchProjectParams = ({
  context,
}: {
  readonly context: LaunchWorkspaceContext;
}): SaveProjectParams => ({
  id: context.activeProjectId,
  draft: context.draft,
  baseVersion: fixtureProject.version,
});

const commitLaunchProject = saveProject;

export const saveLaunchProjectTransaction = flow.transaction({
  id: "launch.save-project",
  params: saveLaunchProjectParams,
  commit: commitLaunchProject,
  preview: {
    apply: ({ params }: { readonly params: SaveProjectParams }) => [
      {
        ref: projectResource.ref(params.id),
        replace: {
          ...fixtureProject,
          ...params.draft,
          id: params.id,
        },
      },
    ],
  },
  invalidates: [projectTag],
  routes: flow.outcomes<LaunchProject, ProjectSaveError, LaunchWorkspaceEvent>({
    success: ({ value }) => ({ type: "PROJECT_SAVED", project: value }),
    failure: ["PROJECT_SAVE_FAILED", "error"],
  }),
  concurrency: "reject-while-running" as const,
});

export const launchWorkspaceView = flow.view<
  LaunchWorkspaceContext,
  LaunchWorkspaceState,
  {
    readonly title: string;
    readonly activeTab: LaunchWorkspaceTab;
    readonly readinessScore: number;
    readonly openChecklist: number;
    readonly assetCount: number;
    readonly approvalStatus: ApprovalRequest["status"];
    readonly saveStatus: string;
    readonly queuedSaves: number;
    readonly hasSaveConflict: boolean;
    readonly traceLabel: string;
  },
  "launch.workspace.summary"
>({
  id: "launch.workspace.summary",
  sources: ["context", "resources", "transactions"],
  select: ({ context, value, resources, transactions }) => {
    const project = resourceValue<LaunchProject>(resources, "launch.project") ?? fixtureProject;
    const readiness =
      resourceValue<readonly ReadinessMetric[]>(resources, "launch.readiness") ?? [];
    const assets = resourceValue<readonly LaunchAsset[]>(resources, "launch.assets") ?? [];
    const approval =
      resourceValue<ApprovalRequest>(resources, "launch.approval") ?? fixtureApproval;
    const transactionStatus = transactions["launch.save-project"]?.status ?? "idle";
    const queuedSaves = transactionStatus === "queued" ? 1 : 0;

    return {
      title: project.name,
      activeTab: context.activeTab,
      readinessScore: Math.round(
        readiness.reduce((total, metric) => total + metric.score, 0) /
          Math.max(readiness.length, 1),
      ),
      openChecklist: context.checklist.filter((item) => !item.done).length,
      assetCount: assets.length,
      approvalStatus: approval.status,
      saveStatus: queuedSaves > 0 ? "queued" : transactionStatus,
      queuedSaves,
      hasSaveConflict: value === "saveConflict" || Option.isSome(context.saveError),
      traceLabel: Option.getOrElse(context.lastTraceEvent, () => "ready"),
    };
  },
});

export const launchWorkspaceMachine = flow.machine<
  LaunchWorkspaceContext,
  LaunchWorkspaceEvent,
  LaunchWorkspaceState
>({
  id: "launch-workspace",
  initial: "ready",
  context: createInitialContext,
  states: {
    ready: {
      invoke: [
        flow.ensure(projectResource.ref(fixtureProjectId)),
        flow.ensure(permissionsResource.ref(fixtureProjectId)),
        flow.observe(readinessResource.ref(fixtureProjectId)),
        flow.observe(assetsResource.ref(fixtureProjectId)),
        flow.observe(approvalResource.ref(fixtureProjectId)),
      ],
      on: {
        NAVIGATE: { update: navigateLaunchWorkspace },
        GO_OFFLINE: { update: goOffline },
        RECONNECT: { update: reconnectLaunchWorkspace },
        EDIT_PROJECT: { update: editLaunchProject },
        SAVE_PROJECT: {
          target: "saving",
          submit: saveLaunchProjectTransaction,
          guard: canSaveProject,
        },
        PROJECT_SAVE_FAILED: {
          target: "saveConflict",
          update: recordLaunchSaveFailure,
        },
        REQUEST_APPROVAL: {
          target: "requestingApproval",
          guard: canRequestApproval,
          submit: requestApprovalTransaction,
        },
        RUN_ASSISTANT: {
          target: "runningAssistant",
          update: () => ({ lastTraceEvent: Option.some("assistant:start") }),
        },
      },
    },
    saving: {
      on: {
        PROJECT_SAVED: {
          target: "ready",
          update: saveLaunchProject,
        },
        PROJECT_SAVE_FAILED: {
          target: "saveConflict",
          update: recordLaunchSaveFailure,
        },
      },
    },
    saveConflict: {
      on: {
        EDIT_PROJECT: {
          target: "ready",
          update: editLaunchProject,
        },
        RECONNECT: { update: reconnectLaunchWorkspace },
      },
    },
    requestingApproval: {
      on: {
        APPROVAL_REQUESTED: {
          target: "ready",
          update: applyApprovalRequest,
        },
        APPROVAL_REQUEST_FAILED: {
          target: "ready",
          update: recordApprovalFailure,
        },
      },
    },
    runningAssistant: {
      invoke: [assistantProgressStream, assistantChild],
      on: {
        ASSISTANT_STEP: { update: recordAssistantStep },
        ASSISTANT_DONE: {
          target: "ready",
          update: () => ({ lastTraceEvent: Option.some("assistant:done") }),
        },
      },
    },
  },
});

export const LaunchWorkspaceModule = flow.module(
  "LaunchWorkspace",
  {
    resources: {
      project: projectResource,
      readiness: readinessResource,
      assets: assetsResource,
      approval: approvalResource,
    },
    transactions: {
      saveProject: saveLaunchProjectTransaction,
      requestApproval: requestApprovalTransaction,
    },
    machines: {
      workspace: launchWorkspaceMachine,
    },
    views: {
      workspace: launchWorkspaceView,
      debug: launchWorkspaceDebugView,
    },
    fixtures: {
      launchWorkspaceSeed,
    },
    machine: launchWorkspaceMachine,
    view: launchWorkspaceView,
    debugView: launchWorkspaceDebugView,
  },
  {
    dependencies: [
      "Session",
      "Project",
      "Checklist",
      "Readiness",
      "Assets",
      "Approval",
      "Assistant",
      "Chat",
      "Trace",
    ],
    tags: ["launch-workspace"],
    screens: ["Overview", "Editor", "Assets", "Approval", "Assistant", "Chat", "Trace"],
    fixtures: ["launchWorkspaceSeed"],
  },
);

export const launchWorkspaceActorId = "launch.workspace";
type LaunchWorkspaceGraphContract = FlowGraphDescriptor<typeof launchWorkspaceMachine>;
type LaunchWorkspaceAnalysisContract = FlowTraceAnalysisDescriptor<
  typeof launchWorkspaceMachine,
  typeof launchWorkspaceTrace
>;

export type LaunchWorkspaceModuleTuple = readonly [
  typeof LaunchWorkspaceModule,
  typeof Session,
  typeof Launch,
  typeof Project,
  typeof Checklist,
  typeof Readiness,
  typeof Assets,
  typeof Approval,
  typeof Assistant,
  typeof Chat,
  typeof Trace,
];
export type LaunchWorkspaceAppDefinition = FlowAppDefinition<LaunchWorkspaceModuleTuple>;

const launchWorkspaceModules: LaunchWorkspaceModuleTuple = [
  LaunchWorkspaceModule,
  Session,
  Launch,
  Project,
  Checklist,
  Readiness,
  Assets,
  Approval,
  Assistant,
  Chat,
  Trace,
] as const;

export const LaunchWorkspaceApp: LaunchWorkspaceAppDefinition = flow.app({
  modules: launchWorkspaceModules,
});

const launchWorkspaceMemoryStore = flow.store.memory();
const launchWorkspaceTestStore = flow.store.test();
const launchWorkspaceLiveOrchestrators = flow.orchestrators.live();
const launchWorkspaceTestOrchestrators = flow.orchestrators.test();

export const LaunchWorkspaceAppLayer = LaunchWorkspaceApp.layer({
  store: launchWorkspaceMemoryStore,
  orchestrators: launchWorkspaceLiveOrchestrators,
  services: [LaunchWorkspaceTestServices],
});
export const LaunchWorkspaceTestAppLayer = LaunchWorkspaceApp.layer({
  store: launchWorkspaceTestStore,
  orchestrators: launchWorkspaceTestOrchestrators,
  services: [LaunchWorkspaceTestServices],
});

function createLaunchWorkspaceRuntime(layer: typeof LaunchWorkspaceAppLayer) {
  return flow.runtime(layer);
}

export function createLaunchWorkspaceTestRuntime() {
  return createLaunchWorkspaceRuntime(LaunchWorkspaceTestAppLayer);
}
export const launchWorkspaceGraph: LaunchWorkspaceGraphContract = graphOf(launchWorkspaceMachine);
export const launchWorkspaceTrace = captureTrace(launchWorkspaceMachine.getInitialSnapshot(), {
  includeSnapshots: true,
});
export const launchWorkspaceAnalysis: LaunchWorkspaceAnalysisContract = analyzeTrace(
  launchWorkspaceMachine,
  launchWorkspaceTrace,
);
export const launchWorkspaceModel = test
  .app(LaunchWorkspaceApp)
  .model(launchWorkspaceMachine, undefined, {
    resources: launchWorkspaceSeed,
  });
export const launchWorkspaceStories = flowStories(launchWorkspaceMachine, [
  {
    id: "overview-ready",
    title: "Overview",
    description: "Open the seeded workspace in its ready overview state.",
    seed: {
      fixtures: ["launchWorkspaceSeed"],
    },
    events: [],
    expectedState: "ready",
    tags: ["docs", "overview"],
  },
  {
    id: "assistant-running",
    title: "Assistant running",
    description: "Kick off the assistant from the ready workspace.",
    seed: {
      fixtures: ["launchWorkspaceSeed"],
    },
    events: [{ type: "RUN_ASSISTANT" }],
    expectedState: "runningAssistant",
    tags: ["docs", "assistant"],
  },
]);

const launchWorkspaceProjectRef = projectResource.ref(fixtureProjectId);
const launchWorkspacePermissionsRef = permissionsResource.ref(fixtureProjectId);
const launchWorkspaceReadinessRef = readinessResource.ref(fixtureProjectId);
const launchWorkspaceAssetsRef = assetsResource.ref(fixtureProjectId);
const launchWorkspaceApprovalRef = approvalResource.ref(fixtureProjectId);

export const launchWorkspaceDescriptor = {
  resourceRefs: {
    project: launchWorkspaceProjectRef,
    permissions: launchWorkspacePermissionsRef,
    readiness: launchWorkspaceReadinessRef,
    assets: launchWorkspaceAssetsRef,
    approval: launchWorkspaceApprovalRef,
  },
  commitSaveProject: flow.run(saveLaunchProjectTransaction),
  ensureProject: flow.ensure(launchWorkspaceProjectRef),
  observeReadiness: flow.observe(launchWorkspaceReadinessRef),
  refreshReadiness: flow.refresh(launchWorkspaceReadinessRef),
  patchProject: flow.patch(launchWorkspaceProjectRef, { version: 8 }),
  invalidateProject: flow.invalidate(projectTag),
  streams: {
    upload: uploadStream,
    assistant: assistantProgressStream,
    chat: tokenStream,
  },
} as const;

export function createInitialContext(): LaunchWorkspaceContext {
  return {
    activeTab: "overview",
    activeProjectId: fixtureProjectId,
    draft: projectDraftFrom(fixtureProject),
    checklist: [
      { id: "copy", title: "Finalize launch copy", done: true },
      { id: "assets", title: "Approve asset bundle", done: false },
      { id: "support", title: "Confirm support staffing", done: false },
    ],
    assistantTasks: [],
    connection: "online",
    saveError: Option.none(),
    lastSavedAt: Option.none(),
    lastTraceEvent: Option.none(),
  };
}

function navigateLaunchWorkspace({ event }: LaunchWorkspaceArgs): Partial<LaunchWorkspaceContext> {
  return event.type === "NAVIGATE"
    ? { activeTab: event.tab, lastTraceEvent: Option.some(`tab:${event.tab}`) }
    : {};
}

function goOffline(): Partial<LaunchWorkspaceContext> {
  return {
    connection: "offline",
    lastTraceEvent: Option.some("network:offline"),
  };
}

function reconnectLaunchWorkspace(): Partial<LaunchWorkspaceContext> {
  return {
    connection: "online",
    lastTraceEvent: Option.some("network:online"),
  };
}

function editLaunchProject({ event }: LaunchWorkspaceArgs): Partial<LaunchWorkspaceContext> {
  return event.type === "EDIT_PROJECT"
    ? {
        draft: event.draft,
        activeTab: "editor",
        saveError: Option.none(),
        lastTraceEvent: Option.some("project:edit"),
      }
    : {};
}

function saveLaunchProject({
  event,
  runtime,
}: LaunchWorkspaceArgs): Partial<LaunchWorkspaceContext> {
  return event.type === "PROJECT_SAVED"
    ? {
        draft: projectDraftFrom(event.project),
        saveError: Option.none(),
        lastSavedAt: Option.some(runtime.now()),
        lastTraceEvent: Option.some("project:saved"),
      }
    : {};
}

function recordLaunchSaveFailure({ event }: LaunchWorkspaceArgs): Partial<LaunchWorkspaceContext> {
  return event.type === "PROJECT_SAVE_FAILED"
    ? {
        activeTab: "editor",
        saveError: Option.some(event.error),
        lastTraceEvent: Option.some("project:save-conflict"),
      }
    : {};
}

function applyApprovalRequest({ event }: LaunchWorkspaceArgs): Partial<LaunchWorkspaceContext> {
  return event.type === "APPROVAL_REQUESTED"
    ? {
        activeTab: "approval",
        lastTraceEvent: Option.some("approval:requested"),
      }
    : {};
}

function recordApprovalFailure({ event }: LaunchWorkspaceArgs): Partial<LaunchWorkspaceContext> {
  return event.type === "APPROVAL_REQUEST_FAILED"
    ? {
        activeTab: "approval",
        lastTraceEvent: Option.some("approval:denied"),
      }
    : {};
}

function recordAssistantStep({
  context,
  event,
}: LaunchWorkspaceArgs): Partial<LaunchWorkspaceContext> {
  return event.type === "ASSISTANT_STEP"
    ? {
        assistantTasks: [...context.assistantTasks, event.title],
        lastTraceEvent: Option.some(`assistant:${event.title}`),
      }
    : {};
}
