import { Clock, Context, Effect, Layer, Stream } from "effect";

import type {
  ApprovalRequest,
  AssistantRun,
  ChatMessage,
  ChatThread,
  ChatToken,
  CurrentUser,
  LaunchAsset,
  LaunchComment,
  LaunchProject,
  LaunchProjectId,
  Permissions,
  ProjectSaveError,
  ReadinessMetric,
  SaveProjectParams,
} from "./domain";
import {
  ApprovalDenied,
  AssistantRunId,
  ChatGenerationFailed,
  LaunchAssetId,
  ProjectConflict,
  UploadFailed,
  fixtureApproval,
  fixturePermissions,
  fixtureProject,
  fixtureProjectId,
  fixtureThreadId,
  validateProjectDraft,
} from "./domain";

export interface AssetUploadProgress {
  readonly assetId: string;
  readonly uploadedBytes: number;
  readonly totalBytes: number;
}

export interface AssistantProgress {
  readonly runId: string;
  readonly message: string;
  readonly taskId?: string;
}

export interface SessionApiShape {
  readonly currentUser: Effect.Effect<CurrentUser>;
  readonly permissions: Effect.Effect<Permissions>;
}

export class SessionApi extends Context.Service<SessionApi, SessionApiShape>()(
  "launch-workspace/SessionApi",
) {}

export interface ProjectApiShape {
  readonly getProject: (id: LaunchProjectId) => Effect.Effect<LaunchProject>;
  readonly listComments: (id: LaunchProjectId) => Effect.Effect<readonly LaunchComment[]>;
  readonly saveProject: (
    params: SaveProjectParams,
  ) => Effect.Effect<LaunchProject, ProjectSaveError>;
}

export class ProjectApi extends Context.Service<ProjectApi, ProjectApiShape>()(
  "launch-workspace/ProjectApi",
) {}

export interface ReadinessApiShape {
  readonly metrics: (projectId: LaunchProjectId) => Effect.Effect<readonly ReadinessMetric[]>;
}

export class ReadinessApi extends Context.Service<ReadinessApi, ReadinessApiShape>()(
  "launch-workspace/ReadinessApi",
) {}

export interface AssetApiShape {
  readonly listAssets: (projectId: LaunchProjectId) => Effect.Effect<readonly LaunchAsset[]>;
  readonly uploadAssets: (
    assets: readonly LaunchAsset[],
  ) => Stream.Stream<AssetUploadProgress, UploadFailed>;
}

export class AssetApi extends Context.Service<AssetApi, AssetApiShape>()(
  "launch-workspace/AssetApi",
) {}

export interface ApprovalApiShape {
  readonly getApproval: (projectId: LaunchProjectId) => Effect.Effect<ApprovalRequest>;
  readonly submitApproval: (
    request: ApprovalRequest,
  ) => Effect.Effect<ApprovalRequest, ApprovalDenied>;
}

export class ApprovalApi extends Context.Service<ApprovalApi, ApprovalApiShape>()(
  "launch-workspace/ApprovalApi",
) {}

export interface AssistantApiShape {
  readonly startRun: (projectId: LaunchProjectId) => Effect.Effect<AssistantRun>;
  readonly progress: (run: AssistantRun) => Stream.Stream<AssistantProgress, never>;
}

export class AssistantApi extends Context.Service<AssistantApi, AssistantApiShape>()(
  "launch-workspace/AssistantApi",
) {}

export interface ChatApiShape {
  readonly getThread: (projectId: LaunchProjectId) => Effect.Effect<ChatThread>;
  readonly appendUserMessage: (
    threadId: string,
    text: string,
  ) => Effect.Effect<ChatMessage, ChatGenerationFailed>;
  readonly streamAssistantResponse: (
    threadId: string,
    prompt: string,
  ) => Stream.Stream<ChatToken, ChatGenerationFailed>;
}

export class ChatApi extends Context.Service<ChatApi, ChatApiShape>()("launch-workspace/ChatApi") {}

export const loadProject = Effect.fn("LaunchWorkspace.ProjectApi.getProject")(function* (
  id: LaunchProjectId,
) {
  const api = yield* ProjectApi;
  return yield* api.getProject(id);
});

export const saveProject = Effect.fn("LaunchWorkspace.ProjectApi.saveProject")(function* (
  params: SaveProjectParams,
) {
  const normalized = validateProjectDraft(params.draft);
  if (normalized._tag === "Failure") {
    return yield* Effect.fail(normalized.failure);
  }

  const api = yield* ProjectApi;
  return yield* api.saveProject({ ...params, draft: normalized.success });
});

