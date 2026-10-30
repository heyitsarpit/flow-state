// Feed tests (pending merge 6). Each Story states its own expectations with `expect`, which rejects the
// run when one fails (`StoryExpectationFailed`, after the whole plan ran), so a Story that runs is a
// Story that passed. These tests add what a Story cannot say with a partial: counts and orderings.
import { expect, test } from "vite-plus/test";
import { Desk } from "../../../testing/desk.fake.js";
import {
  FeedNorth,
  connected,
  dropAndCatchUp,
  historyTruncated,
  logReset,
  pushedRename,
  reloadResumes,
  tokenExpired,
} from "./feed.story.js";

test("the first connection owes nothing", () => connected.run());

test("a token expiry ends the feed instead of retrying", () => tokenExpired.run());

test("a drop catches up from the cursor and shows no notice", async () => {
  const run = await dropAndCatchUp.run();
  const feed = run.read(FeedNorth);

  // Three renames, three entries, each once and in order, whatever the replay and pages repeated.
  expect(feed.memory.activity.map((entry) => entry.cursor.seq)).toEqual([1, 2, 3]);
  expect(feed.memory.notice).toBe("");

  // One drop: the catch-up is a read beside the open socket, and a page failure would not add one.
  expect(run.read(Desk.eventsSince)).toHaveLength(1);
});

test("a history that no longer reaches the cursor is missed, not an outage", async () => {
  const run = await historyTruncated.run();
  const feed = run.checkpoints.rejoined.read(FeedNorth);

  expect(feed.memory.notice).toBe("Some activity may be missing");
  // The one kept entry still arrives, after the notice; the lost ones are gone.
  expect(feed.memory.activity.map((entry) => entry.cursor.seq)).toEqual([1, 3]);
  // Not a drop: the machine never left LIVE, so the backoff is where it started.
  expect(feed.memory.reopenInMs).toBe(1000);
});

test("a reload resumes the activity feed from the stored cursor", async () => {
  const run = await reloadResumes.run();
  const opens = run.read(Desk.socket).map((request) => request.input.from);

  expect(opens).toEqual([undefined, undefined, undefined, { epoch: 1, seq: 1 }]);
});

test("a log reset is missed, and the cursor moves to the new epoch", async () => {
  const run = await logReset.run();

  expect(run.read(FeedNorth).memory.cursor).toEqual({ epoch: 2, seq: 0 });
});

test("a pushed rename repairs only the lists that can be wrong", async () => {
  const run = await pushedRename.run();
  const since = run.checkpoints["before-push"];

  // The push changed `title` and `updatedAt`: the list reads both. The open count reads only `status`.
  expect(run.read(Desk.list).length - since.read(Desk.list).length).toBe(1);
  expect(run.read(Desk.openCount).length - since.read(Desk.openCount).length).toBe(0);
});
