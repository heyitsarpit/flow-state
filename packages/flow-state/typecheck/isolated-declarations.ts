import { Context, Effect, Layer, Stream } from "effect";

import { createKey, createTag } from "flow-state";
import * as flow from "flow-state";
import type {
  FlowAppDefinition,
  FlowChildDefinition,
  FlowChildSnapshot,
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
  FlowTransactionBinding,
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

const packedTransactionCarrier: FlowTransactionBinding<WorkspaceEvent> = saveWorkspaceProject;
export const invalidPackedCommitCarrier: FlowTransactionBinding<WorkspaceEvent> = {
  ...packedTransactionCarrier,
  config: {
    id: packedTransactionCarrier.id,
    // @ts-expect-error packed identity carriers reject narrower commit callback shadows
    commit: (params: { readonly id: "project-1" }) => Effect.succeed(params.id),
  },
};
export const invalidPackedPreviewCarrier: FlowTransactionBinding<WorkspaceEvent> = {
  ...packedTransactionCarrier,
  config: {
    id: packedTransactionCarrier.id,
    // @ts-expect-error packed identity carriers reject narrower preview callback shadows
    preview: { apply: (_args: { readonly params: { readonly id: "project-1" } }) => [] },
  },
};
export const invalidPackedInvalidationCarrier: FlowTransactionBinding<WorkspaceEvent> = {
  ...packedTransactionCarrier,
  config: {
    id: packedTransactionCarrier.id,
    // @ts-expect-error packed identity carriers reject narrower invalidation callback shadows
    invalidates: (_args: { readonly params: { readonly id: "project-1" } }) => [],
  },
};
export const invalidPackedRouteCarrier: FlowTransactionBinding<WorkspaceEvent> = {
  ...packedTransactionCarrier,
  config: {
    id: packedTransactionCarrier.id,
    // @ts-expect-error packed identity carriers reject narrower route callback shadows
    routes: {
      success: (_args: { readonly value: { readonly id: "project-1" } }) => ({
        type: "SAVE_PROJECT",
      }),
    },
  },
};
export const invalidPackedQueueCarrier: FlowTransactionBinding<WorkspaceEvent> = {
  ...packedTransactionCarrier,
  config: {
    id: packedTransactionCarrier.id,
    // @ts-expect-error packed identity carriers reject narrower queue callback shadows
    queue: { when: (_args: { readonly context: WorkspaceContext }) => true },
  },
};

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
    limit: 4,
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
  limit: 4,
  // @ts-expect-error packed declarations preserve carried stream pressure keys
  key: (project: Readonly<{ readonly id: "project-1"; readonly title: string }>) => project.id,
};
const packedAfter = flow.after<"editing", WorkspaceContext, WorkspaceEvent>({
  id: "workspace.packed-after",
  delay: "1 second",
});
const invalidPackedAfterConfig: typeof packedAfter.config = {
  id: "workspace.invalid-packed-after",
  delay: "1 second",
  // @ts-expect-error packed timer guards preserve the full authored context family
  guard: ({ context }: { readonly context: { readonly activeProjectId: "project-1" } }) =>
    context.activeProjectId === "project-1",
};
void [
  true as _PackedCarriedStreamValueRouteArg,
  true as _PackedCoalescedPressureKeyArg,
  invalidPackedCarriedStreamRoutes,
  invalidPackedCoalescedPressure,
  invalidPackedAfterConfig,
];

const foreignContextTransaction = flow.transaction({
  id: "workspace.foreign-context-transaction",
  params: ({ context }: { readonly context: WorkspaceContext }) => ({
    id: context.activeProjectId,
  }),
  commit: () => Effect.void,
});
const invalidSubmitMachineConfig = {
  id: "workspace.invalid-submit-context",
  initial: "idle",
  context: () => ({ count: 0 }),
  states: {
    idle: {
      on: {
        SAVE_PROJECT: { submit: foreignContextTransaction },
      },
    },
  },
} satisfies FlowMachineConfig<
  "workspace.invalid-submit-context",
  { readonly count: number },
  WorkspaceEvent,
  "idle",
  "idle"
