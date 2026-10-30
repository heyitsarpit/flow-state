// The comments contracts: a thread read and a post. Plain requests, no domain (a comment is not an entity
// here: the thread is a list the server owns, and a post becomes part of it when the refetch holds its id,
// rule 33). Every contract states `input`, `output` and `key` (rule 39).
import { Schema } from "effect";
import { resource, transaction } from "flow-state";
import { unknownWhenLost } from "../shared/outcomes.js";
import { CommentRow, CommentThread, CommentsApi } from "./comments-api.js";

// The thread of one ticket. Short `staleTime`: another dispatcher's comment should show within seconds
// of the next read, and a post of ours invalidates it at once (`writes` on the operation, rule 36).
export const commentsOn = resource({
  id: "DispatchDesk/comments-on",
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  output: CommentThread,
  key: ["workspaceId", "ticketId"],
  lookup: (key, { signal }) => CommentsApi.use((api) => api.list(key, { signal })), // fails TicketNotFound
  staleTime: "10 seconds",
  gcTime: "2 minutes",
});

// `key: ["clientId"]`: the id the view minted for this draft (2.9.5), so one draft has one lane and two
// drafts on one ticket can be in flight together. `clientId` is unique within the thread, which is what
// rule 51's authoring rule asks of a write key ("unique within its subject"). `attempt.id` is the
// idempotency key the server deduplicates on (rule 19); the comment's `clientId` is only how the thread
// is matched to the draft afterwards.
export const postComment = transaction({
  id: "DispatchDesk/post-comment",
  input: {
    workspaceId: Schema.String,
    ticketId: Schema.String,
    clientId: Schema.String,
    text: Schema.String,
  },
  output: CommentRow,
  key: ["clientId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    CommentsApi.use((api) => api.post(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost, // NoResponse and ServerError (5xx) are unknown; TicketNotFound (404) and CommentRejected (422) stay failures
    ),
});
