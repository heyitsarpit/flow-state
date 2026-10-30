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
import { Effect, Layer } from "effect";
import { TicketApi } from "../ticket-api.js";
import { QueueList } from "./QueueList.js";
import { Queue } from "./queue.definition.js";
import { queueRef } from "./queue.ref.js";
import { queueHydrated, queuePage } from "./queue.ssr.story.js";

// A small counting Layer over the demo API: how many list and count lookups the browser tab sends.
const countingTicketApi = () => {
  const calls = { list: 0, openCount: 0 };

  const layer = Layer.effect(
    TicketApi,
    Effect.gen(function* () {
      const api = yield* TicketApi;

      return {
        ...api,
        list: (input, options) => {
          calls.list += 1;

          return api.list(input, options);
        },
        openCount: (input, options) => {
          calls.openCount += 1;

          return api.openCount(input, options);
        },
      };
    }),
  );

  return { layer, calls: () => ({ ...calls }) };
};

test("fresh hydrated list and openCount do not refetch", async () => {
  const run = await queueHydrated.run(); // its expectations read the Desk request log: the server's two lookups only
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
