// Fragment Stories: Comments alone, in the stand-in host (2.10.12), over the Desk fake (the client half provides
// CommentsApi). Transcripts: inputs and named checkpoints; comments.test.ts reads them (COVERAGE.md section 6).
// The stand-in's placement is one copy keyed by the Story's `subject` with `resetOn` returning the same subject,
// so a subject-less Story has path `[]` (the editor) and `subject: "T-42"` has path `["T-42"]` (the queue's preview).
// Wire words, never injected results (2.10.5): a lost answer is `Desk.postComment.drop({ at: "response" })`.
// design gap: how `reset(subject)` refills the Input is not said (2.10.12 gives the subject, not the input).
// Assumed: the stand-in fills `ticketId` with the subject, as the queue's filling does
// (`ticketId: memory.previewId`). The A, B, A Story needs that.
//
// Module checkpoints (COVERAGE.md section 6): `posted-in-order`, `delete-refused-restored`, `pinned`; the queue's
// preview edit (`edited-in-preview`) is an app Story, desk.story.ts, because it needs two hosts.
import { Story } from "flow-state/testing";
import { Desk, DeskClient } from "../../testing/desk.fake.js";
import { Comments, MAX_RESENDS } from "./comments.trait.js";

const { E } = Comments;

export const T42 = { workspaceId: "north", ticketId: "T-42" };

const on = (ticketId: string) => ({ workspaceId: "north", ticketId });

const post = (clientId: string, text: string) => E.Post({ clientId, text });

const comments = (id: string) => Story.make(Comments, { id, fixtures: [DeskClient] });

// Two posts typed one after the other while the first is on the wire. The second waits in the FIFO (the lane's
// `outstanding` is 1) and is sent only after the first is answered, so the thread holds them in the order typed.
export const postedInOrder = comments("comments/posted-in-order")
  .enter(on("T-42"))
  .world(Desk.postComment.hold({ at: "response" })) // handled, the answer waits
  .send(post("c1", "Bulb is a 40 W"))
  .checkpoint("sending")
  .send(post("c2", "Ladder is in the van"))
  .checkpoint("queued-behind")
  .world(Desk.postComment.release())
  .checkpoint("posted-in-order");

// The guard declines before any commit: nothing reaches the server.
export const emptyDenied = comments("comments/empty-denied")
  .enter(on("T-42"))
  .send(post("c1", "   "))
  .checkpoint("denied");

// The queue's preview with nothing previewed has ticketId "": a post is denied, never committed to ticket "".
export const noTicket = comments("comments/no-ticket")
  .enter(on(""))
  .send(post("c1", "Into the void"))
  .checkpoint("denied");

// The first post's answer is lost after the server stored it. The head is held, so the second post waits: the
// thread can never show a reply above the comment it answers. Nothing re-sends by itself. The user presses
// Resend: the same Attempt goes again, the server dedupes, and the FIFO moves on.
export const headHoldsTheQueue = comments("comments/head-holds-the-queue")
  .enter(on("T-42"))
  .world(Desk.postComment.drop({ at: "response", times: 1 }))
  .send(post("c1", "Door sticks again"), post("c2", "Fixed it with oil"))
  .checkpoint("head-unsure")
  .advance("1 minute") // a minute passes: no timer re-sends a comment
  .checkpoint("still-waiting")
  .send(E.Resend({ clientId: "c1" }))
  .checkpoint("resent-in-order");

// Nothing ever answers. Resend spends the budget (`retryable`), then Give up releases the head: the next post is
// promoted and sent, and the draft says the first may still appear.
export const gaveUp = Array.from({ length: MAX_RESENDS })
  .reduce<ReturnType<typeof comments>>(
    (story) => story.send(E.Resend({ clientId: "c1" })),
    comments("comments/gave-up")
      .enter(on("T-42"))
      .world(Desk.postComment.drop({ at: "response", times: MAX_RESENDS + 1 }))
      .send(post("c1", "Anyone there?"), post("c2", "Second thought")),
  )
  .checkpoint("budget-spent")
  .send(E.Resend({ clientId: "c1" })) // denied: RetryLimit
  .send(E.GiveUp({ clientId: "c1" }))
  .checkpoint("gave-up");

// The FIFO holds 64 commits behind its head; the 65th is declined `NotSent { Overloaded }` (rule 35), and only that
// draft says "Not sent". Its transition still ran: the draft is in memory, ready to send again.
export const overloaded = Array.from({ length: 65 })
  .reduce<ReturnType<typeof comments>>(
    (story, _, n) => story.send(post(`q${n}`, `Line ${n + 1}`)),
    comments("comments/overloaded")
      .enter(on("T-42"))
      .world(Desk.postComment.hold())
      .send(post("head", "The first")),
  )
  .checkpoint("overloaded");

