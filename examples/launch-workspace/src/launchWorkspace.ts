import { Effect, Option } from "effect";

import { createKey, flow, flowExperimental, flowTest } from "@flow-state/core";
import type { FlowEvent, FlowTransitionArgs } from "@flow-state/core";

import {
  fixtureApproval,
  fixturePermissions,
  fixtureProject,
  fixtureProjectId,
  projectDraftFrom,
} from "./domain";
import type {
  ApprovalDenied,
  ApprovalRequest,
  LaunchAsset,
  LaunchChecklistItem,
  LaunchProject,
  LaunchProjectId,
  Permissions,
  ProjectDraft,
  ProjectSaveError,
  ReadinessMetric,
  SaveProjectParams,
} from "./domain";
import { ApprovalApi, LaunchWorkspaceTestServices, saveProject } from "./services";
import type { AssetUploadProgress } from "./services";
import { Assistant, assistantChild } from "./launchWorkspaceAssistant";
export { Assistant, assistantChild, assistantTaskMachine } from "./launchWorkspaceAssistant";
import { canRequestApproval, canSaveProject, resourceValue } from "./launchWorkspaceGuards";
export { canRequestApproval, canSaveProject } from "./launchWorkspaceGuards";
export { contractOnlyRuntimeQuestions, launchApiCoverage } from "./launchWorkspaceCoverage";
import { Chat } from "./launchWorkspaceChat";
export { Chat, chatLifecycleView, createChatComposer } from "./launchWorkspaceChat";
export type { ChatContext, ChatEvent, ChatState } from "./launchWorkspaceChat";
import { Project } from "./launchWorkspaceProject";
export {
  createEditorSaveParams,
  fixtureEditorParams,
  Project,
  saveProjectTransaction,
} from "./launchWorkspaceProject";
export type {
  ProjectEditorContext,
  ProjectEditorEvent,
  ProjectEditorState,
} from "./launchWorkspaceProject";
import { assistantProgressStream, tokenStream, uploadStream } from "./launchWorkspaceStreams";
export { assistantProgressStream, tokenStream, uploadStream } from "./launchWorkspaceStreams";
import {
  approvalResource,
  approvalTag,
  assetsResource,
  launchWorkspaceSeed,
  permissionsResource,
  projectResource,
  projectTag,
  readinessResource,
  readinessTag,
} from "./launchWorkspaceResources";
export {
  approvalResource,
  approvalTag,
  assetsResource,
  launchWorkspaceSeed,
  permissionsResource,
  projectResource,
  projectTag,
  readinessResource,
  readinessTag,
} from "./launchWorkspaceResources";

export const Session = flow.module(
  "Session",
  {
    resources: {
      permissions: permissionsResource,
    },
    policies: {
      canSaveProject,
      canRequestApproval,
    },
  },
  {
    tags: ["session", "permissions"],
    screens: ["Overview", "Editor", "Approval"],
    fixtures: ["launchWorkspaceSeed.permissions"],
  },
);

export interface ChecklistContext {
  readonly items: readonly {
    readonly id: string;
    readonly title: string;
    readonly done: boolean;
  }[];
}

type ChecklistEvent = { readonly type: "TOGGLE_CHECK"; readonly id: string } & FlowEvent;

const checklist = flow.machine<ChecklistContext, ChecklistEvent, "active">({
  id: "Checklist.checklist",
  initial: "active",
  context: () => ({
    items: [
      { id: "check-1", title: "Finalize copy", done: true },
      { id: "check-2", title: "Approve asset bundle", done: false },
    ],
  }),
  states: {
    active: {
      on: {
        TOGGLE_CHECK: {
          update: ({ context, event }) => ({
            items: context.items.map((item) =>
              item.id === event.id ? { ...item, done: !item.done } : item,
            ),
          }),
        },
      },
    },
  },
});

export const Checklist = flow.module(
  "Checklist",
  () => ({
    checklist,
    machines: { checklist },
  }),
  {
    tags: ["checklist"],
    screens: ["Overview"],
    fixtures: ["defaultChecklist"],
  },
);

