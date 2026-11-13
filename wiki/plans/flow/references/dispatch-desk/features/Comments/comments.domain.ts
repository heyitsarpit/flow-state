// What the comments contracts mean for shared records (rules 26–38). A comment is a record of its own, so the
// editor's thread, the queue's preview of the same ticket and the "@ you" badge show one copy of it: an edit in
// the preview shows in the editor's thread at once (E7), and a delete hides it in both.
//
// How this domain differs from the ticket domain: it is owned by a fragment (the Comments trait registers it for
// whichever actor places it, rule 49); a post predicts a field of ANOTHER entity (`Ticket.commentCount`, E1, E14);
// "mark thread read" predicts many records with one key array and moves no list (E2); and "@ you" is the desk's
// one `contains` condition over an array field, with a nullable field beside it (E5).
import { and, asc, contains, domain, entity, eq, isNull, read, write } from "flow-state"; // merge 5: isNull
import { Ticket } from "../Tickets/ticket.domain.js";
import { CommentRow } from "./comments-api.js";
import {
  commentsOn,
  editComment,
  markThreadRead,
  mentionsFor,
  pinComment,
  postComment,
  removeComment,
} from "./comments.contracts.js";

export const Comment = entity({
  id: "DispatchDesk/Comment",
  fields: CommentRow.fields,
  primaryKey: ["workspaceId", "ticketId", "commentId"],
  version: "revision",
});

const ticketOf = (input: { workspaceId: string; ticketId: string }) => ({
  workspaceId: input.workspaceId,
  ticketId: input.ticketId,
});

const keyOf = (input: { workspaceId: string; ticketId: string; commentId: string }) => ({
  workspaceId: input.workspaceId,
  ticketId: input.ticketId,
  commentId: input.commentId,
});

export const CommentsDomain = domain("comments", {
  // The thread, oldest first, paged backwards (`before`). Every input is accounted for (rule 26): workspace and
  // ticket are conditions; `pinned` is a condition too, absent meaning any (so the "Pinned" strip is this read
  // with `pinned: true`, and a pin moves a comment into it, E4); `before` is the paging input.
  thread: read(commentsOn)
    .list(Comment, ({ output }) => output.comments)
    .where(({ input, record }) =>
      and(
        eq(record.workspaceId, input.workspaceId),
        eq(record.ticketId, input.ticketId),
        eq(record.pinned, input.pinned),
      ),
    )
    .orderBy(({ record }) => [
      asc(record.createdAt),
      asc(record.workspaceId), // total: ends with every key field
      asc(record.ticketId),
      asc(record.commentId),
    ])
    .pagedBy(
      ({ input }) => input.before,
      ({ output }) => output.older,
    ),

  // "@ you": comments that mention me and I have not read. `contains` reads an array field; `isNull` a nullable
  // one. Marking a thread read predicts `readAt`, so those comments leave this list at once.
  mentions: read(mentionsFor)
    .list(Comment, ({ output }) => output)
    .where(({ input, record }) =>
      and(
        eq(record.workspaceId, input.workspaceId),
        contains(record.mentions, input.me),
        isNull(record.readAt),
      ),
    )
    .orderBy(({ record }) => [
      asc(record.createdAt),
      asc(record.workspaceId),
      asc(record.ticketId),
      asc(record.commentId),
    ]),

  // A post creates a comment (no temporary id enters the thread: the trait's draft shows it apart, rule 33) and
  // changes its ticket's count, which the response does not carry. So the ticket's field is a declared target
  // (`.alsoChanges`), and the count is predicted with a field function over the record beneath it (merge 5), which
  // replays over every new base: a push that moves the count meanwhile is still +1 from there.
  post: write(postComment)
    .one(Comment)
    .alsoChanges(({ input }) =>
      Ticket.fields(ticketOf(input), ({ record }) => [record.commentCount]),
    )
    .predicts(({ input }) =>
      Ticket.patch(ticketOf(input), { commentCount: (beneath) => beneath.commentCount + 1 }),
    ),

  // An edit shows everywhere at once. Past the author's window the server answers 403: a definite failure, so the
  // prediction is removed without a repair and the old text is back (rule 30).
  edit: write(editComment)
    .one(Comment)
    .predicts(({ input }) => Comment.patch(keyOf(input), { text: input.text })),

  // A delete hides the comment everywhere and takes one off the ticket's count; a 403 restores both in place (E3).
  remove: write(removeComment)
    .alsoChanges(({ input }) =>
      Ticket.fields(ticketOf(input), ({ record }) => [record.commentCount]),
    )
    .predicts(({ input }) => [
      Comment.delete(keyOf(input)),
      Ticket.patch(ticketOf(input), { commentCount: (beneath) => beneath.commentCount - 1 }),
    ]),

  pin: write(pinComment)
    .one(Comment)
    .predicts(({ input }) => Comment.patch(keyOf(input), { pinned: input.pinned })),

  // Many records, one write: `input.comments` is an array of keys, so each listed comment is predicted once (rule
  // 34). `readAt` is neither a condition nor an order field of the thread, so the thread does not repair; only the
  // "@ you" list, whose condition reads it, does. Past 4,096 keys the commit ends `NotSent { Overloaded }` (rule 35).
  markRead: write(markThreadRead).predicts(({ input }) =>
    Comment.patch(input.comments, { readAt: input.at }),
  ),
});
