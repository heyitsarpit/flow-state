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
  ApprovalRequest,
  ChatToken,
  LaunchAsset,
  LaunchChecklistItem,
  LaunchComment,
  LaunchProject,
  LaunchProjectId,
  Permissions,
  ProjectDraft,
  ProjectSaveError,
  ReadinessMetric,
  SaveProjectParams,
} from "./domain";
import { ApprovalApi, LaunchWorkspaceTestServices, saveProject } from "./services";
import type { AssetUploadProgress, AssistantProgress } from "./services";
import { canRequestApproval, canSaveProject, resourceValue } from "./launchWorkspaceGuards";
export { canRequestApproval, canSaveProject } from "./launchWorkspaceGuards";
export { contractOnlyRuntimeQuestions, launchApiCoverage } from "./launchWorkspaceCoverage";
import { assistantProgressStream, tokenStream, uploadStream } from "./launchWorkspaceStreams";
export { assistantProgressStream, tokenStream, uploadStream } from "./launchWorkspaceStreams";
import {
  approvalResource,
  approvalTag,
  assetsResource,
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

export function createEditorSaveParams(
  project: LaunchProject,
  draft: ProjectDraft,
): SaveProjectParams {
  return {
    id: project.id,
    draft,
    baseVersion: project.version,
  };
}

export const fixtureEditorParams = createEditorSaveParams(
  fixtureProject,
  projectDraftFrom(fixtureProject),
);

export interface ProjectEditorContext {
  readonly projectId: Option.Option<LaunchProjectId>;
  readonly draft: Option.Option<ProjectDraft>;
  readonly saveError: Option.Option<ProjectSaveError>;
}

export type ProjectEditorState = "idle" | "loading" | "viewing" | "editing" | "saving" | "conflict";

export type ProjectEditorEvent =
  | ({ readonly type: "OPEN_PROJECT"; readonly projectId: LaunchProjectId } & FlowEvent)
  | ({ readonly type: "PROJECT_READY"; readonly project: LaunchProject } & FlowEvent)
  | ({ readonly type: "EDIT" } & FlowEvent)
  | ({ readonly type: "CHANGE_NAME"; readonly name: string } & FlowEvent)
  | ({ readonly type: "SAVE" } & FlowEvent)
  | ({ readonly type: "PROJECT_SAVED"; readonly project: LaunchProject } & FlowEvent)
  | ({ readonly type: "PROJECT_SAVE_CONFLICT"; readonly error: ProjectSaveError } & FlowEvent)
  | ({ readonly type: "CANCEL" } & FlowEvent);

type ProjectEditorArgs = FlowTransitionArgs<
  ProjectEditorContext,
  ProjectEditorEvent,
  ProjectEditorState
>;

const byId = flow.resource<[LaunchProjectId], LaunchProject>({
  id: "Project.byId",
  key: (id) => createKey("project", id),
  lookup: (id) => Effect.succeed({ ...fixtureProject, id }),
  tags: () => [projectTag],
  placeholder: () => Option.some(fixtureProject),
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});

const comments = flow.resource<[LaunchProjectId], readonly LaunchComment[]>({
  id: "Project.comments",
  key: (id) => createKey("project", id, "comments"),
  lookup: (id) =>
    Effect.succeed([
      {
        id: "comment-1",
        projectId: id,
        authorId: "user-1",
        body: "Launch brief approved for internal review.",
        createdAt: 1_100,
      },
    ]),
  tags: () => [projectTag],
});

const projectSaveParams = ({
  context,
}: {
  readonly context: ProjectEditorContext;
}): SaveProjectParams | null => {
  if (Option.isNone(context.projectId) || Option.isNone(context.draft)) {
    return null;
  }

  return createEditorSaveParams(fixtureProject, context.draft.value);
};

const commitProjectSave = saveProject;

const save = flow.mutation({
  id: "Project.save",
  input: projectSaveParams,
  effect: commitProjectSave,
  invalidates: ({ input: params }: { readonly input: SaveProjectParams }) => [
    projectTag,
    createKey("project", params.id),
  ],
  routes: flow.outcomes<LaunchProject, ProjectSaveError, ProjectEditorEvent>({
    success: ({ value }) => ({ type: "PROJECT_SAVED", project: value }),
    failure: ({ error }) => ({ type: "PROJECT_SAVE_CONFLICT", error }),
  }),
});

export const saveProjectTransaction = save;

const editorView = flow.view<
  ProjectEditorContext,
  ProjectEditorState,
  {
    readonly state: ProjectEditorState;
    readonly projectId: LaunchProjectId | null;
    readonly hasDraft: boolean;
    readonly projectAvailability: string;
    readonly saveStatus: string;
    readonly commandLabels: readonly string[];
  }
>({
  id: "Project.editorView",
  sources: ["context", "resources", "mutations"],
  select: ({ context, value, resources, mutations }) => ({
    state: value,
    projectId: Option.getOrNull(context.projectId),
    hasDraft: Option.isSome(context.draft),
    projectAvailability: resources["Project.byId"]?.status ?? "idle",
    saveStatus: mutations["Project.save"]?.status ?? "idle",
    commandLabels: value === "editing" ? ["Save", "Cancel"] : ["Edit"],
  }),
});

const editor = flow.machine<ProjectEditorContext, ProjectEditorEvent, ProjectEditorState>({
  id: "Project.editor",
  initial: "idle",
  context: () => ({
    projectId: Option.none(),
    draft: Option.none(),
    saveError: Option.none(),
  }),
  states: {
    idle: {
      on: {
        OPEN_PROJECT: {
          target: "loading",
          update: ({ event }) =>
            event.type === "OPEN_PROJECT"
              ? { projectId: Option.some(event.projectId), saveError: Option.none() }
              : {},
        },
      },
    },
    loading: {
      invoke: flow.ensure(byId.ref(fixtureProjectId)),
      on: {
        PROJECT_READY: {
          target: "viewing",
          update: ({ event }) =>
            event.type === "PROJECT_READY"
              ? { draft: Option.some(projectDraftFrom(event.project)), saveError: Option.none() }
              : {},
        },
      },
    },
    viewing: {
      invoke: flow.observe(comments.ref(fixtureProjectId)),
      on: {
        EDIT: "editing",
      },
    },
    editing: {
      on: {
        CHANGE_NAME: {
          update: changeProjectName,
        },
        SAVE: {
          target: "saving",
          guard: ({ context }) => Option.isSome(context.draft),
        },
        CANCEL: "viewing",
      },
    },
    saving: {
      invoke: flow.run(saveProjectTransaction),
      on: {
        PROJECT_SAVED: {
          target: "viewing",
          update: ({ event }) =>
            event.type === "PROJECT_SAVED"
              ? { draft: Option.some(projectDraftFrom(event.project)), saveError: Option.none() }
              : {},
        },
        PROJECT_SAVE_CONFLICT: {
          target: "conflict",
          update: ({ event }) =>
            event.type === "PROJECT_SAVE_CONFLICT" ? { saveError: Option.some(event.error) } : {},
        },
      },
    },
    conflict: {
      on: {
        CHANGE_NAME: {
          target: "editing",
          update: changeProjectName,
        },
        CANCEL: "viewing",
      },
    },
  },
});

export const Project = flow.module("Project", () => ({
  byId,
  comments,
  save: saveProjectTransaction,
  editor,
  editorView,
}));

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

const checklistView = flow.view<
  ChecklistContext,
  "active",
  { readonly total: number; readonly completed: number }
>({
  id: "Checklist.checklistView",
  sources: ["context"],
  select: ({ context }) => ({
    total: context.items.length,
    completed: context.items.filter((item) => item.done).length,
  }),
});

export const Checklist = flow.module("Checklist", () => ({
  checklist,
  checklistView,
}));

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

export const Readiness = flow.module("Readiness", () => ({
  metrics: readinessMetrics,
  dashboardView,
}));

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

export const Assets = flow.module("Assets", () => ({
  upload,
  uploadStream,
}));

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

const approvalPermission = flow.permission<ApprovalContext, ApprovalEvent, ApprovalState>({
  id: "Approval.request",
  check: ({ context }) => context.permissions.canRequestApproval && Option.isSome(context.request),
});

const approvalFlow = flow.machine<ApprovalContext, ApprovalEvent, ApprovalState>({
  id: "Approval.flow",
  initial: "draft",
  context: () => ({
    permissions: fixturePermissions,
    request: Option.none(),
    denied: Option.none(),
  }),
  persist: approvalPersist,
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

export const Approval = flow.module("Approval", () => ({
  flow: approvalFlow,
  permission: approvalPermission,
}));

interface AssistantContext {
  readonly latest: Option.Option<AssistantProgress>;
}

type AssistantState = "idle" | "running" | "needsApproval";
type AssistantEvent =
  | ({ readonly type: "START_ASSISTANT" } & FlowEvent)
  | ({ readonly type: "ASSISTANT_PROGRESS"; readonly event: AssistantProgress } & FlowEvent)
  | ({ readonly type: "PROPOSE_ACTION" } & FlowEvent)
  | ({ readonly type: "APPROVE_ACTION" } & FlowEvent);

export const assistantChild = flow.child({ id: "Assistant.task", machine: "Assistant.task" });

const assistantRun = flow.machine<AssistantContext, AssistantEvent, AssistantState>({
  id: "Assistant.run",
  initial: "idle",
  context: () => ({ latest: Option.none() }),
  states: {
    idle: {
      on: {
        START_ASSISTANT: "running",
      },
    },
    running: {
      invoke: [assistantProgressStream, assistantChild],
      on: {
        ASSISTANT_PROGRESS: {
          update: ({ event }) =>
            event.type === "ASSISTANT_PROGRESS" ? { latest: Option.some(event.event) } : {},
        },
        PROPOSE_ACTION: "needsApproval",
      },
    },
    needsApproval: {
      on: {
        APPROVE_ACTION: "running",
      },
    },
  },
});

export const Assistant = flow.module("Assistant", () => ({
  run: assistantRun,
  stream: assistantProgressStream,
  child: assistantChild,
}));

interface ChatContext {
  readonly prompt: string;
  readonly partial: string;
}

type ChatState = "idle" | "streaming";
type ChatEvent =
  | ({ readonly type: "TYPE_PROMPT"; readonly prompt: string } & FlowEvent)
  | ({ readonly type: "SUBMIT_PROMPT" } & FlowEvent)
  | ({ readonly type: "CHAT_TOKEN"; readonly token: Partial<ChatToken> } & FlowEvent)
  | ({ readonly type: "STOP_GENERATION" } & FlowEvent);

const composer = flow.machine<ChatContext, ChatEvent, ChatState>({
  id: "Chat.composer",
  initial: "idle",
  context: () => ({ prompt: "", partial: "" }),
  states: {
    idle: {
      on: {
        TYPE_PROMPT: {
          update: ({ event }) => (event.type === "TYPE_PROMPT" ? { prompt: event.prompt } : {}),
        },
        SUBMIT_PROMPT: {
          target: "streaming",
          guard: ({ context }) => context.prompt.trim().length > 0,
        },
      },
    },
    streaming: {
      invoke: tokenStream,
      on: {
        CHAT_TOKEN: {
          update: ({ context, event }) =>
            event.type === "CHAT_TOKEN"
              ? { partial: `${context.partial}${event.token.text ?? ""}` }
              : {},
        },
        STOP_GENERATION: {
          target: "idle",
          update: () => ({ prompt: "", partial: "" }),
        },
      },
    },
  },
});

export const Chat = flow.module("Chat", () => ({
  composer,
  tokenStream,
}));

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
    readonly issueCount: number;
  }
>({
  id: "Launch.overviewView",
  sources: ["resources", "children", "receipts", "issues"],
  select: ({ context, resources, children, receipts, issues }) => ({
    projectId: Option.getOrNull(context.activeProjectId),
    projectStatus: resources["Project.byId"]?.status ?? "idle",
    readinessStatus: resources["Readiness.metrics"]?.status ?? "idle",
    approvalStatus: resources["Approval.current"]?.status ?? "idle",
    activeChildren: Object.values(children).filter((child) => child.status === "active").length,
    receiptCount: receipts.length,
    issueCount: issues.length,
  }),
});

export const Launch = flow.module("Launch", () => ({
  overviewView,
}));

export interface TraceContext {
  readonly selectedReceipt: Option.Option<string>;
}

export type TraceState = "active";

const timelineView = flow.view<
  TraceContext,
  TraceState,
  {
    readonly receipts: readonly string[];
    readonly issueKinds: readonly string[];
    readonly streamIds: readonly string[];
    readonly timerIds: readonly string[];
    readonly childIds: readonly string[];
  }
>({
  id: "Trace.timelineView",
  sources: ["streams", "timers", "children", "receipts", "issues"],
  select: ({ streams, timers, children, receipts, issues }) => ({
    receipts: receipts.map((receipt) => receipt.type),
    issueKinds: issues.map((issue) => issue.kind),
    streamIds: Object.keys(streams),
    timerIds: Object.keys(timers),
    childIds: Object.keys(children),
  }),
});

export const Trace = flow.module("Trace", () => ({
  timelineView,
}));

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

export type LaunchWorkspaceState = "ready" | "saving" | "requestingApproval" | "runningAssistant";

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
  readonly lastSavedAt: Option.Option<number>;
  readonly lastTraceEvent: Option.Option<string>;
}

export type LaunchWorkspaceEvent =
  | ({ readonly type: "NAVIGATE"; readonly tab: LaunchWorkspaceTab } & FlowEvent)
  | ({ readonly type: "EDIT_PROJECT"; readonly draft: ProjectDraft } & FlowEvent)
  | ({ readonly type: "SAVE_PROJECT" } & FlowEvent)
  | ({ readonly type: "PROJECT_SAVED"; readonly project: LaunchProject } & FlowEvent)
  | ({ readonly type: "PROJECT_SAVE_FAILED"; readonly error: ProjectSaveError } & FlowEvent)
  | ({ readonly type: "REQUEST_APPROVAL" } & FlowEvent)
  | ({ readonly type: "APPROVAL_REQUESTED"; readonly approval: ApprovalRequest } & FlowEvent)
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

export const requestApprovalTransaction = flow.mutation({
  id: "launch.request-approval",
  input: requestApprovalParams,
  effect: commitApprovalRequest,
  invalidates: [projectTag, approvalTag],
  routes: flow.outcomes<ApprovalRequest, unknown, LaunchWorkspaceEvent>({
    success: ({ value }) => ({ type: "APPROVAL_REQUESTED", approval: value }),
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

export const saveLaunchProjectTransaction = flow.mutation({
  id: "launch.save-project",
  input: saveLaunchProjectParams,
  effect: commitLaunchProject,
  preview: {
    apply: ({ input: params }: { readonly input: SaveProjectParams }) => [
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
    readonly traceLabel: string;
  }
>({
  id: "launch.workspace.summary",
  sources: ["context", "resources", "mutations", "streams", "children"],
  select: ({ context, resources }) => {
    const project = resourceValue<LaunchProject>(resources, "launch.project") ?? fixtureProject;
    const readiness =
      resourceValue<readonly ReadinessMetric[]>(resources, "launch.readiness") ?? [];
    const assets = resourceValue<readonly LaunchAsset[]>(resources, "launch.assets") ?? [];
    const approval =
      resourceValue<ApprovalRequest>(resources, "launch.approval") ?? fixtureApproval;

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
        EDIT_PROJECT: { update: editLaunchProject },
        SAVE_PROJECT: {
          target: "saving",
          submit: saveLaunchProjectTransaction,
          guard: canSaveProject,
        },
        REQUEST_APPROVAL: {
          target: "requestingApproval",
          guard: canRequestApproval,
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
          target: "ready",
          update: () => ({ lastTraceEvent: Option.some("project:save-failed") }),
        },
      },
    },
    requestingApproval: {
      on: {
        APPROVAL_REQUESTED: {
          target: "ready",
          update: applyApprovalRequest,
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

export const LaunchWorkspaceModule = flow.module("LaunchWorkspace", () => ({
  resources: {
    project: projectResource,
    permissions: permissionsResource,
    readiness: readinessResource,
    assets: assetsResource,
    approval: approvalResource,
  },
  mutations: {
    saveProject: saveLaunchProjectTransaction,
    requestApproval: requestApprovalTransaction,
  },
  machine: launchWorkspaceMachine,
  view: launchWorkspaceView,
}));

export const LaunchWorkspaceApp = flow.app({
  modules: [
    LaunchWorkspaceModule,
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
    lastSavedAt: Option.none(),
    lastTraceEvent: Option.none(),
  };
}

function changeProjectName({ context, event }: ProjectEditorArgs): Partial<ProjectEditorContext> {
  if (event.type !== "CHANGE_NAME" || Option.isNone(context.draft)) {
    return {};
  }

  return {
    draft: Option.some({
      ...context.draft.value,
      name: event.name,
    }),
  };
}

function navigateLaunchWorkspace({ event }: LaunchWorkspaceArgs): Partial<LaunchWorkspaceContext> {
  return event.type === "NAVIGATE"
    ? { activeTab: event.tab, lastTraceEvent: Option.some(`tab:${event.tab}`) }
    : {};
}

function editLaunchProject({ event }: LaunchWorkspaceArgs): Partial<LaunchWorkspaceContext> {
  return event.type === "EDIT_PROJECT"
    ? { draft: event.draft, activeTab: "editor", lastTraceEvent: Option.some("project:edit") }
    : {};
}

function saveLaunchProject({
  event,
  runtime,
}: LaunchWorkspaceArgs): Partial<LaunchWorkspaceContext> {
  return event.type === "PROJECT_SAVED"
    ? {
        draft: projectDraftFrom(event.project),
        lastSavedAt: Option.some(runtime.now()),
        lastTraceEvent: Option.some("project:saved"),
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
