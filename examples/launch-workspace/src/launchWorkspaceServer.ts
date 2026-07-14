import { withRequestRuntime } from "flow-state/server";
import type { FlowRuntimeBootPayload } from "flow-state/server";

import { LaunchWorkspaceAppLayer } from "./launchWorkspaceAssembly";
import { launchWorkspacePortableSeed } from "./launchWorkspaceResources";

export async function createLaunchWorkspaceRequestBoot(): Promise<FlowRuntimeBootPayload> {
  return withRequestRuntime(LaunchWorkspaceAppLayer, async (runtime) => {
    // Boot v1 rejects live Redacted wrappers, so the server carries only the
    // explicitly portable resource subset. The client-owned actor loads the
    // approval resource after commit inside its own runtime.
    runtime.resources.seedResources(launchWorkspacePortableSeed);
    return runtime.dehydrateBoot();
  });
}

export type LaunchWorkspaceBoot = Awaited<ReturnType<typeof createLaunchWorkspaceRequestBoot>>;
