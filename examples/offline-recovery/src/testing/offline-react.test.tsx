// @vitest-environment happy-dom

import { Stream } from "effect";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "flow-state";

import { OfflineApp } from "../app/app";
import { createOfflineServicesLayer } from "../services/layers";
import { OfflineRecoveryClient } from "../ui/OfflineRecoveryClient";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("OfflineRecoveryClient", () => {
  it("shows cached data offline, drains queued work online, and disposes its owner", async () => {
    let finalizers = 0;
    const createRuntime = () =>
      flow.runtime(
        OfflineApp.layer({
          store: flow.store.memory(),
          orchestrators: flow.orchestrators.live(),
          services: [
            createOfflineServicesLayer({
              connectivity: Stream.never,
              onFinalize: () => (finalizers += 1),
            }),
          ],
        }),
      );
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => root.render(<OfflineRecoveryClient createRuntime={createRuntime} />));
    expect(container.textContent).toContain("Offline");
    expect(container.textContent).toContain("Cached before disconnect");

    const button = (label: string) =>
      Array.from(container.querySelectorAll("button")).find((entry) => entry.textContent === label);
    await act(async () => {
      button("Queue comments")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());
    expect(container.textContent).toContain("Queued comments: 1");

    await act(async () => {
      button("Cancel queued work")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Queued comments: 0");

    await act(async () => button("Go online")?.click());
    expect(container.textContent).toContain("Online");

    await act(async () => root.unmount());
    expect(finalizers).toBe(3);
  });
});
