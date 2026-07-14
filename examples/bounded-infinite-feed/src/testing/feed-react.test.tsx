// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { FlowProvider } from "flow-state/react";

import { createFeedTestRuntime } from "../app/runtime";
import { projectPageResource } from "../features/feed/resources";
import { projectPageFixture } from "../services/layers";
import { FeedScreen } from "../ui/FeedScreen";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("FeedScreen", () => {
  it("renders a keyed page and delegates guarded navigation to the actor", async () => {
    const runtime = createFeedTestRuntime();
    runtime.resources.seedResources([
      { ref: projectPageResource.ref(0), value: projectPageFixture(0) },
      { ref: projectPageResource.ref(4), value: projectPageFixture(4) },
    ]);
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <FlowProvider runtime={runtime}>
            <FeedScreen />
          </FlowProvider>,
        );
      });
      expect(container.textContent).toContain("Visible cursors: 0");
      expect(container.textContent).toContain("Project 0");

      const newer = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Load newer",
      );
      expect(newer).toBeDefined();
      await act(async () => newer?.click());
      expect(container.textContent).toContain("Visible cursors: 0, 4");
      expect(container.textContent?.match(/Project 3 ·/g)).toHaveLength(1);
    } finally {
      await act(async () => root.unmount());
      await runtime.dispose();
      document.body.innerHTML = "";
    }
  });
});
