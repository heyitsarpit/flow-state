// The comments contracts: plain requests with no entity or domain imports (comments.domain.ts says what they
// mean for shared records). Every contract states `input`, `output` and `key` (rule 39).
//
// How this module differs from the other desk writers (COVERAGE.md 5.1): its posts are the one `serialize` lane
// inside a fragment, so comments land in the order they were typed; its reactions are a plain write with
// `optimistic` beside the domain edit on the same row; and an unconfirmed post is re-sent only when the user asks.
import { Schema } from "effect";
import { resource, transaction } from "flow-state";
import { unknownWhenLost } from "../shared/outcomes.js";
import { CommentRow, CommentsApi, Reactions, ThreadPage } from "./comments-api.js";

const ticket = { workspaceId: Schema.String, ticketId: Schema.String };

const comment = { ...ticket, commentId: Schema.String };

// One ticket's thread, newest page first; `before` pages backwards (R5). `pinned` is a filter: absent means
// every comment, `true` only the pinned ones (an absent input is "no constraint", entity-domain 4.3), so the
// drawer's "Pinned" strip is the same contract with another input.
export const commentsOn = resource({
  id: "DispatchDesk/comments-on",
  input: {
    ...ticket,
    pinned: Schema.optionalKey(Schema.Boolean),
    before: Schema.optionalKey(Schema.String),
  },
  output: ThreadPage,
  key: ["workspaceId", "ticketId", "pinned", "before"],
  lookup: (input, { signal }) => CommentsApi.use((api) => api.list(input, { signal })), // fails TicketNotFound
  staleTime: "10 seconds",
  gcTime: "2 minutes",
});

// Unread comments that mention one person, across the workspace: the queue's "@ you" badge.
export const mentionsFor = resource({
  id: "DispatchDesk/mentions-for",
  input: { workspaceId: Schema.String, me: Schema.String },
  output: Schema.Array(CommentRow),
  key: ["workspaceId", "me"],
  lookup: (input, { signal }) => CommentsApi.use((api) => api.mentions(input, { signal })),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});

// Posts on one ticket go one at a time, in the order they were typed (`serialize`, a FIFO of at most 64; the 65th
// ends `NotSent { Overloaded }`, rule 35). The lane is the ticket, not the draft: a thread is a conversation, and a
// later comment must never land before an earlier one that is still on its way. `clientId` is in the input, so the
// server stores it and the thread holds it once the post landed (rule 33); `attempt.id` is the idempotency key.
export const postComment = transaction({
  id: "DispatchDesk/post-comment",
  input: { ...ticket, clientId: Schema.String, text: Schema.String },
  output: CommentRow,
  key: ["workspaceId", "ticketId"],
  concurrency: "serialize",
  commit: (input, { attempt, signal }) =>
    CommentsApi.use((api) => api.post(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost, // TicketNotFound (404) and CommentRejected (422) stay failures
    ),
});

// One edit per comment at a time. EditWindowClosed (403), CommentGone (404) and CommentRejected (422) are definite.
export const editComment = transaction({
  id: "DispatchDesk/edit-comment",
  input: { ...comment, text: Schema.String },
  output: CommentRow,
  key: ["workspaceId", "ticketId", "commentId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    CommentsApi.use((api) => api.edit(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

export const removeComment = transaction({
  id: "DispatchDesk/remove-comment",
  input: comment,
  key: ["workspaceId", "ticketId", "commentId"], // no output: void
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    CommentsApi.use((api) => api.remove(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

export const pinComment = transaction({
  id: "DispatchDesk/pin-comment",
  input: { ...comment, pinned: Schema.Boolean },
  output: CommentRow,
  key: ["workspaceId", "ticketId", "commentId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    CommentsApi.use((api) => api.pin(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// "Mark thread read": every unread comment the drawer shows, in one request. `comments` is an array of keys, so
// the domain records the predicted key as `many` (merge 5, M5-D9).
export const markThreadRead = transaction({
  id: "DispatchDesk/mark-thread-read",
  input: {
    ...ticket,
    comments: Schema.Array(Schema.Struct(comment)),
    at: Schema.Number,
  },
  key: ["workspaceId", "ticketId"],
  concurrency: "reject",
  commit: ({ ticketId: _ticket, ...input }, { attempt, signal }) =>
    CommentsApi.use((api) => api.markRead(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// Reactions: a plain resource and a plain write, outside any domain. A count is something the client may guess
// for a moment, and nothing else depends on it, so `optimistic` on the commit is the right tool (rule 36), and
// `latest` sends at most two requests for a burst of taps on one emoji.
export const reactionsOn = resource({
  id: "DispatchDesk/reactions-on",
  input: ticket,
  output: Reactions,
  key: ["workspaceId", "ticketId"],
  lookup: (input, { signal }) => CommentsApi.use((api) => api.reactions(input, { signal })),
  staleTime: "30 seconds",
  gcTime: "2 minutes",
});

export const react = transaction({
  id: "DispatchDesk/react",
  input: { ...comment, emoji: Schema.String, on: Schema.Boolean },
  output: Reactions,
  key: ["workspaceId", "ticketId", "commentId", "emoji"],
  concurrency: "latest",
  commit: (input, { attempt, signal }) =>
    CommentsApi.use((api) => api.react(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});
