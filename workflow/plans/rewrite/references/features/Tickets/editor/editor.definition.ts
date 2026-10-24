// The complete editor vocabulary. Input initializes local draft memory once.
import { Result } from "effect";
import { definition } from "flow-state";
import { sessionDefinition } from "../../Session/session.definition.js";
import { saveTitle, ticketById } from "../ticket.operations.js";
import type { Ticket, TicketError } from "../types.js";

export const Editor = definition({
  id: "DispatchDesk/Editor",
  states: [{ OPEN: ["EDITING", "SAVING", "SAVED", "FAILED"] }, "CLOSED"],
  events: {
    TitleChanged: (title: string) => ({ title }),
    SaveRequested: (requestId: string) => ({ requestId }),
    SaveSucceeded: (ticket: Ticket) => ({ ticket }),
    SaveFailed: (error: TicketError) => ({ error }),
    SaveDefected: "bare",
    SaveInterrupted: "bare",
    PermissionRevoked: "bare",
    LoadRequested: "bare",
    RefreshRequested: "bare",
    CancelLoad: "bare",
    CancelSave: "bare",
    InvalidateTicket: "bare",
    ClearTicket: "bare",
    ReminderDue: "bare",
    Close: "bare",
    Reopen: "bare",
  },
  context: {
    canEdit: sessionDefinition.select(({ memory }) => memory.canEdit),
  },
  memory: ({ input }: { input: { workspaceId: string; ticketId: string; title: string } }) => ({
    workspaceId: input.workspaceId,
    ticketId: input.ticketId,
    draft: input.title,
    error: "",
    reminders: 0,
  }),
  operations: { ticketById, saveTitle },
});

export const editorDefinition = Result.getOrThrow(Editor);
