import { LaunchWorkspaceApp, LaunchWorkspaceModule, Project } from "../../src/launchWorkspace";

import type { OutputWriter } from "./output-writer";

export async function collectInventoryOutputs(writer: OutputWriter): Promise<void> {
  await writer.writeJson(
    "inventory/LaunchWorkspaceModule.inventory.json",
    LaunchWorkspaceModule.inventory(),
    "inventory",
    "LaunchWorkspaceModule.inventory",
    "Module-level inventory shape from the flagship example.",
  );
  await writer.writeJson(
    "inventory/LaunchWorkspaceApp.inventory.json",
    LaunchWorkspaceApp.inventory(),
    "inventory",
    "LaunchWorkspaceApp.inventory",
    "App-level inventory shape consumed by behavior composition and harness tooling.",
  );
  await writer.writeJson(
    "inventory/Project.inventory.json",
    Project.inventory(),
    "inventory",
    "Project.inventory",
    "Smaller module inventory example.",
  );
}
