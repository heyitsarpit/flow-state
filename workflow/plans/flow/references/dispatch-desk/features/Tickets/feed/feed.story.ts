// Feed Stories (pending merge 6; M6 2.11, machine-design 2.10.9). The world is the Desk fake: its socket
// endpoint greets and replays as the core computes, and the real `decodeFrame` and `Feed.reconnect`
// read the frames, so every signal comes from the adapter. Nothing injects an answer.
//
// A rename elsewhere is the cause that makes frames: `Desk.renameElsewhere` logs an event and the
// fake's `pushes` sends it to open sockets (one `change` and one `activity` frame).
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../../app/setup.js";
import { Desk, DeskClient } from "../../../testing/desk.fake.js";
import { SessionRef } from "../../Session/session.ref.js";
import { Ticket } from "../ticket.domain.js";
import { queueRef } from "../queue/queue.ref.js";
import { DeskFeed } from "./feed.definition.js";
import { feedRef } from "./feed.ref.js";

const { O } = DeskFeed;

export const FeedNorth = feedRef("north");

const North = queueRef("north");

const rename = (ticketId: string, title: string) =>
  Desk.renameElsewhere({ workspaceId: "north", ticketId, title });

const desk = (id: string) =>
  Story.make(DeskSetup, { id, fixtures: [DeskClient] })
    .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
    .ensure(FeedNorth, { input: { workspaceId: "north" } });

// First run: nothing was owed, so the first registration is `fresh`: no notice, an empty log, Live.
export const connected = desk("feed/connected").expect(FeedNorth, {
  state: DeskFeed.S.LIVE,
  memory: { notice: "", activity: [] },
  operations: { activity: { connection: "Live" } },
});

// A drop while two changes happen, on a server that cannot replay (`withhold`). The reconnect starts
// from the stored cursor, so `catchUp` pages `eventsSince` after it. The row reads Live while it runs;
// the start settles proven and the machine hears the entries in order, with no notice.
export const dropAndCatchUp = desk("feed/drop-and-catch-up")
  .world(rename("T-43", "Fix the loading dock door"))
  .expect(FeedNorth, { memory: { cursor: { epoch: 1, seq: 1 } } })
  .world(Desk.socket.withhold("replay")) // design gap: B2's Desk has no replay-withholding control; M6 2.11 spells it `fake.withhold("replay")`
  .world(Desk.socket.drop()) // the network closes the sockets; the row reads Connecting with a `drop`
  .expect(FeedNorth, { operations: { activity: { connection: "Connecting" } } })
  .world(rename("T-43", "Dock door, second try"), rename("T-42", "Replace foyer light"))
  .advance({ next: { operation: O.activity, timer: "backoff" } }) // reconnect from { epoch 1, seq 1 }
  .expect(FeedNorth, {
    memory: { notice: "", cursor: { epoch: 1, seq: 3 } },
    operations: { activity: { connection: "Live" } },
  })
  .expect(Desk.eventsSince, [{ input: { workspaceId: "north", after: { epoch: 1, seq: 1 } } }]);

// The server keeps only the last entry, so its history no longer reaches the cursor. `eventsSince`
// says `truncated`: the step fails `Feed.CannotRepair`, the start settles lost, `missed Lost` reaches
// the machine before the next entry, and paging continues from `beforeOldest`. No drop, no budget spent.
export const historyTruncated = desk("feed/history-truncated")
  .world(rename("T-43", "Fix the loading dock door"))
  .world(Desk.socket.drop())
  .world(rename("T-43", "Dock door, second try"), rename("T-42", "Replace foyer light"))
  .world(Desk.retain({ last: 1 }))
  .advance({ next: { operation: O.activity, timer: "backoff" } })
  .checkpoint("rejoined")
  .expect(FeedNorth, {
    memory: { notice: "Some activity may be missing", cursor: { epoch: 1, seq: 3 } },
    operations: { activity: { connection: "Live" } },
  });

// A reload keeps the memory, so the new session asks the socket to resume from the stored cursor.
// The first session sent no `from` for either feed; after the reload only activity has one.
export const reloadResumes = desk("feed/reload-resumes")
  .world(rename("T-43", "Fix the loading dock door"))
  .reload("main") // close, reopen, re-ensure; the persisted feed restores its memory
  .expect(FeedNorth, { memory: { notice: "", cursor: { epoch: 1, seq: 1 } } })
  .expect(Desk.socket, [
    { input: { workspaceId: "north" } }, // changes, first run
    { input: { workspaceId: "north" } }, // activity, first run: fresh
    { input: { workspaceId: "north" } }, // changes, after the reload: `listen` keeps no position
    { input: { workspaceId: "north", from: { epoch: 1, seq: 1 } } }, // activity resumes from the cursor
  ]);

// A log restart is a new position space: `missed Reset`, the notice, and the stored cursor moves to
// the new epoch's start so the next reconnect asks from there.
export const logReset = desk("feed/log-reset")
  .world(rename("T-43", "Fix the loading dock door"))
  .world(Desk.resetLog(), Desk.socket.drop())
  .advance({ next: { operation: O.activity, timer: "backoff" } })
  .expect(FeedNorth, {
    memory: { notice: "Some activity may be missing", cursor: { epoch: 2, seq: 0 } },
  });

// The token expires (close 4401): not a transient drop, so the session fails `SignedOut` and the feed
// stops in SIGNED_OUT instead of retrying.
export const tokenExpired = desk("feed/token-expired")
  .world(Desk.expireToken())
  .expect(FeedNorth, { state: DeskFeed.S.SIGNED_OUT });

// Another dispatcher renames T-43. The push updates the one Ticket record everywhere, and only the
// lists that can be wrong repair: the queue's list reads `title` and `updatedAt`, the open count reads
// only `status`.
export const pushedRename = desk("feed/pushed-rename")
  .ensure(North, { input: { workspaceId: "north" } })
  .checkpoint("before-push")
  .world(rename("T-43", "Fix the loading dock door"))
  .expect(Story.entity(Ticket, { workspaceId: "north", ticketId: "T-43" }), {
    data: { title: "Fix the loading dock door" },
  })
  .expect(FeedNorth, { memory: { activity: [{ text: "dispatcher-2 updated T-43" }] } }); // text is the server's line (desk-server.ts)
