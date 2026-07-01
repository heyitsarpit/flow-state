import { Effect } from "effect";

import { createKey, flow } from "@flow-state/core";
import { captureTrace, flowStories, graphOf, replayTrace } from "@flow-state/inspect";
import type {
  FlowGraphDescriptor,
  FlowReplayDescriptor,
  FlowStoriesDescriptor,
  FlowTraceDescriptor,
} from "@flow-state/inspect";
import { FlowProvider } from "@flow-state/react";
import type { FlowProviderProps } from "@flow-state/react";
import { withRequestRuntime } from "@flow-state/server";
import type { FlowRuntimeBootPayload } from "@flow-state/server";
import { test } from "@flow-state/testing";
import type { FlowModelDescriptor } from "@flow-state/testing";

// @ts-expect-error server boot payload types live on @flow-state/server
import type { FlowRuntimeBootPayload as _RootBootPayload } from "@flow-state/core";
// @ts-expect-error inspect artifact types live on @flow-state/inspect
import type { FlowTraceDescriptor as _RootTraceDescriptor } from "@flow-state/core";
// @ts-expect-error testing harness types live on @flow-state/testing
import type { FlowModelDescriptor as _RootModelDescriptor } from "@flow-state/core";

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

export const workspaceProject = flow.resource({
  id: "workspace.project",
  key: (id: string) => createKey("workspace", "project", id),
  lookup: (id: string) =>
    Effect.succeed({
      id,
      title: `Project ${id}`,
    }),
});

export const workspaceMachine = flow.machine({
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

const workspaceAppLayer = flow
  .app({
    modules: [],
  })
  .layer({
    store: flow.store.memory(),
    orchestrators: flow.orchestrators.live(),
  });

export const WorkspaceProvider = FlowProvider;

export type WorkspaceProviderContract = FlowProviderProps;
export type WorkspaceGraphContract = FlowGraphDescriptor<typeof workspaceMachine>;
export type WorkspaceTraceContract = FlowTraceDescriptor<
  ReturnType<typeof workspaceMachine.getInitialSnapshot>,
  Readonly<{ readonly includeSnapshots: true }>
>;
export type WorkspaceReplayContract = FlowReplayDescriptor<
  typeof workspaceMachine,
  WorkspaceTraceContract
>;
export type WorkspaceStoriesContract = FlowStoriesDescriptor<typeof workspaceMachine>;
export type WorkspaceModelContract = FlowModelDescriptor<typeof workspaceMachine>;

export const workspaceGraph = graphOf(workspaceMachine);

export const workspaceTrace = captureTrace(workspaceMachine.getInitialSnapshot(), {
  includeSnapshots: true,
});

export const workspaceReplay = replayTrace(workspaceMachine, workspaceTrace);

export const workspaceStories = flowStories(workspaceMachine, [
  {
    title: "Atlas",
  },
]);

const workspaceModel = test.model(workspaceMachine);
export const workspaceModelKind: FlowModelDescriptor<typeof workspaceMachine>["kind"] =
  workspaceModel.kind;

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
