import { Context, Effect } from "effect";

import {
  createControlledEffect,
  createKey,
  createTag,
  createTestLayer,
  flow,
} from "@flow-state/core";

import type {
  Project,
  ProjectEditorContext,
  ProjectLoadError,
  ProjectSaveError,
  SaveProjectInput,
} from "./projectFlow";

type ContextArgs = { readonly context: ProjectEditorContext };
type LoadFailureRouteArgs = { readonly requestId: number; readonly error: ProjectLoadError };
type SaveFailureRouteArgs = { readonly requestId: number; readonly error: ProjectSaveError };
type DefectRouteArgs = { readonly requestId: number; readonly defect: unknown };
type InterruptRouteArgs = { readonly requestId: number };

export interface ProjectServiceImplementation {
  readonly loadProject: (projectId: string) => Effect.Effect<Project, ProjectLoadError>;
  readonly saveProject: (input: SaveProjectInput) => Effect.Effect<Project, ProjectSaveError>;
}

export class ProjectService extends Context.Service<ProjectService, ProjectServiceImplementation>()(
  "example/ProjectService",
) {}

export const projectKeys = {
  detail(projectId: string) {
    return createKey("project", projectId);
  },
};

export const projectTags = {
  project: createTag("project"),
};

const loadProject = Effect.fn("ProjectEditor.loadProject")(function* (projectId: string) {
  const service = yield* ProjectService;
  return yield* service.loadProject(projectId);
});

const saveProject = Effect.fn("ProjectEditor.saveProject")(function* (input: SaveProjectInput) {
  const service = yield* ProjectService;
  return yield* service.saveProject(input);
});

export const projectEditorApiSketch = {
  loadProject: flow.query({
    id: "project.load",
    key: ({ context }: ContextArgs) => projectKeys.detail(context.projectId ?? "unknown"),
    effect: ({ context }: ContextArgs) => loadProject(context.projectId ?? "unknown"),
    cache: {
      staleTime: 30_000,
      gcTime: 300_000,
    },
    policy: "stale-while-revalidate",
    routes: {
      success: ({ requestId, value }: { readonly requestId: number; readonly value: Project }) => ({
        type: "PROJECT_LOADED",
        requestId,
        project: value,
      }),
      failure: ({ requestId, error }: LoadFailureRouteArgs) => ({
        type: "PROJECT_LOAD_FAILED",
        requestId,
        error,
      }),
      defect: ({ requestId, defect }: DefectRouteArgs) => ({
        type: "PROJECT_LOAD_DEFECT",
        requestId,
        defect,
      }),
      interrupt: ({ requestId }: InterruptRouteArgs) => ({
        type: "PROJECT_LOAD_INTERRUPTED",
        requestId,
      }),
    },
  }),
  saveProject: flow.mutation({
    id: "project.save",
    input: ({ context }: ContextArgs): SaveProjectInput | null =>
      context.project === null
        ? null
        : {
            projectId: context.project.id,
            draft: {
              title: normalize(context.draft.title),
              summary: context.draft.summary,
            },
            baseVersion: context.project.version,
          },
    effect: saveProject,
    invalidates: [projectTags.project],
    scope: "project-save",
    concurrency: "reject-while-running",
    routes: {
      success: ({ requestId, value }: { readonly requestId: number; readonly value: Project }) => ({
        type: "PROJECT_SAVED",
        requestId,
        project: value,
      }),
      failure: ({ requestId, error }: SaveFailureRouteArgs) => ({
        type: "PROJECT_SAVE_FAILED",
        requestId,
        error,
      }),
      defect: ({ requestId, defect }: DefectRouteArgs) => ({
        type: "PROJECT_SAVE_DEFECT",
        requestId,
        defect,
      }),
      interrupt: ({ requestId }: InterruptRouteArgs) => ({
        type: "PROJECT_SAVE_INTERRUPTED",
        requestId,
      }),
    },
  }),
};

function normalize(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

export const loadProjectEffect = createControlledEffect<Project, ProjectLoadError>("loadProject");
export const saveProjectEffect = createControlledEffect<Project, ProjectSaveError>("saveProject");

export const projectServiceTestLayer = createTestLayer(
  ProjectService,
  ProjectService.of({
    loadProject: () => loadProjectEffect.effect(),
    saveProject: () => saveProjectEffect.effect(),
  }),
);
