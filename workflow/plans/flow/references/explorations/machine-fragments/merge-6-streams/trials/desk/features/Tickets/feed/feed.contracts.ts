// TRIAL (proposal-v3.md): the two live feeds of one workspace, as streams v3 writes them. Imports of unchanged desk files go
// through the `@desk` alias. Marks: `// NEW` `// RENAMED` `// existing` `// CUT` are against the desk's pending-merge-6 code.
import { Effect, Schema, Stream } from "effect";
import { Feed, stream } from "flow-state";
import { TicketApi } from "@desk/features/Tickets/ticket-api.js";
import {
  ActivityEntry,
  type Cursor,
  SignedOut,
  SocketDropped,
  TicketEvent,
  sameCursor,
} from "@desk/features/Tickets/types.js";
import { type DeskFrame, DeskSocket } from "@desk/features/Tickets/feed/desk-socket.js";

const show = (cursor: Cursor) => `${String(cursor.epoch)}:${String(cursor.seq)}`;

// What the server's first frame says to Flow. Two functions, not one: `restartAt` carries a position, and a feed with no
// `position` has none to restart (RESULTS: ticketChanges cannot share the helper).
const hello = (frame: Extract<DeskFrame, { t: "hello" }>, from: Cursor | undefined) =>
  frame.replayedFrom !== undefined && sameCursor(frame.replayedFrom, from)
    ? Feed.live({ proof: `server replayed from ${show(frame.replayedFrom)}` }) // existing: proof
    : Feed.live(); // registered, nothing proven

const ticketSignals = (frame: DeskFrame): ReadonlyArray<TicketEvent | Feed.Signal<never>> => {
  switch (frame.t) {
    case "hello":
      return [hello(frame, undefined)];
    case "reset":
      return [Feed.live()]; // CUT: `lost`, `restartAt`. No position here; `listen` refetches whatever a start cannot prove
    case "ping":
      return [Feed.ping]; // NEW: Feed.ping, so `idle` hears the server's 20 s pings
    case "change":
      return [frame.event];
    case "activity":
      return [];
  }
};

const activitySignals =
  (from: Cursor | undefined) =>
  (frame: DeskFrame): ReadonlyArray<ActivityEntry | Feed.Signal<Cursor>> => {
    switch (frame.t) {
      case "hello":
        return [hello(frame, from)];
      case "reset":
        return [Feed.live({ restartAt: { epoch: frame.epoch, seq: 0 } })]; // existing: restartAt. CUT: `lost`
      case "ping":
        return [Feed.ping];
      case "activity":
        return [frame.entry];
      case "change":
        return [];
    }
  };

export const ticketChanges = stream({
  id: "DispatchDesk/ticket-changes",
  input: { workspaceId: Schema.String },
  output: TicketEvent,
  key: ["workspaceId"],
  delivers: "every", // RENAMED value: "facts" -> "every"
  errors: [SocketDropped, SignedOut], // NEW: errors
  idle: "45 seconds", // NEW: idle. Was `Stream.timeoutOrElse` inside the adapter; the server pings every 20 s
  reconnect: { while: ["SocketDropped"] }, // RENAMED: Feed.reconnect(...) -> data. CUT: `schedule` (the default), `whileDropped`
  subscribe: ({ workspaceId }) =>
    Stream.unwrap(
      Effect.map(DeskSocket, (socket) =>
        socket
          .frames(workspaceId, undefined)
          .pipe(Stream.flatMap((frame) => Stream.fromIterable(ticketSignals(frame)))),
      ),
    ),
});

export const activity = stream({
  id: "DispatchDesk/activity",
  input: { workspaceId: Schema.String }, // CUT: `after`
  output: ActivityEntry,
  key: ["workspaceId"],
  delivers: "every",
  position: "cursor", // RENAMED shape: was `position: (entry) => entry.cursor`, now the field's name
  errors: [SocketDropped, SignedOut],
  idle: "45 seconds",
  reconnect: { while: ["SocketDropped"] },
  subscribe: ({ workspaceId }, { from }) =>
    Stream.unwrap(
      Effect.map(DeskSocket, (socket) =>
        socket
          .frames(workspaceId, from)
          .pipe(Stream.flatMap((frame) => Stream.fromIterable(activitySignals(from)(frame)))),
      ),
    ),
  // existing: catchUp, moved to the contract. CUT: the AbortController, `Option`, `Stream.paginate`'s tuple.
  catchUp: ({ workspaceId }, { from, next, signal }) =>
    Effect.gen(function* () {
      const after = next ?? from;

      // A first open has nothing to read: the wire's `hello` carries no head (RESULTS: needs `Feed.live({ at })`).
      if (after === undefined) return Feed.done([]);

      const page = yield* TicketApi.use((api) =>
        api.eventsSince({ workspaceId, after }, { signal }),
      ).pipe(
        Effect.mapError(() => new SocketDropped({ why: "History" })), // a lost read is a transient drop, retried with the socket open
      );

      if (page.truncated)
        return Feed.gone(`history starts at ${show(page.truncated.oldest)}`, {
          next: page.truncated.beforeOldest,
        }); // RENAMED: CannotRepair, continueAt

      if (page.complete) return Feed.done(page.entries, { at: page.entries.at(-1)?.cursor }); // NEW: Feed.done, at

      // Only the server's `complete` completes a read (FC42): an incomplete page with no `next` is a drop.
      if (page.next === undefined) return yield* new SocketDropped({ why: "History" });

      return Feed.more(page.entries, page.next, { at: page.next }); // NEW: Feed.more, at
    }),
});
