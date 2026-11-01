// TRIAL (stories-amended.md 1.1): the checks, in the runner's own `expect`, over the checkpoints the Stories name.
import { expect, it as test } from "vite-plus/test"; // the repo shim exports `it`, not `test`
import type { Story } from "flow-state/testing";
import { Ticket } from "../../../standin/ticket-entity.js";
import { Desk } from "../../../testing/desk.socket.fake.js";
import { DeskFeed } from "./feed.definition.js";
import {
  FeedNorth,
  connected,
  dropAndCatchUp,
  duplicateFrame,
  flapped,
  historyTruncated,
  logReset,
  pushedRename,
  reloadResumes,
  tokenExpired,
} from "./feed.story.js";

const { S, O } = DeskFeed;

// The bookmark, as the last `session` record shows it (proposal-v3 section 8). `Story.Frame` is by subject, as stories-amended 1.1 says.
// An app Story has no subject, so `Story.Frame` takes no argument here (RESULTS: a guess).
const bookmark = (cp: Story.Frame) =>
  cp.records("session", { operation: O.activity }).at(-1)?.bookmark;

test("connected: first open, no notice", async () => {
  const { connected: cp } = (await connected.run()).checkpoints;
  const feed = cp.read(FeedNorth);

  expect(feed?.state).toBe(S.LIVE);
  expect(feed?.memory).toMatchObject({ notice: "", activity: [] });
  expect(feed?.operations.activity?.connection).toBe("Live");
  expect(feed?.operations.activity?.catchingUp).toBe(false); // NEW: catchingUp
});

test("drop and catch up", async () => {
  const { firstEntry, dropped, caughtUp } = (await dropAndCatchUp.run()).checkpoints;

  expect(bookmark(firstEntry)?.at).toEqual({ epoch: 1, seq: 1 }); // was `memory.cursor`
  expect(dropped.read(FeedNorth)?.operations.activity?.connection).toBe("Connecting");

  const feed = caughtUp.read(FeedNorth);
  // Three renames, three entries, each once and in order, whatever the replay and pages repeated.
  expect(feed?.memory.activity.map((entry) => entry.cursor.seq)).toEqual([1, 2, 3]);
  expect(feed?.memory.notice).toBe("");
  expect(feed?.operations.activity?.connection).toBe("Live");
  expect(bookmark(caughtUp)?.at).toEqual({ epoch: 1, seq: 3 }); // was `memory.cursor`
  // One catch-up read, beside the open socket, from the bookmark.
  expect(caughtUp.read(Desk.eventsSince)).toMatchObject([
    { input: { workspaceId: "north", after: { epoch: 1, seq: 1 } } },
  ]);
});

test("a frame delivered twice is kept once", async () => {
  const { deliveredTwice } = (await duplicateFrame.run()).checkpoints;

  expect(deliveredTwice.read(FeedNorth)?.memory.activity).toHaveLength(1);
  expect(bookmark(deliveredTwice)?.at).toEqual({ epoch: 1, seq: 1 }); // the bookmark does not move backwards
});

test("history truncated: one notice, the kept entry arrives after it", async () => {
  const { historyTruncated: cp } = (await historyTruncated.run()).checkpoints;
  const feed = cp.read(FeedNorth);

  expect(feed?.memory.notice).toBe("Some activity may be missing");
  expect(feed?.memory.activity.map((entry) => entry.cursor.seq)).toEqual([1, 3]);
  // Not a drop: the machine never left LIVE, so the backoff is where it started.
  expect(feed?.memory.reopenInMs).toBe(1000);
  expect(feed?.operations.activity?.connection).toBe("Live");
});

test("a reload resumes from the saved bookmark", async () => {
  const { resumed } = (await reloadResumes.run()).checkpoints;

  expect(resumed.read(FeedNorth)?.memory).toMatchObject({ notice: "" });
  expect(bookmark(resumed)?.at).toEqual({ epoch: 1, seq: 1 }); // was `memory.cursor`: the bookmark came back with the memory
  // changes, activity (first open), changes after the reload (no position), activity resuming from the bookmark.
  expect(resumed.read(Desk.socket).map((request) => request.input.from)).toEqual([
    undefined,
    undefined,
    undefined,
    { epoch: 1, seq: 1 },
  ]);
});

test("a log reset: notice, and the next read starts in the new epoch", async () => {
  const { reset } = (await logReset.run()).checkpoints;

  expect(reset.read(FeedNorth)?.memory.notice).toBe("Some activity may be missing");
  expect(bookmark(reset)?.at).toEqual({ epoch: 2, seq: 0 }); // was `memory.cursor`
  expect(reset.read(Desk.eventsSince)).toMatchObject([{ input: { after: { epoch: 2, seq: 0 } } }]);
});

test("token expired: signed out, not retried", async () => {
  const { signedOut } = (await tokenExpired.run()).checkpoints;

  expect(signedOut.read(FeedNorth)?.state).toBe(S.SIGNED_OUT);
});

test("a pushed rename repairs only the lists that can be wrong", async () => {
  const { beforePush, pushed } = (await pushedRename.run()).checkpoints;
  const key = { workspaceId: "north", ticketId: "T-43" };

  expect(pushed.entity(Ticket, key)?.data.title).toBe("Fix the loading dock door");
  expect(pushed.read(FeedNorth)?.memory.activity).toMatchObject([
    { text: "dispatcher-2 updated T-43" },
  ]);
  expect(pushed.read(Desk.list).length - beforePush.read(Desk.list).length).toBe(1);
  expect(pushed.read(Desk.openCount).length - beforePush.read(Desk.openCount).length).toBe(0);
});

test("eight quick drops end the session Flapping, and the machine waits to reopen", async () => {
  const { ended } = (await flapped.run()).checkpoints;

  expect(ended.read(FeedNorth)?.state).toBe(S.RETRY_WAIT);
  expect(ended.records("session", { operation: O.activity }).at(-1)?.ended).toBe("Flapping");
  expect(ended.read(FeedNorth)?.memory.reopenInMs).toBe(2000); // one ended session doubled it
});
