import { Effect, Stream } from "effect";

import * as flowCore from "flow-state";
import type { FlowMachine, FlowMachineConfig } from "flow-state";
import { analyzeTrace, captureTrace, flowStories, graphOf, storyToDoc } from "flow-state/inspect";
import type {
  FlowGraphDescriptor,
  FlowStoryDocDescriptor,
  FlowStoriesDescriptor,
  FlowTraceAnalysisDescriptor,
  FlowTraceDescriptor,
} from "flow-state/inspect";
import { FlowProvider } from "flow-state/react";
import type { FlowProviderProps } from "flow-state/react";
import { withRequestRuntime } from "flow-state/server";
import type { FlowRuntimeBootPayload } from "flow-state/server";
import { runFlowStory, storyToTest, test } from "flow-state/testing";
import type { FlowModelDescriptor, FlowStoryTestReport } from "flow-state/testing";

// @ts-expect-error server boot payload types live on flow-state/server
import type { FlowRuntimeBootPayload as _RootBootPayload } from "flow-state";
// @ts-expect-error inspect artifact types live on flow-state/inspect
import type { FlowTraceDescriptor as _RootTraceDescriptor } from "flow-state";
// @ts-expect-error testing harness types live on flow-state/testing
import type { FlowModelDescriptor as _RootModelDescriptor } from "flow-state";
// @ts-expect-error private implementation modules are not packed public entry points
import type { FlowRuntime as _PrivateRuntime } from "flow-state/core/api/types";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Type extends true> = Type;

type WorkspaceProject = Readonly<{
  readonly id: string;
  readonly title: string;
}>;

type WorkspaceSaveParams = Readonly<{
  readonly id: string;
  readonly title: string;
}>;

type WorkspaceContext = Readonly<{
  readonly projectId: string;
  readonly title: string;
}>;

type WorkspaceEvent =
  | Readonly<{ readonly type: "SAVE_PROJECT" }>
  | Readonly<{ readonly type: "PROJECT_SAVED"; readonly value: WorkspaceProject }>;

export const workspaceProject = flowCore.resource({
  id: "workspace.project",
  key: (id: string) => flowCore.createKey("workspace", "project", id),
  lookup: (id: string) =>
    Effect.succeed({
      id,
      title: `Project ${id}`,
    }),
});

export const typedWorkspaceProject = flowCore.resource({
  id: "workspace.typed-project",
  key: (id: "project-1") => flowCore.createKey("workspace", "typed-project", id),
  lookup: (id: "project-1") =>
    Effect.succeed({
      id,
      title: `Project ${id}`,
    } satisfies WorkspaceProject),
  placeholder: (id: "project-1") => ({
    id,
    title: "Loading",
  }),
});
// @ts-expect-error packed declarations preserve directional resource ref params
typedWorkspaceProject.ref("project-2");

export const saveWorkspaceProject = flowCore.transaction<
  WorkspaceSaveParams,
  WorkspaceProject,
  never,
  never,
  WorkspaceEvent,
  "workspace.save-project"
>({
  id: "workspace.save-project",
  params: ({ context }: { readonly context: WorkspaceContext }) => ({
    id: context.projectId,
    title: context.title,
  }),
  commit: ({ id, title }) =>
    Effect.succeed({
      id,
      title,
    }),
  routes: flowCore.outcomes<WorkspaceProject, never, WorkspaceEvent>({
    success: ({ value }) => ({ type: "PROJECT_SAVED", value }),
  }),
});

export const workspaceProjectStream: flowCore.FlowStreamDefinition<
  WorkspaceProject,
  never,
  string,
  WorkspaceEvent,
  WorkspaceContext,
  "workspace.project-stream",
  never
