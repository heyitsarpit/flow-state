// Application domain protocols, independent of Flow and its hosts. Effect-only: it imports nothing else.
import { Schema } from "effect";

export const TicketStatus = Schema.Literals(["open", "assigned", "closed"]);

export type TicketStatus = typeof TicketStatus.Type;

// The wire row the API returns. The Ticket entity reuses these fields (ticket.domain.ts).
// Priority is a number, not a word: the domain orders by it (`desc(priority)`), and the client compares only
// numbers, booleans, dates and keys, never strings, whose collation is the server's (entity-domain 4.4).
export const Priority = { low: 0, normal: 1, urgent: 2 } as const;

export const TicketRow = Schema.Struct({
  workspaceId: Schema.String,
  ticketId: Schema.String,
  title: Schema.String,
  status: TicketStatus,
  assignee: Schema.NullOr(Schema.String), // a technician's id: names a `Technician` (features/Roster)
  priority: Schema.Int, // 0 low, 1 normal, 2 urgent
  dueAt: Schema.NullOr(Schema.Number), // the SLA deadline; null when the ticket has none
  customerId: Schema.NullOr(Schema.String), // names a `Customer` (features/Roster); a merge re-points it
  commentCount: Schema.Int, // the server counts; a post predicts `+1` (comments.domain.ts)
  updatedAt: Schema.Number,
  revision: Schema.Number, // the server's version; orders writes, never repairs
});

export type TicketRow = typeof TicketRow.Type;

export type TicketKey = { workspaceId: string; ticketId: string };

// A new ticket from the queue's composer. `draftId` stays on the device: it is the create's lane and the
// view's key, never the server's id (rule 33).
export type NewTicket = {
  workspaceId: string;
  draftId: string;
  title: string;
  priority: number;
  dueAt: number | null;
};

// Absent filters mean "no constraint", on the server and in the domain's conditions.
export type TicketListInput = {
  workspaceId: string;
  status?: TicketStatus;
  assignee?: string;
  search?: string;
  page?: number;
};

// No total: a count over unloaded pages has no dependency the domain can repair (a ticket deleted
// beyond the loaded pages would leave it stale). Counts the app needs are derived reads (openCount).
export const TicketPage = Schema.Struct({
  tickets: Schema.Array(TicketRow),
  nextPage: Schema.optional(Schema.Number), // absent on the last page
});

export type TicketPage = typeof TicketPage.Type;

// A position in one workspace's event log. A reset of the log starts a new epoch, so { 8, 41 } and
// { 9, 41 } are different events (pending merge 6: M6 4.1 uses the same shape for a chat).
export const Cursor = Schema.Struct({ epoch: Schema.Int, seq: Schema.Int });

export type Cursor = typeof Cursor.Type;

export const sameCursor = (a: Cursor | undefined, b: Cursor | undefined) =>
  a?.epoch === b?.epoch && a?.seq === b?.seq;

// Server-pushed changes to tickets in one workspace, each at its position in the log.
export const TicketEvent = Schema.Union([
  Schema.TaggedStruct("TicketSaved", { cursor: Cursor, ticket: TicketRow }),
  Schema.TaggedStruct("TicketRemoved", {
    cursor: Cursor,
    workspaceId: Schema.String,
    ticketId: Schema.String,
    revision: Schema.Number,
  }),
]);

export type TicketEvent = typeof TicketEvent.Type;

// One readable line per logged event ("dispatcher-7 assigned T-42"). It shares its event's cursor:
// the id is the stable identity a client stores by, so a line delivered twice is kept once.
export const ActivityEntry = Schema.Struct({
  id: Schema.String,
  cursor: Cursor,
  workspaceId: Schema.String,
  ticketId: Schema.String,
  text: Schema.String,
  at: Schema.Number,
});

export type ActivityEntry = typeof ActivityEntry.Type;

// A catch-up page. `complete` is the server's own word that nothing newer is left, never "the page
// was short". `truncated` says the retained log no longer reaches `after`: `oldest` is its first
// position and `beforeOldest` the position just before it, where a client may continue.
export const ActivityPage = Schema.Struct({
  entries: Schema.Array(ActivityEntry),
  next: Schema.optional(Cursor),
  complete: Schema.Boolean,
  truncated: Schema.optional(Schema.Struct({ oldest: Cursor, beforeOldest: Cursor })),
});

export type ActivityPage = typeof ActivityPage.Type;

// Tagged expected failures. A commit classifies them with Outcome (definite failure or unknown)
// beside the status it reads (machine-design 2.7.1, 2.7.2).
export class TicketNotFound extends Schema.TaggedError<TicketNotFound>()("TicketNotFound", {
  ticketId: Schema.String,
}) {}

export class TicketLocked extends Schema.TaggedError<TicketLocked>()("TicketLocked", {
  lockedBy: Schema.String,
}) {}

export class TitleRejected extends Schema.TaggedError<TitleRejected>()("TitleRejected", {
  reason: Schema.String,
}) {}

// 409 on an assignment: someone else holds the ticket. Definite, and the queue refetches.
export class AlreadyAssigned extends Schema.TaggedError<AlreadyAssigned>()("AlreadyAssigned", {
  assignee: Schema.String,
}) {}

// 403 on an archive: only an admin archives a ticket with open work. Definite: the record is restored.
export class ArchiveRefused extends Schema.TaggedError<ArchiveRefused>()("ArchiveRefused", {
  reason: Schema.String,
}) {}

// 422 on a create: the title is empty or the due date is in the past.
export class TicketRejected extends Schema.TaggedError<TicketRejected>()("TicketRejected", {
  reason: Schema.String,
}) {}

export class QueueUnavailable extends Schema.TaggedError<QueueUnavailable>()("QueueUnavailable", {
  retryAfter: Schema.Number,
}) {}

// `fetch` rejected: the request may or may not have reached the server. Every write port fails with
// it, and the commit turns it into `Outcome.unknown` (2.7.2).
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

// A 5xx answer: the server may have applied the write before it failed.
export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", {
  status: Schema.Number,
}) {}

// The workspace socket ended and a retry may succeed (pending merge 6: the adapter's transient failure).
export class SocketDropped extends Schema.TaggedError<SocketDropped>()("SocketDropped", {
  why: Schema.String,
}) {}

// Close code 4401: the token expired. Terminal; retrying cannot help.
export class SignedOut extends Schema.TaggedError<SignedOut>()("SignedOut", {}) {}
