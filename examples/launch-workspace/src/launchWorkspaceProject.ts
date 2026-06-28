import { Effect, Option } from "effect";

import { createKey, flow } from "@flow-state/core";
import type { FlowEvent, FlowTransitionArgs } from "@flow-state/core";

import { fixtureProject, fixtureProjectId, projectDraftFrom } from "./domain";
import type {
  LaunchComment,
  LaunchProject,
  LaunchProjectId,
  ProjectDraft,
  ProjectSaveError,
  SaveProjectParams,
} from "./domain";
import { saveProject } from "./services";
import { projectTag } from "./launchWorkspaceResources";

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

export const saveProjectTransaction = flow.transaction({
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
