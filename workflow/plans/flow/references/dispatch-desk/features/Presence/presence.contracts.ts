// Who has a ticket open. Demonstrates rules 39 and 47 (a contract states input, output and key) and the
// state feed of M6 2.1, 2.6 and 4.2: `delivers: "state"`, so the row holds one `value` (the members the
// current connection confirmed) and `last` (the previous one, shown dimmed while reconnecting).
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7, S1–S10.
import { Effect, Schedule, Schema, Stream } from "effect";
import { Feed, stream } from "flow-state"; // pending merge 6
import { SocketDropped } from "../Tickets/types.js";
import { Members, PresenceApi, applyDiff, type PresenceFrame } from "./presence-api.js";

// The adapter folds frames into one `Members` value. A `presence_state` replaces everything, so each
// connection is correct again from its own first frame; a diff before any state cannot happen (the server
// sends the state first) and starts from nothing if it does. A ping changes nothing.
const fold = (acc: Members | undefined, frame: PresenceFrame): Members | undefined =>
  frame.t === "presence_state"
    ? frame.members
    : frame.t === "presence_diff"
      ? applyDiff(acc ?? {}, frame)
      : acc;

// pending merge 6
export const ticketViewers = stream({
  id: "DispatchDesk/ticket-viewers",
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  output: Members,
  key: ["workspaceId", "ticketId"], // one session per ticket per Runtime, shared by the panel and the queue row
  delivers: "state",
  subscribe: ({ workspaceId, ticketId }) =>
    Stream.unwrap(
      Effect.map(PresenceApi, (presence) =>
        Feed.reconnect(
          () =>
            presence.frames({ workspaceId, ticketId }).pipe(
              Stream.scan(undefined as Members | undefined, fold),
              // The first full state is the first value, so there is no explicit `Feed.live()`: the
              // row is live from it. Frames before it (a ping) produce nothing.
              Stream.filter((members): members is Members => members !== undefined),
              // The server pings every 20 s, so a silent minute is a half-open socket.
              Stream.timeoutOrElse({
                duration: "60 seconds",
                orElse: () => Stream.fail(new SocketDropped({ why: "Silent" })),
              }),
            ),
          {
            while: (e) => e._tag === "SocketDropped", // SignedOut is terminal and ends the session
            schedule: Schedule.exponential("1 second").pipe(Schedule.upTo({ times: 10 })),
          },
        ),
      ),
    ),
});
