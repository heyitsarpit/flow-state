import { Brand, Option, Redacted, Result, Schema } from "effect";

export type LaunchProjectId = string & Brand.Brand<"LaunchProjectId">;
export type LaunchAssetId = string & Brand.Brand<"LaunchAssetId">;
export type ApprovalRequestId = string & Brand.Brand<"ApprovalRequestId">;
export type AssistantRunId = string & Brand.Brand<"AssistantRunId">;
export type ChatThreadId = string & Brand.Brand<"ChatThreadId">;

export const LaunchProjectId = Brand.nominal<LaunchProjectId>();
export const LaunchAssetId = Brand.nominal<LaunchAssetId>();
export const ApprovalRequestId = Brand.nominal<ApprovalRequestId>();
export const AssistantRunId = Brand.nominal<AssistantRunId>();
export const ChatThreadId = Brand.nominal<ChatThreadId>();

const LaunchProjectIdSchema = Schema.String.pipe(Schema.brand("LaunchProjectId"));
const LaunchAssetIdSchema = Schema.String.pipe(Schema.brand("LaunchAssetId"));

export interface LaunchProject {
  readonly id: LaunchProjectId;
  readonly name: string;
  readonly summary: string;
  readonly launchDate: string;
  readonly version: number;
  readonly updatedAt: number;
}

export const LaunchProjectSchema: Schema.Schema<LaunchProject> = Schema.Struct({
  id: LaunchProjectIdSchema,
  name: Schema.String,
  summary: Schema.String,
  launchDate: Schema.String,
  version: Schema.Number,
  updatedAt: Schema.Number,
});

export interface LaunchComment {
  readonly id: string;
  readonly projectId: LaunchProjectId;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: number;
}

export const LaunchCommentSchema: Schema.Schema<LaunchComment> = Schema.Struct({
  id: Schema.String,
  projectId: LaunchProjectIdSchema,
  authorId: Schema.String,
  body: Schema.String,
  createdAt: Schema.Number,
});

export interface LaunchChecklistItem {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}

export const LaunchChecklistItemSchema: Schema.Schema<LaunchChecklistItem> = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  done: Schema.Boolean,
});

export type ReadinessMetricKind = "traffic" | "support" | "legal";

export interface ReadinessMetric {
  readonly id: ReadinessMetricKind;
  readonly label: string;
  readonly score: number;
  readonly updatedAt: number;
}

export const ReadinessMetricSchema: Schema.Schema<ReadinessMetric> = Schema.Struct({
  id: Schema.Literals(["traffic", "support", "legal"]),
  label: Schema.String,
  score: Schema.Number,
  updatedAt: Schema.Number,
});

export interface LaunchAsset {
  readonly id: LaunchAssetId;
  readonly projectId: LaunchProjectId;
  readonly name: string;
  readonly size: number;
  readonly status: "queued" | "uploading" | "uploaded" | "failed";
}

export const LaunchAssetSchema: Schema.Schema<LaunchAsset> = Schema.Struct({
  id: LaunchAssetIdSchema,
  projectId: LaunchProjectIdSchema,
  name: Schema.String,
  size: Schema.Number,
  status: Schema.Literals(["queued", "uploading", "uploaded", "failed"]),
});

export interface ApprovalRequest {
  readonly id: ApprovalRequestId;
  readonly projectId: LaunchProjectId;
  readonly requesterId: string;
  readonly budgetCents: number;
  readonly customerNote: Redacted.Redacted<string>;
  readonly status: "draft" | "pending" | "approved" | "denied";
}

export interface AssistantTask {
  readonly id: string;
  readonly title: string;
  readonly status: "queued" | "running" | "done" | "blocked";
}

export interface AssistantRun {
  readonly id: AssistantRunId;
  readonly projectId: LaunchProjectId;
  readonly status: "idle" | "running" | "needs-approval" | "complete" | "failed";
  readonly tasks: readonly AssistantTask[];
}

export interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly createdAt: number;
}

export interface ChatThread {
  readonly id: ChatThreadId;
  readonly projectId: LaunchProjectId;
  readonly messages: readonly ChatMessage[];
}

export interface ChatToken {
  readonly index: number;
  readonly text: string;
}

export interface CurrentUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface Permissions {
  readonly canEditProject: boolean;
  readonly canUploadAssets: boolean;
  readonly canRequestApproval: boolean;
  readonly canRunAssistant: boolean;
}

export interface ProjectDraft {
  readonly name: string;
  readonly summary: string;
  readonly launchDate: string;
}

export const ProjectDraftSchema: Schema.Schema<ProjectDraft> = Schema.Struct({
  name: Schema.String,
  summary: Schema.String,
  launchDate: Schema.String,
});

export interface SaveProjectParams {
  readonly id: LaunchProjectId;
  readonly draft: ProjectDraft;
  readonly baseVersion: number;
}

export class ProjectConflict extends Schema.TaggedErrorClass<ProjectConflict>()("ProjectConflict", {
  serverVersion: Schema.Number,
  serverProject: LaunchProjectSchema,
}) {}

export class ProjectValidation extends Schema.TaggedErrorClass<ProjectValidation>()(
  "ProjectValidation",
  {
    field: Schema.Literals(["name", "summary", "launchDate"]),
    message: Schema.String,
  },
) {}

export class ApprovalDenied extends Schema.TaggedErrorClass<ApprovalDenied>()("ApprovalDenied", {
  reason: Schema.String,
}) {}

export class UploadFailed extends Schema.TaggedErrorClass<UploadFailed>()("UploadFailed", {
  assetId: Schema.String,
  reason: Schema.String,
}) {}

export class ChatGenerationFailed extends Schema.TaggedErrorClass<ChatGenerationFailed>()(
  "ChatGenerationFailed",
  {
    reason: Schema.String,
  },
) {}

export type ProjectSaveError = ProjectConflict | ProjectValidation;

export function projectDraftFrom(project: LaunchProject): ProjectDraft {
  return {
    name: project.name,
    summary: project.summary,
    launchDate: project.launchDate,
  };
}

export function validateProjectDraft(
  draft: ProjectDraft,
): Result.Result<ProjectDraft, ProjectValidation> {
  if (draft.name.trim().length === 0) {
    return Result.fail(
      new ProjectValidation({
        field: "name",
        message: "Project name is required.",
      }),
    );
  }

  return Result.succeed({
    ...draft,
    name: draft.name.trim(),
    summary: draft.summary.trim(),
  });
}

export function optionalDraftFrom(project: LaunchProject): Option.Option<ProjectDraft> {
  return Option.some(projectDraftFrom(project));
}

export const fixtureProjectId = LaunchProjectId("launch-1");
export const fixtureThreadId = ChatThreadId("chat-1");

export const fixtureProject: LaunchProject = {
  id: fixtureProjectId,
  name: "Atlas public launch",
  summary: "Coordinate the launch plan, assets, approvals, and assistant work.",
  launchDate: "2026-07-15",
  version: 7,
  updatedAt: 1_000,
};

export const fixturePermissions: Permissions = {
  canEditProject: true,
  canUploadAssets: true,
  canRequestApproval: true,
  canRunAssistant: true,
};

export const fixtureApproval: ApprovalRequest = {
  id: ApprovalRequestId("approval-1"),
  projectId: fixtureProjectId,
  requesterId: "user-1",
  budgetCents: 250_000,
  customerNote: Redacted.make("Sensitive customer launch note"),
  status: "draft",
};
