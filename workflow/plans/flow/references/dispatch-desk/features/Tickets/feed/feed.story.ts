// Feed Stories (pending merge 6; M6 2.11, machine-design 2.10.9). The world is the Desk fake: its socket
// endpoint greets and replays as the core computes, and the real `decodeFrame` and `Feed.reconnect`
// read the frames, so every signal comes from the adapter. Nothing injects an answer. Transcripts: inputs and
// checkpoints only; feed.test.ts reads them.
//
// A rename elsewhere is the cause that makes frames: `Desk.renameElsewhere` logs an event and the
// fake's `pushes` sends it to open sockets (one `change` and one `activity` frame).
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../../app/setup.js";
import { Desk, DeskClient } from "../../../testing/desk.fake.js";
import { SessionRef } from "../../Session/session.ref.js";
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
export const connected = desk("feed/connected").checkpoint("connected");

// A drop while two changes happen, on a server that greets without a replay (`Desk.greet({ replay: false })`).
// The reconnect starts from the stored cursor, so `catchUp` pages `eventsSince` after it. The row reads Live
// while it runs; the start settles proven and the machine hears the entries in order, with no notice.
export const dropAndCatchUp = desk("feed/drop-and-catch-up")
  .world(rename("T-43", "Fix the loading dock door"))
  .checkpoint("first-entry")
  .world(Desk.greet({ replay: false })) // a server control that `open` reads (2.10.9)
  .world(Desk.socket.drop()) // the network closes the sockets; the row reads Connecting with a `drop`
  .checkpoint("dropped")
  .world(rename("T-43", "Dock door, second try"), rename("T-42", "Replace foyer light"))
  .advance({ next: { operation: O.activity, timer: "backoff" } }) // reconnect from { epoch 1, seq 1 }
  .checkpoint("caught-up");

// The socket delivers one frame twice (`duplicate`, Y4): the same entry, the same cursor. Facts are stored
// by the source's id, so the log keeps it once; the cursor does not move backwards.
export const duplicateFrame = desk("feed/duplicate-frame")
  .world(Desk.socket.duplicate())
  .world(rename("T-43", "Fix the loading dock door"))
  .checkpoint("delivered-twice");

// The server keeps only the last entry, so its history no longer reaches the cursor. `eventsSince`
// says `truncated`: the step fails `Feed.CannotRepair`, the start settles lost, `missed Lost` reaches
// the machine before the next entry, and paging continues from `beforeOldest`. No drop, no budget spent.
export const historyTruncated = desk("feed/history-truncated")
  .world(rename("T-43", "Fix the loading dock door"))
  .world(Desk.socket.drop())
  .world(rename("T-43", "Dock door, second try"), rename("T-42", "Replace foyer light"))
  .world(Desk.retain({ last: 1 }))
  .advance({ next: { operation: O.activity, timer: "backoff" } })
  .checkpoint("history-truncated");

// A reload keeps the memory, so the new session asks the socket to resume from the stored cursor.
// The first session sent no `from` for either feed; after the reload only activity has one.
export const reloadResumes = desk("feed/reload-resumes")
  .world(rename("T-43", "Fix the loading dock door"))
  .reload("main") // close, reopen, re-ensure; the persisted feed restores its memory
  .checkpoint("resumed");

// A log restart is a new position space: `missed Reset`, the notice, and the stored cursor moves to
// the new epoch's start so the next reconnect asks from there.
export const logReset = desk("feed/log-reset")
  .world(rename("T-43", "Fix the loading dock door"))
  .world(Desk.resetLog(), Desk.socket.drop())
  .advance({ next: { operation: O.activity, timer: "backoff" } })
  .checkpoint("reset");

// The token expires (close 4401): not a transient drop, so the session fails `SignedOut` and the feed
// stops in SIGNED_OUT instead of retrying.
export const tokenExpired = desk("feed/token-expired")
  .world(Desk.expireToken())
  .checkpoint("signed-out");

// Another dispatcher renames T-43. The push updates the one Ticket record everywhere, and only the
// lists that can be wrong repair: the queue's list reads `title` and `updatedAt`, the open count reads
// only `status`.
export const pushedRename = desk("feed/pushed-rename")
  .ensure(North, { input: { workspaceId: "north" } })
  .checkpoint("before-push")
  .world(rename("T-43", "Fix the loading dock door"))
  .checkpoint("pushed");
