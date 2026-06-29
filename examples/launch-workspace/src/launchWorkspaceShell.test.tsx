// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import Page from "../app/page";
import { LaunchWorkspaceClient } from "../app/LaunchWorkspaceClient";

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
  it("renders overview, trace, and debug panels through the App Router client boundary", async () => {
    const container = createContainer();
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(LaunchWorkspaceClient));
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
        await Promise.resolve();
      });
      document.body.innerHTML = "";
    }
  });

  it("hydrates the client boundary without provider mismatch errors and keeps edit/save/trace surfaces live", async () => {
    const container = createContainer();
    const serverMarkup = renderToString(createElement(LaunchWorkspaceClient));
    const recordedErrors: string[] = [];
    const originalConsoleError = console.error;

    console.error = (...args: ReadonlyArray<unknown>) => {
      recordedErrors.push(args.map(String).join(" "));
    };
    container.innerHTML = serverMarkup;

    try {
      let root: ReturnType<typeof hydrateRoot> | undefined;

      await act(async () => {
        root = hydrateRoot(container, createElement(LaunchWorkspaceClient));
        await Promise.resolve();
      });

      expect(container.textContent).toContain("Launch Workspace");
      expect(container.textContent).toContain("Project resource");
      expect(container.textContent).toContain("Recent receipts");
      expect(recordedErrors).toEqual([]);

      const nudgeDraftButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Nudge draft",
      );
      const saveButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Save",
      );
      const traceTabButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Trace",
      );

      if (
        nudgeDraftButton === undefined ||
        saveButton === undefined ||
        traceTabButton === undefined
      ) {
        throw new Error("expected hydrated shell actions to be present");
      }

      await act(async () => {
        nudgeDraftButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(container.textContent).toContain("Review");
      expect(container.textContent).toContain("Trace stays visible.");

      await act(async () => {
        traceTabButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(container.textContent).toContain("Active tab: trace");

      await act(async () => {
        saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(container.textContent).toContain("Save lane: pending");
      expect(container.textContent).toContain("transaction:start");
      expect(container.textContent).toContain("transaction:preview-patch");

      await act(async () => {
        root?.unmount();
        await Promise.resolve();
      });
    } finally {
      console.error = originalConsoleError;
      document.body.innerHTML = "";
    }
  });

  it("hydrates one request-scoped page boot payload without provider mismatch errors", async () => {
    const container = createContainer();
    const page = await Page();
    const serverMarkup = renderToString(page);
    const recordedErrors: string[] = [];
    const originalConsoleError = console.error;

    console.error = (...args: ReadonlyArray<unknown>) => {
      recordedErrors.push(args.map(String).join(" "));
    };
    container.innerHTML = serverMarkup;

    try {
      let root: ReturnType<typeof hydrateRoot> | undefined;

      await act(async () => {
        root = hydrateRoot(container, page);
        await Promise.resolve();
      });

      expect(container.textContent).toContain("Launch Workspace");
      expect(container.textContent).toContain("Project resource");
      expect(container.textContent).toContain("Recent receipts");
      expect(recordedErrors).toEqual([]);

      await act(async () => {
        root?.unmount();
        await Promise.resolve();
      });
    } finally {
      console.error = originalConsoleError;
      document.body.innerHTML = "";
    }
  });
});
