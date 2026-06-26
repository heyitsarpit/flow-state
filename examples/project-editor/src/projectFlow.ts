import { Schema } from "effect";

import { flow } from "@flow-state/core";
import type { FlowEvent, FlowSnapshot, FlowTransitionArgs } from "@flow-state/core";

import { projectEditorApiSketch } from "./projectApi";

export type ProjectEditorState =
  | "idle"
  | "loading"
  | "editing"
  | "loadFailure"
  | "saving"
  | "saveFailure"
  | "defect";

export interface Project {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly version: number;
  readonly updatedAt: number;
}

export const ProjectSchema: Schema.Schema<Project> = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  version: Schema.Number,
  updatedAt: Schema.Number,
});

export interface ProjectDraft {
  readonly title: string;
  readonly summary: string;
}

export const ProjectDraftSchema: Schema.Schema<ProjectDraft> = Schema.Struct({
  title: Schema.String,
  summary: Schema.String,
});

export interface ProjectNotFound {
  readonly _tag: "ProjectNotFound";
  readonly projectId: string;
}

export const ProjectNotFoundSchema: Schema.Schema<ProjectNotFound> = Schema.TaggedStruct(
  "ProjectNotFound",
  {
    projectId: Schema.String,
  },
);

export interface ProjectUnavailable {
  readonly _tag: "ProjectUnavailable";
  readonly projectId: string;
  readonly retryAfterMs: number;
}

export const ProjectUnavailableSchema: Schema.Schema<ProjectUnavailable> = Schema.TaggedStruct(
  "ProjectUnavailable",
  {
    projectId: Schema.String,
    retryAfterMs: Schema.Number,
  },
);

export interface ProjectConflict {
  readonly _tag: "ProjectConflict";
  readonly serverVersion: number;
  readonly serverProject: Project;
}

export const ProjectConflictSchema: Schema.Schema<ProjectConflict> = Schema.TaggedStruct(
  "ProjectConflict",
  {
    serverVersion: Schema.Number,
    serverProject: ProjectSchema,
  },
);

export interface ProjectValidation {
  readonly _tag: "ProjectValidation";
  readonly field: keyof ProjectDraft;
  readonly message: string;
}

export const ProjectValidationSchema: Schema.Schema<ProjectValidation> = Schema.TaggedStruct(
  "ProjectValidation",
  {
    field: Schema.Literals(["title", "summary"]),
    message: Schema.String,
  },
);

export type ProjectLoadError = ProjectNotFound | ProjectUnavailable;
export type ProjectSaveError = ProjectConflict | ProjectValidation;

export const ProjectLoadErrorSchema: Schema.Schema<ProjectLoadError> = Schema.Union([
  ProjectNotFoundSchema,
  ProjectUnavailableSchema,
]);
export const ProjectSaveErrorSchema: Schema.Schema<ProjectSaveError> = Schema.Union([
  ProjectConflictSchema,
  ProjectValidationSchema,
]);

export type ProjectFailure = ProjectLoadError | ProjectSaveError;
export type ProjectIssueSource = "query" | "mutation";
export type ProjectIssue =
  | {
      readonly kind: "failure";
      readonly source: ProjectIssueSource;
      readonly requestId: number;
      readonly error: ProjectFailure;
      readonly handled: true;
    }
  | {
      readonly kind: "defect";
      readonly source: ProjectIssueSource;
      readonly requestId: number;
      readonly defect: unknown;
      readonly handled: false;
    }
  | {
      readonly kind: "interrupt";
      readonly source: ProjectIssueSource;
      readonly requestId: number;
      readonly handled: true;
    };

export interface SaveProjectInput {
  readonly projectId: string;
  readonly draft: ProjectDraft;
  readonly baseVersion: number;
}

export interface ProjectEditorContext {
  readonly projectId: string | null;
  readonly project: Project | null;
  readonly draft: ProjectDraft;
  readonly currentIssue: ProjectIssue | null;
}