>;
const invalidRunMachineConfig = {
  id: "workspace.invalid-run-context",
  initial: "idle",
  context: () => ({ count: 0 }),
  states: {
    idle: { invoke: flow.run(foreignContextTransaction) },
  },
} satisfies FlowMachineConfig<
  "workspace.invalid-run-context",
  { readonly count: number },
  WorkspaceEvent,
  "idle",
  "idle"
>;
const invalidStreamMachineConfig = {
  id: "workspace.invalid-stream-context",
  initial: "idle",
  context: () => ({ count: 0 }),
  states: {
    idle: { invoke: workspaceProjectStream },
  },
} satisfies FlowMachineConfig<
  "workspace.invalid-stream-context",
  { readonly count: number },
  WorkspaceEvent,
  "idle",
  "idle"
>;
// @ts-expect-error isolated declarations reject foreign transaction submit context
flow.machine(invalidSubmitMachineConfig);
// @ts-expect-error isolated declarations reject foreign state-owned transaction context
flow.machine(invalidRunMachineConfig);
// @ts-expect-error isolated declarations reject foreign stream invoke context
flow.machine(invalidStreamMachineConfig);

const workspaceChildMachineConfigValue = {
  id: "workspace.child-machine",
  initial: "running",
  context: () => ({ count: 0 }),
  states: {
    running: {
      on: {
        COMPLETE: "done",
      },
    },
    done: {
      type: "final",
    },
  },
} satisfies FlowMachineConfig<
  "workspace.child-machine",
  { readonly count: number },
  Readonly<{ readonly type: "COMPLETE" }>,
  "running" | "done",
  "running"
>;

export const workspaceChildMachine: FlowMachine<
  { readonly count: number },
  Readonly<{ readonly type: "COMPLETE" }>,
  "running" | "done",
  "running",
  "workspace.child-machine"
> = flow.machine(workspaceChildMachineConfigValue);

export const workspaceChild: FlowChildDefinition<typeof workspaceChildMachine> = flow.child({
  id: "workspace.child",
  machine: workspaceChildMachine,
  supervision: "stop-on-failure",
});
type _PackedCarriedChildMachine = Expect<
  Equal<typeof workspaceChild.config.machine, typeof workspaceChildMachine>
>;
// @ts-expect-error packed declarations preserve carried child machine types
const invalidPackedChild: FlowChildDefinition<typeof workspaceChildMachine> = flow.child({
  id: "workspace.other-child",
  machine: flow.machine<{}, never, "idle">({
    id: "workspace.other-child-machine",
    initial: "idle",
    context: () => ({}),
    states: {
      idle: {},
    },
  }),
});
void [true as _PackedCarriedChildMachine, invalidPackedChild];

const workspaceChildParentMachineConfigValue = {
  id: "workspace.child-parent-machine",
  initial: "idle",
  context: () => ({ ready: false }),
  states: {
    idle: {
      invoke: workspaceChild,
    },
    done: {
      type: "final",
    },
  },
} satisfies FlowMachineConfig<
  "workspace.child-parent-machine",
  { readonly ready: boolean },
  never,
  "idle" | "done",
  "idle"
>;

const workspaceChildParentMachine = flow.machine(workspaceChildParentMachineConfigValue);
type _PackedCopiedChildInvoke = Expect<
  Equal<typeof workspaceChildParentMachine.config.states.idle.invoke, typeof workspaceChild>
>;
type _PackedCopiedChildInvokeMachine = Expect<
  Equal<
    typeof workspaceChildParentMachine.config.states.idle.invoke.config.machine,
    typeof workspaceChildMachine
  >
>;
void [true as _PackedCopiedChildInvoke, true as _PackedCopiedChildInvokeMachine];

const workspaceRunInvoke = flow.run(saveWorkspaceProject);
const workspaceMixedInvokeMachineConfigValue = {
  id: "workspace.mixed-invoke-machine",
  initial: "idle",
  context: () => ({ ready: false }),
  states: {
    idle: {
      invoke: [workspaceRunInvoke, workspaceChild],
    },
    done: {
      type: "final",
    },
  },
} satisfies FlowMachineConfig<
  "workspace.mixed-invoke-machine",
  { readonly ready: boolean },
  WorkspaceEvent,
  "idle" | "done",
  "idle"
