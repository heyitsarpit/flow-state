// SSR against one world: the server render dehydrates the queue, and the hydrated tab starts from the payload.
// Both run against the same Desk fake (2.10.11), so the browser's refetch would read the truth the server
// read. The hydrated tab's request log shows no list or count lookup of its own: only the server's two.
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../../app/setup.js";
import { Desk, DeskClient } from "../../../testing/desk.fake.js";
import { SessionRef } from "../../Session/session.ref.js";
import { queueRef } from "./queue.ref.js";

export const queuePage = Story.make(DeskSetup, {
  id: "queue/ssr-server",
  fixtures: [DeskClient],
})
  .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
  .ensure(queueRef("north"), { input: { workspaceId: "north" } })
  .dehydrate("page", { within: "1500 millis" }); // DeskSetup has no scope; the browser side matches

// design gap: the filter on `via.tab` is the request log's, 2.10.11 gives the field and not a filter word.
const serverOnly = [{ via: { tab: { name: "server" } }, phase: "answered" }] as const;

export const queueHydrated = Story.make(DeskSetup, {
  id: "queue/ssr-browser",
  fixtures: [DeskClient],
})
  .hydrate(queuePage, "page") // leading command: before bootstrap, as on initial page load
  .checkpoint("active")
  .expect(Desk.list, serverOnly) // the server's lookup; the browser asked for nothing
  .expect(Desk.openCount, serverOnly);
