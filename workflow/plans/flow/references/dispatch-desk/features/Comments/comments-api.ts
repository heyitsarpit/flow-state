// The comments port and its Schemas. A comment is a record the server owns (`Comment`, comments.domain.ts):
// the thread is a paged list of them, oldest first, and a post becomes part of it when an answer holds its
// `clientId` (rule 33). Writes carry Flow's `attempt.id` as the idempotency key (rule 19); the server stores it
// on the comment as `attemptId`, so a pushed comment names the write that made it (O13).
// Reactions are not comment fields: they are a plain resource of their own, written with `optimistic` beside
// the domain edit (comments.contracts.ts), because a count the client may guess is not shared truth.
import { Context, Schema, type Effect } from "effect";
import {
  Cursor,
  type NoResponse,
  type ServerError,
  type TicketKey,
  type TicketNotFound,
} from "../Tickets/types.js";

export const CommentRow = Schema.Struct({
  workspaceId: Schema.String,
  ticketId: Schema.String,
  commentId: Schema.String, // the server's id
  clientId: Schema.String, // the id the author's device minted; the thread holds it once the post landed
  attemptId: Schema.String, // the idempotency key the server stored the post under (O13)
  author: Schema.String,
  text: Schema.String,
  mentions: Schema.Array(Schema.String), // technician and dispatcher ids, parsed by the server from "@name"
  pinned: Schema.Boolean,
  readAt: Schema.NullOr(Schema.Number), // when the signed-in user read it; null while unread
  editedAt: Schema.NullOr(Schema.Number),
  createdAt: Schema.Number,
  revision: Schema.Number,
});

export type CommentRow = typeof CommentRow.Type;

export type CommentKey = { workspaceId: string; ticketId: string; commentId: string };

// One page of a thread, newest page first: `older` is the cursor of the page before it, absent at the start.
export const ThreadPage = Schema.Struct({
  comments: Schema.Array(CommentRow), // oldest first within the page
  older: Schema.optional(Schema.String),
});

export type ThreadPage = typeof ThreadPage.Type;

// Emoji counts per comment of one ticket: `{ [commentId]: { "👍": 2 } }`.
export const Reactions = Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Int));

export type Reactions = typeof Reactions.Type;

// A change the workspace socket pushes for a comment (feed.domain.ts `listen`s to them).
export const CommentEvent = Schema.Union([
  Schema.TaggedStruct("CommentSaved", { cursor: Cursor, comment: CommentRow }),
  Schema.TaggedStruct("CommentRemoved", {
    cursor: Cursor,
    workspaceId: Schema.String,
    ticketId: Schema.String,
    commentId: Schema.String,
    revision: Schema.Number,
  }),
]);

export type CommentEvent = typeof CommentEvent.Type;

// 422: the text is empty or too long. Definite.
export class CommentRejected extends Schema.TaggedError<CommentRejected>()("CommentRejected", {
  reason: Schema.String,
}) {}

// 403: an edit or a delete after the author's fifteen-minute window. Definite: the record is restored.
export class EditWindowClosed extends Schema.TaggedError<EditWindowClosed>()("EditWindowClosed", {
  closedAt: Schema.Number,
}) {}

// 404 on a comment write: someone deleted it meanwhile.
export class CommentGone extends Schema.TaggedError<CommentGone>()("CommentGone", {
  commentId: Schema.String,
}) {}

type Read = { signal: AbortSignal };

type Write = { idempotencyKey: string; signal: AbortSignal };

type Lost = NoResponse | ServerError;

export class CommentsApi extends Context.Service<
  CommentsApi,
  {
    // `before` is a page cursor; absent reads the newest page (R5: older comments are paged backwards). `pinned`
    // filters: absent is every comment.
    list: (
      input: TicketKey & { pinned?: boolean; before?: string },
      options: Read,
    ) => Effect.Effect<ThreadPage, TicketNotFound | NoResponse>;
    // Comments that mention `me` and are unread, across the workspace.
    mentions: (
      input: { workspaceId: string; me: string },
      options: Read,
    ) => Effect.Effect<ReadonlyArray<CommentRow>, NoResponse>;
    post: (
      input: TicketKey & { clientId: string; text: string },
      options: Write,
    ) => Effect.Effect<CommentRow, TicketNotFound | CommentRejected | Lost>;
    edit: (
      input: CommentKey & { text: string },
      options: Write,
    ) => Effect.Effect<CommentRow, CommentGone | EditWindowClosed | CommentRejected | Lost>;
    remove: (
      input: CommentKey,
      options: Write,
    ) => Effect.Effect<void, CommentGone | EditWindowClosed | Lost>;
    pin: (
      input: CommentKey & { pinned: boolean },
      options: Write,
    ) => Effect.Effect<CommentRow, CommentGone | Lost>;
    // Every listed comment at once; the answer is empty (the server marks, the client already predicted).
    markRead: (
      input: { workspaceId: string; comments: ReadonlyArray<CommentKey>; at: number },
      options: Write,
    ) => Effect.Effect<void, Lost>;
    reactions: (input: TicketKey, options: Read) => Effect.Effect<Reactions, NoResponse>;
    react: (
      input: CommentKey & { emoji: string; on: boolean },
      options: Write,
    ) => Effect.Effect<Reactions, CommentGone | Lost>;
  }
>()("DispatchDesk/CommentsApi") {}
