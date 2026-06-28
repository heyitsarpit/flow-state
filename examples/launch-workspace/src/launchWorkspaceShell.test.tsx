// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { FlowProvider, flow } from "@flow-state/core";

import { LaunchWorkspaceTestAppLayer, launchWorkspaceSeed } from "./launchWorkspace";
import { LaunchWorkspaceShell } from "./launchWorkspaceShell";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function createContainer(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("Launch Workspace shell", () => {
  it("renders overview, trace, and debug panels from the live workspace actor", async () => {
    const runtime = flow.runtime(LaunchWorkspaceTestAppLayer);
    runtime.resources.seedResources(launchWorkspaceSeed);
    const container = createContainer();
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          createElement(FlowProvider, {
            runtime,
            children: createElement(LaunchWorkspaceShell),
          }),
        );
        await Promise.resolve();
      });

      expect(container.textContent).toContain("Launch Workspace");
      expect(container.textContent).toContain("Project resource");
      expect(container.textContent).toContain("Recent receipts");
      expect(container.textContent).toContain("Pending work");
      expect(container.textContent).toContain("Active runtime facts");

      const runAssistantButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Run assistant",
      );
      if (runAssistantButton === undefined) {
        throw new Error("expected the shell to render a Run assistant action");
      }

      await act(async () => {
        runAssistantButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      expect(container.textContent).toContain("Assistant.progress");
      expect(container.textContent).toContain("Assistant.task");
      expect(container.textContent).toContain("runningAssistant");
      expect(container.textContent).toContain("Stream snapshots");
    } finally {
      await act(async () => {
        root.unmount();
      });
      document.body.innerHTML = "";
      await runtime.dispose();
    }
  });
});
