// One watcher per ticket, named by its parts, shared by the ticket panel. Not persisted: who is here is only true
// now. It stays for 15 seconds after the last view lets go, so moving between screens does not leave and rejoin.
// Pending merge 6.
import { actorRef } from "flow-state";
import type { TicketKey } from "../Tickets/types.js";
import { PresenceMachine } from "./presence.machine.js";

export const presenceRef = (ticket: TicketKey) =>
  actorRef(PresenceMachine, [ticket.workspaceId, ticket.ticketId], { retain: "15 seconds" });
