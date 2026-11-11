// A second domain over the same Ticket entity, for what other dispatchers do. B1 left the push out of TicketsDomain; it lives here so the pure-HTTP half has no stream in it.
// Pushes are applied in order as they arrive, in a store publication, never through a turn (rule 29).
// Versions decide duplicates and reorders: `revision` is the entity's version, so a replay of a change
// the client already holds changes nothing.
import { domain, listen } from "flow-state";
import { Ticket } from "../ticket.domain.js";
import { ticketChanges } from "./feed.contracts.js";

export const TicketFeed = domain("ticket-feed", {
  // session's answers also drive the covered lists: a drop makes them stale at once, a start that proves
  // nothing refetches them. A pushed rename therefore repairs only lists that read `title`.
  changes: listen(ticketChanges).as([Ticket], (event) => {
    if (event._tag === "TicketRemoved") {
      return Ticket.delete(
        { workspaceId: event.workspaceId, ticketId: event.ticketId },
        { version: event.revision },
      );
    }

    const { workspaceId, ticketId, ...fields } = event.ticket;

    // design gap: a patch of a ticket no list holds yet changes nothing; it appears when a list loads it.
    return Ticket.patch({ workspaceId, ticketId }, fields);
  }),
});
