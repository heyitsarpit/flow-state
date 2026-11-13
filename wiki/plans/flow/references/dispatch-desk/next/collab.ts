// The production collaboration client: a hosted realtime SDK's client, adapted to the desk's `CollabClient` shape
// (features/Presence/collab-sdk.ts). Illustrative: `@collab/realtime` stands for whichever service is chosen (Ably,
// Liveblocks, Supabase Realtime); the mapping below is the part that matters, and it is the same for each.
//
// One client per tab, made at layer build: the SDK owns the connection, its reconnect and its backoff (recipe S).
// Channels are reference-counted by name, so a Flow session's release never detaches a channel another holds (S9).
import { Effect, Layer } from "effect";
import { Realtime } from "@collab/realtime"; // illustrative SDK
import { CollabClient, type CollabChannel } from "../features/Presence/collab-sdk.js";

export const CollabLive = (token: () => Promise<string>) =>
  Layer.effect(
    CollabClient,
    Effect.gen(function* () {
      const client = yield* Effect.acquireRelease(
        Effect.sync(() => new Realtime({ authCallback: token, recover: true })), // `recover`: resume in place
        (c) => Effect.sync(() => c.close()),
      );
      const refs = new Map<string, number>();

      const adapt = (name: string): CollabChannel => {
        const channel = client.channels.get(name);

        return {
          onStatus: (listener) => {
            const attached = (change: { resumed: boolean }) =>
              listener({ state: "attached", resumed: change.resumed });
            const suspended = (change: { reason?: { message: string } }) =>
              listener({ state: "suspended", reason: change.reason?.message ?? "disconnected" });
            const failed = (change: { reason?: { message: string } }) =>
              listener({ state: "failed", reason: change.reason?.message ?? "failed" });

            channel.on("attached", attached);
            channel.on("suspended", suspended);
            channel.on("failed", failed);

            return () => {
              channel.off("attached", attached);
              channel.off("suspended", suspended);
              channel.off("failed", failed);
            };
          },
          presence: {
            subscribe: (listener) => {
              const update = async () =>
                listener(
                  Object.fromEntries(
                    (await channel.presence.get()).map((m) => [m.clientId, m.data]),
                  ),
                );

              channel.presence.subscribe(update);
              void update();

              return () => channel.presence.unsubscribe(update);
            },
            enter: (member) => channel.presence.enter(member),
            leave: () => channel.presence.leave(),
          },
          subscribe: (event, listener) => {
            const message = (m: { data: Parameters<typeof listener>[0] }) => listener(m.data); // the SDK awaits it
            channel.subscribe(event, message);

            return () => channel.unsubscribe(event, message);
          },
          publish: (event, message) => channel.publish(event, message), // resolves on the service's ack
        };
      };

      return CollabClient.of({
        acquire: (name) => {
          refs.set(name, (refs.get(name) ?? 0) + 1);

          return adapt(name);
        },
        release: (name) => {
          const left = (refs.get(name) ?? 1) - 1;

          if (left > 0) return void refs.set(name, left);

          refs.delete(name);
          client.channels.get(name).detach();
        },
      });
    }),
  );
