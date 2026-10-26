import { story } from "flow-state/testing";
import { DeskSetup } from "../../../app/setup.js";
import { countingTicketApi } from "../../../testing/fixtures.js";
import { SessionRef } from "../../Session/session.ref.js";
import { queueRef } from "./queue.ref.js";

export const queuePage = story
  .app(DeskSetup, { id: "queue-ssr-server", fixtures: [] })
  .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
  .ensure(queueRef("north"), { input: { workspaceId: "north" } })
  .dehydrate("page", { scope: "dispatch-desk:dispatcher-7", within: "1500 millis" });

export const queueHydrated = story
  .app(DeskSetup, { id: "queue-ssr-browser", fixtures: [] })
  .hydrate(queuePage, "page") // leading command: before bootstrap, as on initial page load
  .process()
  .checkpoint("active");

// Tests allocate fresh counters; the exported Story above remains discoverable by the CLI.
export function countedQueueHydration() {
  const counter = countingTicketApi();
  return {
    counter,
    scenario: story
      .app(DeskSetup, { id: "queue-ssr-counted", fixtures: [counter.layer] })
      .hydrate(queuePage, "page")
      .process()
      .checkpoint("active"),
  };
}
