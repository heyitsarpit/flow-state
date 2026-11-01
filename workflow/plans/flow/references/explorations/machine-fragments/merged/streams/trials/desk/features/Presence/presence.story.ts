// TRIAL (stories-amended.md): Presence Stories, the watcher alone over the collaboration fake. Transcripts; presence.test.ts reads them.
import { Layer } from "effect";
import { Story, type Step } from "flow-state/testing";
import { Collab, CollabFake } from "../../testing/presence.fake.js";
import { PresenceChannel } from "./presence.channel.js";
import { Presence } from "./presence.definition.js";
import { PresenceMachine } from "./presence.machine.js";

const { E } = Presence;

export const T42 = { workspaceId: "north", ticketId: "T-42" };

const CHANNEL = "ticket:north:T-42";

export const ben = { id: "dispatcher-3", name: "Ben" };

const watching = (id: string, world: ReadonlyArray<Step> = []) =>
  Story.machine(PresenceMachine, {
    id,
    input: T42,
    fixtures: [PresenceChannel.layer.pipe(Layer.provide(CollabFake))],
    world,
  }); // RENAMED: Story.make -> Story.machine

// The attach greets with "attached" and the members; a join adds one, and its badge copy flashes.
export const joined = watching("presence/joined")
  .checkpoint("joined")
  .world(Collab.join({ channel: CHANNEL, member: ben }))
  .checkpoint("benJoined")
  .advance("2 seconds")
  .checkpoint("settled");

// The SDK's connection drops and comes back by itself: `Feed.down` dims the row, and the SDK's `resumed` flag is the proof.
export const sdkResumed = watching("presence/sdk-resumed")
  .world(Collab.suspend({ channel: CHANNEL }))
  .checkpoint("suspended")
  .world(Collab.resume({ channel: CHANNEL, resumed: true }))
  .checkpoint("sdkResumed");

// The SDK gives up on the channel: the session ends, and the watcher stops in ENDED with the SDK's reason.
export const sdkGaveUp = watching("presence/sdk-gave-up")
  .world(Collab.fail({ channel: CHANNEL, reason: "token revoked" }))
  .checkpoint("ended");

// Typing, both ways. A burst of 1,025 messages, one past the 1,024 bound (was 400 on 256): the SDK awaits each listener's promise,
// `emit`'s promise waits for room, so nothing overflows. And this tab's own keystrokes are pings under `allow`.
export const typing = watching("presence/typing")
  .world(Collab.typingBurst({ channel: CHANNEL, memberId: "dispatcher-2", count: 1_025 }))
  .checkpoint("typing")
  .world(Collab.publish.hold({ at: "response" }))
  .send(
    E.Typed({ memberId: "dispatcher-7", at: 1_000 }),
    E.Typed({ memberId: "dispatcher-7", at: 3_000 }),
  )
  .checkpoint("pinging")
  .world(Collab.publish.release())
  .checkpoint("pinged");

// The attach held: the row stays Connecting until the service answers the attach.
export const attachHeld = watching("presence/attach-held", [Collab.channel.hold({ at: "open" })])
  .checkpoint("attaching")
  .world(Collab.channel.release())
  .checkpoint("attached");
