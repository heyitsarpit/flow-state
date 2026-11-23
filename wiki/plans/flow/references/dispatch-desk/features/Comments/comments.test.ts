// The Comments trait's checks, read from its Stories' checkpoints (2.10.6): each test runs its Story once and
// destructures the checkpoints it names. A fragment-alone Story's cut carries the fragment's own snapshot, re-rooted
// at it (2.10.12): `cp.memory`, `cp.operations`, `cp.lane(O.post, key)`. One property test: a comment never shows
// twice, as a draft and as a thread row at once (rule 33; Y9).
import { Story, propertyTest } from "flow-state/testing";
import { expect, test } from "vite-plus/test";
import { Desk, DeskClient } from "../../testing/desk.fake.js";
import { Comment } from "./comments.domain.js";
import {
  aBA,
  deleteRefused,
  edited,
  emptyDenied,
  gaveUp,
  headHoldsTheQueue,
  leftWhileSending,
  markedRead,
  noTicket,
  olderPage,
  overloaded,
  pinned,
  postedInOrder,
  reacted,
  T42,
  ticketGone,
} from "./comments.story.js";
import { Comments } from "./comments.trait.js";

const { E, O } = Comments;

const c = (commentId: string) => ({ ...T42, commentId });

// What the server stored, in its order.
const texts = (truth: { desk: { comments: ReadonlyArray<{ text: string }> } }) =>
  truth.desk.comments.map((comment) => comment.text);

test("two posts typed together are sent one at a time, in the order typed", async () => {
  const { sending, queuedBehind, postedInOrder: posted } = (await postedInOrder.run()).checkpoints;

  expect(sending.memory.drafts).toMatchObject([{ clientId: "c1", sent: false, problem: null }]);
  expect(sending.lane(O.post, T42)).toMatchObject({ pending: true });
  // The second post waits behind the first: one lane per ticket, its FIFO counting the rest.
  expect(queuedBehind.lane(O.post, T42)).toMatchObject({ pending: true, outstanding: 1 });
  expect(queuedBehind.read(Desk.postComment)).toHaveLength(1); // only the head reached the server
  expect(texts(posted.read(Desk))).toEqual(["Bulb is a 40 W", "Ladder is in the van"]);
  expect(posted.memory.drafts).toEqual([]); // the thread holds both ids (rule 33)
  expect(posted.lane(O.post, T42)).toBeUndefined(); // settled: the lane is gone
  // The comment row carries the Attempt the server deduplicated on (O13).
  const [first] = posted.read(Desk).desk.comments;
  expect(first?.attemptId).toBe(posted.attempt(O.post, { n: 0 }));
});

test("an empty comment is denied before anything is committed", async () => {
  const { denied } = (await emptyDenied.run()).checkpoints;

  expect(denied.records("verdict")).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "EmptyComment" }] } },
  ]);
  expect(denied.read(Desk.postComment)).toEqual([]);
});

test("a post with no ticket previewed is denied", async () => {
  const { denied } = (await noTicket.run()).checkpoints;

  expect(denied.records("verdict")).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "NoTicket" }] } },
  ]);
  expect(denied.read(Desk.postComment)).toEqual([]);
});

test("a lost answer holds the head, and only Resend sends it again", async () => {
  const { headUnsure, stillWaiting, resentInOrder } = (await headHoldsTheQueue.run()).checkpoints;

  expect(headUnsure.memory.drafts).toMatchObject([
    { clientId: "c1", problem: "unsure" },
    { clientId: "c2", problem: null },
  ]);
  expect(headUnsure.lane(O.post, T42)).toMatchObject({ uncertain: true, outstanding: 1 });
  // A minute later nothing was sent again: comments are re-sent only when someone asks.
  expect(stillWaiting.read(Desk.postComment)).toHaveLength(1);
  // Resend: the same Attempt, then the next post. Stored once each, in the order typed.
  const sends = resentInOrder.read(Desk.postComment);
  expect(sends.map((r) => r.input.clientId)).toEqual(["c1", "c1", "c2"]);
  expect(sends[0]?.input.key).toBe(sends[1]?.input.key);
  expect(texts(resentInOrder.read(Desk))).toEqual(["Door sticks again", "Fixed it with oil"]);
});

