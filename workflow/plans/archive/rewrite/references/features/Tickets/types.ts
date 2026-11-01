// Application domain protocols, independent of Flow and its hosts.
import { Data, Schema } from "effect";

// Ticket crosses boundaries (persisted cache data, CLI evidence), so it is a Schema (D46).
export const TicketStatus = Schema.Literals(["open", "assigned", "closed"]);

export type TicketStatus = typeof TicketStatus.Type;

export const Ticket = Schema.Struct({
  workspaceId: Schema.String,
  ticketId: Schema.String,
  title: Schema.String,
  status: TicketStatus,
  assignee: Schema.NullOr(Schema.String),
});

export type Ticket = typeof Ticket.Type;

export type TicketRef = { workspaceId: string; ticketId: string };

export type SaveTitleInput = TicketRef & { title: string; requestId: string };

export type TicketFilters = {
  status: typeof TicketStatus.Type | null;
  search: string;
  assignee: string | null;
};

export type TicketListInput = { workspaceId: string; filters: TicketFilters; page: number };

export type TicketPage = { tickets: Ticket[]; total: number };

export type TechnicianUpdate = { stage: "assigned" | "on-site" | "completed"; at: number };

// Tagged expected failures: outcomes route by tag (D58).
export class TicketNotFound extends Data.TaggedError("TicketNotFound")<{ ticketId: string }> {}

export class TicketLocked extends Data.TaggedError("TicketLocked")<{ lockedBy: string }> {}

export class TitleRejected extends Data.TaggedError("TitleRejected")<{ reason: string }> {}

export class QueueUnavailable extends Data.TaggedError("QueueUnavailable")<{
  retryAfter: number;
}> {}