export const LaunchWorkspaceTestServices = Layer.mergeAll(
  Layer.succeed(
    SessionApi,
    SessionApi.of({
      currentUser: Effect.succeed({
        id: "user-1",
        name: "Mira Shah",
        email: "mira@example.test",
      }),
      permissions: Effect.succeed(fixturePermissions),
    }),
  ),
  Layer.succeed(
    ProjectApi,
    ProjectApi.of({
      getProject: Effect.fn("LaunchWorkspace.TestProjectApi.getProject")(function* (id) {
        const now = yield* Clock.currentTimeMillis;
        return {
          ...fixtureProject,
          id,
          updatedAt: now,
        };
      }),
      listComments: Effect.fn("LaunchWorkspace.TestProjectApi.listComments")((id) =>
        Effect.succeed([
          {
            id: "comment-1",
            projectId: id,
            authorId: "user-1",
            body: "Launch brief approved for internal review.",
            createdAt: 1_100,
          },
        ]),
      ),
      saveProject: Effect.fn("LaunchWorkspace.TestProjectApi.saveProject")(function* (params) {
        const now = yield* Clock.currentTimeMillis;
        if (params.baseVersion < fixtureProject.version) {
          return yield* Effect.fail(
            new ProjectConflict({
              serverVersion: fixtureProject.version,
              serverProject: fixtureProject,
            }),
          );
        }

        return {
          ...fixtureProject,
          ...params.draft,
          id: params.id,
          version: params.baseVersion + 1,
          updatedAt: now,
        };
      }),
    }),
  ),
  Layer.succeed(
    ReadinessApi,
    ReadinessApi.of({
      metrics: Effect.fn("LaunchWorkspace.TestReadinessApi.metrics")(() =>
        Effect.succeed([
          { id: "traffic", label: "Traffic", score: 92, updatedAt: 1_000 },
          { id: "support", label: "Support", score: 84, updatedAt: 1_000 },
          { id: "legal", label: "Legal", score: 76, updatedAt: 1_000 },
        ]),
      ),
    }),
  ),
  Layer.succeed(
    AssetApi,
    AssetApi.of({
      listAssets: Effect.fn("LaunchWorkspace.TestAssetApi.listAssets")((projectId) =>
        Effect.succeed([
          {
            id: LaunchAssetId("asset-1"),
            projectId,
            name: "press-kit.zip",
            size: 2048,
            status: "uploaded",
          },
        ]),
      ),
      uploadAssets: (assets) =>
        Stream.fromIterable(
          assets.map((asset) => ({
            assetId: asset.id,
            uploadedBytes: asset.size,
            totalBytes: asset.size,
          })),
        ),
    }),
  ),
  Layer.succeed(
    ApprovalApi,
    ApprovalApi.of({
      getApproval: Effect.fn("LaunchWorkspace.TestApprovalApi.getApproval")(() =>
        Effect.succeed(fixtureApproval),
      ),
      submitApproval: Effect.fn("LaunchWorkspace.TestApprovalApi.submitApproval")(
        function* (request) {
          if (request.budgetCents <= 0) {
            return yield* Effect.fail(new ApprovalDenied({ reason: "Budget must be positive." }));
          }

          return {
            ...request,
            status: "pending",
          };
        },
      ),
    }),
  ),
  Layer.succeed(
    AssistantApi,
    AssistantApi.of({
      startRun: Effect.fn("LaunchWorkspace.TestAssistantApi.startRun")((projectId) =>
        Effect.succeed({
          id: AssistantRunId("run-1"),
          projectId,
          status: "running",
          tasks: [
            { id: "task-1", title: "Draft launch checklist", status: "queued" },
            { id: "task-2", title: "Review asset gaps", status: "queued" },
          ],
        }),
      ),
      progress: (run) =>
        Stream.fromIterable([
          { runId: run.id, message: "Planning launch work" },
          { runId: run.id, taskId: "task-1", message: "Checklist drafted" },
        ]),
    }),
  ),
  Layer.succeed(
    ChatApi,
    ChatApi.of({
      getThread: Effect.fn("LaunchWorkspace.TestChatApi.getThread")((projectId) =>
        Effect.succeed({
          id: fixtureThreadId,
          projectId,
          messages: [],
        }),
      ),
      appendUserMessage: Effect.fn("LaunchWorkspace.TestChatApi.appendUserMessage")(
        function* (_threadId, text) {
          const now = yield* Clock.currentTimeMillis;
          return {
            id: "message-user-1",
            role: "user",
            text,
            createdAt: now,
          };
        },
      ),
      streamAssistantResponse: (_threadId, prompt) =>
        prompt.trim().length === 0
          ? Stream.fail(new ChatGenerationFailed({ reason: "Prompt is required." }))
          : Stream.fromIterable([
              { index: 0, text: "Launch" },
              { index: 1, text: " plan" },
              { index: 2, text: " ready." },
            ]),
    }),
  ),
);

export const testProjectConflict = new ProjectConflict({
  serverVersion: fixtureProject.version,
  serverProject: fixtureProject,
});

export const serviceFixtureIds = {
  projectId: fixtureProjectId,
  threadId: fixtureThreadId,
} as const;
