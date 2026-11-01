// The ticket contracts: plain requests with no entity or domain imports (adopting entities edits only
// ticket.domain.ts). Every contract states `input`, `output` and `key` (rule 39). The live feeds are not
// here: `ticketChanges` and `activity` are in feed/feed.contracts.ts (pending merge 6).
import { Schema } from "effect";
import { resource, transaction } from "flow-state";
import { unknownWhenLost } from "../shared/outcomes.js";
import { TicketApi } from "./ticket-api.js";
import { ClosePage, TicketPage, TicketRow, TicketStatus } from "./types.js";

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

// The queue's other lists. `unassigned` is every ticket nobody holds; `triage` reads the caller's clock, so
// `now` is part of the key: the queue rounds it to the minute before it builds the input (OD4, normalised in the
// caller), which makes one entry per minute rather than one per tick.
export const unassignedTickets = resource({
  id: "DispatchDesk/unassigned-tickets",
  input: { workspaceId: Schema.String, page: Schema.optionalKey(Schema.Number) },
  output: TicketPage,
  key: ["workspaceId", "page"],
  lookup: (input, { signal }) => TicketApi.use((api) => api.unassigned(input, { signal })),
  staleTime: "10 seconds",
  gcTime: "2 minutes",
});

export const customerTickets = resource({
  id: "DispatchDesk/customer-tickets",
  input: { workspaceId: Schema.String, customerId: Schema.String },
  output: Schema.Array(TicketRow),
  key: ["workspaceId", "customerId"],
  lookup: (input, { signal }) => TicketApi.use((api) => api.byCustomer(input, { signal })),
  staleTime: "30 seconds",
  gcTime: "2 minutes",
});

export const triageTickets = resource({
  id: "DispatchDesk/triage-tickets",
  input: { workspaceId: Schema.String, now: Schema.Number },
  output: TicketPage,
  key: ["workspaceId", "now"],
  lookup: (input, { signal }) => TicketApi.use((api) => api.triage(input, { signal })),
  staleTime: "30 seconds",
  gcTime: "2 minutes",
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

// A new ticket. `draftId` is the lane (one create per draft) and the view's key; it never reaches the server,
// which mints the ticket's id (rule 33). Fails TicketRejected (422): definite.
export const createTicket = transaction({
  id: "DispatchDesk/create-ticket",
  input: {
    workspaceId: Schema.String,
    draftId: Schema.String,
    title: Schema.String,
    priority: Schema.Int,
    dueAt: Schema.NullOr(Schema.Number),
  },
  output: TicketRow,
  key: ["draftId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    TicketApi.use((api) => api.create(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// Archiving removes the ticket from every list. ArchiveRefused (403, someone is working on it) and
// TicketNotFound (404) are definite; the domain then restores what it hid.
export const archiveTicket = transaction({
  id: "DispatchDesk/archive-ticket",
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  key: ["workspaceId", "ticketId"], // no output: void
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    TicketApi.use((api) => api.archive(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// One ticket's assignee, set or cleared, from the row's toggle. `latest`, one lane per ticket: assign, unassign,
// assign in a burst sends at most two requests, and the server ends with the last (O4). The adapter batches the
// assignments of one moment into one request (`assignResolver`, ticket-api.ts), and each item is answered on its
// own: AlreadyAssigned (409) and TicketNotFound (404) are this commit's alone.
export const setAssignee = transaction({
  id: "DispatchDesk/set-assignee",
  input: {
    workspaceId: Schema.String,
    ticketId: Schema.String,
    assignee: Schema.NullOr(Schema.String),
  },
  output: TicketRow,
  key: ["workspaceId", "ticketId"],
  concurrency: "latest",
  commit: (input, { attempt, signal }) =>
    TicketApi.use((api) => api.setAssignee(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// Close many tickets in one write, one lane per workspace, in order: `serialize` keeps a FIFO of at most 64 bulk
// operations behind the one on the wire, so "close these 50", then "close those 20" land in that order; the 65th is
// declined `NotSent { Overloaded }` (rule 35). `tickets` is an array of keys: the domain predicts each once.
export const closeTickets = transaction({
  id: "DispatchDesk/close-tickets",
  input: {
    workspaceId: Schema.String,
    tickets: Schema.Array(Schema.Struct({ workspaceId: Schema.String, ticketId: Schema.String })),
  },
  output: ClosePage,
  key: ["workspaceId"],
  concurrency: "serialize",
  commit: (input, { attempt, signal }) =>
    TicketApi.use((api) => api.closeMany(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});
