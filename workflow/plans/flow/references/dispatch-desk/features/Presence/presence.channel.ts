// the SDK adapter, as a service, as `ChatSocket` is. Three feeds on the collaboration SDK, each a
// `Feed.callback<A, E>` (the spec's one place for explicit generics: no closure can infer them). The SDK reconnects itself, so nothing
// here is retried by Flow and no stream has `reconnect` or `idleTime`.
import { Context, Effect, Layer, type Stream } from "effect";
import { Feed } from "flow-state";
import {
  CollabClient,
  type CollabChannel,
  CollabFailed,
  type Members,
  type Typing,
  technicianChannel,
  ticketChannel,
} from "./collab-sdk.js";

// What `emit` is to the status half: a signal in, a failure out. Any of the three emits fits it.
interface StatusSink {
  (signal: Feed.Signal<unknown>): Promise<void>;
  fail: (error: CollabFailed) => void;
}

// One channel per session, from the client service, released with the session (the channel is the service's, reference-counted).
// The SDK's statuses become Feed's three words; this session's listeners go with the finalizer. The data listener is the caller's.
const attach = (
  client: CollabClient["Service"],
  name: string,
  emit: StatusSink,
  listen: (channel: CollabChannel) => () => void,
) =>
  Effect.gen(function* () {
    const channel = yield* Effect.acquireRelease(
      Effect.sync(() => client.acquire(name)),
      () => Effect.sync(() => client.release(name)),
    );
    let first = true;

    const offStatus = channel.onStatus((status) => {
      if (status.state === "attached") {
        // The channel is the service's, cached across connections, so the first attach of a session proves nothing.
        void emit(
          status.resumed && !first ? Feed.live({ proof: "collab channel resumed" }) : Feed.live(),
        );
        first = false;
      }

      if (status.state === "suspended") void emit(Feed.down({ reason: status.reason }));
      if (status.state === "failed") emit.fail(new CollabFailed({ reason: status.reason }));
    });
    const offData = listen(channel);

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        offStatus();
        offData();
      }),
    );
  });

interface Key {
  readonly workspaceId: string;
  readonly ticketId: string;
}

export class PresenceChannel extends Context.Service<
  PresenceChannel,
  {
    readonly viewers: (key: Key) => Stream.Stream<Members | Feed.Signal, CollabFailed>;
    readonly typing: (key: Key) => Stream.Stream<Typing | Feed.Signal, CollabFailed>;
    readonly technician: (key: {
      readonly workspaceId: string;
      readonly technicianId: string;
    }) => Stream.Stream<boolean | Feed.Signal, CollabFailed>;
  }
>()("DispatchDesk/PresenceChannel") {
  static readonly layer = Layer.effect(
    PresenceChannel,
    Effect.map(CollabClient, (client) => ({
      viewers: (key: Key) =>
        Feed.callback<Members, CollabFailed>((emit) =>
          attach(client, ticketChannel(key), emit, (channel) =>
            channel.presence.subscribe((members) => void emit(members)),
          ),
        ),
      typing: (key: Key) =>
        Feed.callback<Typing, CollabFailed>((emit) =>
          attach(client, ticketChannel(key), emit, (channel) =>
            channel.subscribe("typing", (message) => emit(message)),
          ),
        ),
      technician: (key: { readonly workspaceId: string; readonly technicianId: string }) =>
        Feed.callback<boolean, CollabFailed>((emit) =>
          attach(client, technicianChannel(key), emit, (channel) =>
            channel.presence.subscribe((members) => void emit(key.technicianId in members)),
          ),
        ),
    })),
  );
}
