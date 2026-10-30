// Queue Stories: the normalised search key, mine only, paging, degraded backoff, and keyed assignments with
// held and dropped wires. Each runs the Queue machine alone over the Desk fake (the client half provides
// every port), with the session's user supplied as `context`. Wire words, never injected results (2.10.5).
// A machine Story's `context` option stands in for the Session actor (2.10.1), and `setContext` is a step.
import { Story } from "flow-state/testing";
import { Ticket } from "../ticket.domain.js";
import { Desk, DeskClient } from "../../../testing/desk.fake.js";
import { MAX_ASSIGN_RESENDS, Queue } from "./queue.definition.js";
import { QueueMachine } from "./queue.machine.js";

const { S, E, O } = Queue;

const north = { workspaceId: "north" };

const queue = (id: string, world: ReadonlyArray<unknown> = []) =>
  Story.make(QueueMachine, {
    id,
    input: north,
    context: { userId: "dispatcher-7" },
    fixtures: [DeskClient],
    world,
  });

const key = (ticketId: string) => ({ workspaceId: "north", ticketId });

// "Lobby " and "lobby" are one key because the queue lowercases and trims before it builds the input, so
// the second search reuses the cached page: the endpoint's log has the first load and one search lookup.
export const searched = queue("queue/search-key")
  .send(E.SearchChanged({ search: "Lobby " }))
  .send(E.SearchChanged({ search: "lobby" }))
  .send(E.SearchChanged({ search: "  LOBBY" }))
  .expect(Desk.list, [
    { input: { search: undefined }, phase: "answered" },
    { input: { search: "lobby" }, phase: "answered" },
  ]);

// "Mine only" reads the session's user as a list parameter: toggling it replaces the subscription by key.
// A different user arrives as context, and the key changes again with no event.
export const mineOnly = queue("queue/mine-only")
  .send(E.MineOnlyToggled())
  .expect({ operations: { list: { data: [{ tickets: [{ ticketId: "T-42" }] }] } } })
  .setContext({ userId: "dispatcher-8" })
  .expect({ operations: { list: { data: [{ tickets: [] }] } } })
  .expect(Desk.list, [
    { input: { assignee: undefined } },
    { input: { assignee: "dispatcher-7" } },
    { input: { assignee: "dispatcher-8" } },
  ]);

// Paging: 20 tickets a page, 45 in all. LoadMore appends while a next page exists, then its guard declines.
export const paged = queue("queue/paged")
  .send(E.LoadMore())
  .expect({ operations: { list: { hasMore: true, data: [{}, {}] } } })
  .send(E.LoadMore())
  .expect({ operations: { list: { hasMore: false, data: [{}, {}, {}] } } })
  .checkpoint("last-page")
  .send(E.LoadMore())
  .expect(Story.records("verdict", { since: "last-page" }), [
    { result: { _tag: "Denied", reasons: [{ code: "NoMorePages" }] } },
  ]);

// The list cannot load: the queue degrades, and polling backs off (5 seconds with jitter) instead of
// hammering the server. When the outage ends, the next poll loads and the queue is healthy again.
export const degraded = queue("queue/degraded", [Desk.listOutage({ on: true })])
  .expect({ state: S.DEGRADED })
  .advance({ next: { schedule: "poll" } })
  .expect({ state: S.DEGRADED })
  .expect(Desk.list, [{ phase: "answered" }, { phase: "answered" }])
  .world(Desk.listOutage({ on: false }))
  .advance({ next: { schedule: "poll" } })
  .expect({ state: S.HEALTHY });

// Assigning an open ticket: the row shows the assignee at once (predicted), the lane says it is on the
// wire, and the "open" list and count repair when the answer lands because status and assignee are
// condition fields (ticket.domain.ts).
export const assigned = queue("queue/assign")
  .world(Desk.assign.hold({ at: "response" })) // handled, the answer waits
  .send(E.AssignToMe({ ticketId: "T-43" }))
  .expect({ operations: { assign: [{ key: key("T-43"), pending: true }] } })
  .expect(Story.entity(Ticket, key("T-43")), {
    data: { assignee: "dispatcher-7", status: "assigned" },
    predicted: true,
  })
  .send(E.AssignToMe({ ticketId: "T-43" })) // a second press on the same row
  .expect(Story.records("verdict"), [
    { result: { _tag: "Allowed" } },
    { result: { _tag: "Denied", reasons: [{ code: "InFlight" }] } },
  ])
  .world(Desk.assign.release())
  .expect({ operations: { assign: [] } }) // the lane held nothing, so it is gone
  .expect(Story.entity(Ticket, key("T-43")), {
    data: { assignee: "dispatcher-7" },
    predicted: false,
  })
  .expect(Desk.assign, [
    { input: { ticketId: "T-43", key: Story.attempt(O.assign) }, phase: "answered" },
  ])
  .expect(Desk.openCount, [{ phase: "answered" }, { phase: "answered" }]); // the first read, then the repair

