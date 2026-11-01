// Presence and typing on a ticket, over a collaboration SDK (collab-sdk.ts). Pending merge 6: written against
// merged/streams/proposal-v2.md revision 7.1, S1–S10. Every `stream`, `Feed` and `delivers` line is a stream line.
//
// How this module differs from the other desk transports (COVERAGE.md 5.1, "PR"): the only one that is a
// third-party SDK. The SDK keeps its own connection and reconnects by itself (recipe S, decided S5 Q3), so the
// adapter does not reconnect: it REPORTS. A suspended channel is `Feed.down`, a re-attached one `Feed.live`, with the
// SDK's `resumed` flag as the proof (T3). The machine has no RETRY_WAIT: the SDK's budget is the budget (T9), and a
// channel the SDK gave up on ends the session (`CollabFailed`). Compare the workspace socket (feed.contracts.ts),
// where `Feed.reconnect` owns the reconnect and the machine owns a re-open.
import { Effect, Schema, Stream } from "effect";
import { Feed, Outcome, stream, transaction } from "flow-state"; // pending merge 6: Feed, stream
import {
  CollabClient,
  CollabDown,
  CollabFailed,
  type CollabChannel,
  Members,
  PublishLost,
  technicianChannel,
  ticketChannel,
  Typing,
} from "./collab-sdk.js";

// One channel per session, from the client service, released with the session. Only this session's listeners are
// removed; the channel is the service's, reference-counted (S9).
// No `Feed.reconnect`: it would add a second retry over the SDK's (recipe S wraps only for terminal failures and
// `catchUp`, and this source has neither). A plain stream of values and signals is a valid session (M6 2.2).
const onChannel = <A>(
  name: string,
  attach: (channel: CollabChannel, emit: (value: A) => Promise<void>) => () => void,
) =>
  Stream.unwrap(
    Effect.map(
      Effect.flatMap(CollabClient, (client) =>
        Effect.acquireRelease(
          Effect.sync(() => client.acquire(name)),
          () => Effect.sync(() => client.release(name)),
        ),
      ),
      (channel) =>
        Feed.callback<A, CollabDown, CollabFailed>( // pending merge 6: NEW: Feed.callback
          (emit) =>
            Effect.gen(function* () {
              let first = true;

              const offStatus = channel.onStatus((status) => {
                if (status.state === "attached") {
                  // A resume after the first attach is the SDK's word that nothing was missed (T3). The channel is
                  // the service's, cached across connections, so the first attach of a session proves nothing (RV3 L7).
                  emit(
                    status.resumed && !first
                      ? Feed.live({ proof: "collab channel resumed" })
                      : Feed.live(),
                  );
                  first = false;
                }

                if (status.state === "suspended")
                  emit(Feed.down(new CollabDown({ reason: status.reason })));

                if (status.state === "failed")
                  emit.fail(new CollabFailed({ reason: status.reason }));
              });

              const offData = attach(channel, (value) => emit(value));

              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  offStatus();
                  offData();
                }),
              );
            }),
          { bufferSize: 256 },
        ),
    ),
  );

// Who has the ticket open: a STATE feed (the whole set, each time). Bare in the watcher: the members are the row.
export const ticketViewers = stream({
  // pending merge 6
  id: "DispatchDesk/ticket-viewers",
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  output: Members,
  key: ["workspaceId", "ticketId"],
  delivers: "state",
  subscribe: (key) =>
    onChannel<Members>(ticketChannel(key), (channel, emit) =>
      channel.presence.subscribe((members) => void emit(members)),
    ),
});

// Who is typing: a FACT feed. The SDK awaits each listener's promise before the next message, and `emit` returns a
// promise that resolves once Flow's queue has room (S7 Q20), so a burst never overflows the bound: back-pressure
// reaches the SDK (T7). Typing is ephemeral, so the watcher accepts every `missed` in one line.
export const typingIn = stream({
  // pending merge 6
  id: "DispatchDesk/typing-in",
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  output: Typing,
  key: ["workspaceId", "ticketId"],
  delivers: "facts",
  subscribe: (key) =>
    onChannel<Typing>(ticketChannel(key), (channel, emit) =>
      channel.subscribe("typing", (message) => emit(message)),
    ),
});

// One technician online, by the same SDK contract placed per row (the roster's dots, `subscribe.each`).
export const technicianOnline = stream({
  // pending merge 6
  id: "DispatchDesk/technician-online",
  input: { workspaceId: Schema.String, technicianId: Schema.String },
  output: Schema.Boolean,
  key: ["workspaceId", "technicianId"],
  delivers: "state",
  subscribe: (key) =>
    onChannel<boolean>(technicianChannel(key), (channel, emit) =>
      channel.presence.subscribe((members) => void emit(key.technicianId in members)),
    ),
});

// "I am typing": a publish through the SDK. `allow`: fire and forget, many at once, each answered in its own turn,
// nothing held. A publish the SDK queues while disconnected has not been delivered, so until the ack it is unknown
// (RV2 M5).
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
