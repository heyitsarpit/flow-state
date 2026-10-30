// The ticket contracts: plain requests with no entity or domain imports (adopting entities edits only
// ticket.domain.ts). Every contract states `input`, `output` and `key` (rule 39). The live feeds are not
// here: `ticketChanges` and `activity` are in feed/feed.contracts.ts (pending merge 6).
import { Schema } from "effect";
import { resource, transaction } from "flow-state";
import { unknownWhenLost } from "../shared/outcomes.js";
import { TicketApi } from "./ticket-api.js";
import { TicketPage, TicketRow, TicketStatus } from "./types.js";

// Resources ----------------------------------------------------------------------------------------

export const ticketById = resource({
  id: "DispatchDesk/ticket-by-id",
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  output: TicketRow,
  key: ["workspaceId", "ticketId"],
  lookup: (key, { signal }) => TicketApi.use((api) => api.load(key, { signal })), // fails TicketNotFound
  staleTime: "30 seconds", // required, with no library default
  gcTime: "5 minutes",
  persist: true,
});

// Every input field that changes the output is in `key` (rule 39), so the key lists all five. A key is
// the pick of those fields and cannot be derived (OD4), so the old normalised search ("Lobby " and "lobby"
// sharing one entry) is no longer written here: the queue's definition trims and lowercases `search`
// before it builds the input (decided, OD4).
export const ticketList = resource({
  id: "DispatchDesk/ticket-list",
  input: {
    workspaceId: Schema.String,
    status: Schema.optionalKey(TicketStatus), // absent means any status
    assignee: Schema.optionalKey(Schema.String),
    search: Schema.optionalKey(Schema.String),
    page: Schema.optionalKey(Schema.Number),
  },
  output: TicketPage,
  key: ["workspaceId", "status", "assignee", "search", "page"],
  lookup: (input, { signal }) => TicketApi.use((api) => api.list(input, { signal })), // fails QueueUnavailable
  staleTime: "10 seconds",
  gcTime: "2 minutes",
});

// `output` is a Schema, which is what lets an answer cross a boundary: persisted, or carried in a server
// render's payload. An answer without one is fetched by the browser.
export const openCount = resource({
  id: "DispatchDesk/open-count",
  input: { workspaceId: Schema.String },
  output: Schema.Number,
  key: ["workspaceId"],
  lookup: (input, { signal }) => TicketApi.use((api) => api.openCount(input, { signal })),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});

// Transactions -------------------------------------------------------------------------------------

// `attempt.id` is minted by Flow per Attempt and reused when the Attempt is re-sent, so it is the idempotency
// key the server deduplicates on (rule 19). One lane per ticket; a second save while one runs is declined.
export const saveTitle = transaction({
  id: "DispatchDesk/save-title",
  input: { workspaceId: Schema.String, ticketId: Schema.String, title: Schema.String },
  output: TicketRow,
  key: ["workspaceId", "ticketId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id, signal })).pipe(
      // Definite failures, by the status the port decoded: TicketNotFound (404), TicketLocked (423) and
      // TitleRejected (422). They stay plain errors and default to failure.
      unknownWhenLost, // NoResponse and ServerError (5xx): unknown
    ),
});

export const assignTicket = transaction({
  id: "DispatchDesk/assign-ticket",
  input: { workspaceId: Schema.String, ticketId: Schema.String, assignee: Schema.String },
  output: TicketRow,
  key: ["workspaceId", "ticketId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    TicketApi.use((api) => api.assign(input, { idempotencyKey: attempt.id, signal })).pipe(
      // TicketNotFound (404) and AlreadyAssigned (409): definite. The queue refetches on the second.
      unknownWhenLost,
    ),
});
