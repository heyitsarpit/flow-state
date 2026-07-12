import { Context, Effect, Layer } from "effect";

import {
  app,
  createKey,
  createTag,
  invalidate,
  module,
  outcomes,
  patch,
  refresh,
  resource,
  run,
  store,
  orchestrators,
  transaction,
  view,
} from "flow-state";
import { withRequestRuntime } from "flow-state/server";

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

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Type extends true> = Type;

class ProjectConfig extends Context.Service<ProjectConfig, { readonly projectId: string }>()(
  "@proof/ProjectConfig",
) {}

class ProjectAnalytics extends Context.Service<
  ProjectAnalytics,
  { readonly label: Effect.Effect<string, never, never> }
>()("@proof/ProjectAnalytics") {}

export const workspaceProject = resource({
  id: "workspace.project",
  key: (id: string) => createKey("workspace", "project", id),
  lookup: (id: string) =>
    Effect.succeed({
      id,
      title: `Project ${id}`,
    }),
  tags: () => [workspaceProjectTag],
});

export const saveWorkspaceProject = transaction({
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
  routes: outcomes<WorkspaceProject, never, WorkspaceEvent>({
    success: ({ value }: { readonly value: WorkspaceProject }) => ({
      type: "PROJECT_SAVED",
      value,
    }),
  }),
});

export const workspaceSummary = view({
  id: "workspace.summary",
  sources: ["context"],
  select: ({ context }: { readonly context: WorkspaceContext }) => ({
    title: context.title,
    saveCount: context.saveCount,
  }),
});

const workspaceModule = module(
  "Workspace",
  {
    resources: {
      project: workspaceProject,
    },
    transactions: {
      saveProject: saveWorkspaceProject,
    },
    views: {
      summary: workspaceSummary,
    },
  },
  {
    screens: ["Workspace"],
    tags: ["typescript-proof"],
  },
);

const workspaceApp = app({
  modules: [workspaceModule],
});

const workspaceAppLayer = workspaceApp.layer({
  store: store.memory(),
  orchestrators: orchestrators.live(),
});

const configLayer = Layer.succeed(
  ProjectConfig,
  ProjectConfig.of({
    projectId: "atlas",
  }),
);
const analyticsLayer = Layer.effect(
  ProjectAnalytics,
  Effect.map(ProjectConfig, (config) =>
    ProjectAnalytics.of({
      label: Effect.succeed(config.projectId),
    }),
  ),
);
const workspaceAnalyticsAppLayer = workspaceApp.layer<
  readonly [typeof configLayer, typeof analyticsLayer]
>({
  store: store.memory(),
  orchestrators: orchestrators.live(),
  services: [configLayer, analyticsLayer],
});

type _PackedAppLayerRequirement = Expect<
  Equal<Layer.Services<typeof workspaceAnalyticsAppLayer>, never>
>;
type _PackedAppLayerError = Expect<Equal<Layer.Error<typeof workspaceAnalyticsAppLayer>, never>>;
const failingAnalyticsLayer = Layer.effect(
  ProjectAnalytics,
  Effect.flatMap(ProjectConfig, () => Effect.fail("analytics-acquire-failed" as const)),
);
const workspaceAnalyticsRequiredAppLayer = workspaceApp.layer<
  readonly [typeof failingAnalyticsLayer]
>({
  store: store.memory(),
  orchestrators: orchestrators.live(),
  services: [failingAnalyticsLayer],
});
type _PackedRequiredAppLayerRequirement = Expect<
  Equal<Layer.Services<typeof workspaceAnalyticsRequiredAppLayer>, ProjectConfig>
>;
type _PackedRequiredAppLayerError = Expect<
  Equal<Layer.Error<typeof workspaceAnalyticsRequiredAppLayer>, "analytics-acquire-failed">
>;
void [true as _PackedAppLayerRequirement, true as _PackedAppLayerError];
void [true as _PackedRequiredAppLayerRequirement, true as _PackedRequiredAppLayerError];

export const refreshWorkspaceProject = refresh(workspaceProject.ref("project-1"));
export const patchWorkspaceProject = patch(workspaceProject.ref("project-1"), {
  title: "Atlas v2",
});
export const invalidateWorkspaceProject = invalidate(workspaceProjectTag);
export const runSaveWorkspaceProject = run(saveWorkspaceProject);

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
