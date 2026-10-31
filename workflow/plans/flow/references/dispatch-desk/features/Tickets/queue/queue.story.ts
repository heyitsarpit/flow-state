// Queue Stories: the queue machine alone over the Desk fake (the client half provides every port), with the
// session's user supplied as `context` (a machine Story's `context` option stands in for the Session actor,
// 2.10.1; `setContext` is a step). Transcripts: inputs and named checkpoints; queue.test.ts reads them.
// Wire words, never injected results (2.10.5).
//
// Module checkpoints (COVERAGE.md section 6): `filtered`, `left-unassigned`, `created`, `archived` here;
// `toggled`, `toggled-while-unsure`, `bulk-queued`, `bulk-partly-failed`, `sla-breached` with the bulk and toggle
// Stories (queue.bulk.story.ts); the technician panel's in technicians/technicians.story.ts.
import { Story } from "flow-state/testing";
import { Desk, DeskClient } from "../../../testing/desk.fake.js";
import { Queue } from "./queue.definition.js";
import { QueueMachine } from "./queue.machine.js";

const { E } = Queue;

export const north = { workspaceId: "north" };

export const queue = (id: string, world: ReadonlyArray<unknown> = []) =>
  Story.make(QueueMachine, {
    id,
    input: north,
    context: { userId: "dispatcher-7" },
    fixtures: [DeskClient],
    world,
  }).checkpoint("loaded");

export const key = (ticketId: string) => ({ workspaceId: "north", ticketId });

// A row's assign toggle: the row's own copy (`toggles`), addressed by its key (rule 9).
export const toggle = (ticketId: string, assignee: string | null = "dispatcher-7") =>
  E.toggles.key(ticketId).Toggle({ assignee });

// "Lobby " and "lobby" are one key because the queue lowercases and trims before it builds the input, so the
// second search reuses the cached page: the endpoint's log has the first load and one search lookup.
export const searched = queue("queue/search-key")
  .send(E.SearchChanged({ search: "Lobby " }))
  .send(E.SearchChanged({ search: "lobby" }))
  .send(E.SearchChanged({ search: "  LOBBY" }))
  .checkpoint("typing")
  .advance("300 millis") // the debounce (S1): three edits, one applied search
  .checkpoint("searched");

// "Mine only" reads the session's user as a list parameter: toggling it replaces the subscription by key.
// A different user arrives as context, and the key changes again with no event.
export const mineOnly = queue("queue/mine-only")
  .send(E.MineOnlyToggled())
  .checkpoint("mine")
  .setContext({ userId: "dispatcher-8" })
  .checkpoint("someone-else");

// Paging: 20 tickets a page, 45 in all. LoadMore appends while a next page exists, then its guard declines.
export const paged = queue("queue/paged")
  .send(E.LoadMore())
  .checkpoint("second-page")
  .send(E.LoadMore())
  .checkpoint("last-page")
  .send(E.LoadMore())
  .checkpoint("no-more");

// The list cannot load: the queue degrades, and polling backs off (5 seconds with jitter) instead of
// hammering the server. When the outage ends, the next poll loads and the queue is healthy again.
export const degraded = queue("queue/degraded", [Desk.listOutage({ on: true })])
  .advance({ next: { schedule: "poll" } })
  .checkpoint("degraded")
  .world(Desk.listOutage({ on: false }))
  .advance({ next: { schedule: "poll" } })
  .checkpoint("recovered");

// The triage tab: `or(eq(priority, urgent), and(isNull(assignee), lt(dueAt, now)))`. T-43 is urgent; once the
// clock passes the routine tickets' deadlines, the unassigned ones join (their `dueAt` is now behind `now`), and
// the ones with no deadline never do: a null is not before anything (three-valued, M5-D7).
export const filtered = queue("queue/triage")
  .send(E.TabChosen({ tab: "triage" }))
  .checkpoint("filtered")
  .advance("2 days") // the routine deadlines are a day and some minutes in
  .checkpoint("overdue-joined");

// Assigning from the "Unassigned" tab predicts `assignee`, so the ticket no longer meets `isNull(assignee)`: it
// leaves the list in the starting turn's publication, before the server answers (E4), and the "mine" filter
// would hold it. The answer then confirms it; nothing is read again to make it leave.
export const leftUnassigned = queue("queue/left-unassigned", [
  Desk.assignBatch.hold({ at: "response" }),
])
  .send(E.TabChosen({ tab: "unassigned" }))
  .checkpoint("unassigned")
  .send(toggle("T-43"))
  .checkpoint("left-unassigned")
  .world(Desk.assignBatch.release())
  .checkpoint("confirmed");

