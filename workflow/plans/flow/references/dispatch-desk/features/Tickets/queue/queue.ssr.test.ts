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
import { Desk } from "../../../testing/desk.fake.js";
import { Queue } from "./queue.definition.js";
import { North, queueHydrated, queuePage } from "./queue.ssr.story.js";

// The Stories are transcripts; their checks are below, read from their checkpoints (2.10.6). The render test below
// is React's: one string from `renderToString`, the same markup from `hydrateRoot`, no recoverable error.

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

// The hydrated tab's request log holds the server's two lookups and none of its own: a fresh payload is not read
// again, at activation or a second later.
const serverOnly = [{ via: { tab: { name: "server" } }, phase: "answered" }];

test("a hydrated tab does not read what the server render already read", async () => {
  const { active, stillFresh } = (await queueHydrated.run()).checkpoints;

  expect(active.read(North)?.state).toBe(Queue.S.HEALTHY);
  expect(active.read(Desk.list)).toMatchObject(serverOnly);
  expect(active.read(Desk.openCount)).toMatchObject(serverOnly);
  expect(stillFresh.read(Desk.list)).toMatchObject(serverOnly);
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
