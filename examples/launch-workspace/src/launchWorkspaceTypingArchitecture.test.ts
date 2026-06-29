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

  it("keeps feature module manifests free of inventory wrapper types", () => {
    const approvalSource = requireSource("./launchWorkspaceApproval.ts");
    const assistantSource = requireSource("./launchWorkspaceAssistant.ts");
    const chatSource = requireSource("./launchWorkspaceChat.ts");
    const projectSource = requireSource("./launchWorkspaceProject.ts");
    const supportSource = requireSource("./launchWorkspaceSupport.ts");

    expect(approvalSource).not.toContain("type ApprovalInventory = Readonly<{");
    expect(assistantSource).not.toContain("type AssistantInventory = Readonly<{");
    expect(chatSource).not.toContain("type ChatInventory = Readonly<{");
    expect(projectSource).not.toContain("type ProjectInventory = Readonly<{");
    expect(supportSource).not.toContain("type ChecklistInventory = Readonly<{");
    expect(supportSource).not.toContain("type AssetsInventory = Readonly<{");

    expect(approvalSource).not.toContain(": FlowModuleDefinition<");
    expect(assistantSource).not.toContain(": FlowModuleDefinition<");
    expect(chatSource).not.toContain(": FlowModuleDefinition<");
    expect(projectSource).not.toContain(": FlowModuleDefinition<");
    expect(supportSource).not.toContain(": FlowModuleDefinition<");
  });

  it("keeps exported launch descriptors inference-first instead of pinning Flow definitions", () => {
    const assemblySource = requireSource("./launchWorkspaceAssembly.ts");
    const projectSource = requireSource("./launchWorkspaceProject.ts");
    const assistantSource = requireSource("./launchWorkspaceAssistant.ts");
    const chatSource = requireSource("./launchWorkspaceChat.ts");

    expect(projectSource).not.toContain(": FlowTransactionDefinition<");
    expect(assistantSource).not.toContain(": FlowChildDefinition<");
    expect(assistantSource).not.toContain(": FlowMachine<");
    expect(chatSource).not.toContain("): FlowMachine<");
    expect(chatSource).not.toContain(": FlowMachine<");

    expect(assemblySource).not.toContain(": FlowTransactionDefinition<");
    expect(assemblySource).not.toContain(": FlowViewDefinition<");
    expect(assemblySource).not.toContain(": FlowMachine<");
    expect(assemblySource).not.toContain(": FlowModuleDefinition<");
    expect(assemblySource).not.toContain("type LaunchWorkspaceModules = readonly [");
    expect(assemblySource).not.toContain("type LaunchWorkspaceAppModules = readonly [");
    expect(assemblySource).not.toContain(": LaunchWorkspaceModules = [");
    expect(assemblySource).not.toContain("type LaunchWorkspaceAppLayer = ReturnType<");
    expect(assemblySource).not.toContain(": LaunchWorkspaceAppLayer =");
    expect(assemblySource).not.toContain("modules: launchWorkspaceModules");
    expect(assemblySource).not.toContain("type LaunchWorkspaceModuleInventory = Readonly<{");
    expect(assemblySource).not.toContain(": FlowGraphDescriptor<");
    expect(assemblySource).not.toContain(": FlowTraceDescriptor<");
    expect(assemblySource).not.toContain(": FlowReplayDescriptor<");
    expect(assemblySource).not.toContain(": FlowModelDescriptor<");
    expect(assemblySource).not.toContain(": FlowStoriesDescriptor<");
    expect(assemblySource).not.toContain("type LaunchWorkspaceDescriptor = Readonly<{");
    expect(assemblySource).toContain("flow.app(");
  });
});
