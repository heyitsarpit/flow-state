// Dispatch, as shared records: one write that changes two entities. The ticket's assignee is predicted, and so is
// the technician's status, which the response (the ticket) does not carry, so it is a declared target. A dispatched
// technician's card moves from "Free" to "Busy" at once (E4), because the panel's columns are the records' status.
import { domain, write } from "flow-state";
import { Technician } from "../../Roster/roster.domain.js";
import { Ticket } from "../ticket.domain.js";
import { dispatchTicket } from "./technicians.contracts.js";

export const DispatchDomain = domain("dispatch", {
  dispatch: write(dispatchTicket)
    .one(Ticket)
    .alsoChanges(({ input }) =>
      Technician.fields(
        { workspaceId: input.workspaceId, technicianId: input.technicianId },
        ({ record }) => [record.status],
      ),
    )
    .predicts(({ input }) => [
      Ticket.patch(
        { workspaceId: input.workspaceId, ticketId: input.ticketId },
        { assignee: input.technicianId, status: "assigned" },
      ),
      Technician.patch(
        { workspaceId: input.workspaceId, technicianId: input.technicianId },
        { status: "busy" },
      ),
    ]),
});
