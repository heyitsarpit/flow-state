import { describe, expect, it } from "vite-plus/test";

import {
  Approval as LaunchWorkspaceApproval,
  Assistant as LaunchWorkspaceAssistant,
  Chat as LaunchWorkspaceChat,
  Assets as LaunchWorkspaceAssets,
  Checklist as LaunchWorkspaceChecklist,
  createLaunchWorkspaceBrowserRuntime as createLaunchWorkspaceRootBrowserRuntime,
  createLaunchWorkspaceTestRuntime as createLaunchWorkspaceRootTestRuntime,
  Launch as LaunchWorkspaceLaunch,
  LaunchWorkspaceApp as LaunchWorkspaceRootApp,
  LaunchWorkspaceModule as LaunchWorkspaceRootModule,
  Readiness as LaunchWorkspaceReadiness,
  Session as LaunchWorkspaceSession,
  Trace as LaunchWorkspaceTrace,
  assistantChild as launchWorkspaceAssistantChild,
  createChatComposer as launchWorkspaceCreateChatComposer,
  chatLifecycleView as launchWorkspaceChatLifecycleView,
  launchWorkspaceMachine as launchWorkspaceRootMachine,
  launchWorkspaceView as launchWorkspaceRootView,
} from "./launchWorkspace";
import { Approval } from "./launchWorkspaceApproval";
import {
  LaunchWorkspaceApp,
  LaunchWorkspaceModule,
  createLaunchWorkspaceBrowserRuntime,
  createLaunchWorkspaceTestRuntime,
  launchWorkspaceMachine,
  launchWorkspaceView,
} from "./launchWorkspaceAssembly";
import { Assistant, assistantChild } from "./launchWorkspaceAssistant";
import { Chat, createChatComposer, chatLifecycleView } from "./launchWorkspaceChat";
import { Assets, Checklist, Readiness, Session } from "./launchWorkspaceSupport";
import { Launch, Trace } from "./launchWorkspaceViews";

describe("launch workspace module ownership", () => {
  it("re-exports dedicated feature modules from their owned files", () => {
    expect(LaunchWorkspaceApproval).toBe(Approval);
    expect(LaunchWorkspaceAssistant).toBe(Assistant);
    expect(LaunchWorkspaceAssets).toBe(Assets);
    expect(launchWorkspaceAssistantChild).toBe(assistantChild);
    expect(LaunchWorkspaceChat).toBe(Chat);
    expect(LaunchWorkspaceChecklist).toBe(Checklist);
    expect(launchWorkspaceCreateChatComposer).toBe(createChatComposer);
    expect(launchWorkspaceChatLifecycleView).toBe(chatLifecycleView);
    expect(LaunchWorkspaceLaunch).toBe(Launch);
    expect(LaunchWorkspaceRootApp).toBe(LaunchWorkspaceApp);
    expect(LaunchWorkspaceRootModule).toBe(LaunchWorkspaceModule);
    expect(LaunchWorkspaceReadiness).toBe(Readiness);
    expect(LaunchWorkspaceSession).toBe(Session);
    expect(LaunchWorkspaceTrace).toBe(Trace);
    expect(launchWorkspaceRootMachine).toBe(launchWorkspaceMachine);
    expect(launchWorkspaceRootView).toBe(launchWorkspaceView);
    expect(createLaunchWorkspaceRootBrowserRuntime).toBe(createLaunchWorkspaceBrowserRuntime);
    expect(createLaunchWorkspaceRootTestRuntime).toBe(createLaunchWorkspaceTestRuntime);
  });

  it("creates fresh runtimes from dedicated browser and test factories", async () => {
    const browserRuntimeA = createLaunchWorkspaceBrowserRuntime();
    const browserRuntimeB = createLaunchWorkspaceBrowserRuntime();
    const testRuntimeA = createLaunchWorkspaceTestRuntime();
    const testRuntimeB = createLaunchWorkspaceTestRuntime();

    try {
      expect(browserRuntimeA).not.toBe(browserRuntimeB);
      expect(testRuntimeA).not.toBe(testRuntimeB);
      expect(browserRuntimeA.managedRuntime).toBeDefined();
      expect(testRuntimeA.managedRuntime).toBeDefined();
    } finally {
      await browserRuntimeA.dispose();
      await browserRuntimeB.dispose();
      await testRuntimeA.dispose();
      await testRuntimeB.dispose();
    }
  });
});
