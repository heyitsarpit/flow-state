// presence and typing on a ticket, over a collaboration SDK. The SDK reconnects itself, so no stream here
// has `reconnect` or `idle` (section 8: "an SDK that reconnects a dropped connection itself omits `reconnect`, `idle`, and reports").
import { Effect, Schema, Stream } from "effect";
import { Outcome, stream, transaction } from "flow-state";
import { CollabClient, Members, PublishLost, ticketChannel, Typing } from "./collab-sdk.js";
import { PresenceChannel } from "./presence.channel.js";

// Who has the ticket open: the whole set, each time. Bare in the watcher: the members are the row.
export const ticketViewers = stream({
  id: "DispatchDesk/ticket-viewers",
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  output: Members,
  key: ["workspaceId", "ticketId"],
  delivers: "latest", // RENAMED value: "state" -> "latest"
  subscribe: (key) => Stream.unwrap(Effect.map(PresenceChannel, (channel) => channel.viewers(key))),
});

// Who is typing. The SDK awaits each listener's promise before the next message, and `emit` resolves once Flow's queue has room, so
// a burst never overflows: back-pressure reaches the SDK. Typing is ephemeral, so the watcher accepts every `missed`.
export const typingIn = stream({
  id: "DispatchDesk/typing-in",
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  output: Typing,
  key: ["workspaceId", "ticketId"],
  delivers: "every", // RENAMED value: "facts" -> "every"
  subscribe: (key) => Stream.unwrap(Effect.map(PresenceChannel, (channel) => channel.typing(key))),
});

// One technician online, by the same SDK contract placed per row (the roster's dots, `subscribe.each`).
export const technicianOnline = stream({
  id: "DispatchDesk/technician-online",
  input: { workspaceId: Schema.String, technicianId: Schema.String },
  output: Schema.Boolean,
  key: ["workspaceId", "technicianId"],
  delivers: "latest",
  subscribe: (key) =>
    Stream.unwrap(Effect.map(PresenceChannel, (channel) => channel.technician(key))),
});

// "I am typing": a publish through the SDK. UNCHANGED by v3 (7.3 and the spec's stance on writes).
export const typingPing = transaction({
  id: "DispatchDesk/typing-ping",
  input: {
    workspaceId: Schema.String,
    ticketId: Schema.String,
    memberId: Schema.String,
    at: Schema.Number,
  },
  key: ["workspaceId", "ticketId"],
  concurrency: "allow",
  commit: ({ memberId, at, ...key }, { attempt }) =>
    Effect.flatMap(CollabClient, (client) =>
      Effect.acquireUseRelease(
        Effect.sync(() => client.acquire(ticketChannel(key))),
        (channel) =>
          Effect.tryPromise({
            try: () => channel.publish("typing", { memberId, at, id: attempt.id }),
            catch: () => new PublishLost(),
          }),
        () => Effect.sync(() => client.release(ticketChannel(key))),
      ),
    ).pipe(Effect.catchTag("PublishLost", (e) => Outcome.unknown(e))),
});
