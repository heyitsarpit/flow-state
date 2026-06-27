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
  ProjectEditorEvent,
  ProjectLoadError,
  ProjectSaveError,
  SaveProjectInput,
} from "./projectFlow";

type ContextArgs = { readonly context: ProjectEditorContext };

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
    routes: flow.outcomes<Project, ProjectLoadError, ProjectEditorEvent>({
      success: ["PROJECT_LOADED", "project"],
      failure: ["PROJECT_LOAD_FAILED", "error"],
      defect: ["PROJECT_LOAD_DEFECT", "defect"],
      interrupt: "PROJECT_LOAD_INTERRUPTED",
    }),
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
    routes: flow.outcomes<Project, ProjectSaveError, ProjectEditorEvent>({
      success: ["PROJECT_SAVED", "project"],
      failure: ["PROJECT_SAVE_FAILED", "error"],
      defect: ["PROJECT_SAVE_DEFECT", "defect"],
      interrupt: "PROJECT_SAVE_INTERRUPTED",
    }),
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
