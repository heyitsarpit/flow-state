import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

function requireSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("launch workspace typing architecture", () => {
  it("keeps the client shell helpers free of explicit library-shaped annotations", () => {
    const clientSource = requireSource("../app/LaunchWorkspaceClient.tsx");
    const shellSource = requireSource("./launchWorkspaceShell.tsx");
    const headerSource = requireSource("./launchWorkspaceHeader.tsx");
    const railSource = requireSource("./launchWorkspaceRail.tsx");
    const statusStripSource = requireSource("./launchWorkspaceRuntimeStatusStrip.tsx");

    expect(clientSource).not.toContain("FlowRuntime");
    expect(clientSource).not.toContain(": FlowRuntime");
    expect(shellSource).not.toContain(": FlowMachine");
    expect(shellSource).not.toContain(": FlowModuleDefinition");
    expect(headerSource).not.toContain(": FlowMachine");
    expect(railSource).not.toContain(": FlowMachine");
    expect(statusStripSource).not.toContain(": FlowMachine");
  });
});