// The predicted assignee replays over a new base (E11): another dispatcher lowers T-43's priority while the
// assignment is on the wire, the poll reads the list again, and the record shows the server's priority under the
// still-predicted assignee. `checkReplays` (on in every Story) runs each predicted field function twice over the
// new base and fails the run if they disagree.
export const replayedOverPush = queue("queue/replayed-over-push", [
  Desk.assignBatch.hold({ at: "response" }),
])
  .send(toggle("T-43"))
  .world(Desk.changeElsewhere({ ...key("T-43"), priority: 0 }))
  .advance({ next: { schedule: "poll" } })
  .checkpoint("replayed-over-push")
  .world(Desk.assignBatch.release())
  .checkpoint("settled");

// A new ticket: shown as a draft until a list holds the server's id (rule 33), never twice. The create holds no
// prediction, so no temporary id enters a list.
export const created = queue("queue/created", [Desk.createTicket.hold({ at: "response" })])
  .send(
    E.CreateTicket({ draftId: "d1", title: "Leaking tap, 3rd floor", priority: 2, dueAt: null }),
  )
  .checkpoint("creating")
  .world(Desk.createTicket.release())
  .checkpoint("created");

// Archive predicts a delete, so the ticket leaves every list at once. T-42 is being worked on: the server refuses
// (403), and the definite failure brings it back in place with no repair (rule 30). T-101 (open, nobody on it)
// archives.
export const archived = queue("queue/archived", [Desk.archiveTicket.hold({ at: "response" })])
  .send(E.Archive({ ticketId: "T-42" }), E.Archive({ ticketId: "T-101" }))
  .checkpoint("archive-predicted")
  .world(Desk.archiveTicket.release())
  .checkpoint("archived");

// A row's toggle: assign, release, assign. The first is on the wire; the release is queued behind it, then the
// third tap REPLACES it before it was ever sent (`latest`, `Superseded`): two requests, and never the release (O4).
// The row shows the assignee at once (predicted), and the "open" count repairs when the answers land, because
// status and assignee are condition fields.
export const toggled = queue("queue/toggled", [Desk.assignBatch.hold({ at: "response" })])
  .send(toggle("T-43"))
  .checkpoint("assigning")
  .send(toggle("T-43", null), toggle("T-43"))
  .checkpoint("toggled")
  .world(Desk.assignBatch.release())
  .checkpoint("assigned");

// A tap while the row's assignment is unsure waits behind the hold (O5). The first answer is lost; the copy asks
// again with the same Attempt at once, and that re-send is held: the lane is still the first Attempt's, so the
// next tap queues and is sent only after the re-send answers.
export const toggledWhileUnsure = queue("queue/toggled-while-unsure", [
  Desk.assignBatch.drop({ at: "response", times: 1 }), // set first: a request takes the earliest-set rule (2.10.4)
  Desk.assignBatch.hold({ at: "response" }),
])
  .send(toggle("T-43"))
  .send(toggle("T-43", null))
  .checkpoint("toggled-while-unsure")
  .world(Desk.assignBatch.release())
  .checkpoint("caught-up");

// Two rows at once are two lanes, two commits and two Attempts, sent as ONE request: the adapter's `RequestResolver`
// batches below the commit and completes each from its own item (O19, O2). T-43 is free; T-42 is someone else's, so
// only T-42's copy hears 409 (`bulk-partly-failed`), and only its prediction goes.
export const bulkAssigned = queue("queue/bulk-assigned", [
  Desk.changeElsewhere({ ...key("T-42"), assignee: "dispatcher-2" }),
])
  .send(toggle("T-43"), toggle("T-42"))
  .advance("10 millis") // the resolver's window
  .checkpoint("bulk-partly-failed");

// "A, B, A" through the queue's own filling: a post held for A while the drawer previews B is parked, B's thread is
// separate, and previewing A again adopts A's ending (the Comments Story walks the same cell alone).
export const previewABA = queue("queue/preview-a-b-a")
  .send(E.PreviewOpened({ ticketId: "T-42" }))
  .world(Desk.postComment.hold({ at: "response" }))
  .send(E.preview.Post({ clientId: "a1", text: "For A" }))
  .send(E.PreviewOpened({ ticketId: "T-43" }))
  .checkpoint("previewing-b")
  .world(Desk.postComment.release()) // A's answer lands and is parked for ["T-42"]
  .send(E.PreviewOpened({ ticketId: "T-42" }))
  .checkpoint("back-on-a");
