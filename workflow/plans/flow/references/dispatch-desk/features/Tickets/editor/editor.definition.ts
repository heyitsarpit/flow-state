// The complete editor vocabulary. Public events are what users and other actors may send;
// internal events come only from this actor's own schedules, reactions and outcomes, so a
// component or a URL can never forge a Saved (FlowState D19).
import { Schema } from "effect";
import { Attempt, definition } from "flow-state";
import { Session } from "../../Session/session.definition.js";
import { TicketsDomain } from "../ticket.domain.js";
import { technicianUpdates } from "../ticket.operations.js";
import { TicketRow } from "../types.js";

export const Editor = definition({
  id: "DispatchDesk/Editor",
  states: [{ OPEN: ["EDITING", "SAVING", "SAVED", "FAILED", "LOCKED", "UNCERTAIN"] }, "CLOSED"],
  events: {
    TitleChanged: { title: Schema.String },
    SaveRequested: {},
    CancelSave: {},
    RefreshRequested: {},
    Escape: {},
    Close: {},
    Reopen: {},
  },
  internalEvents: {
    TicketLoaded: { title: Schema.String },
    AutosaveDue: {},
    RetrySave: {},
    PermissionRevoked: {},
    Saved: { ticket: TicketRow },
    SaveFailed: { reason: Schema.String },
    SaveLocked: { lockedBy: Schema.String },
    SaveUncertain: { attempt: Attempt }, // the save may have reached the server
  },
  context: { canEdit: Session.select(({ memory }) => memory.canEdit) }, // one upward read edge
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  // Memory holds keys and drafts, never copies of cached tickets (FlowState D29).
  memory: {
    workspaceId: Schema.String,
    ticketId: Schema.String,
    draft: Schema.String, // what the user is typing
    saved: Schema.String, // the last title the server confirmed; the draft is dirty when they differ
    error: Schema.String,
    lockRetries: Schema.Int,
    uncertain: Schema.NullOr(Attempt), // a save whose outcome is unknown, kept so it can be retried
  },
  initial: ({ input }) => ({
    workspaceId: input.workspaceId,
    ticketId: input.ticketId,
    draft: "",
    saved: "",
    error: "",
    lockRetries: 0,
    uncertain: null,
  }),
  operations: { Tickets: TicketsDomain, technicianUpdates }, // a domain handle and a plain stream
});

// Editor also exposes Editor.Event, State, Input, Memory and Snapshot Schemas for decoding at
// application boundaries (FlowState D47). Decoding an internal event is rejected.
