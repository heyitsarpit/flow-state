// One watcher per ticket, named by its parts (as `editorRef`), shared by the ticket panel and the
// queue row: both ensure the same ref, so the Runtime holds one session per ticket (M6 2.5).
// Not persisted: who is here is only true now, and a reload opens a new session. It stays for 15
// seconds after the last view lets go, so moving from a row to its panel does not leave and rejoin.
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7, S1–S10.
import { actorRef } from "flow-state";
import type { TicketKey } from "../Tickets/types.js";
import { PresenceMachine } from "./presence.machine.js";

export const presenceRef = (ticket: TicketKey) =>
  actorRef(PresenceMachine, [ticket.workspaceId, ticket.ticketId], { retain: "15 seconds" });
