import { withRequestRuntime } from "flow-state/server";
import type { FlowRuntimeBootPayload } from "flow-state/server";

import {
  LaunchWorkspaceAppLayer,
  launchWorkspaceActorId,
  launchWorkspaceMachine,
} from "./launchWorkspaceAssembly";
import { launchWorkspaceSeed } from "./launchWorkspaceResources";

export async function createLaunchWorkspaceRequestBoot(): Promise<FlowRuntimeBootPayload> {
  return withRequestRuntime(LaunchWorkspaceAppLayer, async (runtime) => {
    runtime.resources.seedResources(launchWorkspaceSeed);

    const actor = runtime.createActor(launchWorkspaceMachine, {
      id: launchWorkspaceActorId,
    });
    await actor.flush();

    return runtime.dehydrateBoot({ actors: [actor] });
  });
}

export type LaunchWorkspaceBoot = Awaited<ReturnType<typeof createLaunchWorkspaceRequestBoot>>;
