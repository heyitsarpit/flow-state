// @vitest-environment happy-dom
import { createElement as h } from "react";
import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, test } from "vite-plus/test";
import { runtimeSetup } from "flow-state";
import { FlowProvider, Hydrate } from "flow-state/react";
import { DeskApp } from "../../../app/app.js";
import { DemoTicketApi } from "../../../app/demo-api.js";
import { DeskSetup } from "../../../app/setup.js";
import { Layer } from "effect";
import { countingTicketApi } from "../../../testing/fixtures.js";
import { QueueList } from "./QueueList.js";
import { Queue } from "./queue.definition.js";
import { queueRef } from "./queue.ref.js";
import { countedQueueHydration, queuePage } from "./queue.ssr.story.js";

test("fresh hydrated list and openCount do not refetch", async () => {
  const { scenario, counter } = countedQueueHydration();
  const run = await scenario.run();
  expect(counter.calls()).toEqual({ list: 0, openCount: 0 });
  expect(Queue.S.HEALTHY.is(run.checkpoints.active.actor(queueRef("north")).snapshot)).toBe(true);
});

test("renderToString and hydrateRoot agree before browser activation", async () => {
  const payload = (await queuePage.run()).payloads.page;
  const counter = countingTicketApi();
  // The same fixture composition as Stories: fixtures may require and shadow setup services.
  const setup = runtimeSetup({
    app: DeskApp,
    services: Layer.provideMerge(counter.layer, DemoTicketApi),
  });
  const serverRenderRuntime = DeskSetup.construct();
  const browserRuntime = setup.construct();
  const errors: unknown[] = [];
  const container = document.createElement("div");
  document.body.append(container);
  const tree = (runtime: ReturnType<typeof DeskSetup.construct>) =>
    h(
      FlowProvider,
      { runtime },
      h(Hydrate, { payload }, h(QueueList, { workspaceId: "north", onOpen: () => {} })),
    );
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    container.innerHTML = renderToString(tree(serverRenderRuntime));
    const serverHtml = container.innerHTML;
    await act(async () => {
      root = hydrateRoot(container, tree(browserRuntime), {
        onRecoverableError: (error) => errors.push(error),
      });
      await browserRuntime.runPromise(browserRuntime.ready());
    });
    expect(errors).toEqual([]);
    expect(container.innerHTML).toBe(serverHtml);
    expect(container.textContent).toContain("Replace lobby light");
    expect(counter.calls()).toEqual({ list: 0, openCount: 0 });
  } finally {
    await act(async () => {
      root?.unmount();
    });
    await browserRuntime.dispose();
    await serverRenderRuntime.dispose();
    container.remove();
  }
});
