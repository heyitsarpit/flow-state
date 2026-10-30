// One assistant per ticket, named by its parts. Persisted so a reload while asking restores ASKING, where
// the held Attempt arrives as `unknown { Restored }` and ends `Cut` with no partial text (M6 2.10).
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7.
import { actorRef } from "flow-state";
import type { TicketKey } from "../Tickets/types.js";
import { AssistantMachine } from "./assistant.machine.js";

export const assistantRef = (ticket: TicketKey) =>
  actorRef(AssistantMachine, [ticket.workspaceId, ticket.ticketId], {
    persist: true,
    retain: "10 minutes",
  });
