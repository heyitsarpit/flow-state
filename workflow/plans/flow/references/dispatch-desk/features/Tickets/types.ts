// Application domain protocols, independent of Flow and its hosts.
import { Data, Schema } from "effect";

export const TicketStatus = Schema.Literals(["open", "assigned", "closed"]);

export type TicketStatus = typeof TicketStatus.Type;

// The wire row the API returns. The Ticket entity reuses these fields (ticket.domain.ts).
export const TicketRow = Schema.Struct({
  workspaceId: Schema.String,
  ticketId: Schema.String,
  title: Schema.String,
  status: TicketStatus,
  assignee: Schema.NullOr(Schema.String),
  updatedAt: Schema.Number,
  revision: Schema.Number, // the server's version; orders writes, never repairs
});

export type TicketRow = typeof TicketRow.Type;

export type TicketKey = { workspaceId: string; ticketId: string };

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

export const TechnicianUpdate = Schema.Struct({
  stage: Schema.Literals(["assigned", "on-site", "completed"]),
  at: Schema.Number,
});

export type TechnicianUpdate = typeof TechnicianUpdate.Type;

// Server-pushed changes to tickets in one workspace.
export const TicketEvent = Schema.Union([
  Schema.TaggedStruct("TicketSaved", { ticket: TicketRow }),
  Schema.TaggedStruct("TicketRemoved", {
    workspaceId: Schema.String,
    ticketId: Schema.String,
    revision: Schema.Number,
  }),
]);

export type TicketEvent = typeof TicketEvent.Type;

// Tagged expected failures: outcomes route them by tag (FlowState D31).
export class TicketNotFound extends Data.TaggedError("TicketNotFound")<{ ticketId: string }> {}

export class TicketLocked extends Data.TaggedError("TicketLocked")<{ lockedBy: string }> {}

export class TitleRejected extends Data.TaggedError("TitleRejected")<{ reason: string }> {}

export class QueueUnavailable extends Data.TaggedError("QueueUnavailable")<{
  retryAfter: number;
}> {}
