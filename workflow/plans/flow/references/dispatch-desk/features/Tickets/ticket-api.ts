// The replaceable service port. Requests return Effects with exact success and failure channels;
// live feeds return Streams.
import { Context, Effect, Stream } from "effect";
import type {
  QueueUnavailable,
  TechnicianUpdate,
  TicketEvent,
  TicketKey,
  TicketListInput,
  TicketLocked,
  TicketNotFound,
  TicketPage,
  TicketRow,
  TitleRejected,
} from "./types.js";

type SaveTitleRequest = TicketKey & { title: string; idempotencyKey: string };
type AssignRequest = TicketKey & { assignee: string; idempotencyKey: string };

export class TicketApi extends Context.Service<
  TicketApi,
  {
    load: (key: TicketKey, signal: AbortSignal) => Effect.Effect<TicketRow, TicketNotFound>;
    list: (
      input: TicketListInput,
      signal: AbortSignal,
    ) => Effect.Effect<TicketPage, QueueUnavailable>;
    openCount: (input: { workspaceId: string }, signal: AbortSignal) => Effect.Effect<number>;
    saveTitle: (
      request: SaveTitleRequest,
      signal: AbortSignal,
    ) => Effect.Effect<TicketRow, TicketNotFound | TicketLocked | TitleRejected>;
    assign: (
      request: AssignRequest,
      signal: AbortSignal,
    ) => Effect.Effect<TicketRow, TicketNotFound>;
    technicianUpdates: (key: TicketKey) => Stream.Stream<TechnicianUpdate>;
    events: (input: { workspaceId: string }) => Stream.Stream<TicketEvent>;
  }
>()("DispatchDesk/TicketApi") {}
