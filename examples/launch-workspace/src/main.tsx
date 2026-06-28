import { createRoot } from "react-dom/client";

import { FlowProvider } from "@flow-state/core";

import { launchRuntime, launchWorkspaceSeed } from "./launchWorkspace";
import { LaunchWorkspaceShell } from "./launchWorkspaceShell";
import "./styles.css";

const root = document.getElementById("root");

if (root !== null) {
  launchRuntime.resources.seedResources(launchWorkspaceSeed);
  createRoot(root).render(
    <FlowProvider runtime={launchRuntime}>
      <LaunchWorkspaceShell />
    </FlowProvider>,
  );
}
