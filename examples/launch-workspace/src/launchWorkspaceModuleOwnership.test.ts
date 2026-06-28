import { describe, expect, it } from "vite-plus/test";

import {
  Approval as LaunchWorkspaceApproval,
  Assistant as LaunchWorkspaceAssistant,
  Chat as LaunchWorkspaceChat,
  Assets as LaunchWorkspaceAssets,
  Checklist as LaunchWorkspaceChecklist,
  Launch as LaunchWorkspaceLaunch,
  Readiness as LaunchWorkspaceReadiness,
  Session as LaunchWorkspaceSession,
  Trace as LaunchWorkspaceTrace,
  assistantChild as launchWorkspaceAssistantChild,
  createChatComposer as launchWorkspaceCreateChatComposer,
  chatLifecycleView as launchWorkspaceChatLifecycleView,
} from "./launchWorkspace";
import { Approval } from "./launchWorkspaceApproval";
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
    expect(LaunchWorkspaceReadiness).toBe(Readiness);
    expect(LaunchWorkspaceSession).toBe(Session);
    expect(LaunchWorkspaceTrace).toBe(Trace);
  });
});
