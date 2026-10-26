// Queue scenarios: normalised keys, context-driven parameters, availability-aware polling, and
// the entity layer keeping lists and counts right after writes and pushes.
import { story } from "flow-state/testing";
import { DeskSetup } from "../../../app/setup.js";
import { RenamedElsewhere, SlowAssign, UnavailableQueue } from "../../../testing/fixtures.js";
import { SessionRef } from "../../Session/session.ref.js";
import { Queue } from "./queue.definition.js";
import { queueRef } from "./queue.ref.js";

const { E } = Queue;

export const North = queueRef("north");

const desk = (id: string, fixtures: ReadonlyArray<unknown> = []) =>
  story
    .app(DeskSetup, { id, fixtures })
    .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
    .ensure(North, { input: { workspaceId: "north" } })
    .process()
    .checkpoint("loaded");

// "Lobby " and "lobby" normalise to one key, so the second search reuses the cached page.
export const searched = desk("queue-search")
  .send(North, E.SearchChanged({ search: "Lobby " }))
  .process()
  .checkpoint("first")
  .send(North, E.SearchChanged({ search: "lobby" }))
  .process()
  .checkpoint("same-key");

// "Mine only" reads the session's user as a list parameter: toggling it replaces the
// subscription by key. (Another user is another Runtime, never a change in this one.)
export const mineOnly = desk("queue-mine-only")
  .send(North, E.MineOnlyToggled())
  .process()
  .checkpoint("mine");

// Paging: 20 tickets a page; LoadMore appends the next page while one exists.
export const paged = desk("queue-paged")
  .send(North, E.LoadMore())
  .process()
  .checkpoint("two-pages")
  .send(North, E.LoadMore())
  .process()
  .checkpoint("all-pages");

// The list cannot load: the queue degrades and polling backs off instead of hammering the server.
export const degraded = desk("queue-degraded", [UnavailableQueue])
  .checkpoint("degraded")
  .advanceToNextTimer()
  .process()
  .checkpoint("first-backoff-poll");

// Assigning an open ticket: predicted at once, then the "open" list and the open count repair
// because status and assignee are condition fields (ticket.domain.ts). SlowAssign holds the
// response for two seconds, so the prediction can be checkpointed before it settles.
export const assigned = desk("queue-assign", [SlowAssign])
  .send(North, E.StatusChanged({ status: "open" }))
  .process()
  .checkpoint("open-only")
  .send(North, E.AssignToMe({ ticketId: "T-43" }))
  .process() // the turn runs and the commit starts; its response is still two seconds away
  .checkpoint("predicted")
  .advance("2 seconds")
  .process()
  .checkpoint("settled");

// Another dispatcher renames T-43 on the server: the push updates every copy, and only answers
// that can be wrong refetch (the list, whose search and order read title and updatedAt).
export const renamedElsewhere = desk("queue-pushed-rename", [RenamedElsewhere])
  .advance("3 seconds")
  .process()
  .checkpoint("pushed");