const readinessMetrics = flow.resource<[LaunchProjectId], readonly ReadinessMetric[]>({
  id: "Readiness.metrics",
  key: (id) => createKey("project", id, "readiness"),
  lookup: () =>
    Effect.succeed([
      { id: "traffic", label: "Traffic", score: 92, updatedAt: 1_000 },
      { id: "support", label: "Support", score: 84, updatedAt: 1_000 },
      { id: "legal", label: "Legal", score: 76, updatedAt: 1_000 },
    ]),
  tags: () => [readinessTag],
  freshness: { staleAfter: "15 seconds", onInvalidate: "active" },
});

const dashboardView = flow.view<
  { readonly metrics: readonly ReadinessMetric[] },
  "active",
  { readonly metricStatus: string; readonly invalidations: number }
>({
  id: "Readiness.dashboardView",
  sources: ["resources", "receipts"],
  select: ({ resources, receipts }) => ({
    metricStatus: resources["Readiness.metrics"]?.status ?? "idle",
    invalidations: receipts.filter((receipt) => receipt.type === "cache:invalidate").length,
  }),
});

export const Readiness = flow.module(
  "Readiness",
  () => ({
    metrics: readinessMetrics,
    dashboardView,
    resources: { metrics: readinessMetrics },
    views: { dashboardView },
  }),
  {
    tags: ["readiness"],
    screens: ["Overview"],
    fixtures: ["launchWorkspaceSeed.readiness"],
  },
);

interface AssetsContext {
  readonly assets: readonly LaunchAsset[];
  readonly latest: Option.Option<AssetUploadProgress>;
}

type AssetsState = "idle" | "uploading" | "complete";
type AssetsEvent =
  | ({ readonly type: "CHOOSE_ASSETS"; readonly assets: readonly LaunchAsset[] } & FlowEvent)
  | ({ readonly type: "START_UPLOAD" } & FlowEvent)
  | ({ readonly type: "UPLOAD_PROGRESS"; readonly progress: AssetUploadProgress } & FlowEvent)
  | ({ readonly type: "UPLOAD_DONE" } & FlowEvent);

const upload = flow.machine<AssetsContext, AssetsEvent, AssetsState>({
  id: "Assets.upload",
  initial: "idle",
  context: () => ({
    assets: [],
    latest: Option.none(),
  }),
  states: {
    idle: {
      on: {
        CHOOSE_ASSETS: {
          update: ({ event }) => (event.type === "CHOOSE_ASSETS" ? { assets: event.assets } : {}),
        },
        START_UPLOAD: "uploading",
      },
    },
    uploading: {
      invoke: uploadStream,
      on: {
        UPLOAD_PROGRESS: {
          update: ({ event }) =>
            event.type === "UPLOAD_PROGRESS" ? { latest: Option.some(event.progress) } : {},
        },
        UPLOAD_DONE: "complete",
      },
    },
    complete: {
      after: flow.after({ id: "Assets.dismissComplete", delay: "2 seconds", target: "idle" }),
    },
  },
});

export const Assets = flow.module(
  "Assets",
  () => ({
    upload,
    uploadStream,
    machines: { upload },
    streams: { uploadStream },
  }),
  {
    tags: ["assets"],
    screens: ["Assets"],
    fixtures: ["launchWorkspaceSeed.assets"],
  },
);

interface ApprovalContext {
  readonly permissions: Permissions;
  readonly request: Option.Option<ApprovalRequest>;
  readonly denied: Option.Option<string>;
}

type ApprovalState = "draft" | "submitting" | "denied";
type ApprovalEvent =
  | ({ readonly type: "REQUEST_APPROVAL" } & FlowEvent)
  | ({ readonly type: "APPROVAL_DENIED"; readonly reason: string } & FlowEvent);

const approvalPersist = flow.persist({
  id: "Approval.persisted",
  version: 1,
  redact: (value: unknown) =>
    typeof value === "object" && value !== null && "customerNote" in value
      ? { redacted: true }
      : value,
});

