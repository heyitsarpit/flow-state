import { Context, Effect, Layer, Stream } from "effect";

import { createKey, createTag } from "flow-state";
import * as flow from "flow-state";
import type {
  FlowAppDefinition,
  FlowMachine,
  FlowMachineConfig,
  FlowRuntimeDefaultServices,
  FlowInvalidateDefinition,
  FlowModuleDefinition,
  FlowOrchestratorDescriptor,
  FlowPatchDefinition,
  FlowRefreshDefinition,
  FlowResourceDefinition,
  FlowResourceRef,
  FlowRunDefinition,
  FlowStoreDescriptor,
  FlowStreamDefinition,
  FlowTag,
  FlowTransactionDefinition,
  FlowViewDefinition,
} from "flow-state";
import { withRequestRuntime } from "flow-state/server";
import type { FlowRuntimeBootPayload } from "flow-state/server";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Type extends true> = Type;

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

type ProjectConfigService = Readonly<{
  readonly projectId: string;
}>;

type ProjectAnalyticsService = Readonly<{
  readonly label: Effect.Effect<string, never, never>;
}>;

const ProjectConfig = Context.Service<ProjectConfigService>("@proof/ProjectConfig");
const ProjectAnalytics = Context.Service<ProjectAnalyticsService>("@proof/ProjectAnalytics");

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

export const typedWorkspaceProject: FlowResourceDefinition<
  "workspace.typed-project",
  [id: "project-1"],
  WorkspaceProject
> = flow.resource({
  id: "workspace.typed-project",
  key: (id: "project-1") => createKey("workspace", "typed-project", id),
  lookup: (id: "project-1") =>
    Effect.succeed({
      id,
      title: `Project ${id}`,
    } satisfies WorkspaceProject),
  tags: (id: "project-1") => {
    void (id satisfies "project-1");
    return [workspaceProjectTag];
  },
  placeholder: (id: "project-1") => ({
    id,
    title: "Loading",
  }),
});
type _PackedIsolatedResourceParams = Expect<
  Equal<Parameters<typeof typedWorkspaceProject.ref>, [id: "project-1"]>
>;
// @ts-expect-error packed declarations preserve directional resource ref params
typedWorkspaceProject.ref("project-2");
void (true as _PackedIsolatedResourceParams);

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

export const workspaceProjectStream: FlowStreamDefinition<
  WorkspaceProject,
  never,
  string,
  WorkspaceEvent,
  WorkspaceContext,
  "workspace.project-stream",
  never
> = flow.stream({
  id: "workspace.project-stream",
  params: ({ context }: { readonly context: WorkspaceContext }) => context.activeProjectId,
  subscribe: ({ params }: { readonly params: string }) =>
    Stream.succeed({
      id: params,
      title: `Project ${params}`,
    } satisfies WorkspaceProject),
  pressure: {
    strategy: "coalesce-latest",
    key: (project: WorkspaceProject) => project.id,
  },
  routes: {
    value: (project: WorkspaceProject) => ({ type: "PROJECT_SAVED", value: project }),
  },
});
type PackedCarriedStreamRoutes = NonNullable<typeof workspaceProjectStream.config.routes>;
type _PackedCarriedStreamValueRouteArg = Expect<
  Equal<Parameters<NonNullable<PackedCarriedStreamRoutes["value"]>>[0], WorkspaceProject>
>;
const invalidPackedCarriedStreamRoutes: PackedCarriedStreamRoutes = {
  // @ts-expect-error packed declarations preserve carried stream value routes
  value: (project: Readonly<{ readonly id: "project-1"; readonly title: string }>) => ({
    type: "PROJECT_SAVED",
    value: project,
  }),
};
type PackedExportedCoalescedPressure = Extract<
  NonNullable<typeof workspaceProjectStream.config.pressure>,
  { readonly strategy: "coalesce-latest" }
>;
type _PackedCoalescedPressureKeyArg = Expect<
  Equal<Parameters<PackedExportedCoalescedPressure["key"]>[0], WorkspaceProject>
>;
const invalidPackedCoalescedPressure: PackedExportedCoalescedPressure = {
  strategy: "coalesce-latest",
  // @ts-expect-error packed declarations preserve carried stream pressure keys
  key: (project: Readonly<{ readonly id: "project-1"; readonly title: string }>) => project.id,
};
void [
  true as _PackedCarriedStreamValueRouteArg,
  true as _PackedCoalescedPressureKeyArg,
  invalidPackedCarriedStreamRoutes,
  invalidPackedCoalescedPressure,
];

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

