// The ticket's details: three short description fields, the long body and the history. Plain requests, no domain:
// details are one ticket's text, read by its own screen; nothing else shows them (rule 39: input, output, key).
//
// Two write policies side by side, on purpose (COVERAGE.md O4, O6):
//   - a short field is `latest`, one lane per field: last write wins on the server, so a newer value replaces the
//     queued one (`Superseded` evidence) and rapid edits send at most two requests; summary, location note and
//     access code never wait on each other.
//   - the body is `reject`, one lane per ticket, with `If-Match`. `latest` would be wrong here: a queued commit's
//     input is fixed when it is committed (rule 22), so a replaced-then-sent body would carry the etag of the turn
//     that queued it, which the save ahead of it has made stale, and every coalesced save would meet 412. The body
//     trait coalesces in its own memory instead and sends the newest text with the newest etag after each answer.
import { Schema } from "effect";
import { resource, transaction } from "flow-state";
import { unknownWhenLost } from "../../shared/outcomes.js";
import {
  FieldName,
  HistoryEntry,
  HistoryPage,
  TicketDetails,
  TicketDetailsApi,
} from "./details-api.js";

const ticket = { workspaceId: Schema.String, ticketId: Schema.String };

export const ticketDetails = resource({
  id: "DispatchDesk/ticket-details",
  input: ticket,
  output: TicketDetails,
  key: ["workspaceId", "ticketId"],
  lookup: (key, { signal }) => TicketDetailsApi.use((api) => api.details(key, { signal })),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  persist: true,
});

export const saveTicketField = transaction({
  id: "DispatchDesk/save-ticket-field",
  input: { ...ticket, field: FieldName, value: Schema.String },
  output: TicketDetails,
  key: ["workspaceId", "ticketId", "field"],
  concurrency: "latest",
  commit: (input, { attempt, signal }) =>
    TicketDetailsApi.use((api) =>
      api.saveField(input, { idempotencyKey: attempt.id, signal }),
    ).pipe(
      unknownWhenLost, // FieldRejected (422) stays a failure
    ),
});

export const saveTicketBody = transaction({
  id: "DispatchDesk/save-ticket-body",
  input: { ...ticket, body: Schema.String, ifMatch: Schema.String },
  output: TicketDetails,
  key: ["workspaceId", "ticketId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    TicketDetailsApi.use((api) => api.saveBody(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost, // BodyConflict (412) stays a failure; after an unknown send it arrives as StillUnknown (rule 18)
    ),
});

// The newest page of history, live, and older pages as one-off reads a panel waits on.
export const historyOf = resource({
  id: "DispatchDesk/ticket-history",
  input: { ...ticket, before: Schema.optionalKey(Schema.String) },
  output: HistoryPage,
  key: ["workspaceId", "ticketId", "before"],
  lookup: ({ before, ...key }, { signal }) =>
    TicketDetailsApi.use((api) =>
      api.history(before === undefined ? key : { ...key, before }, { signal }),
    ),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});

export const pinHistoryNote = transaction({
  id: "DispatchDesk/pin-history-note",
  input: { ...ticket, entryId: Schema.String, pinned: Schema.Boolean },
  output: HistoryEntry,
  key: ["workspaceId", "ticketId", "entryId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    TicketDetailsApi.use((api) => api.pinNote(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});
