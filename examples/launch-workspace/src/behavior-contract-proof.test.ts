import { describe, expect, it } from "vite-plus/test";

import { buildBehaviorContract } from "flow-state/inspect";

import { LaunchWorkspaceApp, launchWorkspaceStories } from "./launchWorkspaceAssembly";

describe("launch workspace behavior contract proof", () => {
  it("builds the Phase 1 behavior contract from the assembled launch workspace app", () => {
    const contract = buildBehaviorContract({
      app: LaunchWorkspaceApp,
      stories: [launchWorkspaceStories],
    });

    expect(contract.app.id).toBe(LaunchWorkspaceApp.id);
    expect(contract.app.moduleIds[0]).toBe("LaunchWorkspace");
    expect(contract.modules.some((module) => module.id === "LaunchWorkspace")).toBe(true);
    expect(contract.resources.some((resource) => resource.id === "launch.project")).toBe(true);
    expect(
      contract.transactions.some((transaction) => transaction.id === "launch.save-project"),
    ).toBe(true);
    expect(contract.machines.find((machine) => machine.id === "launch-workspace")?.states).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "ready" }),
        expect.objectContaining({ id: "runningAssistant" }),
        expect.objectContaining({ id: "requestingApproval" }),
      ]),
    );
    expect(contract.views.some((view) => view.id === "launch.workspace.summary")).toBe(true);
    expect(contract.stories.map((story) => story.id)).toEqual([
      "overview-ready",
      "assistant-running",
    ]);
  });
});