test("Resend spends a budget, then Give up releases the head", async () => {
  const { budgetSpent, gaveUp: gone } = (await gaveUp.run()).checkpoints;

  expect(budgetSpent.lane(O.post, T42)).toMatchObject({ retryCount: 3 });
  expect(gone.records("verdict", { event: E.Resend })).toContainEqual(
    expect.objectContaining({
      result: { _tag: "Denied", reasons: [{ code: "RetryLimit", retryCount: 3 }] },
    }),
  );
  expect(gone.memory.drafts).toMatchObject([
    { clientId: "c1", problem: "gaveUp" },
    { clientId: "c2" },
  ]);
  // Releasing the head promoted c2, which is on its way now.
  expect(gone.read(Desk.postComment).at(-1)?.input.clientId).toBe("c2");
});

test("the 65th commit behind the head is not sent, and only its draft says so", async () => {
  const { overloaded: cp } = (await overloaded.run()).checkpoints;

  expect(cp.lane(O.post, T42)).toMatchObject({ outstanding: 64 });
  expect(cp.records("ending", { operation: O.post, channel: "failure" })).toMatchObject([
    { reason: { _tag: "NotSent", why: "Overloaded" } },
  ]);
  expect(cp.memory.drafts.filter((d) => d.problem === "notSent")).toMatchObject([
    { clientId: "q64" },
  ]);
});

test("a removed ticket is a definite failure, and the host is told", async () => {
  const { ticketGone: cp } = (await ticketGone.run()).checkpoints;

  expect(cp.memory.drafts).toMatchObject([{ clientId: "c1", problem: "ticketGone" }]);
  expect(cp.records("callback", { name: "onTicketGone" })).toMatchObject([{ payload: {} }]);
});

test("leaving keeps the post, and entering again with the same subject adopts it", async () => {
  const { left, parked, adopted } = (await leftWhileSending.run()).checkpoints;

  expect(left.inspection.lanes).toMatchObject([
    { key: T42, subject: ["T-42"], binding: "unplaced", releasing: false, state: "InFlight" },
  ]);
  expect(parked.inspection.lanes).toMatchObject([{ key: T42, binding: "unplaced", parked: 1 }]);
  expect(adopted.memory.drafts).toEqual([]); // adopted `Posted`, then the thread pruned it
  expect(adopted.lane(O.post, T42)).toBeUndefined(); // settled: nothing left to do
});

test("A, B, A: each subject keeps its own lane and drafts", async () => {
  const { onB, twoLanes, backOnA } = (await aBA.run()).checkpoints;

  expect(onB.memory).toMatchObject({ ticketId: "T-43", drafts: [] }); // B starts with no drafts
  expect(twoLanes.inspection.lanes).toMatchObject([
    { key: T42, subject: ["T-42"], binding: "unplaced" },
    { key: { workspaceId: "north", ticketId: "T-43" }, subject: ["T-43"], binding: "bound" },
  ]);
  expect(backOnA.memory).toMatchObject({ ticketId: "T-42", drafts: [] });
  expect(backOnA.read(Desk.postComment)).toMatchObject([
    { input: { clientId: "a1" }, phase: "answered" },
    { input: { clientId: "b1" }, phase: "answered" },
  ]);
});

test("an edit shows at once and is confirmed by the answer", async () => {
  const { editPredicted, editConfirmed } = (await edited.run()).checkpoints;

  expect(editPredicted.entity(Comment, c("c-1"))).toMatchObject({
    data: { text: "Note 1, corrected" },
    predicted: true,
  });
  expect(editConfirmed.entity(Comment, c("c-1"))).toMatchObject({ predicted: false });
});

