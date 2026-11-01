// The editor's whole vocabulary. Public events are what users and other actors may send; internal
// events come only from this actor's own schedules, reactions and operation endings, so a component
// or a URL can never forge a Saved (Machines.plan O1).
//
// Two operations, named (rule 40): `ticket` reads the ticket live, `save` writes its title. Two traits are
// placed: `comments` (a root trait, subject path `[]`) and `uploads` (one copy per entry of the memory list
// `attachments`). Names: `uploads` is the trait, so views read the copies at `s.memory.uploads`;
// `attachments` is the host's list, the `of:` of the placement (rule 9: membership is host data).
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { AttachmentsDomain } from "../../Attachments/attachments.domain.js";
import { AttachmentUpload } from "../../Attachments/upload.trait.js";
import { Comments } from "../../Comments/comments.trait.js";
import { Session } from "../../Session/session.definition.js";
import { TicketsDomain } from "../ticket.domain.js";
import { Autosave } from "./autosave.trait.js";
import { Body } from "./body.trait.js";
import { FieldName } from "./details-api.js";
import { ticketDetails } from "./fields.contracts.js";
import { TicketRow } from "../types.js";

export const MAX_RESENDS = 3; // user-defined: re-sends of an unconfirmed save, then give up
export const MAX_ATTACHMENTS = 10; // user-defined

// What a dropped file leaves in memory: its bytes wait in PendingFiles, never here (the editor is persisted).
export const AttachmentDraft = Schema.Struct({
  ref: Schema.String,
  name: Schema.String,
  size: Schema.Number,
});

// One entry per description field, in the order the form shows them. `field` is the copy's key (`by`); the list's
// order is the copies' order (rule 9), so the form's schema position is the list's.
export const FieldEntry = Schema.Struct({
  field: FieldName,
  label: Schema.String,
  saved: Schema.String,
});

