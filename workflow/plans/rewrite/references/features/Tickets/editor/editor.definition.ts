// The complete editor vocabulary. Input initializes local draft memory once.
import { Schema } from "effect";
import { definition } from "flow-state";
import { Session } from "../../Session/session.definition.js";
import { saveTitle, technicianUpdates, ticketById, ticketList } from "../ticket.operations.js";
import { Ticket } from "../types.js";

export const Editor = definition({
  id: "DispatchDesk/Editor",
  states: [{ OPEN: ["EDITING", "SAVING", "SAVED", "FAILED", "LOCKED"] }, "CLOSED"],
  events: {
    // What the user and other actors can do.
    TitleChanged: { title: Schema.String },
    SaveRequested: {},
    CancelSave: {},
    LoadRequested: {},
    RefreshRequested: {},
    Close: {},
    Reopen: {},
    // Timer, reaction and operation-outcome vocabulary.
    AutosaveDue: {},
    ReminderDue: {},
    RetrySave: {},
    PermissionRevoked: {},
    SaveSucceeded: Ticket.fields, // The success value's fields (see api-reference.ts, payload rule).
    SaveRejected: { reason: Schema.String },
    TicketLocked: { lockedBy: Schema.String },
    SaveDefected: {},
  },
  context: {
    canEdit: Session.select(({ memory }) => memory.canEdit),
  },
  input: { workspaceId: Schema.String, ticketId: Schema.String, title: Schema.String },
  memory: {
    workspaceId: Schema.String,
    ticketId: Schema.String,
    draft: Schema.String,
    edits: Schema.Int, // Counts edits; derives deterministic autosave request ids.
    error: Schema.String,
    reminders: Schema.Int,
    lockRetries: Schema.Int,
  },
  initial: ({ input }) => ({
    workspaceId: input.workspaceId,
    ticketId: input.ticketId,
    draft: input.title,
    edits: 0,
    error: "",
    reminders: 0,
    lockRetries: 0,
  }),
  operations: { ticketById, ticketList, saveTitle, technicianUpdates },
});

// Editor also exposes Editor.Event (Schema.TaggedUnion), Editor.State, Editor.Input,
// Editor.Memory and Editor.Snapshot for decoding at application boundaries (D55).
