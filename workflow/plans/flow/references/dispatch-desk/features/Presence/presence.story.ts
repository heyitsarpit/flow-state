// Presence Stories: the watcher alone over the collaboration fake, whose client half is the SDK's own shape.
// Transcripts; presence.test.ts reads them. Module checkpoints (COVERAGE.md section 6, "PR"): `joined`,
// `sdk-resumed`, `typing`. Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7.1, S1–S10.
import { Story } from "flow-state/testing";
import { Collab, CollabFake } from "../../testing/presence.fake.js";
import { Presence } from "./presence.definition.js";
import { PresenceMachine } from "./presence.machine.js";

const { E } = Presence;

export const T42 = { workspaceId: "north", ticketId: "T-42" };

const CHANNEL = "ticket:north:T-42";

export const ben = { id: "dispatcher-3", name: "Ben" };

const watching = (id: string, world: ReadonlyArray<unknown> = []) =>
  Story.make(PresenceMachine, { id, input: T42, fixtures: [CollabFake], world });

// The attach greets with "attached" and the members; a join adds one, and its badge copy flashes (F5).
export const joined = watching("presence/joined")
  .checkpoint("joined")
  .world(Collab.join({ channel: CHANNEL, member: ben }))
  .checkpoint("ben-joined")
  .advance("2 seconds")
  .checkpoint("settled");

// The SDK's connection drops and comes back by itself: `Feed.down` dims the row (no machine event, rule 25), and
// the SDK's `resumed` flag on the re-attach is the proof nothing was missed (T3). No re-open by the machine (T9).
export const sdkResumed = watching("presence/sdk-resumed")
  .world(Collab.suspend({ channel: CHANNEL }))
  .checkpoint("suspended")
  .world(Collab.resume({ channel: CHANNEL, resumed: true }))
  .checkpoint("sdk-resumed");

// The SDK gives up on the channel: the session ends, and the watcher stops in ENDED with the SDK's reason.
export const sdkGaveUp = watching("presence/sdk-gave-up")
  .world(Collab.fail({ channel: CHANNEL, reason: "token revoked" }))
  .checkpoint("ended");

// Typing, both ways. A burst of 400 messages on a 256 bound: the SDK awaits each listener's promise, `emit`'s
// promise waits for room, so nothing overflows (T7). And this tab's own keystrokes are pings through the SDK under
// `allow`: two at once, each answered on its own, nothing held (O9).
export const typing = watching("presence/typing")
  .world(Collab.typingBurst({ channel: CHANNEL, memberId: "dispatcher-2", count: 400 }))
  .checkpoint("typing")
  .world(Collab.publish.hold({ at: "response" }))
  .send(
    E.Typed({ memberId: "dispatcher-7", at: 1_000 }),
    E.Typed({ memberId: "dispatcher-7", at: 3_000 }),
  )
  .checkpoint("pinging")
  .world(Collab.publish.release())
  .checkpoint("pinged");

// The attach held (Y3): the row stays Connecting until the service answers the attach.
export const attachHeld = watching("presence/attach-held", [Collab.channel.hold({ at: "open" })])
  .checkpoint("attaching")
  .world(Collab.channel.release())
  .checkpoint("attached");
