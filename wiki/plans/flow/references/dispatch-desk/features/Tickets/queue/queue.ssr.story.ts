// SSR against one world (2.10.11): the server render dehydrates the queue, and the hydrated tab starts from the
// payload. Both run against the same Desk server, so the browser's refetch would read the truth the server
// read. A hydration source runs at the `hydrate` step, against the truth current then, and its requests carry
// `via.tab: { name: "server" }`. The hydrated tab's request log therefore shows the server's two lookups and
// none of its own: a fresh payload is not read again.
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../../app/setup.js";
import { DeskClient } from "../../../testing/desk.fake.js";
import { SessionRef } from "../../Session/session.ref.js";
import { queueRef } from "./queue.ref.js";

export const North = queueRef("north");

// A source Story sets no `world`, neither the option nor a step (2.10.11, W29): it runs at the `hydrate` step on the
// destination run's fake servers, the Desk's seed. Its fixtures are its own; its server is the destination's.
export const queuePage = Story.app(DeskSetup, {
  id: "queue/ssr-server",
  fixtures: [DeskClient],
})
  .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
  .ensure(North, { input: { workspaceId: "north" } })
  .dehydrate("page", { within: "1500 millis" }); // DeskSetup has no scope; the browser side matches

export const queueHydrated = Story.app(DeskSetup, {
  id: "queue/ssr-browser",
  fixtures: [DeskClient],
})
  .hydrate(queuePage, "page") // a leading command: before bootstrap, as on initial page load
  .checkpoint("active")
  .advance("1 second") // still inside the payload's freshness: still nothing from the browser
  .checkpoint("stillFresh");
