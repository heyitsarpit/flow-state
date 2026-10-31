// The replaceable service port, over `fetch`. Each call returns an Effect with exact success and
// failure channels: `NoResponse` when `fetch` rejects (reads and writes alike: a lost read is a network
// fact, not a defect), `ServerError` for a 5xx write, and the tagged 4xx failures the contract knows. The commit classifies them (machine-design 2.7.2); this port
// never decides what is definite and what is unknown. Live feeds are not here: they moved to
// feed/desk-socket.ts.
import { Context, type Effect } from "effect";
import type {
  ActivityPage,
  AlreadyAssigned,
  ArchiveRefused,
  NewTicket,
  TicketRejected,
  Cursor,
  NoResponse,
  QueueUnavailable,
  ServerError,
  TicketKey,
  TicketListInput,
  TicketLocked,
  TicketNotFound,
  TicketPage,
  TicketRow,
  TitleRejected,
} from "./types.js";

// Reads take the lifetime `signal` the lookup was handed.
type Read = { signal: AbortSignal };

// Writes also carry Flow's `attempt.id`, which the author puts on the wire as the idempotency key
// (rule 19); the server dedupes on it.
type Write = { idempotencyKey: string; signal: AbortSignal };

export class TicketApi extends Context.Service<
  TicketApi,
  {
    load: (key: TicketKey, options: Read) => Effect.Effect<TicketRow, TicketNotFound | NoResponse>;
    list: (
      input: TicketListInput,
      options: Read,
    ) => Effect.Effect<TicketPage, QueueUnavailable | NoResponse>;
    openCount: (input: { workspaceId: string }, options: Read) => Effect.Effect<number, NoResponse>;
    saveTitle: (
      input: TicketKey & { title: string },
      options: Write,
    ) => Effect.Effect<
      TicketRow,
      TicketNotFound | TicketLocked | TitleRejected | NoResponse | ServerError
    >;
    assign: (
      input: TicketKey & { assignee: string },
      options: Write,
    ) => Effect.Effect<TicketRow, TicketNotFound | AlreadyAssigned | NoResponse | ServerError>;
    // The queue's other two lists (ticket.domain.ts): tickets nobody holds, and the triage view, whose
    // condition reads the caller's clock (`now`, rounded to the minute by the queue: OD4, normalised in the caller).
    unassigned: (
      input: { workspaceId: string; page?: number },
      options: Read,
    ) => Effect.Effect<TicketPage, NoResponse>;
    triage: (
      input: { workspaceId: string; now: number },
      options: Read,
    ) => Effect.Effect<TicketPage, NoResponse>;
    // Every ticket of one customer: what a customer merge re-points (features/Roster).
    byCustomer: (
      input: { workspaceId: string; customerId: string },
      options: Read,
    ) => Effect.Effect<ReadonlyArray<TicketRow>, NoResponse>;
    create: (
      input: NewTicket,
      options: Write,
    ) => Effect.Effect<TicketRow, TicketRejected | NoResponse | ServerError>;
    archive: (
      input: TicketKey,
      options: Write,
    ) => Effect.Effect<void, TicketNotFound | ArchiveRefused | NoResponse | ServerError>;
    // One page of the workspace's activity after a position: the catch-up behind the socket's
    // `activity` frames (pending merge 6: feed.contracts.ts pages it from `catchUp`).
    eventsSince: (
      input: { workspaceId: string; after: Cursor },
      options: Read,
    ) => Effect.Effect<ActivityPage, NoResponse>;
  }
>()("DispatchDesk/TicketApi") {}
