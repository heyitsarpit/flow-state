// The replaceable service port, over `fetch`. Each call returns an Effect with exact success and
// failure channels: `NoResponse` when `fetch` rejects, `ServerError` for a 5xx, and the tagged
// 4xx failures the contract knows. The commit classifies them (machine-design 2.7.2); this port
// never decides what is definite and what is unknown. Live feeds are not here: they moved to
// feed/desk-socket.ts.
import { Context, type Effect } from "effect";
import type {
  ActivityPage,
  AlreadyAssigned,
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
    load: (key: TicketKey, options: Read) => Effect.Effect<TicketRow, TicketNotFound>;
    list: (input: TicketListInput, options: Read) => Effect.Effect<TicketPage, QueueUnavailable>;
    openCount: (input: { workspaceId: string }, options: Read) => Effect.Effect<number>;
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
    // One page of the workspace's activity after a position: the catch-up behind the socket's
    // `activity` frames (pending merge 6: feed.contracts.ts pages it from `catchUp`).
    eventsSince: (
      input: { workspaceId: string; after: Cursor },
      options: Read,
    ) => Effect.Effect<ActivityPage, NoResponse>;
  }
>()("DispatchDesk/TicketApi") {}
