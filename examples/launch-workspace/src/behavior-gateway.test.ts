import { describe, expect, it } from "vite-plus/test";

import { BehaviorGateway } from "./app/behavior";
import { LaunchWorkspaceApp, launchWorkspaceStories } from "./launchWorkspaceAssembly";

describe("launch workspace behavior gateway", () => {
  it("keeps the behavior gateway explicit and rooted in the assembled app", () => {
    expect(BehaviorGateway.app).toBe(LaunchWorkspaceApp);
    expect(BehaviorGateway.stories).toEqual([launchWorkspaceStories]);
  });
});