export type ProjectEditorEvent =
  | ({ readonly type: "OPEN_PROJECT"; readonly projectId: string } & FlowEvent)
  | ({ readonly type: "RETRY_LOAD" } & FlowEvent)
  | ({
      readonly type: "PROJECT_LOADED";
      readonly requestId: number;
      readonly project: Project;
    } & FlowEvent)
  | ({
      readonly type: "PROJECT_LOAD_FAILED";
      readonly requestId: number;
      readonly error: ProjectLoadError;
    } & FlowEvent)
  | ({
      readonly type: "PROJECT_LOAD_DEFECT";
      readonly requestId: number;
      readonly defect: unknown;
    } & FlowEvent)
  | ({
      readonly type: "PROJECT_LOAD_INTERRUPTED";
      readonly requestId: number;
    } & FlowEvent)
  | ({ readonly type: "EDIT_TITLE"; readonly title: string } & FlowEvent)
  | ({ readonly type: "EDIT_SUMMARY"; readonly summary: string } & FlowEvent)
  | ({ readonly type: "DISCARD_CHANGES" } & FlowEvent)
  | ({ readonly type: "SAVE_PROJECT" } & FlowEvent)
  | ({
      readonly type: "PROJECT_SAVED";
      readonly requestId: number;
      readonly project: Project;
    } & FlowEvent)
  | ({
      readonly type: "PROJECT_SAVE_FAILED";
      readonly requestId: number;
      readonly error: ProjectSaveError;
    } & FlowEvent)
  | ({
      readonly type: "PROJECT_SAVE_DEFECT";
      readonly requestId: number;
      readonly defect: unknown;
    } & FlowEvent)
  | ({
      readonly type: "PROJECT_SAVE_INTERRUPTED";
      readonly requestId: number;
    } & FlowEvent);

export type ProjectEditorSnapshot = FlowSnapshot<ProjectEditorContext, ProjectEditorState>;
type ProjectArgs = FlowTransitionArgs<ProjectEditorContext, ProjectEditorEvent, ProjectEditorState>;

const emptyDraft: ProjectDraft = {
  title: "",
  summary: "",
};

const submitSave = flow.submit<ProjectEditorContext, ProjectEditorEvent, ProjectEditorState>(
  projectEditorApiSketch.saveProject,
  { target: "saving" },
);

export const projectEditorMachine = flow.machine<
  ProjectEditorContext,
  ProjectEditorEvent,
  ProjectEditorState
>({
  id: "example-1-project-editor",
  initial: "idle",
  context: () => ({
    projectId: null,
    project: null,
    draft: emptyDraft,
    currentIssue: null,
  }),
  states: {
    idle: {
      on: {
        OPEN_PROJECT: {
          target: "loading",
          update: beginLoad,
        },
      },
    },
    loading: {
      invoke: projectEditorApiSketch.loadProject,
      on: {
        OPEN_PROJECT: {
          target: "loading",
          update: beginLoad,
        },
        PROJECT_LOADED: {
          target: "editing",
          update: finishLoad,
        },
        PROJECT_LOAD_FAILED: {
          target: "loadFailure",
          update: failLoad,
        },
        PROJECT_LOAD_DEFECT: {
          target: "defect",
          update: defectLoad,
        },
        PROJECT_LOAD_INTERRUPTED: {
          target: "loadFailure",
          update: interruptLoad,
        },
      },
    },
    loadFailure: {
      on: {
        RETRY_LOAD: {
          target: "loading",
          guard: hasProjectId,
        },
        OPEN_PROJECT: {
          target: "loading",
          update: beginLoad,
        },
      },
    },
    editing: {
      on: {
        EDIT_TITLE: {
          update: setTitle,
        },
        EDIT_SUMMARY: {
          update: setSummary,
        },
        DISCARD_CHANGES: {
          guard: hasProject,
          update: discardChanges,
        },
        SAVE_PROJECT: {
          ...submitSave,
          guard: canSubmitDraft,
        },
        OPEN_PROJECT: {
          target: "loading",
          update: beginLoad,
        },
      },
    },
    saving: {
      on: {
        PROJECT_SAVED: {
          target: "editing",
          update: finishSave,
        },
        PROJECT_SAVE_FAILED: {
          target: "saveFailure",
          update: failSave,
        },
        PROJECT_SAVE_DEFECT: {
          target: "defect",
          update: defectSave,
        },
        PROJECT_SAVE_INTERRUPTED: {
          target: "saveFailure",
          update: interruptSave,
        },
        OPEN_PROJECT: {
          target: "loading",
          update: beginLoad,
        },
      },
    },
    saveFailure: {
      on: {
        EDIT_TITLE: {
          update: setTitle,
        },
        EDIT_SUMMARY: {
          update: setSummary,
        },
        DISCARD_CHANGES: {
          target: "editing",
          guard: hasProject,
          update: discardChanges,
        },
        SAVE_PROJECT: {
          ...submitSave,
          guard: canSubmitDraft,
        },
        OPEN_PROJECT: {
          target: "loading",
          update: beginLoad,
        },
      },
    },
    defect: {
      on: {
        OPEN_PROJECT: {
          target: "loading",
          update: beginLoad,
        },
      },
    },
  },
});

