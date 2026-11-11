// Feed Stories as transcripts of inputs and checkpoints. The world is the Desk fake; the real
// `decodeFrame` and the contract's reconnect read the frames. feed.test.ts holds every check.
import { Layer } from "effect";
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../../app/setup.js";
import { Desk, DeskClient } from "../../../testing/desk.fake.js";
import { SessionRef } from "../../Session/session.ref.js";
import { queueRef } from "../queue/queue.ref.js";
import { socketClient } from "../../../testing/desk.socket.fake.js";
import { DeskFeed } from "./feed.definition.js";
import { DeskFeedSocket } from "./feed.socket.js";
import { feedRef } from "./feed.ref.js";

const { O } = DeskFeed;

export const FeedNorth = feedRef("north");

const North = queueRef("north");

const rename = (ticketId: string, title: string) =>
  Desk.renameElsewhere({ workspaceId: "north", ticketId, title });

const desk = (id: string) =>
  Story.app(DeskSetup, {
    id,
    fixtures: [DeskClient, DeskFeedSocket.layer.pipe(Layer.provide(socketClient(Desk)))],
  })
    .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
    .ensure(FeedNorth, { input: { workspaceId: "north" } });

// First run: nothing was owed, so the first registration is first-open: no notice, an empty log, Live.
export const connected = desk("feed/connected").checkpoint("connected");

// A drop while two changes happen, on a server that greets without a replay. The reconnect asks from the bookmark, so `catchUp`
// pages `eventsSince` after it; the machine hears the entries in order, with no notice.
export const dropAndCatchUp = desk("feed/drop-and-catch-up")
  .world(rename("T-43", "Fix the loading dock door"))
  .checkpoint("firstEntry")
  .world(Desk.greet({ replay: false }))
  .world(Desk.socket.drop()) // existing: the network closes the sockets
  .checkpoint("dropped")
  .world(rename("T-43", "Dock door, second try"), rename("T-42", "Replace foyer light"))
  .advance({ next: { operation: O.activity, timer: "backoff" } })
  .checkpoint("caughtUp");

// The socket delivers one frame twice: the same entry, the same cursor. Entries are stored by id, so the log keeps it once.
export const duplicateFrame = desk("feed/duplicate-frame")
  .world(Desk.socket.duplicate())
  .world(rename("T-43", "Fix the loading dock door"))
  .checkpoint("deliveredTwice");

// The server keeps only the last entry, so its history no longer reaches the bookmark: `Feed.gone`, `missed Lost`, then the rest.
export const historyTruncated = desk("feed/history-truncated")
  .world(rename("T-43", "Fix the loading dock door"))
  .world(Desk.socket.drop())
  .world(rename("T-43", "Dock door, second try"), rename("T-42", "Replace foyer light"))
  .world(Desk.retain({ last: 1 }))
  .advance({ next: { operation: O.activity, timer: "backoff" } })
  .checkpoint("historyTruncated");

// A reload keeps the memory and, with it, the bookmark, so the new session asks the socket to resume from it.
export const reloadResumes = desk("feed/reload-resumes")
  .world(rename("T-43", "Fix the loading dock door"))
  .reload("main")
  .checkpoint("resumed");

// A log restart is a new position space: `missed Reset`, the notice, and the next read starts at the new epoch.
export const logReset = desk("feed/log-reset")
  .world(rename("T-43", "Fix the loading dock door"))
  .world(Desk.resetLog(), Desk.socket.drop())
  .advance({ next: { operation: O.activity, timer: "backoff" } })
  .checkpoint("reset");

// Eight quick drops end the session `Flapping` (MD 2.11.10). Plain construction: a loop of `world` and `advance`
// adds no checkpoint, so the builder's type is unchanged. `base` is a Story past its first registration.
const base = desk("feed/flapping").checkpoint("live");

export const flapped = Array.from({ length: 7 })
  .reduce(
    (story: typeof base) =>
      story
        .advance("1 second")
        .world(Desk.socket.drop())
        .advance({ next: { operation: O.activity, timer: "backoff" } }),
    base,
  )
  .advance("1 second")
  .world(Desk.socket.drop()) // the eighth drop ends it: no backoff left
  .checkpoint("ended");

// The token expires (close 4401): not in `reconnect.while`, so the session fails `SignedOut` and the feed stops in SIGNED_OUT.
export const tokenExpired = desk("feed/token-expired")
  .world(Desk.expireToken())
  .checkpoint("signedOut");

// Another dispatcher renames T-43. The push updates the one Ticket record everywhere, and only the lists that can be wrong repair.
export const pushedRename = desk("feed/pushed-rename")
  .ensure(North, { input: { workspaceId: "north" } })
  .checkpoint("beforePush")
  .world(rename("T-43", "Fix the loading dock door"))
  .checkpoint("pushed");
