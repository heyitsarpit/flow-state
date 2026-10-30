// The comments port and its Schemas. `post` carries the client's id (minted by the view, so a
// resend and a refetch can be matched to it) and Flow's attempt id as the idempotency key.
import { Context, Schema, type Effect } from "effect";
import type { NoResponse, ServerError, TicketKey, TicketNotFound } from "../Tickets/types.js";

export const CommentRow = Schema.Struct({
  id: Schema.String, // the server's id
  clientId: Schema.String, // the id the author's device minted; the thread holds it once the post landed
  workspaceId: Schema.String,
  ticketId: Schema.String,
  author: Schema.String,
  text: Schema.String,
  at: Schema.Number,
});

export type CommentRow = typeof CommentRow.Type;

export const CommentThread = Schema.Array(CommentRow);

export type CommentThread = typeof CommentThread.Type;

// 422: the text is empty or too long. Definite.
export class CommentRejected extends Schema.TaggedError<CommentRejected>()("CommentRejected", {
  reason: Schema.String,
}) {}

export class CommentsApi extends Context.Service<
  CommentsApi,
  {
    list: (
      ticket: TicketKey,
      options: { signal: AbortSignal },
    ) => Effect.Effect<CommentThread, TicketNotFound>;
    post: (
      input: TicketKey & { clientId: string; text: string },
      options: { idempotencyKey: string; signal: AbortSignal },
    ) => Effect.Effect<CommentRow, TicketNotFound | CommentRejected | NoResponse | ServerError>;
  }
>()("DispatchDesk/CommentsApi") {}
