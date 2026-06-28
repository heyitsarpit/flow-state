import { Effect, Option } from "effect";

import { createKey, flow, flowExperimental, flowTest } from "@flow-state/core";
import type {
  FlowEvent,
  FlowMachine,
  FlowStreamDefinition,
  FlowTransitionArgs,
} from "@flow-state/core";

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

const save = flow.transaction({
  id: "Project.save",
  params: projectSaveParams,
  commit: commitProjectSave,
  invalidates: ({ params }: { readonly params: SaveProjectParams }) => [
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
  sources: ["context", "resources", "transactions"],
  select: ({ context, value, resources, transactions }) => ({
    state: value,
    projectId: Option.getOrNull(context.projectId),
    hasDraft: Option.isSome(context.draft),
    projectAvailability: resources["Project.byId"]?.status ?? "idle",
    saveStatus: transactions["Project.save"]?.status ?? "idle",
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

export const Project = flow.module(
  "Project",
  () => ({
    byId,
    comments,
    save: saveProjectTransaction,
    editor,
    editorView,
    resources: { byId, comments },
    transactions: { save: saveProjectTransaction },
    machines: { editor },
    views: { editorView },
  }),
  {
    dependencies: ["Session"],
    tags: ["project"],
    screens: ["Editor"],
    fixtures: ["launchWorkspaceSeed.project"],
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

interface AssistantContext {
  readonly latest: Option.Option<AssistantProgress>;
}

interface AssistantTaskContext {
  readonly latest: Option.Option<AssistantProgress>;
}

type AssistantState = "idle" | "running" | "needsApproval";
type AssistantEvent =
  | ({ readonly type: "START_ASSISTANT" } & FlowEvent)
  | ({ readonly type: "ASSISTANT_PROGRESS"; readonly event: AssistantProgress } & FlowEvent)
  | ({ readonly type: "PROPOSE_ACTION" } & FlowEvent)
  | ({ readonly type: "APPROVE_ACTION" } & FlowEvent);

type AssistantTaskState = "running";
type AssistantTaskEvent = {
  readonly type: "ASSISTANT_PROGRESS";
  readonly event: AssistantProgress;
} & FlowEvent;

export const assistantTaskMachine = flow.machine<
  AssistantTaskContext,
  AssistantTaskEvent,
  AssistantTaskState
>({
  id: "Assistant.task",
  initial: "running",
  context: () => ({ latest: Option.none() }),
  states: {
    running: {
      invoke: assistantProgressStream,
      on: {
        ASSISTANT_PROGRESS: {
          update: ({ event }) => ({ latest: Option.some(event.event) }),
        },
      },
    },
  },
});

export const assistantChild = flow.child({
  id: "Assistant.task",
  machine: assistantTaskMachine,
  supervision: "stop-on-failure",
});

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

export const Assistant = flow.module(
  "Assistant",
  () => ({
    run: assistantRun,
    task: assistantTaskMachine,
    stream: assistantProgressStream,
    child: assistantChild,
    machines: { run: assistantRun, task: assistantTaskMachine },
    streams: { progress: assistantProgressStream },
  }),
  {
    dependencies: ["Session", "Project"],
    tags: ["assistant"],
    screens: ["Assistant"],
    fixtures: ["assistantRun"],
    permissions: ["runAssistant"],
  },
);

export interface ChatContext {
  readonly prompt: string;
  readonly partial: string;
}

export type ChatState = "idle" | "streaming";
export type ChatEvent =
  | ({ readonly type: "TYPE_PROMPT"; readonly prompt: string } & FlowEvent)
  | ({ readonly type: "SUBMIT_PROMPT" } & FlowEvent)
  | ({ readonly type: "CHAT_TOKEN"; readonly token: Partial<ChatToken> } & FlowEvent)
  | ({ readonly type: "STOP_GENERATION" } & FlowEvent);

type ChatControlledTokenStream = FlowStreamDefinition<
  ChatToken,
  never,
  void,
  ChatEvent,
  ChatContext
>;

export const createChatComposer = (
  chatTokenStream: typeof tokenStream | ChatControlledTokenStream = tokenStream,
): FlowMachine<ChatContext, ChatEvent, ChatState> =>
  flow.machine<ChatContext, ChatEvent, ChatState>({
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
        invoke: chatTokenStream,
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

export const chatComposer = createChatComposer();

export const chatLifecycleView = flow.view<
  ChatContext,
  ChatState,
  {
    readonly state: ChatState;
    readonly partialText: string;
    readonly streamStatus: string;
    readonly cleanupStatus: "idle" | "subscribed" | "unsubscribed" | "disposed";
  }
>({
  id: "Chat.lifecycleView",
  sources: ["context", "streams", "receipts"],
  select: ({ value, context, streams, receipts }) => {
    const lastLifecycleReceipt = receipts.findLast((receipt) =>
      ["actor:subscribe", "actor:unsubscribe", "actor:dispose"].includes(receipt.type),
    );
    const cleanupStatus =
      lastLifecycleReceipt?.type === "actor:dispose"
        ? "disposed"
        : lastLifecycleReceipt?.type === "actor:unsubscribe"
          ? "unsubscribed"
          : lastLifecycleReceipt?.type === "actor:subscribe"
            ? "subscribed"
            : "idle";

    return {
      state: value,
      partialText: context.partial,
      streamStatus: streams["Chat.tokenStream"]?.status ?? "idle",
      cleanupStatus,
    };
  },
});

export const Chat = flow.module(
  "Chat",
  () => ({
    composer: chatComposer,
    tokenStream,
    chatLifecycleView,
    machines: { composer: chatComposer },
    streams: { tokenStream },
    views: { chatLifecycleView },
  }),
  {
    dependencies: ["Session", "Project"],
    tags: ["chat"],
    screens: ["Chat"],
    fixtures: ["chatThread"],
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
