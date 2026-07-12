import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Type extends true> = Type;
type LaunchWorkspaceAppType = typeof import("./launchWorkspaceAssembly").LaunchWorkspaceApp;
type LaunchWorkspaceModuleTuple = import("./launchWorkspaceAssembly").LaunchWorkspaceModuleTuple;
type ExpectedLaunchWorkspaceModules = readonly [
  typeof import("./launchWorkspaceAssembly").LaunchWorkspaceModule,
  typeof import("./launchWorkspaceSupport").Session,
  typeof import("./launchWorkspaceViews").Launch,
  typeof import("./launchWorkspaceProject").Project,
  typeof import("./launchWorkspaceSupport").Checklist,
  typeof import("./launchWorkspaceSupport").Readiness,
  typeof import("./launchWorkspaceSupport").Assets,
  typeof import("./launchWorkspaceApproval").Approval,
  typeof import("./launchWorkspaceAssistant").Assistant,
  typeof import("./launchWorkspaceChat").Chat,
  typeof import("./launchWorkspaceViews").Trace,
];
type _LaunchWorkspaceModulesKeepsExpectedTuple = Expect<
  Equal<LaunchWorkspaceModuleTuple, ExpectedLaunchWorkspaceModules>
>;
type _LaunchWorkspaceAppKeepsExactModules = Expect<
  Equal<LaunchWorkspaceAppType["modules"], LaunchWorkspaceModuleTuple>
>;
void [
  true as _LaunchWorkspaceModulesKeepsExpectedTuple,
  true as _LaunchWorkspaceAppKeepsExactModules,
];

function requireSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("launch workspace typing architecture", () => {
  it("bans the package-owned flow object import form from the flagship example", () => {
    const approvalSource = requireSource("./launchWorkspaceApproval.ts");
    const assistantSource = requireSource("./launchWorkspaceAssistant.ts");
    const chatSource = requireSource("./launchWorkspaceChat.ts");
    const debugSource = requireSource("./launchWorkspaceDebug.ts");
    const streamsSource = requireSource("./launchWorkspaceStreams.ts");
    const viewsSource = requireSource("./launchWorkspaceViews.ts");
    const assemblySource = requireSource("./launchWorkspaceAssembly.ts");

    for (const source of [
      approvalSource,
      assistantSource,
      chatSource,
      debugSource,
      streamsSource,
      viewsSource,
      assemblySource,
    ]) {
      expect(source).not.toContain('import { flow } from "flow-state";');
    }

    expect(approvalSource).toContain('import * as flow from "flow-state";');
    expect(chatSource).toContain('import * as flow from "flow-state";');
    expect(assemblySource).toContain('import * as flow from "flow-state";');
  });

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
    expect(assemblySource).not.toContain("type LaunchWorkspaceModuleInventory = Readonly<{");
    expect(assemblySource).not.toContain(": FlowGraphDescriptor<");
    expect(assemblySource).not.toContain(": FlowTraceDescriptor<");
    expect(assemblySource).not.toContain(": FlowReplayDescriptor<");
    expect(assemblySource).not.toContain(": FlowModelDescriptor<");
    expect(assemblySource).not.toContain(": FlowStoriesDescriptor<");
    expect(assemblySource).not.toContain("type LaunchWorkspaceDescriptor = Readonly<{");
    expect(assemblySource).toContain("flow.app(");
    expect(assemblySource).not.toContain("type LaunchWorkspaceAppContract = FlowAppDefinition;");
    expect(assemblySource).toContain("export type LaunchWorkspaceModuleTuple = readonly [");
    expect(assemblySource).toContain(
      "export const LaunchWorkspaceApp: FlowAppDefinition<LaunchWorkspaceModuleTuple> = flow.app({",
    );
    expect(assemblySource).toContain("modules: launchWorkspaceModules");
  });
});