export function selectIsDirty(context: ProjectEditorContext): boolean {
  return (
    context.project !== null &&
    (context.draft.title !== context.project.title ||
      context.draft.summary !== context.project.summary)
  );
}

export function selectCanSave(context: ProjectEditorContext): boolean {
  return (
    context.project !== null && selectIsDirty(context) && normalize(context.draft.title).length > 0
  );
}

export function selectProjectKey(projectId: string): string {
  return JSON.stringify(["project", projectId]);
}

function hasProject({ context }: ProjectArgs): boolean {
  return context.project !== null;
}

function hasProjectId({ context }: ProjectArgs): boolean {
  return context.projectId !== null;
}

function canSubmitDraft({ context }: ProjectArgs): boolean {
  return selectCanSave(context);
}

function beginLoad({ event }: ProjectArgs): Partial<ProjectEditorContext> {
  return {
    projectId: event.type === "OPEN_PROJECT" ? event.projectId : null,
    project: null,
    draft: emptyDraft,
    currentIssue: null,
  };
}

function finishLoad({ event }: ProjectArgs): Partial<ProjectEditorContext> {
  if (event.type !== "PROJECT_LOADED") {
    return {};
  }

  return {
    projectId: event.project.id,
    project: event.project,
    draft: projectToDraft(event.project),
    currentIssue: null,
  };
}

function failLoad({ event }: ProjectArgs): Partial<ProjectEditorContext> {
  if (event.type !== "PROJECT_LOAD_FAILED") {
    return {};
  }

  return {
    currentIssue: {
      kind: "failure",
      source: "query",
      requestId: event.requestId,
      error: event.error,
      handled: true,
    },
  };
}

function defectLoad({ event }: ProjectArgs): Partial<ProjectEditorContext> {
  if (event.type !== "PROJECT_LOAD_DEFECT") {
    return {};
  }

  return {
    currentIssue: {
      kind: "defect",
      source: "query",
      requestId: event.requestId,
      defect: event.defect,
      handled: false,
    },
  };
}

function interruptLoad({ event }: ProjectArgs): Partial<ProjectEditorContext> {
  if (event.type !== "PROJECT_LOAD_INTERRUPTED") {
    return {};
  }

  return {
    currentIssue: {
      kind: "interrupt",
      source: "query",
      requestId: event.requestId,
      handled: true,
    },
  };
}

function setTitle({ context, event }: ProjectArgs): Partial<ProjectEditorContext> {
  return event.type === "EDIT_TITLE" ? { draft: { ...context.draft, title: event.title } } : {};
}

function setSummary({ context, event }: ProjectArgs): Partial<ProjectEditorContext> {
  return event.type === "EDIT_SUMMARY"
    ? { draft: { ...context.draft, summary: event.summary } }
    : {};
}

function discardChanges({ context }: ProjectArgs): Partial<ProjectEditorContext> {
  return {
    draft: context.project === null ? emptyDraft : projectToDraft(context.project),
    currentIssue: null,
  };
}

function finishSave({ event }: ProjectArgs): Partial<ProjectEditorContext> {
  if (event.type !== "PROJECT_SAVED") {
    return {};
  }

  return {
    project: event.project,
    draft: projectToDraft(event.project),
    currentIssue: null,
  };
}

function failSave({ context, event }: ProjectArgs): Partial<ProjectEditorContext> {
  if (event.type !== "PROJECT_SAVE_FAILED") {
    return {};
  }

  return {
    project: event.error._tag === "ProjectConflict" ? event.error.serverProject : context.project,
    currentIssue: {
      kind: "failure",
      source: "mutation",
      requestId: event.requestId,
      error: event.error,
      handled: true,
    },
  };
}

function defectSave({ event }: ProjectArgs): Partial<ProjectEditorContext> {
  if (event.type !== "PROJECT_SAVE_DEFECT") {
    return {};
  }

  return {
    currentIssue: {
      kind: "defect",
      source: "mutation",
      requestId: event.requestId,
      defect: event.defect,
      handled: false,
    },
  };
}

function interruptSave({ event }: ProjectArgs): Partial<ProjectEditorContext> {
  if (event.type !== "PROJECT_SAVE_INTERRUPTED") {
    return {};
  }

  return {
    currentIssue: {
      kind: "interrupt",
      source: "mutation",
      requestId: event.requestId,
      handled: true,
    },
  };
}

function projectToDraft(project: Project): ProjectDraft {
  return {
    title: project.title,
    summary: project.summary,
  };
}

function normalize(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}
