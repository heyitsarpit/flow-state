import { describe, expect, it } from "vite-plus/test";

import {
  Approval as LaunchWorkspaceApproval,
  Assistant as LaunchWorkspaceAssistant,
  Chat as LaunchWorkspaceChat,
  assistantChild as launchWorkspaceAssistantChild,
  createChatComposer as launchWorkspaceCreateChatComposer,
  chatLifecycleView as launchWorkspaceChatLifecycleView,
} from "./launchWorkspace";
import { Approval } from "./launchWorkspaceApproval";
import { Assistant, assistantChild } from "./launchWorkspaceAssistant";
import { Chat, createChatComposer, chatLifecycleView } from "./launchWorkspaceChat";

describe("launch workspace module ownership", () => {
  it("re-exports Approval, Assistant, and Chat from dedicated module files", () => {
    expect(LaunchWorkspaceApproval).toBe(Approval);
    expect(LaunchWorkspaceAssistant).toBe(Assistant);
    expect(launchWorkspaceAssistantChild).toBe(assistantChild);
    expect(LaunchWorkspaceChat).toBe(Chat);
    expect(launchWorkspaceCreateChatComposer).toBe(createChatComposer);
    expect(launchWorkspaceChatLifecycleView).toBe(chatLifecycleView);
  });
});
