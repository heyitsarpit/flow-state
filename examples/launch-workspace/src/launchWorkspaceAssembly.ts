import { Effect, Option } from "effect";

import { flow, flowExperimental, flowTest } from "@flow-state/core";
import type {
  FlowAppDefinition,
  FlowEvent,
  FlowGraphDescriptor,
  FlowMachine,
  FlowModelDescriptor,
  FlowModuleDefinition,
  FlowReplayDescriptor,
  FlowRuntime,
  FlowStoriesDescriptor,
  FlowTraceDescriptor,
  FlowTransitionArgs,
} from "@flow-state/core";

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
  readinessTag,
} from "./launchWorkspaceResources";

export const launchCommandContracts = {
  refreshProject: flow.refresh(Project.byId.ref(fixtureProjectId)),
  previewProjectPatch: flow.patch(Project.byId.ref(fixtureProjectId), {
    name: "Atlas v2 launch",
  }),
  invalidateReadiness: flow.invalidate(readinessTag),
} as const;

export const launchRuntimeContracts = {
  memoryStore: flow.store.memory(),
  testStore: flow.store.test(),
  liveOrchestrators: flow.orchestrators.live(),
  testOrchestrators: flow.orchestrators.test(),
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

export const launchWorkspaceMachine: FlowMachine<
  LaunchWorkspaceContext,
  LaunchWorkspaceEvent,
  LaunchWorkspaceState
> = flow.machine<LaunchWorkspaceContext, LaunchWorkspaceEvent, LaunchWorkspaceState>({
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

type LaunchWorkspaceModuleInventory = Readonly<{
  readonly resources: Readonly<{
    readonly project: typeof projectResource;
    readonly readiness: typeof readinessResource;
    readonly assets: typeof assetsResource;
    readonly approval: typeof approvalResource;
  }>;
  readonly transactions: Readonly<{
    readonly saveProject: typeof saveLaunchProjectTransaction;
    readonly requestApproval: typeof requestApprovalTransaction;
  }>;
  readonly machines: Readonly<{
    readonly workspace: typeof launchWorkspaceMachine;
  }>;
  readonly views: Readonly<{
    readonly workspace: typeof launchWorkspaceView;
    readonly debug: typeof launchWorkspaceDebugView;
  }>;
  readonly fixtures: Readonly<{
    readonly launchWorkspaceSeed: typeof launchWorkspaceSeed;
  }>;
  readonly machine: typeof launchWorkspaceMachine;
  readonly view: typeof launchWorkspaceView;
  readonly debugView: typeof launchWorkspaceDebugView;
}>;

export const LaunchWorkspaceModule: FlowModuleDefinition<
  "LaunchWorkspace",
  LaunchWorkspaceModuleInventory
> = flow.module(
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
      debug: launchWorkspaceDebugView,
    },
    fixtures: {
      launchWorkspaceSeed,
    },
    machine: launchWorkspaceMachine,
    view: launchWorkspaceView,
    debugView: launchWorkspaceDebugView,
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

type LaunchWorkspaceModules = readonly [
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

type LaunchWorkspaceAppDefinition = FlowAppDefinition<LaunchWorkspaceModules>;
type LaunchWorkspaceAppLayer = ReturnType<LaunchWorkspaceAppDefinition["layer"]>;
type LaunchWorkspaceSnapshot = ReturnType<typeof launchWorkspaceMachine.getInitialSnapshot>;

export const LaunchWorkspaceApp: LaunchWorkspaceAppDefinition = flow.app({
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

export const LaunchWorkspaceAppLayer: LaunchWorkspaceAppLayer = LaunchWorkspaceApp.layer({
  store: launchRuntimeContracts.memoryStore,
  orchestrators: launchRuntimeContracts.liveOrchestrators,
  services: [LaunchWorkspaceTestServices],
});
export const LaunchWorkspaceTestAppLayer: LaunchWorkspaceAppLayer = LaunchWorkspaceApp.layer({
  store: launchRuntimeContracts.testStore,
  orchestrators: launchRuntimeContracts.testOrchestrators,
  services: [LaunchWorkspaceTestServices],
});

function createLaunchWorkspaceRuntime(layer: LaunchWorkspaceAppLayer): FlowRuntime {
  return flow.runtime(layer);
}

export function createLaunchWorkspaceBrowserRuntime(): FlowRuntime {
  return createLaunchWorkspaceRuntime(LaunchWorkspaceAppLayer);
}

export function createLaunchWorkspaceTestRuntime(): FlowRuntime {
  return createLaunchWorkspaceRuntime(LaunchWorkspaceTestAppLayer);
}

export const launchWorkspaceGraph: FlowGraphDescriptor<typeof launchWorkspaceMachine> =
  flowExperimental.graphOf(launchWorkspaceMachine);
export const launchWorkspaceTrace: FlowTraceDescriptor<LaunchWorkspaceSnapshot> =
  flowExperimental.captureTrace(launchWorkspaceMachine.getInitialSnapshot(), {
    includeSnapshots: true,
  });
export const launchWorkspaceReplay: FlowReplayDescriptor<
  typeof launchWorkspaceMachine,
  typeof launchWorkspaceTrace
> = flowExperimental.replayTrace(launchWorkspaceMachine, launchWorkspaceTrace);
export const launchWorkspaceModel: FlowModelDescriptor<typeof launchWorkspaceMachine> = flowTest
  .app(LaunchWorkspaceApp)
  .seedResources(launchWorkspaceSeed)
  .model(launchWorkspaceMachine);
export const launchWorkspaceStories: FlowStoriesDescriptor<typeof launchWorkspaceMachine> =
  flowExperimental.flowStories(launchWorkspaceMachine, [
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
