import { Effect } from "effect";

import * as flowCore from "flow-state";
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

type WorkspaceProject = Readonly<{
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

export const workspaceGraph = graphOf(workspaceMachine);

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

const workspaceModel = test.model(workspaceMachine);
export const workspaceModelKind: FlowModelDescriptor<typeof workspaceMachine>["kind"] =
  workspaceModel.kind;

export async function createWorkspaceStoryTest(): Promise<
  FlowStoryTestReport<typeof workspaceMachine>
> {
  return storyToTest(await runFlowStory(workspaceMachine, workspaceStories.stories[0]!));
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
