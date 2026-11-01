// the two live feeds of one workspace. Marks are against the desk's pending-merge-6 code.
import { Effect, Schema, Stream } from "effect";
import { Feed, stream } from "flow-state";
import { TicketApi } from "../ticket-api.js";
import { ActivityEntry, SocketDropped, TicketEvent } from "../types.js";
import { DeskFeedSocket } from "./feed.socket.js";

const show = (cursor: { readonly epoch: number; readonly seq: number }) =>
  `${String(cursor.epoch)}:${String(cursor.seq)}`;

export const ticketChanges = stream({
  id: "DispatchDesk/ticket-changes",
  input: { workspaceId: Schema.String },
  output: TicketEvent,
  key: ["workspaceId"],
  delivers: "every", // RENAMED value: "facts" -> "every"
  subscribe: ({ workspaceId }) =>
    Stream.unwrap(Effect.map(DeskFeedSocket, (feed) => feed.changes(workspaceId))), // E is inferred from the service
  reconnect: { while: (e) => e._tag === "SocketDropped" },
  idleTime: "45 seconds", // NEW. The server pings every 20 s; a ping before `hello` does not extend it
});

export const activity = stream({
  id: "DispatchDesk/activity",
  input: { workspaceId: Schema.String },
  output: ActivityEntry,
  key: ["workspaceId"],
  delivers: "every",
  position: "cursor", // the NAME of a field of `output`
  subscribe: ({ workspaceId }, { from }) =>
    Stream.unwrap(Effect.map(DeskFeedSocket, (feed) => feed.activity(workspaceId, from))),
  // existing: catchUp, moved to the contract. CUT: the AbortController, `Option`, `Stream.paginate`'s tuple.
  catchUp: ({ workspaceId }, { from, next, signal }) =>
    Effect.gen(function* () {
      const after = next ?? from;

      // A first open has nothing to read, and the wire's `hello` gives no head to name.
      if (after === undefined) return Feed.done({ items: [], proof: "nothing before now" });

      const page = yield* TicketApi.use((api) =>
        api.eventsSince({ workspaceId, after }, { signal }),
      ).pipe(
        Effect.mapError(() => new SocketDropped({ why: "History" })), // a lost read is a transient drop, retried with the socket open
      );

      if (page.truncated)
        return Feed.gone({
          reason: `history starts at ${show(page.truncated.oldest)}`,
          next: page.truncated.beforeOldest,
        });

      // The server's own `complete` is the proof (FC42): never "the page was short".
      if (page.complete)
        return Feed.done({
          items: page.entries,
          proof: "server: page.complete",
          through: page.entries.at(-1)?.cursor,
        });

      // An incomplete page with no `next` is a drop.
      if (page.next === undefined) return yield* new SocketDropped({ why: "History" });

      return Feed.more({ items: page.entries, next: page.next, through: page.next });
    }),
  reconnect: { while: (e) => e._tag === "SocketDropped" }, // after catchUp, so `e` includes its errors
  idleTime: "45 seconds",
});
