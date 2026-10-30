// What the ticket contracts mean for shared data (rules 26-38). One record per ticket stays
// coherent across the editor, the queue and the counts; repair refetches only what can be wrong.
import { and, asc, desc, domain, entity, eq, read, serverMatches, write } from "flow-state";
import { assignTicket, openCount, saveTitle, ticketById, ticketList } from "./ticket.contracts.js";
import { TicketRow } from "./types.js";

// The record is declared once: the entity reuses the wire row's fields.
export const Ticket = entity({
  id: "DispatchDesk/Ticket",
  fields: TicketRow.fields,
  primaryKey: ["workspaceId", "ticketId"],
  version: "revision",
});

export const TicketsDomain = domain("tickets", {
  // How one ticket is loaded by its key; confirming reads and forced repairs use it.
  ticketById: read(ticketById)
    .one(Ticket)
    .byKey(({ input }) => ({ workspaceId: input.workspaceId, ticketId: input.ticketId })),

  // Every input is accounted for (rule 26): workspace, status and assignee are conditions;
  // the search is matched by the server on the title; page is the paging input.
  list: read(ticketList)
    .list(Ticket, ({ output }) => output.tickets)
    .where(({ input, record }) =>
      and(
        eq(record.workspaceId, input.workspaceId),
        eq(record.status, input.status), // absent status means any status
        eq(record.assignee, input.assignee),
        serverMatches(input.search, record.title),
      ),
    )
    .orderBy(({ record }) => [
      desc(record.updatedAt),
      asc(record.workspaceId), // total: ends with every key field (2.8.2)
      asc(record.ticketId),
    ])
    .pagedBy(
      ({ input }) => input.page,
      ({ output }) => output.nextPage,
    ),

  // A count the server computes; it changes only when a ticket enters or leaves "open".
  openCount: read(openCount)
    .derivedFrom(Ticket, ({ record }) => [record.status])
    .where(({ input, record }) =>
      and(eq(record.workspaceId, input.workspaceId), eq(record.status, "open")),
    ),

  // The title shows at once everywhere the ticket appears. The response carries the ticket, so
  // the prediction is confirmed by it; lists that match by title or order by updatedAt repair.
  saveTitle: write(saveTitle)
    .one(Ticket)
    .predicts(({ input }) =>
      Ticket.patch(
        { workspaceId: input.workspaceId, ticketId: input.ticketId },
        { title: input.title },
      ),
    ),

  // Assigning changes two condition fields, so lists filtered by status or assignee repair, and
  // the open count refetches.
  assign: write(assignTicket)
    .one(Ticket)
    .predicts(({ input }) =>
      Ticket.patch(
        { workspaceId: input.workspaceId, ticketId: input.ticketId },
        { assignee: input.assignee, status: "assigned" },
      ),
    ),

  // Other dispatchers' changes are not here: the push `listen` entry moved to a second domain over the
  // same entity, TicketFeed in feed/feed.domain.ts (pending merge 6).
});