>;

const workspaceMixedInvokeMachine = flow.machine(workspaceMixedInvokeMachineConfigValue);
type _PackedMixedInvokeTuple = Expect<
  typeof workspaceMixedInvokeMachine.config.states.idle.invoke extends readonly [
    typeof workspaceRunInvoke,
    typeof workspaceChild,
  ]
    ? true
    : false
>;
type _PackedMixedInvokeRun = Expect<
  (typeof workspaceMixedInvokeMachine.config.states.idle.invoke)[0] extends typeof workspaceRunInvoke
    ? true
    : false
>;
type _PackedMixedInvokeChild = Expect<
  (typeof workspaceMixedInvokeMachine.config.states.idle.invoke)[1] extends typeof workspaceChild
    ? true
    : false
>;
void [
  true as _PackedMixedInvokeTuple,
  true as _PackedMixedInvokeRun,
  true as _PackedMixedInvokeChild,
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

const workspaceRuntime = flow.runtime(workspaceAppLayer);
const workspaceChildParentActor = workspaceRuntime.createActor(workspaceChildParentMachine);
const workspaceStartedChildParentActor = workspaceRuntime.orchestrators.start(
  workspaceChildParentMachine,
  {
    id: "workspace.child-parent-started",
  },
);
const workspaceAttachedChildParentLease = workspaceRuntime.orchestrators.attach(
  workspaceChildParentMachine,
  {
    id: "workspace.child-parent-attached",
    policy: "keep-alive",
  },
);
type _PackedRuntimeActorRetryChildParams = Expect<
  Equal<Parameters<typeof workspaceChildParentActor.retryChild>, [id: string]>
>;
type _PackedRuntimeActorRetryChildResult = Expect<
  Equal<ReturnType<typeof workspaceChildParentActor.retryChild>, boolean>
>;
type _PackedRuntimeActorChildrenResult = Expect<
  Equal<
    ReturnType<typeof workspaceChildParentActor.children>,
    Readonly<Record<string, FlowChildSnapshot>>
  >
>;
type _PackedRuntimeActorChildrenReadAliasesMatch = Expect<
  Equal<
    ReturnType<typeof workspaceChildParentActor.children>,
    ReturnType<typeof workspaceChildParentActor.getSnapshot>["children"]
  >
>;
type _PackedRuntimeActorChildStatus = Expect<
  Equal<
    ReturnType<typeof workspaceChildParentActor.children>[string]["status"],
    FlowChildSnapshot["status"]
  >
>;
type _PackedRuntimeActorChildSupervision = Expect<
  Equal<
    ReturnType<typeof workspaceChildParentActor.children>[string]["supervision"],
    FlowChildSnapshot["supervision"]
  >
>;
type _PackedRuntimeActorChildSnapshot = Expect<
  Equal<
    ReturnType<typeof workspaceChildParentActor.children>[string]["snapshot"],
    FlowChildSnapshot["snapshot"]
  >
>;
type _PackedStartedActorChildrenResult = Expect<
  Equal<
    ReturnType<typeof workspaceStartedChildParentActor.children>,
    Readonly<Record<string, FlowChildSnapshot>>
  >
>;
type _PackedStartedActorChildrenReadAliasesMatch = Expect<
  Equal<
    ReturnType<typeof workspaceStartedChildParentActor.children>,
    ReturnType<typeof workspaceStartedChildParentActor.getSnapshot>["children"]
  >
>;
type _PackedStartedActorRetryChildParams = Expect<
  Equal<Parameters<typeof workspaceStartedChildParentActor.retryChild>, [id: string]>
>;
type _PackedStartedActorRetryChildResult = Expect<
  Equal<ReturnType<typeof workspaceStartedChildParentActor.retryChild>, boolean>
>;
type _PackedStartedActorChildStatus = Expect<
  Equal<
    ReturnType<typeof workspaceStartedChildParentActor.children>[string]["status"],
    FlowChildSnapshot["status"]
  >
>;
type _PackedStartedActorChildSupervision = Expect<
  Equal<
    ReturnType<typeof workspaceStartedChildParentActor.children>[string]["supervision"],
    FlowChildSnapshot["supervision"]
  >
>;
type _PackedStartedActorChildSnapshot = Expect<
  Equal<
    ReturnType<typeof workspaceStartedChildParentActor.children>[string]["snapshot"],
    FlowChildSnapshot["snapshot"]
  >
>;
type _PackedAttachedActorRetryChildParams = Expect<
  Equal<
    Parameters<Awaited<typeof workspaceAttachedChildParentLease>["actor"]["retryChild"]>,
    [id: string]
  >
>;
type _PackedAttachedActorRetryChildResult = Expect<
  Equal<
    ReturnType<Awaited<typeof workspaceAttachedChildParentLease>["actor"]["retryChild"]>,
    boolean
  >
>;
type _PackedAttachedActorReleaseParams = Expect<
  Equal<Parameters<Awaited<typeof workspaceAttachedChildParentLease>["release"]>, []>
>;
type _PackedAttachedActorReleaseResult = Expect<
  Equal<ReturnType<Awaited<typeof workspaceAttachedChildParentLease>["release"]>, Promise<void>>
>;
type _PackedAttachedActorChildrenResult = Expect<
  Equal<
    ReturnType<Awaited<typeof workspaceAttachedChildParentLease>["actor"]["children"]>,
    Readonly<Record<string, FlowChildSnapshot>>
  >
>;
type _PackedAttachedActorChildrenReadAliasesMatch = Expect<
  Equal<
    ReturnType<Awaited<typeof workspaceAttachedChildParentLease>["actor"]["children"]>,
    ReturnType<
      Awaited<typeof workspaceAttachedChildParentLease>["actor"]["getSnapshot"]
    >["children"]
  >
>;
type _PackedAttachedActorChildStatus = Expect<
  Equal<
    ReturnType<
      Awaited<typeof workspaceAttachedChildParentLease>["actor"]["children"]
    >[string]["status"],
    FlowChildSnapshot["status"]
  >
>;
type _PackedAttachedActorChildSupervision = Expect<
  Equal<
    ReturnType<
      Awaited<typeof workspaceAttachedChildParentLease>["actor"]["children"]
    >[string]["supervision"],
    FlowChildSnapshot["supervision"]
  >
>;
type _PackedAttachedActorChildSnapshot = Expect<
  Equal<
    ReturnType<
      Awaited<typeof workspaceAttachedChildParentLease>["actor"]["children"]
    >[string]["snapshot"],
    FlowChildSnapshot["snapshot"]
  >
>;
void [
  true as _PackedRuntimeActorRetryChildParams,
  true as _PackedRuntimeActorRetryChildResult,
  true as _PackedRuntimeActorChildrenResult,
  true as _PackedRuntimeActorChildrenReadAliasesMatch,
  true as _PackedRuntimeActorChildStatus,
  true as _PackedRuntimeActorChildSupervision,
  true as _PackedRuntimeActorChildSnapshot,
  true as _PackedStartedActorChildrenResult,
  true as _PackedStartedActorChildrenReadAliasesMatch,
  true as _PackedStartedActorRetryChildParams,
  true as _PackedStartedActorRetryChildResult,
  true as _PackedStartedActorChildStatus,
  true as _PackedStartedActorChildSupervision,
  true as _PackedStartedActorChildSnapshot,
  true as _PackedAttachedActorRetryChildParams,
  true as _PackedAttachedActorRetryChildResult,
  true as _PackedAttachedActorReleaseParams,
  true as _PackedAttachedActorReleaseResult,
  true as _PackedAttachedActorChildrenResult,
  true as _PackedAttachedActorChildrenReadAliasesMatch,
  true as _PackedAttachedActorChildStatus,
  true as _PackedAttachedActorChildSupervision,
  true as _PackedAttachedActorChildSnapshot,
];

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
