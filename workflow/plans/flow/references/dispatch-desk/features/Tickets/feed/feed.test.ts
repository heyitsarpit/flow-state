// Feed checks (pending merge 6), read from the Stories' checkpoints through the proposed test adapter
// (COVERAGE.md section 6; features/Tickets/editor/editor.test.ts says what `at` is).
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Desk } from "../../../testing/desk.fake.js";
import { Ticket } from "../ticket.domain.js";
import { DeskFeed } from "./feed.definition.js";
import {
  FeedNorth,
  connected,
  dropAndCatchUp,
  duplicateFrame,
  historyTruncated,
  logReset,
  pushedRename,
  reloadResumes,
  tokenExpired,
} from "./feed.story.js";

const { S } = DeskFeed;

storyTest(connected, ({ at }) => {
  const feed = at.connected.read(FeedNorth);
  expect(feed?.state).toBe(S.LIVE);
  expect(feed?.memory).toMatchObject({ notice: "", activity: [] }); // fresh: nothing was owed
  expect(feed?.operations.activity?.connection).toBe("Live"); // pending merge 6: accepted: connection
});

storyTest(dropAndCatchUp, ({ at }) => {
  expect(at["first-entry"].read(FeedNorth)?.memory.cursor).toEqual({ epoch: 1, seq: 1 });
  expect(at.dropped.read(FeedNorth)?.operations.activity?.connection).toBe("Connecting");
  const feed = at["caught-up"].read(FeedNorth);
  // Three renames, three entries, each once and in order, whatever the replay and pages repeated.
  expect(feed?.memory.activity.map((entry) => entry.cursor.seq)).toEqual([1, 2, 3]);
  expect(feed?.memory).toMatchObject({ notice: "", cursor: { epoch: 1, seq: 3 } });
  expect(feed?.operations.activity?.connection).toBe("Live");
  // One catch-up read, beside the open socket, from the stored cursor.
  expect(at["caught-up"].read(Desk.eventsSince)).toMatchObject([
    { input: { workspaceId: "north", after: { epoch: 1, seq: 1 } } },
  ]);
});

storyTest(duplicateFrame, ({ at }) => {
  const feed = at["delivered-twice"].read(FeedNorth);
  expect(feed?.memory.activity).toHaveLength(1); // stored by the source's id: at least once, kept once
  expect(feed?.memory.cursor).toEqual({ epoch: 1, seq: 1 });
});

storyTest(historyTruncated, ({ at }) => {
  const feed = at["history-truncated"].read(FeedNorth);
  expect(feed?.memory.notice).toBe("Some activity may be missing");
  // The one kept entry still arrives, after the notice; the lost ones are gone.
  expect(feed?.memory.activity.map((entry) => entry.cursor.seq)).toEqual([1, 3]);
  // Not a drop: the machine never left LIVE, so the backoff is where it started.
  expect(feed?.memory.reopenInMs).toBe(1000);
  expect(feed?.operations.activity?.connection).toBe("Live");
});

storyTest(reloadResumes, ({ at }) => {
  expect(at.resumed.read(FeedNorth)?.memory).toMatchObject({
    notice: "",
    cursor: { epoch: 1, seq: 1 },
  });
  // changes, activity (first run: fresh), changes after the reload (`listen` keeps no position), activity resuming.
  expect(at.resumed.read(Desk.socket).map((request) => request.input.from)).toEqual([
    undefined,
    undefined,
    undefined,
    { epoch: 1, seq: 1 },
  ]);
});

storyTest(logReset, ({ at }) => {
  expect(at.reset.read(FeedNorth)?.memory).toMatchObject({
    notice: "Some activity may be missing",
    cursor: { epoch: 2, seq: 0 },
  });
});

storyTest(tokenExpired, ({ at }) => {
  expect(at["signed-out"].read(FeedNorth)?.state).toBe(S.SIGNED_OUT);
});

storyTest(pushedRename, ({ at }) => {
  const key = { workspaceId: "north", ticketId: "T-43" };
  expect(at.pushed.read(Story.entity(Ticket, key))?.data.title).toBe("Fix the loading dock door");
  expect(at.pushed.read(FeedNorth)?.memory.activity).toMatchObject([
    { text: "dispatcher-2 updated T-43" }, // the server's line (desk-server.ts)
  ]);
  // The push changed `title` and `updatedAt`: the list reads both. The open count reads only `status`.
  expect(at.pushed.read(Desk.list).length - at["before-push"].read(Desk.list).length).toBe(1);
  expect(
    at.pushed.read(Desk.openCount).length - at["before-push"].read(Desk.openCount).length,
  ).toBe(0);
});