// The editor holds three write styles on one screen (COVERAGE.md 5.1): the title (the hold, re-sent on a schedule,
// editor.machine.ts), the description fields (`.each` copies on `latest`, autosave.trait.ts) and the body (etag'd,
// `reject`, coalesced in its trait, body.trait.ts). The panels beside them are their own actor (panels.machine.ts).
export const Editor = definition({
  id: "DispatchDesk/Editor",
  states: [{ OPEN: ["EDITING", "SAVING", "SAVED", "FAILED", "LOCKED", "UNSURE"] }, "CLOSED"],
  events: {
    TitleChanged: { title: Schema.String },
    SaveRequested: {},
    CancelSave: {},
    RefreshRequested: {},
    Escape: {},
    Close: {},
    Reopen: {},
    AttachFile: AttachmentDraft.fields,
    RemoveAttachment: { ref: Schema.String }, // NEW
    RemoveStoredFile: { ref: Schema.String }, // a file already on the server (the ticket's file list)
  },
  internalEvents: {
    TicketLoaded: { title: Schema.String },
    TicketGone: {},
    TicketLoadFailed: {},
    AutosaveDue: {},
    RetrySave: {}, // the lock's backoff
    ResendDue: {}, // the hold's re-send
    PermissionRevoked: {},
    Saved: { ticket: TicketRow },
    SaveFailed: { reason: Schema.String },
    SaveLocked: { lockedBy: Schema.String },
    SaveNotSent: {}, // never left this device: cancelled while waiting, or a reload before the send
    SaveStopped: Flow.uncertain({}), // existing: Flow.uncertain; the user's own stop (`Cancelled`), released at once
    SaveUnsure: Flow.uncertain({}), // the request may have landed; the lane is Held until retried or released
    FileRemoved: {},
    FileKept: { uploadedBy: Schema.String }, // 403: the store already put it back
    FileRemoveUnsure: Flow.uncertain({}),
    DetailsLoaded: {
      fields: Schema.Record(Schema.String, Schema.String),
      body: Schema.String,
      etag: Schema.String,
    },
    DetailsFailed: {},
    FieldSettled: { field: FieldName }, // one field's debounce: the keyed schedule `settle`
  },
  context: { canEdit: Session.select(({ memory }) => memory.canEdit) }, // one upward read edge
  // Memory holds keys and drafts, never copies of cached tickets, and never the Attempt: the lane holds it
  // (rule 21), and views read `O.save.get(s, key).uncertain`.
  memory: {
    workspaceId: Flow.input(Schema.String),
    ticketId: Flow.input(Schema.String),
    draft: Flow.initial(Schema.String, ""), // what the user is typing
    saved: Flow.initial(Schema.String, ""), // the last title the server confirmed; dirty when they differ
    error: Flow.initial(Schema.String, ""),
    lockRetries: Flow.initial(Schema.Int, 0),
    attachments: Flow.initial(Schema.Array(AttachmentDraft), []), // the `of:` list of `uploads`
    fieldList: Flow.initial(Schema.Array(FieldEntry), []), // the `of:` list of `fields`, filled by the first read
    lastFieldSaved: Flow.initial(Schema.NullOr(FieldName), null), // the "saved" badge (F17)
  },
  operations: ({ E }) => ({
    // A domain read: the store keeps the ticket coherent with the queue's copy. Its `value` fires only when the
    // confirmed ticket changes, never for a prediction, so `saved` only ever holds what the server confirmed.
    ticket: TicketsDomain.ticketById.outcomes({
      value: E.TicketLoaded.from((ticket) => ({ title: ticket.title })),
      failure: {
        TicketNotFound: E.TicketGone,
        NoResponse: E.TicketLoadFailed, // `fetch` rejected or a 5xx: a lost read, never a defect (REVIEW gap 34)
        Defect: E.TicketLoadFailed, // a read's tag record maps Flow's two (rule 37)
        Interrupted: E.TicketLoadFailed,
      },
    }),
    // A domain write: the domain predicts the title, confirms it from the response and repairs every list
    // that can be wrong (rules 27-31). `reject`, keyed per ticket, so it holds an unknown (rule 21).
    save: TicketsDomain.saveTitle.outcomes({
      success: E.Saved.from((ticket) => ({ ticket })),
      failure: {
        TitleRejected: E.SaveFailed.from((e) => ({ reason: e.reason })),
        TicketNotFound: E.SaveFailed.from(() => ({ reason: "This ticket no longer exists" })),
        TicketLocked: E.SaveLocked.from((e) => ({ lockedBy: e.lockedBy })),
        NotSent: E.SaveNotSent, // a persisted identity: `Restored`, `StorageRefused`, `Disposed` (rule 20)
      },
      unknown: {
        // by tag (rule 13): the user's stop releases, anything else may have landed
        Cancelled: E.SaveStopped,
        NoResponse: E.SaveUnsure,
        ServerError: E.SaveUnsure,
        Restored: E.SaveUnsure, // a reload mid-save: the lane returns Held, and the root adopts it
        Interrupted: E.SaveUnsure,
        Defect: E.SaveUnsure,
        StillUnknown: E.SaveUnsure,
        StorageRefused: E.SaveUnsure, // a persisted re-send whose lane-record capture failed (2.7.13)
      },
    }),
    // The description fields and the body, one read. Its value fills the field list once and feeds the body.
    details: ticketDetails.outcomes({
      value: E.DetailsLoaded.from((d) => ({ fields: d.fields, body: d.body, etag: d.etag })),
      failure: {
        NoResponse: E.DetailsFailed,
        Defect: E.DetailsFailed,
        Interrupted: E.DetailsFailed,
      },
    }),
    // The ticket's stored files: a domain list the view reads. A finished upload joins it (the trait's `put` is a
    // domain write), so the view shows each file once: as a copy while it uploads, as a record once stored.
    files: AttachmentsDomain.files, // bare: the view reads the rows
    // Removing a stored file predicts its delete; a 403 restores it (E3). One lane per file, `reject`.
    removeFile: AttachmentsDomain.remove.outcomes({
      success: E.FileRemoved,
      failure: {
        RemoveRefused: E.FileKept.from((e) => ({ uploadedBy: e.uploadedBy })),
        NotSent: E.FileRemoved, // nothing happened, nothing to say: the record was never hidden for long
      },
      unknown: E.FileRemoveUnsure,
    }),
  }),
  traits: {
    comments: Comments,
    uploads: AttachmentUpload.each({ of: "attachments", by: "ref", max: MAX_ATTACHMENTS }),
    fields: Autosave.each({ of: "fieldList", by: "field", max: 3 }),
    body: Body,
  },
});

// Editor also exposes Editor.Event, State, Input, Memory and Snapshot Schemas for decoding at
// application boundaries (Machines.plan O1). Decoding an internal event is rejected.
