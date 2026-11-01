// The Comments trait's checks, read from its Stories' checkpoints (`@flow-state/vitest`, proposed; COVERAGE.md
// section 6; features/Tickets/editor/editor.test.ts says what `at` is), and one property test: a comment never
// shows twice, as a draft and as a thread row at once (rule 33; Y9).
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Generate, propertyTest, Story } from "flow-state/testing";
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

const { O } = Comments;

const c = (commentId: string) => ({ ...T42, commentId });

// What the server stored, in its order.
const texts = (truth: { desk: { comments: ReadonlyArray<{ text: string }> } }) =>
  truth.desk.comments.map((comment) => comment.text);

storyTest(postedInOrder, ({ at }) => {
  expect(at.sending.memory.drafts).toMatchObject([{ clientId: "c1", sent: false, problem: null }]);
  expect(O.post.get(at.sending, T42).pending).toBe(true);
  // The second post waits behind the first: one lane per ticket, its FIFO counting the rest.
  expect(O.post.get(at["queued-behind"], T42).outstanding).toBe(1);
  expect(at["queued-behind"].read(Desk.postComment)).toHaveLength(1); // only the head reached the server
  expect(texts(at["posted-in-order"].read(Desk))).toEqual([
    "Bulb is a 40 W",
    "Ladder is in the van",
  ]);
  expect(at["posted-in-order"].memory.drafts).toEqual([]); // the thread holds both ids (rule 33)
  // The comment row carries the Attempt the server deduplicated on (O13).
  const [first] = at["posted-in-order"].read(Desk).desk.comments;
  expect(first?.attemptId).toBe(at["posted-in-order"].read(Story.attempt(O.post, { n: 0 })));
});

storyTest(emptyDenied, ({ at }) => {
  expect(at.denied.read(Story.records("verdict"))).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "EmptyComment" }] } },
  ]);
  expect(at.denied.read(Desk.postComment)).toEqual([]);
});

storyTest(noTicket, ({ at }) => {
  expect(at.denied.read(Story.records("verdict"))).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "NoTicket" }] } },
  ]);
  expect(at.denied.read(Desk.postComment)).toEqual([]);
});

storyTest(headHoldsTheQueue, ({ at }) => {
  expect(at["head-unsure"].memory.drafts).toMatchObject([
    { clientId: "c1", problem: "unsure" },
    { clientId: "c2", problem: null },
  ]);
  expect(O.post.get(at["head-unsure"], T42)).toMatchObject({ uncertain: true, outstanding: 1 });
  // A minute later nothing was sent again: comments are re-sent only when someone asks.
  expect(at["still-waiting"].read(Desk.postComment)).toHaveLength(1);
  // Resend: the same Attempt, then the next post. Stored once each, in the order typed.
  const sends = at["resent-in-order"].read(Desk.postComment);
  expect(sends.map((r) => r.input.clientId)).toEqual(["c1", "c1", "c2"]);
  expect(sends[0]?.input.key).toBe(sends[1]?.input.key);
  expect(texts(at["resent-in-order"].read(Desk))).toEqual([
    "Door sticks again",
    "Fixed it with oil",
  ]);
});

storyTest(gaveUp, ({ at }) => {
  expect(O.post.get(at["budget-spent"], T42).retryCount).toBe(3);
  expect(at["gave-up"].read(Story.records("verdict", { event: Comments.E.Resend }))).toContainEqual(
    expect.objectContaining({
      result: { _tag: "Denied", reasons: [{ code: "RetryLimit", retryCount: 3 }] },
    }),
  );
  expect(at["gave-up"].memory.drafts).toMatchObject([
    { clientId: "c1", problem: "gaveUp" },
    { clientId: "c2" },
  ]);
  // Releasing the head promoted c2, which is on its way now.
  expect(at["gave-up"].read(Desk.postComment).at(-1)?.input.clientId).toBe("c2");
});

storyTest(overloaded, ({ at }) => {
  expect(O.post.get(at.overloaded, T42).outstanding).toBe(64);
  expect(
    at.overloaded.read(Story.records("ending", { operation: O.post, channel: "failure" })),
  ).toMatchObject([{ reason: { _tag: "NotSent", why: "Overloaded" } }]);
  expect(at.overloaded.memory.drafts.filter((d) => d.problem === "notSent")).toMatchObject([
    { clientId: "q64" },
  ]);
});

storyTest(ticketGone, ({ at }) => {
  expect(at["ticket-gone"].memory.drafts).toMatchObject([
    { clientId: "c1", problem: "ticketGone" },
  ]);
  expect(at["ticket-gone"].read(Story.records("callback", { name: "onTicketGone" }))).toMatchObject(
    [{ payload: {} }],
  );
});

storyTest(leftWhileSending, ({ at }) => {
  expect(at.left.read(Story.inspection).lanes).toMatchObject([
    { key: T42, subject: ["T-42"], binding: "unplaced", releasing: false, state: "InFlight" },
  ]);
  expect(at.parked.read(Story.inspection).lanes).toMatchObject([
    { key: T42, binding: "unplaced", parked: 1 },
  ]);
  expect(at.adopted.memory.drafts).toEqual([]); // adopted `Posted`, then the thread pruned it
  expect(at.adopted.operations.post).toEqual([]);
});

