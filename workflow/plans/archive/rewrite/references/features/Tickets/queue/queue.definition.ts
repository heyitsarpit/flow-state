// The dispatcher's ticket queue: filters, search, paging and live health of the list feed.
import { Schema } from "effect";
import { definition } from "flow-state";
import { Session } from "../../Session/session.definition.js";
import { ticketList } from "../ticket.operations.js";
import { TicketStatus } from "../types.js";

export const Queue = definition({
  id: "DispatchDesk/Queue",
  states: ["HEALTHY", "DEGRADED"],
  events: {
    SearchChanged: { search: Schema.String },
    StatusChanged: { status: Schema.NullOr(TicketStatus) },
    MineOnlyToggled: {},
    PageChanged: { page: Schema.Int },
    PollDue: {},
    ListLoaded: {},
    ListUnavailable: { retryAfter: Schema.Number },
  },
  context: {
    userId: Session.select(({ memory }) => memory.userId),
  },
  input: { workspaceId: Schema.String },
  memory: {
    workspaceId: Schema.String,
    search: Schema.String,
    status: Schema.NullOr(TicketStatus),
    mineOnly: Schema.Boolean,
    page: Schema.Int,
  },
  initial: ({ input }) => ({
    workspaceId: input.workspaceId,
    search: "",
    status: null,
    mineOnly: false,
    page: 0,
  }),
  operations: { ticketList },
});
