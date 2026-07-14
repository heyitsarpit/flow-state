import * as flow from "flow-state";

import { LaunchWorkspaceAppLayer } from "./launchWorkspaceAssembly";

export function createLaunchWorkspaceBrowserRuntime() {
  return flow.runtime(LaunchWorkspaceAppLayer);
}
