import { actorRef } from "flow-state";
import type { TicketKey } from "../Tickets/types.js";
import { VisitMachine } from "./visit.machine.js";

// One visit per ticket, persisted: a resolution on the wire survives a dead phone battery (rule 46).
export const visitRef = (ticket: TicketKey) =>
  actorRef(VisitMachine, [ticket.workspaceId, ticket.ticketId], { persist: true });
