// Fragment Stories: Comments alone, in the stand-in host (2.10.12), over the Desk fake (the client half
// provides CommentsApi). The stand-in's placement is one copy keyed by the Story's `subject` with `resetOn`
// returning the same subject, so a subject-less Story has path `[]` (the editor) and `subject: "T-42"` has
// path `["T-42"]` (the queue's preview), the same incarnation the queue places.
// Wire words, never injected results (2.10.5): a lost answer is `Desk.postComment.drop({ at: "response" })`.
// design gap: how `reset(subject)` refills the Input is not said (2.10.12 gives the subject, not the input).
// Assumed: the stand-in fills `ticketId` with the subject, as the queue's filling does
// (`ticketId: memory.previewId`). The A, B, A Story needs that.
import { Story } from "flow-state/testing";
import { Desk, DeskClient } from "../../testing/desk.fake.js";
import { Comments, MAX_RESENDS } from "./comments.trait.js";

const { E, O } = Comments;

const on = (ticketId: string) => ({ workspaceId: "north", ticketId });

const post = (clientId: string, text: string) => E.Post({ clientId, text });

const comments = (id: string) => Story.make(Comments, { id, fixtures: [DeskClient] });

// The whole happy path: sending, sent, the thread refetched once because `writes` invalidated it, and the
// draft gone because the thread now holds its id (rule 33).
export const posted = comments("comments/posted")
  .enter(on("T-42"))
  .world(Desk.postComment.hold({ at: "response" })) // handled, the answer waits: "Sending…"
  .send(post("c1", "Bulb is a 40 W"))
  .expect({
    memory: { drafts: [{ clientId: "c1", sent: false, problem: null }] },
    operations: { post: [{ key: { clientId: "c1" }, pending: true }] },
  })
  .world(Desk.postComment.release())
  .expect({ memory: { drafts: [] }, operations: { post: [] } })
  .expect(Desk.postComment, [
    { input: { clientId: "c1", key: Story.attempt(O.post) }, phase: "answered" },
  ])
  .expect(Desk.comments, [{ phase: "answered" }, { phase: "answered" }]); // the first read, then the invalidation's

// The guard declines before any commit: nothing reaches the server.
export const emptyDenied = comments("comments/empty-denied")
  .enter(on("T-42"))
  .send(post("c1", "   "))
  .expect(Story.records("verdict"), [{ result: { _tag: "Denied", code: "EmptyComment" } }])
  .expect({ memory: { drafts: [] } })
  .expect(Desk.postComment, []);

// The answer is lost after the server stored the comment. The post is unknown, the same Attempt is re-sent
// by the keyed `resend` schedule, and the server's dedupe answers: one comment, three-way proof in the log.
export const lostThenResent = comments("comments/lost-then-resent")
  .enter(on("T-42"))
  .world(Desk.postComment.drop({ at: "response", times: 1 }))
  .send(post("c1", "Door sticks again"))
  .expect({ operations: { post: [{ key: { clientId: "c1" }, uncertain: true }] } })
  .advance({ next: { schedule: "resend" } })
  .expect({ memory: { drafts: [] }, operations: { post: [] } })
  .expect(Desk.postComment, [
    { phase: "dropped", via: { attempts: [Story.attempt(O.post)] } },
    { phase: "answered", via: { attempts: [Story.attempt(O.post)] } }, // the same Attempt
  ])
  .expect(Desk, { desk: { comments: [{ clientId: "c1", text: "Door sticks again" }] } }); // stored once

// Nothing ever answers: after the budget the hold is released, the draft says so and offers only Discard.
export const gaveUp = Array.from({ length: MAX_RESENDS + 1 })
  .reduce<ReturnType<typeof comments>>(
    (story) => story.advance({ next: { schedule: "resend" } }), // three re-sends, then the fourth timer gives up
    comments("comments/gave-up")
      .enter(on("T-42"))
      .world(Desk.postComment.drop({ at: "response", times: "always" }))
      .send(post("c1", "Anyone there?")),
  )
  .expect({
    memory: { drafts: [{ clientId: "c1", problem: "gaveUp" }] },
    operations: { post: [] }, // released: no lane
  })
  .send(E.Discard({ clientId: "c1" }))
  .expect({ memory: { drafts: [] } });

// The ticket was removed elsewhere: a definite 404, no resend, and the host is told through its callback.
export const ticketGone = comments("comments/ticket-gone")
  .enter(on("T-42"))
  .world(Desk.removeElsewhere({ workspaceId: "north", ticketId: "T-42" }))
  .send(post("c1", "Too late"))
  .expect({ memory: { drafts: [{ clientId: "c1", problem: "ticketGone" }] } })
  .expect(Story.records("callback", { name: "onTicketGone" }), [{ payload: {} }]);

// Leaving keeps the post (no `whenAbandoned` release): the lane is unplaced, not releasing; its ending is
// parked, and entering again with the same subject adopts it (rule 54). Compare the upload's removal story.
export const leftWhileSending = comments("comments/left-while-sending")
  .enter(on("T-42"), { subject: "T-42" })
  .world(Desk.postComment.hold({ at: "response" }))
  .send(post("c1", "Left mid-send"))
  .leave()
  .expect(Story.inspection.lanes, [
    {
      key: { clientId: "c1" },
      subject: ["T-42"],
      binding: "unplaced",
      releasing: false,
      state: "InFlight",
    },
  ])
  .world(Desk.postComment.release())
  .expect(Story.inspection.lanes, [{ key: { clientId: "c1" }, binding: "unplaced", parked: 1 }]) // parked, not lost
  .enter(on("T-42"), { subject: "T-42" })
  .expect({ memory: { drafts: [] }, operations: { post: [] } }) // adopted `Posted`, then the refetch pruned it
  .expect(Desk, { desk: { comments: [{ clientId: "c1" }] } });

// A, B, A (rule 56's Story walk): a post held for A while the drawer previews B. B is a different subject,
// so B never sees A's lane and B's own post is unaffected. A's next preview adopts A's ending.
export const aBA = comments("comments/a-b-a")
  .enter(on("T-42"), { subject: "T-42" })
  .world(Desk.postComment.hold({ at: "response" }))
  .send(post("a1", "For A"))
  .reset("T-43") // the drawer now previews B
  .expect({ memory: { ticketId: "T-43", drafts: [] } }) // B starts with no drafts
  .send(post("b1", "For B")) // B's own lane, key b1, path ["T-43"]
  .expect(Story.inspection.lanes, [
    { key: { clientId: "a1" }, subject: ["T-42"], binding: "unplaced" },
    { key: { clientId: "b1" }, subject: ["T-43"], binding: "bound" },
  ])
  .world(Desk.postComment.release()) // both answers land; A's is parked for ["T-42"]
  .reset("T-42") // back to A: adopts A's `Posted`
  .expect({ memory: { ticketId: "T-42", drafts: [] } }) // the refetch holds a1, so the draft is already gone
  .expect(Desk.postComment, [
    { input: { clientId: "a1" }, phase: "answered" },
    { input: { clientId: "b1" }, phase: "answered" },
  ]);
