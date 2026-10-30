// dispatch-desk's features/Tickets/ticket.domain.ts, ported. Only two things differ from the original:
// imports come from the stand-in library, and the entity is declared without Schema (the spike has none).
// Every recorded position was already operator syntax, so no declaration changes.
import { and, asc, desc, domain, entity, eq, listen, read, serverMatches, write } from "../flow.ts";
import { assignTicket, openCount, saveTitle, ticketById, ticketEvents, ticketList } from "./ops.ts";
import type { TicketRow } from "./ops.ts";

export const Ticket = entity<TicketRow>()({
  id: "DispatchDesk/Ticket",
  primaryKey: ["workspaceId", "ticketId"],
  version: "revision",
});

export const TicketsDomain = domain("tickets", {
  ticketById: read(ticketById)
    .one(Ticket)
    .byKey(({ input }) => ({ workspaceId: input.workspaceId, ticketId: input.ticketId })),

  list: read(ticketList)
    .list(Ticket, ({ result }) => result.tickets)
    .where(({ input, record }) =>
      and(
        eq(record.workspaceId, input.workspaceId),
        eq(record.status, input.status), // absent status means any status
        eq(record.assignee, input.assignee),
        serverMatches(input.search, record.title),
      ),
    )
    .orderBy(({ record }) => [desc(record.updatedAt), asc(record.workspaceId), asc(record.ticketId)])
    .pagedBy(
      ({ input }) => input.page,
      ({ result }) => result.nextPage,
    ),

  openCount: read(openCount)
    .derivedFrom(Ticket, ({ record }) => [record.status])
    .where(({ input, record }) => and(eq(record.workspaceId, input.workspaceId), eq(record.status, "open"))),

  saveTitle: write(saveTitle)
    .one(Ticket)
    .predicts(({ input }) =>
      Ticket.patch({ workspaceId: input.workspaceId, ticketId: input.ticketId }, { title: input.title }),
    ),

  assign: write(assignTicket)
    .one(Ticket)
    .predicts(({ input }) =>
      Ticket.patch(
        { workspaceId: input.workspaceId, ticketId: input.ticketId },
        { assignee: input.assignee, status: "assigned" },
      ),
    ),

  // A runtime position: logic is ordinary code here, shown as an opaque mapping.
  events: listen(ticketEvents).as([Ticket], (event) =>
    event._tag === "TicketSaved"
      ? Ticket.save(event.ticket)
      : Ticket.delete({ workspaceId: event.workspaceId, ticketId: event.ticketId }, { version: event.revision }),
  ),
});