const approvalPermission = flow.permission({
  id: "Approval.request",
  check: ({ context }: { readonly context: ApprovalContext }) =>
    context.permissions.canRequestApproval && Option.isSome(context.request),
});

const approvalFlow = flow.machine<ApprovalContext, ApprovalEvent, ApprovalState>({
  id: "Approval.flow",
  initial: "draft",
  context: () => ({
    permissions: fixturePermissions,
    request: Option.none(),
    denied: Option.none(),
  }),
  states: {
    draft: {
      on: {
        REQUEST_APPROVAL: {
          target: "submitting",
          guard: ({ context }) =>
            context.permissions.canRequestApproval && Option.isSome(context.request),
        },
      },
    },
    submitting: {
      on: {
        APPROVAL_DENIED: {
          target: "denied",
          update: ({ event }) =>
            event.type === "APPROVAL_DENIED" ? { denied: Option.some(event.reason) } : {},
        },
      },
    },
    denied: {},
  },
});

export const Approval = flow.module(
  "Approval",
  () => ({
    flow: approvalFlow,
    persist: approvalPersist,
    permission: approvalPermission,
    machines: { flow: approvalFlow },
    policies: { permission: approvalPermission },
  }),
  {
    dependencies: ["Session", "Project"],
    tags: ["approval"],
    screens: ["Approval"],
    fixtures: ["launchWorkspaceSeed.approval"],
    permissions: ["requestApproval"],
  },
);

export interface LaunchContext {
  readonly activeProjectId: Option.Option<LaunchProjectId>;
}

export type LaunchState = "active";

const overviewView = flow.view<
  LaunchContext,
  LaunchState,
  {
    readonly projectId: LaunchProjectId | null;
    readonly projectStatus: string;
    readonly readinessStatus: string;
    readonly approvalStatus: string;
    readonly activeChildren: number;
    readonly receiptCount: number;
  }
>({
  id: "Launch.overviewView",
  sources: ["context", "resources", "children", "receipts"],
  select: ({ context, resources, children, receipts }) => ({
    projectId: Option.getOrNull(context.activeProjectId),
    projectStatus: resources["Project.byId"]?.status ?? "idle",
    readinessStatus: resources["Readiness.metrics"]?.status ?? "idle",
    approvalStatus: resources["Approval.current"]?.status ?? "idle",
    activeChildren: Object.values(children).filter((child) => child.status === "active").length,
    receiptCount: receipts.length,
  }),
});

export const Launch = flow.module(
  "Launch",
  () => ({
    overviewView,
    views: { overviewView },
  }),
  {
    dependencies: ["Project", "Readiness", "Assets", "Approval", "Assistant", "Chat"],
    tags: ["launch"],
    screens: ["Overview"],
  },
);

export interface TraceContext {
  readonly selectedReceipt: Option.Option<string>;
}

export type TraceState = "active";

const timelineView = flow.view<
  TraceContext,
  TraceState,
  {
    readonly receipts: readonly string[];
    readonly streamIds: readonly string[];
    readonly childIds: readonly string[];
  }
>({
  id: "Trace.timelineView",
  sources: ["streams", "children", "receipts"],
  select: ({ streams, children, receipts }) => ({
    receipts: receipts.map((receipt) => receipt.type),
    streamIds: Object.keys(streams),
    childIds: Object.keys(children),
  }),
});

export const Trace = flow.module(
  "Trace",
  () => ({
    timelineView,
    views: { timelineView },
  }),
  {
    tags: ["trace"],
    screens: ["Trace"],
  },
);

export const launchCommandContracts = {
  refreshProject: flow.refresh(Project.byId.ref(fixtureProjectId)),
  previewProjectPatch: flow.patch(Project.byId.ref(fixtureProjectId), {
    name: "Atlas v2 launch",
  }),
  invalidateReadiness: flow.invalidate(readinessTag),
} as const;

