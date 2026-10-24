// Queue scenarios: derived keys, context-driven resubscription and health-aware polling.
import { story } from "flow-state/testing";
import { DemoTicketApi } from "../../../app/demo-api.js";
import { DeskSetup } from "../../../app/setup.js";
import { UnavailableQueueApi } from "../../../testing/fixtures.js";
import { Session } from "../../Session/session.definition.js";
import { SessionMachine } from "../../Session/session.machine.js";
import { Queue } from "./queue.definition.js";
import { QueueMachine } from "./queue.machine.js";

export const session = story.actor(SessionMachine);

export const queue = story.actor(QueueMachine, {
  input: { workspaceId: "north" },
  contextBindings: { userId: session },
});

// "Lobby " and "lobby" normalise to one key, so the second search reuses the cached page.
export const searched = story
  .app(DeskSetup, { id: "queue-search", fixtures: [DemoTicketApi] })
  .send(queue, Queue.E.SearchChanged({ search: "Lobby " }))
  .process()
  .checkpoint("first")
  .send(queue, Queue.E.SearchChanged({ search: "lobby" }))
  .process()
  .checkpoint("same-key");

// "Mine only" reads the session's user: switching user replaces the subscription by key change.
export const switchedUser = story
  .app(DeskSetup, { id: "queue-switch-user", fixtures: [DemoTicketApi] })
  .send(queue, Queue.E.MineOnlyToggled())
  .process()
  .checkpoint("mine")
  .send(session, Session.E.UserSwitched({ userId: "dispatcher-2" }))
  .process()
  .checkpoint("theirs");

// A failing feed degrades the queue; polling backs off instead of hammering the server.
export const degraded = story
  .app(DeskSetup, { id: "queue-degraded", fixtures: [UnavailableQueueApi] })
  .send(queue, Queue.E.PageChanged({ page: 0 }))
  .process()
  .checkpoint("degraded")
  .advanceToNextTimer()
  .process()
  .checkpoint("first-backoff-poll");
