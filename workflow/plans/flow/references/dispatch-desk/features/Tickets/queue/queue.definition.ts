// The dispatcher's ticket queue: filters, search, paging, assignment and list availability. Named operations
// (rule 39–43): `list` and `open` are reads, `assign` is a keyed write (one lane per ticket). The comments
// preview drawer is the `Comments` trait placed as `preview`, reset by the previewed ticket (F7).
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { Comments } from "../../Comments/comments.trait.js";
import { Session } from "../../Session/session.definition.js";
import { TicketsDomain } from "../ticket.domain.js";
import { TicketStatus } from "../types.js";

export const MAX_ASSIGN_RESENDS = 3; // user-defined: re-sends after the first send, then give up

export const Queue = definition({
  id: "DispatchDesk/Queue",
  states: ["HEALTHY", "DEGRADED"],
  events: {
    SearchChanged: { search: Schema.String },
    StatusChanged: { status: Schema.NullOr(TicketStatus) },
    MineOnlyToggled: {},
    LoadMore: {},
    AssignToMe: { ticketId: Schema.String },
    // The drawer's open and close set `memory.previewId`.
    PreviewOpened: { ticketId: Schema.String },
    PreviewClosed: {},
  },
  internalEvents: {
    PollDue: {},
    ListLoaded: {},
    ListUnavailable: { retryAfter: Schema.Number },
    AssignFailed: { reason: Schema.String },
    AssignConflict: { assignee: Schema.String }, // 409: someone else holds the ticket
    // One unknown event for the one keyed write whose handler acts on its lane (rule 43).
    AssignUnsure: Flow.uncertain({ workspaceId: Schema.String, ticketId: Schema.String }),
    ReconcileAssign: { workspaceId: Schema.String, ticketId: Schema.String },
  },
  context: { userId: Session.select(({ memory }) => memory.userId) },
  memory: {
    workspaceId: Flow.input(Schema.String),
    search: Flow.initial(Schema.String, ""), // as typed; the list input trims and lowercases it
    status: Flow.initial(Schema.NullOr(TicketStatus), null),
    mineOnly: Flow.initial(Schema.Boolean, false),
    notice: Flow.initial(Schema.String, ""),
    previewId: Flow.initial(Schema.NullOr(Schema.String), null), // the ticket whose comments the drawer shows
  },
  // `Comments` at the root, once: the drawer. Its filling and `resetOn` are in the machine.
  traits: { preview: Comments },
  operations: ({ E }) => ({
    // Maps `value`, so the machine subscribes. Rows are read from the lane; the event only says "loaded".
    list: TicketsDomain.list.outcomes({
      value: E.ListLoaded,
      failure: {
        QueueUnavailable: E.ListUnavailable.from(({ retryAfter }) => ({ retryAfter })),
        // A lost read degrades the queue the same way a 503 does; Flow's two are required in a tag record
        // (rule 37), and a list that cannot be read is "unavailable" whatever the reason.
        NoResponse: E.ListUnavailable.from(() => ({ retryAfter: 5 })),
        Defect: E.ListUnavailable.from(() => ({ retryAfter: 5 })),
        Interrupted: E.ListUnavailable.from(() => ({ retryAfter: 5 })),
      },
    }),
    open: TicketsDomain.openCount, // bare: the badge reads the lane
    // Key `["workspaceId", "ticketId"]` on the contract: one lane per ticket, created by work.
    assign: TicketsDomain.assign.outcomes({
      failure: {
        TicketNotFound: E.AssignFailed.from(() => ({ reason: "That ticket was removed" })),
        AlreadyAssigned: E.AssignConflict.from(({ assignee }) => ({ assignee })),
        NotSent: E.AssignFailed.from(() => ({ reason: "That assignment was not sent" })), // rule 20
      },
      unknown: E.AssignUnsure.from((_ending, { key }) => ({
        workspaceId: key.workspaceId,
        ticketId: key.ticketId,
      })),
    }),
  }),
});
