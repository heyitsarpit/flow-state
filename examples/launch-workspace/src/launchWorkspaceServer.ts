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
    // The hardened decoder uses null-prototype records internally. Materialize
    // the already validated JSON data as ordinary host objects before crossing
    // the React Server Component transport boundary.
    return structuredClone(runtime.dehydrateBoot());
  });
}

export type LaunchWorkspaceBoot = Awaited<ReturnType<typeof createLaunchWorkspaceRequestBoot>>;
