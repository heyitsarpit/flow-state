import { Effect } from "effect";

import { createKey, createTag, flow } from "@flow-state/core";
import { withRequestRuntime } from "@flow-state/core/server";

type WorkspaceProject = Readonly<{
  readonly id: string;
  readonly title: string;
}>;

type SaveWorkspaceProjectParams = Readonly<{
  readonly id: string;
  readonly title: string;
}>;

type WorkspaceContext = Readonly<{
  readonly activeProjectId: string;
  readonly title: string;
  readonly saveCount: number;
}>;

type WorkspaceEvent =
  | Readonly<{ readonly type: "SAVE_PROJECT" }>
  | Readonly<{ readonly type: "PROJECT_SAVED"; readonly value: WorkspaceProject }>;

const workspaceProjectTag = createTag("workspace.project");

export const workspaceProject = flow.resource({
  id: "workspace.project",
  key: (id: string) => createKey("workspace", "project", id),
  lookup: (id: string) =>
    Effect.succeed({
      id,
      title: `Project ${id}`,
    }),
  tags: () => [workspaceProjectTag],
});

export const saveWorkspaceProject = flow.transaction({
  id: "workspace.save-project",
  params: ({ context }: { readonly context: WorkspaceContext }) => ({
    id: context.activeProjectId,
    title: context.title,
  }),
  commit: ({ id, title }: SaveWorkspaceProjectParams) =>
    Effect.succeed({
      id,
      title,
    }),
  invalidates: [workspaceProjectTag],
  routes: flow.outcomes<WorkspaceProject, never, WorkspaceEvent>({
    success: ({ value }) => ({ type: "PROJECT_SAVED", value }),
  }),
});

export const workspaceSummary = flow.view({
  id: "workspace.summary",
  sources: ["context"],
  select: ({ context }: { readonly context: WorkspaceContext }) => ({
    title: context.title,
    saveCount: context.saveCount,
  }),
});

const workspaceModule = flow.module(
  "Workspace",
  () => ({
    resources: {
      project: workspaceProject,
    },
    transactions: {
      saveProject: saveWorkspaceProject,
    },
    views: {
      summary: workspaceSummary,
    },
  }),
  {
    screens: ["Workspace"],
    tags: ["typescript-proof"],
  },
);

const workspaceApp = flow.app({
  modules: [workspaceModule],
});

const workspaceAppLayer = workspaceApp.layer({
  store: flow.store.memory(),
  orchestrators: flow.orchestrators.live(),
});

export const refreshWorkspaceProject = flow.refresh(workspaceProject.ref("project-1"));
export const patchWorkspaceProject = flow.patch(workspaceProject.ref("project-1"), {
  title: "Atlas v2",
});
export const invalidateWorkspaceProject = flow.invalidate(workspaceProjectTag);
export const runSaveWorkspaceProject = flow.run(saveWorkspaceProject);

export async function createWorkspaceBoot() {
  return withRequestRuntime(workspaceAppLayer, async (runtime) => {
    runtime.resources.seedResources([
      {
        ref: workspaceProject.ref("project-1"),
        value: { id: "project-1", title: "Atlas" },
      },
    ]);

    return runtime.dehydrateBoot();
  });
}
