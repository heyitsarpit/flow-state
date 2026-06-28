import { describe, expect, it } from "vite-plus/test";

import {
  Approval as LaunchWorkspaceApproval,
  Assistant as LaunchWorkspaceAssistant,
  Chat as LaunchWorkspaceChat,
  Launch as LaunchWorkspaceLaunch,
  Trace as LaunchWorkspaceTrace,
  assistantChild as launchWorkspaceAssistantChild,
  createChatComposer as launchWorkspaceCreateChatComposer,
  chatLifecycleView as launchWorkspaceChatLifecycleView,
} from "./launchWorkspace";
import { Approval } from "./launchWorkspaceApproval";
import { Assistant, assistantChild } from "./launchWorkspaceAssistant";
import { Chat, createChatComposer, chatLifecycleView } from "./launchWorkspaceChat";
import { Launch, Trace } from "./launchWorkspaceViews";

describe("launch workspace module ownership", () => {
  it("re-exports dedicated feature modules from their owned files", () => {
    expect(LaunchWorkspaceApproval).toBe(Approval);
    expect(LaunchWorkspaceAssistant).toBe(Assistant);
    expect(launchWorkspaceAssistantChild).toBe(assistantChild);
    expect(LaunchWorkspaceChat).toBe(Chat);
    expect(launchWorkspaceCreateChatComposer).toBe(createChatComposer);
    expect(launchWorkspaceChatLifecycleView).toBe(chatLifecycleView);
    expect(LaunchWorkspaceLaunch).toBe(Launch);
    expect(LaunchWorkspaceTrace).toBe(Trace);
  });
});