> = flowCore.stream({
  id: "workspace.project-stream",
  params: ({ context }: { readonly context: WorkspaceContext }) => context.projectId,
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

export const workspaceMachine = flowCore.machine({
  id: "workspace.machine",
  initial: "idle",
  context: () => ({
    projectId: "project-1",
    title: "Atlas",
  }),
  states: {
    idle: {
      on: {
        SAVE_PROJECT: {
          target: "saved",
          actions: [
            ({ context }: { readonly context: WorkspaceContext }) =>
              ({
                type: "PROJECT_SAVED",
                value: {
                  id: context.projectId,
                  title: context.title,
                },
              }) satisfies WorkspaceEvent,
          ],
        },
      },
    },
    saved: {},
  },
});

const workspaceSubmitMachineConfigValue = {
  id: "workspace.submit-machine",
  initial: "editing",
  context: () => ({
    projectId: "project-1",
    title: "Atlas",
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
      invoke: flowCore.run(saveWorkspaceProject),
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

export const workspaceSubmitMachine: FlowMachine<
  WorkspaceContext,
  WorkspaceEvent,
  "editing" | "saving",
  "editing",
  "workspace.submit-machine"
> = flowCore.machine(workspaceSubmitMachineConfigValue);

const workspaceAppLayer = flowCore
  .app({
    modules: [],
  })
  .layer({
    store: flowCore.store.memory(),
    orchestrators: flowCore.orchestrators.live(),
    services: [],
  });

export const WorkspaceProvider = FlowProvider;

export type WorkspaceProviderContract = FlowProviderProps;
export type WorkspaceGraphContract = FlowGraphDescriptor<typeof workspaceMachine>;
export type WorkspaceTraceContract = FlowTraceDescriptor<
  ReturnType<typeof workspaceMachine.getInitialSnapshot>,
  Readonly<{ readonly includeSnapshots: true }>
>;
export type WorkspaceAnalysisContract = FlowTraceAnalysisDescriptor<
  typeof workspaceMachine,
  WorkspaceTraceContract
>;
export type WorkspaceStoriesContract = FlowStoriesDescriptor<typeof workspaceMachine>;
export type WorkspaceStoryDocContract = FlowStoryDocDescriptor<typeof workspaceMachine>;
export type WorkspaceModelContract = FlowModelDescriptor<typeof workspaceMachine>;
export type WorkspaceStoryTestContract = FlowStoryTestReport<typeof workspaceMachine>;
export type WorkspaceSubmitStoriesContract = FlowStoriesDescriptor<typeof workspaceSubmitMachine>;
export type WorkspaceSubmitStoryDocContract = FlowStoryDocDescriptor<typeof workspaceSubmitMachine>;
export type WorkspaceSubmitModelContract = FlowModelDescriptor<typeof workspaceSubmitMachine>;
export type WorkspaceSubmitStoryTestContract = FlowStoryTestReport<typeof workspaceSubmitMachine>;

export const workspaceGraph = graphOf(workspaceMachine);
export const workspaceSubmitGraph = graphOf(workspaceSubmitMachine);

export const workspaceTrace = captureTrace(workspaceMachine.getInitialSnapshot(), {
  includeSnapshots: true as const,
});

export const workspaceAnalysis: WorkspaceAnalysisContract = analyzeTrace(
  workspaceMachine,
  workspaceTrace,
);

export const workspaceStories = flowStories(workspaceMachine, [
  {
    id: "save-project",
    title: "Save project",
    description: "Persist the seeded Atlas workspace project.",
    events: [{ type: "SAVE_PROJECT" }],
    expectedState: "saved",
    tags: ["docs", "workspace"],
  },
]);
export const workspaceStoryDoc = storyToDoc(workspaceStories.stories[0]!);
export const workspaceSubmitStories = flowStories(workspaceSubmitMachine, [
  {
    id: "submit-project",
    title: "Submit project",
    description: "Persist the seeded Atlas workspace project through submit bindings.",
    events: [{ type: "SAVE_PROJECT" }],
    expectedState: "editing",
    tags: ["docs", "workspace"],
  },
]);
export const workspaceSubmitStoryDoc = storyToDoc(workspaceSubmitStories.stories[0]!);

const workspaceModel = test.model(workspaceMachine);
export const workspaceModelKind: FlowModelDescriptor<typeof workspaceMachine>["kind"] =
  workspaceModel.kind;
const workspaceSubmitModel = test.model(workspaceSubmitMachine);
export const workspaceSubmitModelKind: FlowModelDescriptor<typeof workspaceSubmitMachine>["kind"] =
  workspaceSubmitModel.kind;

type _PackedRootImportPreservesResourceParams = Expect<
  Equal<Parameters<typeof workspaceProject.ref>, [id: string]>
>;
type _PackedRootImportPreservesDirectionalResourceParams = Expect<
  Equal<Parameters<typeof typedWorkspaceProject.ref>, [id: "project-1"]>
>;
type _PackedInspectImportPreservesGraphMachine = Expect<
  Equal<typeof workspaceGraph, FlowGraphDescriptor<typeof workspaceMachine>>
>;
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
type _PackedInspectImportPreservesSubmitGraphMachine = Expect<
  Equal<typeof workspaceSubmitGraph, FlowGraphDescriptor<typeof workspaceSubmitMachine>>
>;
type _PackedReactImportPreservesProvider = Expect<
  Equal<typeof WorkspaceProvider, typeof FlowProvider>
>;
type _PackedServerImportPreservesBootPayload = Expect<
  Equal<Awaited<ReturnType<typeof createWorkspaceBoot>>, FlowRuntimeBootPayload>
>;
type _PackedTestingImportPreservesModelKind = Expect<
  Equal<typeof workspaceModelKind, FlowModelDescriptor<typeof workspaceMachine>["kind"]>
>;
type _PackedTestingImportPreservesSubmitModelKind = Expect<
  Equal<typeof workspaceSubmitModelKind, FlowModelDescriptor<typeof workspaceSubmitMachine>["kind"]>
>;
type _PackedTestingImportPreservesSubmitStories = Expect<
  Equal<typeof workspaceSubmitStories, FlowStoriesDescriptor<typeof workspaceSubmitMachine>>
>;
type _PackedTestingImportPreservesSubmitStoryTest = Expect<
  Equal<
    Awaited<ReturnType<typeof createWorkspaceSubmitStoryTest>>,
    FlowStoryTestReport<typeof workspaceSubmitMachine>
  >
>;
void [
  true as _PackedRootImportPreservesResourceParams,
  true as _PackedRootImportPreservesDirectionalResourceParams,
  true as _PackedInspectImportPreservesGraphMachine,
  true as _PackedSubmitBindingPreservesTransaction,
  true as _PackedRunBindingPreservesTransaction,
  true as _PackedInspectImportPreservesSubmitGraphMachine,
  true as _PackedReactImportPreservesProvider,
  true as _PackedServerImportPreservesBootPayload,
  true as _PackedTestingImportPreservesModelKind,
  true as _PackedTestingImportPreservesSubmitModelKind,
  true as _PackedTestingImportPreservesSubmitStories,
  true as _PackedTestingImportPreservesSubmitStoryTest,
];

export async function createWorkspaceStoryTest(): Promise<
  FlowStoryTestReport<typeof workspaceMachine>
> {
  return storyToTest(await runFlowStory(workspaceMachine, workspaceStories.stories[0]!));
}

export async function createWorkspaceSubmitStoryTest(): Promise<
  FlowStoryTestReport<typeof workspaceSubmitMachine>
> {
  return storyToTest(
    await runFlowStory(workspaceSubmitMachine, workspaceSubmitStories.stories[0]!),
  );
}

export async function createWorkspaceBoot(): Promise<FlowRuntimeBootPayload> {
  return withRequestRuntime(workspaceAppLayer, async (runtime) => {
    runtime.resources.seedResources([
      {
        ref: workspaceProject.ref("project-1"),
        value: {
          id: "project-1",
          title: "Atlas",
        },
      },
    ]);

    return runtime.dehydrateBoot();
  });
}
