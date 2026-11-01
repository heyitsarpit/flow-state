// The two live feeds of one workspace: pushed ticket changes and the activity log. Pending merge 6
// (M6 2.2-2.4, 4.1; decisions S2-S4, S7): every `stream`, `Feed` and `delivers` line is a stream line.
//
// Both ride the one `DeskSocket` service, as two connections: the socket protocol has no channels, so
// each contract opens the workspace socket and keeps the frames it owns (plan, open item 5).
//   ticketChanges  `change` frames -> TicketEvent. Consumed by `listen` (feed.domain.ts), which keeps no
//                  position across sessions, so there is no `from` and no `catchUp`: every start lowers
//                  the lists it covers and the domain refetches them.
//   activity       `activity` frames -> ActivityEntry. A fact feed into DeskFeed's memory. The resume
//                  position is the `after` input, which the machine fills from its memory (S4).
import { Effect, Option, Schedule, Schema, Stream } from "effect"; // Effect: Option, Schedule, Stream
import { Feed, stream } from "flow-state"; // pending merge 6: NEW: Feed (module); existing: stream
import { TicketApi } from "../ticket-api.js";
import {
  ActivityEntry,
  Cursor,
  NoResponse,
  SocketDropped,
  TicketEvent,
  sameCursor,
} from "../types.js";
import { DeskFrame, DeskSocket } from "./desk-socket.js";

// What the adapter tells Flow about the connection (S2). The server's first frame is its registration:
// a `hello` that echoes our `from` proves the replay (nothing missed); any other `hello` registers with
// nothing proven; a `reset` says the log restarted in a new epoch, so the old position is meaningless.
// Frames this feed does not own, and pings, decode to nothing.
const toItems =
  <A>(from: Cursor | undefined, own: (frame: DeskFrame) => ReadonlyArray<A>) =>
  (frame: DeskFrame): ReadonlyArray<A | Feed.Signal<never, Cursor>> => {
    switch (frame.t) {
      case "hello":
        return [
          frame.replayedFrom !== undefined && sameCursor(frame.replayedFrom, from)
            ? Feed.live({
                proof: `server replayed from ${String(frame.replayedFrom.epoch)}:${String(frame.replayedFrom.seq)}`,
              }) // pending merge 6: NEW: Feed.live, proof (only on the server's echo of this `from`)
            : Feed.live(), // pending merge 6: registered, nothing proven
        ];
      case "reset":
        return [
          Feed.live({ lost: "log reset", restartAt: { epoch: frame.epoch, seq: 0 } }), // pending merge 6: NEW: lost, restartAt (rare)
        ];
      case "ping":
        return [];
      default:
        return own(frame);
    }
  };

const ticketChangeOf = (frame: DeskFrame) => (frame.t === "change" ? [frame.event] : []);

const activityOf = (frame: DeskFrame) => (frame.t === "activity" ? [frame.entry] : []);

// The pager behind `catchUp`: one `eventsSince` page per step. The server's own word decides when it
// is over (`complete`), never "the page was short" (FC42). A history that no longer reaches the cursor
// is `truncated`: that is `Feed.CannotRepair`, which settles the start lost (`missed Lost`) and then
// continues after the position just before the oldest kept entry. A lost request is a transient drop
// (retried by the schedule with the socket open), so the port's `NoResponse` becomes `SocketDropped`.
const eventsPage = (workspaceId: string) => (cursor: Cursor) =>
  Effect.gen(function* () {
    // `catchUp` is an Effect, so interruption is Effect's: the port's signal is aborted when this step is
    // interrupted or ends, and an interrupted catch-up leaves no request running (S6 Q15).
    const page = yield* Effect.acquireUseRelease(
      Effect.sync(() => new AbortController()),
      (controller) =>
        TicketApi.use((api) =>
          api.eventsSince({ workspaceId, after: cursor }, { signal: controller.signal }),
        ),
      (controller) => Effect.sync(() => controller.abort()),
    ).pipe(Effect.mapError((_: NoResponse) => new SocketDropped({ why: "History" })));

    if (page.truncated) {
      return yield* new Feed.CannotRepair({
        // pending merge 6: NEW (S7): missed Lost, then the rest
        reason: `history starts at ${String(page.truncated.oldest.epoch)}:${String(page.truncated.oldest.seq)}`,
        continueAt: page.truncated.beforeOldest, // the next page starts after it
      });
    }

    // Only the server's completeness field completes the repair (FC42): an incomplete page with no
    // `next` is a transient drop, retried with the socket open.
    if (!page.complete && page.next === undefined) {
      return yield* new SocketDropped({ why: "History" });
    }

    const next = page.complete ? Option.none() : Option.fromNullishOr(page.next);

    return [page.entries, next] as const; // pending merge 6: Stream.paginate's step shape
  });

// Both feeds retry a dropped socket: 500 ms, doubling, jittered, eight tries. The budget returns after
// a connection has been registered for a minute (`resetAfter`, default).
const schedule = Schedule.exponential("500 millis").pipe(
  Schedule.jittered,
  Schedule.upTo({ times: 8 }),
);

const whileDropped = (error: SocketDropped | { readonly _tag: string }) =>
  error._tag === "SocketDropped"; // SignedOut (close 4401) is terminal: the session ends

export const ticketChanges = stream({
  // pending merge 6
  id: "DispatchDesk/ticket-changes",
  input: { workspaceId: Schema.String },
  output: TicketEvent,
  key: ["workspaceId"], // one session per workspace
  delivers: "facts", // pending merge 6: accepted: delivers (M6-D4); `listen` takes only facts
  subscribe: ({ workspaceId }) =>
    Stream.unwrap(
      Effect.map(DeskSocket, (socket) =>
        Feed.reconnect(
          // pending merge 6: NEW: Feed.reconnect
          (from) =>
            socket
              .frames(workspaceId, from)
              .pipe(
                Stream.flatMap((frame) =>
                  Stream.fromIterable(toItems(from, ticketChangeOf)(frame)),
                ),
              ),
          // No `from`, `position` or `catchUp`: a `listen` session starts fresh and lowers once, so the
          // cross-session position belongs to the fact feed below (M6 2.7).
          { while: whileDropped, schedule },
        ),
      ),
    ),
});

export const activity = stream({
  // pending merge 6
  id: "DispatchDesk/activity",
  input: { workspaceId: Schema.String, after: Schema.optional(Cursor) }, // `after` is outside the key (K2)
  output: ActivityEntry,
  key: ["workspaceId"],
  delivers: "facts", // pending merge 6
  subscribe: ({ workspaceId, after }) =>
    Stream.unwrap(
      Effect.map(DeskSocket, (socket) =>
        Feed.reconnect(
          // pending merge 6
          (from) =>
            socket
              .frames(workspaceId, from)
              .pipe(
                Stream.flatMap((frame) => Stream.fromIterable(toItems(from, activityOf)(frame))),
              ),
          {
            from: after, // pending merge 6: NEW: from (where the first connection resumes); empty on a first run: `fresh`
            position: (entry) => entry.cursor, // pending merge 6: NEW: position (the entry names its place)
            while: whileDropped,
            schedule,
            catchUp: eventsPage(workspaceId), // pending merge 6: NEW: catchUp; pages oldest first, after the cursor (P0)
          },
        ),
      ),
    ),
});
