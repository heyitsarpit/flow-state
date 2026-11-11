// What the ticket contracts mean for shared data (rules 26-38). One record per ticket stays
// coherent across the editor, the queue and the counts; repair refetches only what can be wrong.
import {
  and,
  asc,
  desc,
  domain,
  entity,
  eq,
  isNull,
  lt,
  or,
  read,
  serverMatches,
  write,
} from "flow-state"; // merge 5: or, isNull, lt
import {
  archiveTicket,
  assignTicket,
  closeTickets,
  setAssignee,
  createTicket,
  customerTickets,
  openCount,
  saveTitle,
  ticketById,
  ticketList,
  triageTickets,
  unassignedTickets,
} from "./ticket.contracts.js";
import { Priority, TicketRow } from "./types.js";

// The record is declared once: the entity reuses the wire row's fields.
export const Ticket = entity({
  id: "DispatchDesk/Ticket",
  fields: TicketRow.fields,
  primaryKey: ["workspaceId", "ticketId"],
  version: "revision",
});

// The queue's lists share one order: two sort keys, then the key (E6). `dueAt` is nullable: a pair of nulls is
// skipped and the next key decides (merge 5, M5-D4), so the client never guesses where the server puts tickets
// without a deadline. Priority is a number, so the client can check the order within a response; a title would
// not be (entity-domain 4.4).
// design gap: a shared `.orderBy` callback has no type for its recorded `record`, so the order is written out in
// each read rather than in one helper.
export const TicketsDomain = domain("tickets", {
  // How one ticket is loaded by its key; confirming reads and forced repairs use it.
  ticketById: read(ticketById)
    .one(Ticket)
    .byKey(({ input }) => ({ workspaceId: input.workspaceId, ticketId: input.ticketId })),

  // Every input is accounted for (rule 26): workspace, status and assignee are conditions;
  // the search is matched by the server on the title (so a rename repairs it); page is the paging input.
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
      desc(record.priority),
      asc(record.dueAt),
      asc(record.workspaceId), // total: ends with every key field (2.8.2)
      asc(record.ticketId),
    ])
    .pagedBy(
      ({ input }) => input.page,
      ({ output }) => output.nextPage,
    ),

  // Tickets nobody holds (`isNull`, merge 5). Assigning one predicts `assignee`, so the condition no longer holds
  // and the ticket leaves this list at once, in the starting turn's publication, and joins "mine" (E4, rule 28).
  unassigned: read(unassignedTickets)
    .list(Ticket, ({ output }) => output.tickets)
    .where(({ input, record }) =>
      and(eq(record.workspaceId, input.workspaceId), isNull(record.assignee)),
    )
    .orderBy(({ record }) => [
      desc(record.priority),
      asc(record.dueAt),
      asc(record.workspaceId), // total: ends with every key field (2.8.2)
      asc(record.ticketId),
    ])
    .pagedBy(
      ({ input }) => input.page,
      ({ output }) => output.nextPage,
    ),

  // Triage: urgent, or nobody holds it and its deadline has passed. Three-valued (M5-D7, D8): a null `dueAt` makes
  // `lt` "no", never "maybe". A prediction that does not carry a condition field makes the record "maybe" for
  // this list, so the list refetches rather than guessing (an assign predicts `assignee` but no `dueAt`: carried
  // fields decide; here both condition fields are known, so the record leaves at once).
  triage: read(triageTickets)
    .list(Ticket, ({ output }) => output.tickets)
    .where(({ input, record }) =>
      and(
        eq(record.workspaceId, input.workspaceId),
        or(
          eq(record.priority, Priority.urgent),
          and(isNull(record.assignee), lt(record.dueAt, input.now)),
        ),
      ),
    )
    .orderBy(({ record }) => [
      desc(record.priority),
      asc(record.dueAt),
      asc(record.workspaceId), // total: ends with every key field (2.8.2)
      asc(record.ticketId),
    ]),

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

  // Every ticket of one customer (the roster's merge reads it). `customerId` is a condition field, so a merge's
  // re-pointing prediction moves the tickets from one customer's list to the other's at once.
  byCustomer: read(customerTickets)
    .list(Ticket, ({ output }) => output)
    .where(({ input, record }) =>
      and(eq(record.workspaceId, input.workspaceId), eq(record.customerId, input.customerId)),
    )
    .orderBy(({ record }) => [
      desc(record.priority),
      asc(record.dueAt),
      asc(record.workspaceId),
      asc(record.ticketId),
    ]),

  // A create holds no prediction: no temporary id enters a list (rule 33). The queue shows its draft apart until
  // a list's refetch holds the server's id.
  create: write(createTicket).one(Ticket),

  // Archiving hides the ticket everywhere at once. A 403 is a definite failure: the delete is removed and the
  // ticket is back in place in every list, with no repair (rule 30).
  archive: write(archiveTicket).predicts(({ input }) =>
    Ticket.delete({ workspaceId: input.workspaceId, ticketId: input.ticketId }),
  ),

  // The row toggle: assigns or clears. The ticket leaves "Unassigned" (or joins it) at once (E4).
  setAssignee: write(setAssignee)
    .one(Ticket)
    .predicts(({ input }) =>
      Ticket.patch(
        { workspaceId: input.workspaceId, ticketId: input.ticketId },
        {
          assignee: input.assignee,
          status: (beneath, input) =>
            input.assignee === null ? "open" : beneath.status === "closed" ? "closed" : "assigned",
        },
      ),
    ),

  // Many records of one entity in one write (E2): every listed ticket is predicted closed, once. The answer lists
  // each ticket as the server has it, so a skipped one (someone is on it) is confirmed as it was: the partial
  // failure arrives as confirmed fields, not as an error. An unknown answer marks every listed record uncertain,
  // and one successful re-send clears every mark (rule 32, E17).
  bulkClose: write(closeTickets)
    .list(Ticket, ({ output }) => output.tickets)
    .predicts(({ input }) => Ticket.patch(input.tickets, { status: "closed" })),

  // Other dispatchers' changes are not here: the push `listen` entry moved to a second domain over the
  // same entity, TicketFeed in feed/feed.domain.ts.
});
