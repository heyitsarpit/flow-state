// SSR against one world (2.10.11): the server render dehydrates the queue, and the hydrated tab starts from the
// payload. Both run against the same Desk server, so the browser's refetch would read the truth the server
// read. A hydration source runs at the `hydrate` step, against the truth current then, and its requests carry
// `via.tab: { name: "server" }`. The hydrated tab's request log therefore shows the server's two lookups and
// none of its own: a fresh payload is not read again.
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../../app/setup.js";
import { Desk, DeskClient } from "../../../testing/desk.fake.js";
import { SessionRef } from "../../Session/session.ref.js";
import { Queue } from "./queue.definition.js";
import { queueRef } from "./queue.ref.js";

const North = queueRef("north");

// design gap: a source Story's `world` is a type error (2.10.11); it has none, and the Desk's seed is the truth.
export const queuePage = Story.make(DeskSetup, {
  id: "queue/ssr-server",
  fixtures: [DeskClient],
})
  .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
  .ensure(North, { input: { workspaceId: "north" } })
  .dehydrate("page", { within: "1500 millis" }); // DeskSetup has no scope; the browser side matches

const serverOnly = [{ via: { tab: { name: "server" } }, phase: "answered" }] as const;

export const queueHydrated = Story.make(DeskSetup, {
  id: "queue/ssr-browser",
  fixtures: [DeskClient],
})
  .hydrate(queuePage, "page") // a leading command: before bootstrap, as on initial page load
  .checkpoint("active")
  .expect(North, { state: Queue.S.HEALTHY })
  .expect(Desk.list, serverOnly) // the server's lookup; the browser asked for nothing
  .expect(Desk.openCount, serverOnly)
  .advance("1 second") // still inside the payload's freshness: still nothing from the browser
  .expect(Desk.list, serverOnly);