// The ticket was removed elsewhere: a definite 404, no resend, and the host is told through its callback.
export const ticketGone = comments("comments/ticket-gone")
  .enter(on("T-42"))
  .world(Desk.removeElsewhere({ workspaceId: "north", ticketId: "T-42" }))
  .send(post("c1", "Too late"))
  .checkpoint("ticket-gone");

// Leaving keeps the post (no `whenAbandoned` release): the lane is unplaced, not releasing; its ending is parked,
// and entering again with the same subject adopts it (rule 54). Compare the upload's removal Story.
export const leftWhileSending = comments("comments/left-while-sending")
  .enter(on("T-42"), { subject: "T-42" })
  .world(Desk.postComment.hold({ at: "response" }))
  .send(post("c1", "Left mid-send"))
  .leave()
  .checkpoint("left")
  .world(Desk.postComment.release())
  .checkpoint("parked")
  .enter(on("T-42"), { subject: "T-42" })
  .checkpoint("adopted");

// A, B, A (rule 56's Story walk): a post held for A while the drawer previews B. B is a different subject, so B
// never sees A's lane and B's own post is unaffected. A's next preview adopts A's ending.
export const aBA = comments("comments/a-b-a")
  .enter(on("T-42"), { subject: "T-42" })
  .world(Desk.postComment.hold({ at: "response" }))
  .send(post("a1", "For A"))
  .reset("T-43") // the drawer now previews B
  .checkpoint("on-b")
  .send(post("b1", "For B")) // B's own lane, key T-43, path ["T-43"]
  .checkpoint("two-lanes")
  .world(Desk.postComment.release()) // both answers land; A's is parked for ["T-42"]
  .reset("T-42") // back to A: adopts A's `Posted`
  .checkpoint("back-on-a");

// An edit shows at once (predicted) and is confirmed by the answer. The record is the store's: memory holds none.
export const edited = comments("comments/edited")
  .world(Desk.commentsElsewhere({ ...T42, count: 1 })) // c-1, already in the thread
  .enter(on("T-42"))
  .world(Desk.editComment.hold({ at: "response" }))
  .send(E.Edit({ commentId: "c-1", text: "Note 1, corrected" }))
  .checkpoint("edit-predicted")
  .world(Desk.editComment.release())
  .checkpoint("edit-confirmed");

// Past the edit window the server refuses a delete (403). The delete was predicted, so the comment vanished at once;
// the definite failure removes the prediction without a repair, and the comment is back in place (E3).
export const deleteRefused = comments("comments/delete-refused")
  .world(Desk.commentsElsewhere({ ...T42, count: 2 }), Desk.ageComment({ commentId: "c-1" }))
  .enter(on("T-42"))
  .world(Desk.removeComment.hold({ at: "response" }))
  .send(E.Delete({ commentId: "c-1" }))
  .checkpoint("delete-predicted")
  .world(Desk.removeComment.release())
  .checkpoint("delete-refused-restored");

// A pin predicts `pinned`, so the comment joins the "Pinned" strip (the same read with `pinned: true`) at once,
// before the server answers (E4).
export const pinned = comments("comments/pinned")
  .world(Desk.commentsElsewhere({ ...T42, count: 2 }))
  .enter(on("T-42"))
  .world(Desk.pinComment.hold({ at: "response" }))
  .send(E.Pin({ commentId: "c-2", pinned: true }))
  .checkpoint("pinned")
  .world(Desk.pinComment.release())
  .checkpoint("pin-confirmed");

// "Mark all read": one write, every unread comment the drawer shows (a `many` key array). `readAt` is not a
// condition or order field of the thread, so the thread does not refetch (E2).
export const markedRead = comments("comments/marked-read")
  .world(Desk.commentsElsewhere({ ...T42, count: 3 }))
  .enter(on("T-42"))
  .checkpoint("unread")
  .send(E.MarkRead({ at: 60_000 }))
  .checkpoint("marked-read");

// A reaction is a plain write with `optimistic`: the count moves at once, and a refused tap takes it back.
export const reacted = comments("comments/reacted")
  .world(Desk.commentsElsewhere({ ...T42, count: 1 }))
  .enter(on("T-42"))
  .world(Desk.react.hold({ at: "response" }))
  .send(E.React({ commentId: "c-1", emoji: "👍", on: true }))
  .checkpoint("reacted")
  .world(Desk.react.release())
  .checkpoint("reaction-confirmed");

// Thirty comments: the newest twenty load, and "Older comments" pages backwards (gap 23, proposed).
export const olderPage = comments("comments/older-page")
  .world(Desk.commentsElsewhere({ ...T42, count: 30 }))
  .enter(on("T-42"))
  .checkpoint("newest-page")
  .send(E.LoadOlder())
  .checkpoint("older-loaded");
