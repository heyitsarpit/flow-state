// The dispatcher's ticket queue: filters, search, paging, assignment and list availability.
import { Schema } from "effect";
import { definition } from "flow-state";
import { Session } from "../../Session/session.definition.js";
import { TicketsDomain } from "../ticket.domain.js";
import { TicketStatus } from "../types.js";

export const Queue = definition({
  id: "DispatchDesk/Queue",
  states: ["HEALTHY", "DEGRADED"],
  events: {
    SearchChanged: { search: Schema.String },
    StatusChanged: { status: Schema.NullOr(TicketStatus) },
    MineOnlyToggled: {},
    LoadMore: {},
    AssignToMe: { ticketId: Schema.String },
  },
  internalEvents: {
    PollDue: {},
    ListLoaded: {},
    ListUnavailable: { retryAfter: Schema.Number },
    AssignFailed: { reason: Schema.String },
  },
  context: { userId: Session.select(({ memory }) => memory.userId) },
  input: { workspaceId: Schema.String },
  memory: {
    workspaceId: Schema.String,
    search: Schema.String,
    status: Schema.NullOr(TicketStatus),
    mineOnly: Schema.Boolean,
    notice: Schema.String,
  },
  initial: ({ input }) => ({
    workspaceId: input.workspaceId,
    search: "",
    status: null,
    mineOnly: false,
    notice: "",
  }),
  operations: { Tickets: TicketsDomain },
});
