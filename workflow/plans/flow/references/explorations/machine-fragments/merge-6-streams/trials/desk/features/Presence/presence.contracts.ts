// TRIAL (proposal-v3.md): presence and typing on a ticket, over a collaboration SDK. The SDK reconnects itself, so no stream here
// has `reconnect` or `idle` (section 8: "an SDK that reconnects a dropped connection itself omits `reconnect`, `idle`, and reports").
import { Effect, Schema, Stream } from "effect";
import { Feed, Outcome, stream, transaction } from "flow-state";
import {
  CollabClient,
  type CollabChannel,
  CollabFailed,
  Members,
  PublishLost,
  technicianChannel,
  ticketChannel,
  Typing,
} from "@desk/features/Presence/collab-sdk.js";

// One channel per session, from the client service, released with the session (the channel is the service's, reference-counted).
const acquire = (name: string) =>
  Effect.flatMap(CollabClient, (client) =>
    Effect.acquireRelease(
      Effect.sync(() => client.acquire(name)),
      () => Effect.sync(() => client.release(name)),
    ),
  );

// What `emit` is to the status half of the adapter: a signal in, a failure out. `emit` of any of the three streams fits it.
interface StatusSink {
  (signal: Feed.Signal<never>): Promise<void>;
  fail: (error: CollabFailed) => void;
}

// The SDK's statuses become Feed's three words, and this session's listeners go with its finalizer. The data listener is the caller's.
const wire = (channel: CollabChannel, emit: StatusSink, offData: () => void) =>
  Effect.gen(function* () {
    let first = true;

    const offStatus = channel.onStatus((status) => {
      if (status.state === "attached") {
        // The channel is the service's, cached across connections, so the first attach of a session proves nothing.
        void emit(
          status.resumed && !first ? Feed.live({ proof: "collab channel resumed" }) : Feed.live(),
        );
        first = false;
      }

      if (status.state === "suspended") void emit(Feed.down({ reason: status.reason })); // RENAMED: no CollabDown class; any data is a reason
      if (status.state === "failed") emit.fail(new CollabFailed({ reason: status.reason }));
    });

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        offStatus();
        offData();
      }),
    );
  });

// Who has the ticket open: the whole set, each time. Bare in the watcher: the members are the row.
export const ticketViewers = stream({
  id: "DispatchDesk/ticket-viewers",
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  output: Members,
  key: ["workspaceId", "ticketId"],
  delivers: "latest", // RENAMED value: "state" -> "latest"
  errors: [CollabFailed], // NEW: errors
  subscribe: (key, { callback }) =>
    // NEW: callback in the context (was Feed.callback)
    Stream.unwrap(
      Effect.map(acquire(ticketChannel(key)), (channel) =>
        callback((emit) =>
          wire(
            channel,
            emit,
            channel.presence.subscribe((members) => void emit(members)),
          ),
        ),
      ),
    ),
});

// Who is typing. The SDK awaits each listener's promise before the next message, and `emit` returns a promise that resolves once
// Flow's queue has room, so a burst never overflows: back-pressure reaches the SDK. Typing is ephemeral, so the watcher accepts every `missed`.
export const typingIn = stream({
  id: "DispatchDesk/typing-in",
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  output: Typing,
  key: ["workspaceId", "ticketId"],
  delivers: "every", // RENAMED value: "facts" -> "every"
  errors: [CollabFailed],
  subscribe: (key, { callback }) =>
    Stream.unwrap(
      Effect.map(acquire(ticketChannel(key)), (channel) =>
        callback((emit) =>
          wire(
            channel,
            emit,
            channel.subscribe("typing", (message) => emit(message)),
          ),
        ),
      ),
    ),
});

// One technician online, by the same SDK contract placed per row (the roster's dots, `subscribe.each`).
export const technicianOnline = stream({
  id: "DispatchDesk/technician-online",
  input: { workspaceId: Schema.String, technicianId: Schema.String },
  output: Schema.Boolean,
  key: ["workspaceId", "technicianId"],
  delivers: "latest",
  errors: [CollabFailed],
  subscribe: (key, { callback }) =>
    Stream.unwrap(
      Effect.map(acquire(technicianChannel(key)), (channel) =>
        callback((emit) =>
          wire(
            channel,
            emit,
            channel.presence.subscribe((members) => void emit(key.technicianId in members)),
          ),
        ),
      ),
    ),
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