type WorkspaceApp = FlowAppDefinition<readonly [typeof workspaceModule]>;
type WorkspaceAppLayer = ReturnType<WorkspaceApp["layer"]>;

export const memoryStore: FlowStoreDescriptor = flow.store.memory();
export const liveOrchestrators: FlowOrchestratorDescriptor = flow.orchestrators.live();

const workspaceApp: WorkspaceApp = flow.app({ modules: [workspaceModule] });

const workspaceAppLayer: WorkspaceAppLayer = workspaceApp.layer({
  store: memoryStore,
  orchestrators: liveOrchestrators,
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
export const workspaceAnalyticsAppLayer: Layer.Layer<
  FlowRuntimeDefaultServices | ProjectConfigService | ProjectAnalyticsService,
  never,
  never
> = workspaceApp.layer<readonly [typeof configLayer, typeof analyticsLayer]>({
  store: memoryStore,
  orchestrators: liveOrchestrators,
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
export const workspaceAnalyticsRequiredAppLayer: Layer.Layer<
  FlowRuntimeDefaultServices | ProjectAnalyticsService,
  "analytics-acquire-failed",
  ProjectConfigService
> = workspaceApp.layer<readonly [typeof failingAnalyticsLayer]>({
  store: memoryStore,
  orchestrators: liveOrchestrators,
  services: [failingAnalyticsLayer],
});
type _PackedRequiredAppLayerRequirement = Expect<
  Equal<Layer.Services<typeof workspaceAnalyticsRequiredAppLayer>, ProjectConfigService>
>;
type _PackedRequiredAppLayerError = Expect<
  Equal<Layer.Error<typeof workspaceAnalyticsRequiredAppLayer>, "analytics-acquire-failed">
>;
void [true as _PackedAppLayerRequirement, true as _PackedAppLayerError];
void [true as _PackedRequiredAppLayerRequirement, true as _PackedRequiredAppLayerError];

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

const workspaceSubmitMachineConfigValue = {
  id: "workspace.submit-machine",
  initial: "editing",
  context: (): WorkspaceContext => ({
    activeProjectId: "project-1",
    title: "Atlas",
    saveCount: 0,
  }),
  states: {
    editing: {
      on: {
        SAVE_PROJECT: {
          target: "saving",
          submit: saveWorkspaceProject,
        },
      },
    },
    saving: {
      invoke: flow.run(saveWorkspaceProject),
      on: {
        PROJECT_SAVED: {
          target: "editing",
        },
      },
    },
  },
} satisfies FlowMachineConfig<
  "workspace.submit-machine",
  WorkspaceContext,
  WorkspaceEvent,
  "editing" | "saving",
  "editing"
>;

export const workspaceSubmitMachineConfig: FlowMachineConfig<
  "workspace.submit-machine",
  WorkspaceContext,
  WorkspaceEvent,
  "editing" | "saving",
  "editing"
> = workspaceSubmitMachineConfigValue;

type _PackedSubmitBindingPreservesTransaction = Expect<
  Equal<
    typeof workspaceSubmitMachineConfigValue.states.editing.on.SAVE_PROJECT.submit,
    typeof saveWorkspaceProject
  >
>;
type _PackedRunBindingPreservesTransaction = Expect<
  Equal<
    typeof workspaceSubmitMachineConfigValue.states.saving.invoke.transaction,
    typeof saveWorkspaceProject
  >
>;
void [
  true as _PackedSubmitBindingPreservesTransaction,
  true as _PackedRunBindingPreservesTransaction,
];

export const workspaceSubmitMachine: FlowMachine<
  WorkspaceContext,
  WorkspaceEvent,
  "editing" | "saving",
  "editing",
  "workspace.submit-machine"
> = flow.machine(workspaceSubmitMachineConfigValue);

type _PackedSubmitMachineConfigExport = Expect<
  Equal<
    typeof workspaceSubmitMachineConfig,
    FlowMachineConfig<
      "workspace.submit-machine",
      WorkspaceContext,
      WorkspaceEvent,
      "editing" | "saving",
      "editing"
    >
  >
>;
type _PackedSubmitMachineExport = Expect<
  Equal<
    typeof workspaceSubmitMachine,
    FlowMachine<
      WorkspaceContext,
      WorkspaceEvent,
      "editing" | "saving",
      "editing",
      "workspace.submit-machine"
    >
  >
>;
void [true as _PackedSubmitMachineConfigExport, true as _PackedSubmitMachineExport];

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
