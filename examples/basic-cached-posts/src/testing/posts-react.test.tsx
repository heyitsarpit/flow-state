// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { FlowProvider } from "flow-state/react";

import { createPostsTestRuntime } from "../app/runtime";
import { postDetailResource, postsResource } from "../features/posts/resources";
import { fixturePosts } from "../services/layers";
import { PostsScreen } from "../ui/PostsScreen";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("PostsScreen", () => {
  it("renders cached resources and delegates navigation to the actor", async () => {
    const runtime = createPostsTestRuntime();
    runtime.resources.seedResources([
      {
        ref: postsResource.ref(),
        value: Object.values(fixturePosts).map(({ id, title }) => ({ id, title })),
      },
      { ref: postDetailResource.ref(1), value: fixturePosts[1] },
    ]);
    const container = document.createElement("div");
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <FlowProvider runtime={runtime}>
            <PostsScreen />
          </FlowProvider>,
        );
      });
      expect(container.textContent).toContain("Flow State basics");

      const firstPost = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Flow State basics",
      );
      expect(firstPost).toBeDefined();
      await act(async () => firstPost?.click());

      expect(container.textContent).toContain("Actors own work.");
      expect(container.textContent).toContain("Refresh");
    } finally {
      await act(async () => root.unmount());
      await runtime.dispose();
      document.body.innerHTML = "";
    }
  });
});