export const launchRuntimeContracts = {
  memoryStore: flow.store.memory({ namespace: "launch-workspace" }),
  testStore: flow.store.test({ namespace: "launch-workspace-test" }),
  liveOrchestrators: flow.orchestrators.live({ mode: "browser" }),
  testOrchestrators: flow.orchestrators.test({ deterministic: true }),
} as const;

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
  }
>({
  id: "launch.workspace.summary",
  sources: ["context", "resources", "transactions", "streams", "children", "receipts"],
  select: ({ context, value, resources, transactions, receipts }) => {
    const project = resourceValue<LaunchProject>(resources, "launch.project") ?? fixtureProject;
    const readiness =
      resourceValue<readonly ReadinessMetric[]>(resources, "launch.readiness") ?? [];
    const assets = resourceValue<readonly LaunchAsset[]>(resources, "launch.assets") ?? [];
    const approval =
      resourceValue<ApprovalRequest>(resources, "launch.approval") ?? fixtureApproval;
    const queueClosedRequestIds = new Set(
      receipts
        .filter(
          (receipt) =>
            receipt.id === "launch.save-project" &&
            (receipt.type === "transaction:dequeue" || receipt.type === "transaction:queue-drop"),
        )
        .map((receipt) => receipt.requestId),
    );
    const queuedSaves = receipts.filter(
      (receipt) =>
        receipt.id === "launch.save-project" &&
        receipt.type === "transaction:queue" &&
        !queueClosedRequestIds.has(receipt.requestId),
    ).length;
    const transactionStatus = transactions["launch.save-project"]?.status ?? "idle";

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
  () => ({
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
    },
    fixtures: {
      launchWorkspaceSeed,
    },
    machine: launchWorkspaceMachine,
    view: launchWorkspaceView,
  }),
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

export const LaunchWorkspaceApp = flow.app({
  modules: [
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
  ],
});

export const LaunchWorkspaceAppLayer = LaunchWorkspaceApp.layer({
  store: launchRuntimeContracts.memoryStore,
  orchestrators: launchRuntimeContracts.liveOrchestrators,
  services: [LaunchWorkspaceTestServices],
});
export const LaunchWorkspaceTestAppLayer = LaunchWorkspaceApp.layer({
  store: launchRuntimeContracts.testStore,
  orchestrators: launchRuntimeContracts.testOrchestrators,
  services: [LaunchWorkspaceTestServices],
});
export const launchRuntime = flow.runtime(LaunchWorkspaceTestAppLayer);

export const launchWorkspaceGraph = flowExperimental.graphOf(launchWorkspaceMachine);
export const launchWorkspaceTrace = flowExperimental.captureTrace(
  launchWorkspaceMachine.getInitialSnapshot(),
  { includeSnapshots: true },
);
export const launchWorkspaceReplay = flowExperimental.replayTrace(
  launchWorkspaceMachine,
  launchWorkspaceTrace,
);
export const launchWorkspaceModel = flowTest.model(launchWorkspaceMachine);
export const launchWorkspaceStories = flowExperimental.flowStories(launchWorkspaceMachine, [
  { name: "Overview", state: "ready" },
  { name: "Assistant running", state: "runningAssistant" },
]);

export const launchWorkspaceDescriptor = {
  resourceRefs: {
    project: projectResource.ref(fixtureProjectId),
    permissions: permissionsResource.ref(fixtureProjectId),
    readiness: readinessResource.ref(fixtureProjectId),
    assets: assetsResource.ref(fixtureProjectId),
    approval: approvalResource.ref(fixtureProjectId),
  },
  commitSaveProject: flow.run(saveLaunchProjectTransaction),
  ensureProject: flow.ensure(projectResource.ref(fixtureProjectId)),
  observeReadiness: flow.observe(readinessResource.ref(fixtureProjectId)),
  refreshReadiness: flow.refresh(readinessResource.ref(fixtureProjectId)),
  patchProject: flow.patch(projectResource.ref(fixtureProjectId), { version: 8 }),
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