// Two rows at once are two lanes: each shows its own "Assigning…", and each ending is its own. One answer
// is lost on the way back, so only that row says "?" and the other settles.
export const assignedMany = queue("queue/assign-many")
  .world(
    // The drop is set first: a request takes the earliest-set rule that matches (2.10.4). The address is
    // the lane's `operation` and `key` (rule 65).
    Desk.assign.drop({
      at: "response",
      match: { operation: O.assign, key: key("T-101") },
      times: 1,
    }),
    Desk.assign.hold({ at: "response" }),
  )
  .send(E.AssignToMe({ ticketId: "T-43" }), E.AssignToMe({ ticketId: "T-101" }))
  .expect({
    operations: {
      assign: [
        { key: key("T-43"), pending: true },
        { key: key("T-101"), pending: true },
      ],
    },
  })
  .world(Desk.assign.release())
  .expect({ operations: { assign: [{ key: key("T-101"), uncertain: true }] } }) // T-43 settled, its lane gone
  .expect(Story.entity(Ticket, key("T-43")), {
    data: { assignee: "dispatcher-7" },
    predicted: false,
  })
  .expect(Story.entity(Ticket, key("T-101")), { uncertain: true });

// Nothing ever answers T-43: `reconcile` re-sends the same Attempt (the server dedupes on its id) until the
// budget is spent, then the hold is released and the notice says the queue could not confirm it.
export const assignUnsure = Array.from({ length: MAX_ASSIGN_RESENDS })
  .reduce<ReturnType<typeof queue>>(
    (story) => story.advance({ next: { schedule: "reconcile" } }),
    queue("queue/assign-unsure", [Desk.assign.drop({ at: "response", times: "always" })])
      .send(E.AssignToMe({ ticketId: "T-43" }))
      .expect({ operations: { assign: [{ key: key("T-43"), uncertain: true, retryCount: 0 }] } }),
  )
  .expect({
    memory: { notice: "We couldn't confirm that assignment" },
    operations: { assign: [] }, // released: no lane
  })
  .expect(Desk.assign, [
    { phase: "dropped", via: { attempts: [Story.attempt(O.assign)] } },
    { phase: "dropped", via: { attempts: [Story.attempt(O.assign)] } }, // the same Attempt, every time
    { phase: "dropped", via: { attempts: [Story.attempt(O.assign)] } },
    { phase: "dropped", via: { attempts: [Story.attempt(O.assign)] } },
  ])
  .expect(Desk, { desk: { tickets: [{ ticketId: "T-43", assignee: "dispatcher-7" }] } }); // applied once

// Somebody else took T-43 first: a definite 409. The prediction goes without a repair of its own, the notice
// names the holder, and the list is read again.
export const alreadyAssigned = queue("queue/already-assigned")
  .world(Desk.changeElsewhere({ ...key("T-43"), status: "assigned", assignee: "dispatcher-2" }))
  .send(E.AssignToMe({ ticketId: "T-43" }))
  .expect({ memory: { notice: "Already assigned to dispatcher-2" } })
  .expect(Story.entity(Ticket, key("T-43")), { data: { assignee: "dispatcher-2" } })
  .expect(Desk.list, [{ phase: "answered" }, { phase: "answered" }]); // the refetch

// "A, B, A" through the queue's own filling: a post held for A while the drawer previews B is parked, B's
// thread is separate, and previewing A again adopts A's ending (the Comments Story walks the same cell alone).
export const previewABA = queue("queue/preview-a-b-a")
  .send(E.PreviewOpened({ ticketId: "T-42" }))
  .world(Desk.postComment.hold({ at: "response" }))
  .send(E.preview.Post({ clientId: "a1", text: "For A" }))
  .send(E.PreviewOpened({ ticketId: "T-43" }))
  .expect({ memory: { previewId: "T-43", preview: { drafts: [] } } })
  .expect(Story.inspection.lanes, [
    { key: { clientId: "a1" }, subject: ["T-42"], binding: "unplaced" },
  ])
  .world(Desk.postComment.release()) // A's answer lands and is parked for ["T-42"]
  .send(E.PreviewOpened({ ticketId: "T-42" }))
  .expect({ memory: { previewId: "T-42", preview: { drafts: [] } } }) // adopted; the refetch holds a1
  .expect(Desk, { desk: { comments: [{ clientId: "a1", text: "For A" }] } });