test("a refused delete brings the comment back in place", async () => {
  const { deletePredicted, deleteRefusedRestored } = (await deleteRefused.run()).checkpoints;

  expect(deletePredicted.entity(Comment, c("c-1"))).toBeUndefined(); // hidden at once
  expect(deleteRefusedRestored.entity(Comment, c("c-1"))).toMatchObject({
    data: { text: "Note 1" },
    predicted: false,
  });
  expect(deleteRefusedRestored.memory.notice).toBe("Past the edit window: the comment stays");
  // Back in its place: still first of two, with no repair read for a definite failure (rule 30).
  expect(deleteRefusedRestored.read(Desk.comments)).toHaveLength(2); // the first two reads (thread, pinned) only
});

test("a pin joins the Pinned strip before the server answers", async () => {
  const { pinned: pinning, pinConfirmed } = (await pinned.run()).checkpoints;

  const strip = pinning.operations.pinned?.data?.flatMap((page) => page.comments) ?? [];
  expect(strip.map((row) => row.commentId)).toEqual(["c-2"]); // joined by the prediction, before the answer (E4)
  expect(pinning.entity(Comment, c("c-2"))?.predicted).toBe(true);
  expect(pinConfirmed.entity(Comment, c("c-2"))?.predicted).toBe(false);
});

test("mark all read is one write for every unread comment, and no refetch", async () => {
  const { unread, markedRead: done } = (await markedRead.run()).checkpoints;

  for (const id of ["c-1", "c-2", "c-3"])
    expect(done.entity(Comment, c(id))?.data.readAt).toBe(60_000);
  expect(done.read(Desk.markRead)).toMatchObject([
    { input: { comments: [c("c-1"), c("c-2"), c("c-3")] } }, // one request, three records (E2)
  ]);
  // No list moved: the thread was not read again.
  expect(done.read(Desk.comments).length).toBe(unread.read(Desk.comments).length);
});

test("a reaction moves the count at once and is confirmed by the answer", async () => {
  const { reacted: tapped, reactionConfirmed } = (await reacted.run()).checkpoints;

  expect(tapped.operations.reactions?.data?.["c-1"]?.["👍"]).toBe(1); // the commit's `optimistic` look
  expect(tapped.operations.reactions?.predicted).toBe(true);
  expect(reactionConfirmed.operations.reactions?.predicted).toBe(false);
});

test("the newest twenty load first, and older comments page backwards", async () => {
  const { newestPage, olderLoaded } = (await olderPage.run()).checkpoints;

  expect(newestPage.operations.thread?.data?.flatMap((p) => p.comments)).toHaveLength(20);
  expect(olderLoaded.operations.thread?.data?.flatMap((p) => p.comments)).toHaveLength(30);
});

// Y9: a comment is never shown as a draft and as a row at once, whatever the wire does to its post. A plain function
// over a frame (W25); it returns the violation, or undefined.
const neverTwice = (frame: Story.Frame<typeof Comments>) => {
  const s = frame.read();
  if (s === undefined) return undefined;
  const rows = s.operations.thread?.data?.flatMap((page) => page.comments) ?? [];
  const twice = s.memory.drafts.filter((d) => rows.some((row) => row.clientId === d.clientId));
  return twice.length > 0 ? twice : undefined;
};

test("a comment never shows twice", () =>
  propertyTest(
    Story.fragment(Comments, { id: "comments/property-never-twice", fixtures: [DeskClient] }).enter(
      { ...T42 },
    ),
    {
      steps: [
        [
          E.Post({ clientId: "p1", text: "First" }),
          E.Post({ clientId: "p2", text: "Second" }),
          E.Resend({ clientId: "p1" }),
          E.Resend({ clientId: "p2" }),
          E.GiveUp({ clientId: "p1" }),
          E.Discard({ clientId: "p2" }),
          E.Refresh(),
        ],
        [
          Desk.postComment.hold(),
          Desk.postComment.release(),
          Desk.postComment.release({ nth: 1 }),
          Desk.postComment.drop({ at: "request" }),
          Desk.postComment.drop({ at: "response" }),
          Desk.postComment.duplicate(),
        ],
        [Desk.comments.hold(), Desk.comments.release()],
        [{ advance: "1 second" }, { advance: "10 seconds" }],
      ],
      properties: { neverTwice },
      seed: 3,
      runs: 100,
      length: 25,
    },
  ));