storyTest(aBA, ({ at }) => {
  expect(at["on-b"].memory).toMatchObject({ ticketId: "T-43", drafts: [] }); // B starts with no drafts
  expect(at["two-lanes"].read(Story.inspection).lanes).toMatchObject([
    { key: T42, subject: ["T-42"], binding: "unplaced" },
    { key: { workspaceId: "north", ticketId: "T-43" }, subject: ["T-43"], binding: "bound" },
  ]);
  expect(at["back-on-a"].memory).toMatchObject({ ticketId: "T-42", drafts: [] });
  expect(at["back-on-a"].read(Desk.postComment)).toMatchObject([
    { input: { clientId: "a1" }, phase: "answered" },
    { input: { clientId: "b1" }, phase: "answered" },
  ]);
});

storyTest(edited, ({ at }) => {
  expect(at["edit-predicted"].read(Story.entity(Comment, c("c-1")))).toMatchObject({
    data: { text: "Note 1, corrected" },
    predicted: true,
  });
  expect(at["edit-confirmed"].read(Story.entity(Comment, c("c-1")))).toMatchObject({
    predicted: false,
  });
});

storyTest(deleteRefused, ({ at }) => {
  expect(at["delete-predicted"].read(Story.entity(Comment, c("c-1")))).toBeUndefined(); // hidden at once
  const restored = at["delete-refused-restored"].read(Story.entity(Comment, c("c-1")));
  expect(restored).toMatchObject({ data: { text: "Note 1" }, predicted: false });
  expect(at["delete-refused-restored"].memory.notice).toBe(
    "Past the edit window: the comment stays",
  );
  // Back in its place: still first of two, with no repair read for a definite failure (rule 30).
  expect(at["delete-refused-restored"].read(Desk.comments)).toHaveLength(2); // the first two reads (thread, pinned) only
});

storyTest(pinned, ({ at }) => {
  const strip = at.pinned.operations.pinned?.data?.flatMap((page) => page.comments) ?? [];
  expect(strip.map((row) => row.commentId)).toEqual(["c-2"]); // joined by the prediction, before the answer (E4)
  expect(at.pinned.read(Story.entity(Comment, c("c-2")))?.predicted).toBe(true);
  expect(at["pin-confirmed"].read(Story.entity(Comment, c("c-2")))?.predicted).toBe(false);
});

storyTest(markedRead, ({ at }) => {
  for (const id of ["c-1", "c-2", "c-3"])
    expect(at["marked-read"].read(Story.entity(Comment, c(id)))?.data.readAt).toBe(60_000);
  expect(at["marked-read"].read(Desk.markRead)).toMatchObject([
    { input: { comments: [c("c-1"), c("c-2"), c("c-3")] } }, // one request, three records (E2)
  ]);
  // No list moved: the thread was not read again.
  expect(at["marked-read"].read(Desk.comments).length).toBe(at.unread.read(Desk.comments).length);
});

storyTest(reacted, ({ at }) => {
  expect(at.reacted.operations.reactions?.data?.["c-1"]?.["👍"]).toBe(1); // the commit's `optimistic` look
  expect(at.reacted.operations.reactions?.predicted).toBe(true);
  expect(at["reaction-confirmed"].operations.reactions?.predicted).toBe(false);
});

storyTest(olderPage, ({ at }) => {
  expect(at["newest-page"].operations.thread?.data?.flatMap((p) => p.comments)).toHaveLength(20);
  expect(at["older-loaded"].operations.thread?.data?.flatMap((p) => p.comments)).toHaveLength(30);
});

// Y9: a comment is never shown as a draft and as a row at once, whatever the wire does to its post.
// design gap: the generators' spellings (`Generate.*`, REVIEW gap 39).
const neverTwice = Story.property("a comment never shows twice", (frame) => {
  const s = frame.read();
  if (s === undefined) return undefined;
  const rows = s.operations.thread?.data?.flatMap((page) => page.comments) ?? [];
  const twice = s.memory.drafts.filter((d) => rows.some((row) => row.clientId === d.clientId));
  return twice.length > 0 ? twice : undefined;
});

test("a comment never shows twice", () =>
  propertyTest(
    Story.make(Comments, {
      id: "comments/property-never-twice",
      fixtures: [DeskClient],
      properties: [neverTwice],
    }).enter({
      ...T42,
    }),
    {
      steps: [
        Generate.sends(Comments), // Post, Resend, GiveUp, Discard, … with Schema-derived payloads
        Generate.wire(Desk.postComment), // hold, release, drop (request and response), duplicate, release({ nth })
        Generate.wire(Desk.comments),
        Generate.advance(["1 second", "10 seconds"]),
      ],
      seed: 3,
      runs: 100,
      length: 25,
    },
  ));
