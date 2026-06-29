import { Effect } from "effect";

import { createKey, createTag, flow } from "@flow-state/core";
import type {
  FlowAppDefinition,
  FlowInvalidateDefinition,
  FlowModuleDefinition,
  FlowOrchestratorDescriptor,
  FlowPatchDefinition,
  FlowRefreshDefinition,
  FlowResourceDefinition,
  FlowResourceRef,
  FlowRunDefinition,
  FlowStoreDescriptor,
  FlowTag,
  FlowTransactionDefinition,
  FlowViewDefinition,
} from "@flow-state/core";
import { withRequestRuntime } from "@flow-state/core/server";
import type { FlowRuntimeBootPayload } from "@flow-state/core/server";

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

type WorkspaceSummary = Readonly<{
  readonly title: string;
  readonly saveCount: number;
}>;

const workspaceProjectTag: FlowTag<"workspace.project"> = createTag("workspace.project");

export const workspaceProject: FlowResourceDefinition<
  "workspace.project",
  [id: string],
  WorkspaceProject
> = flow.resource({
  id: "workspace.project",
  key: (id: string) => createKey("workspace", "project", id),
  lookup: (id: string) =>
    Effect.succeed({
      id,
      title: `Project ${id}`,
    }),
  tags: () => [workspaceProjectTag],
});

export const saveWorkspaceProject: FlowTransactionDefinition<
  "workspace.save-project",
  SaveWorkspaceProjectParams,
  WorkspaceProject,
  never,
  never,
  WorkspaceEvent
> = flow.transaction({
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

export const workspaceSummary: FlowViewDefinition<
  WorkspaceContext,
  string,
  WorkspaceSummary,
  "workspace.summary"
> = flow.view({
  id: "workspace.summary",
  sources: ["context"],
  select: ({ context }: { readonly context: WorkspaceContext }) => ({
    title: context.title,
    saveCount: context.saveCount,
  }),
});

type WorkspaceModuleInventory = Readonly<{
  readonly resources: Readonly<{
    readonly project: typeof workspaceProject;
  }>;
  readonly transactions: Readonly<{
    readonly saveProject: typeof saveWorkspaceProject;
  }>;
  readonly views: Readonly<{
    readonly summary: typeof workspaceSummary;
  }>;
}>;

const workspaceModule: FlowModuleDefinition<"Workspace", WorkspaceModuleInventory> = flow.module(
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

type WorkspaceApp = FlowAppDefinition<readonly [typeof workspaceModule]>;
type WorkspaceAppLayer = ReturnType<WorkspaceApp["layer"]>;

export const memoryStore: FlowStoreDescriptor = flow.store.memory();
export const liveOrchestrators: FlowOrchestratorDescriptor = flow.orchestrators.live();

const workspaceApp: WorkspaceApp = flow.app(workspaceModule);

const workspaceAppLayer: WorkspaceAppLayer = workspaceApp.layer({
  store: memoryStore,
  orchestrators: liveOrchestrators,
});

const workspaceProjectRef: FlowResourceRef<"workspace.project", [id: string], WorkspaceProject> =
  workspaceProject.ref("project-1");

export const refreshWorkspaceProject: FlowRefreshDefinition<typeof workspaceProjectRef> =
  flow.refresh(workspaceProjectRef);
export const patchWorkspaceProject: FlowPatchDefinition<
  typeof workspaceProjectRef,
  Readonly<{ readonly title: string }>
> = flow.patch(workspaceProjectRef, {
  title: "Atlas v2",
});
export const invalidateWorkspaceProject: FlowInvalidateDefinition<typeof workspaceProjectTag> =
  flow.invalidate(workspaceProjectTag);
export const runSaveWorkspaceProject: FlowRunDefinition<typeof saveWorkspaceProject> =
  flow.run(saveWorkspaceProject);

export async function createWorkspaceBoot(): Promise<FlowRuntimeBootPayload> {
  return withRequestRuntime(workspaceAppLayer, async (runtime) => {
    runtime.resources.seedResources([
      {
        ref: workspaceProjectRef,
        value: { id: "project-1", title: "Atlas" },
      },
    ]);

    return runtime.dehydrateBoot();
  });
}
