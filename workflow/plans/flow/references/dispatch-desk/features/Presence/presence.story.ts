// Presence Stories: join, drop (the value goes, `last` dims), rejoin, a spent budget, an expired token.
// Each Story runs the watcher alone over the presence fake. Demonstrates 2.10.9 (stream controls: the
// wire words `drop` and `release`, `advance` with `{ next }`) and M6 2.6 (the row).
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7.1, S1–S10.
import { Story } from "flow-state/testing";
import { Presence as PresenceServer, PresenceFake } from "../../testing/presence.fake.js";
import { Presence } from "./presence.definition.js";
import { PresenceMachine } from "./presence.machine.js";

const { S, O } = Presence;

const T42 = { workspaceId: "north", ticketId: "T-42" };
const two = { id: "dispatcher-2", name: "dispatcher-2" };
const three = { id: "dispatcher-3", name: "dispatcher-3" };

const watching = (id: string) =>
  Story.make(PresenceMachine, { id, input: T42, fixtures: [PresenceFake] });

// The first `presence_state` is the first value; a diff then adds one member.
export const joined = watching("presence/joined")
  .expect({ operations: { viewers: { connection: "Live", value: {} } } })
  .world(PresenceServer.join({ ...T42, member: two }))
  .expect({ operations: { viewers: { value: { "dispatcher-2": two } } } });

// A drop: the value goes, `last` keeps the members, dimmed. The next connection's state confirms them.
export const dropped = watching("presence/dropped")
  .world(PresenceServer.join({ ...T42, member: two }))
  .world(PresenceServer.frames.drop()) // the connection closes as a network would (1006)
  .expect({
    operations: {
      viewers: {
        connection: "Connecting",
        value: undefined,
        last: { value: { "dispatcher-2": two } },
      },
    },
  })
  .expect({ state: S.WATCHING }) // no machine event: a transient drop is the adapter's
  .advance({ next: { operation: O.viewers, timer: "backoff" } })
  .expect({
    operations: { viewers: { connection: "Live", value: { "dispatcher-2": two } } },
  });

// Someone leaves while this tab is offline: the new state, not the old one, confirms. Nobody's diff is
// needed because the server sends the whole state on every join.
export const rejoinedChanged = watching("presence/rejoined-changed")
  .world(PresenceServer.join({ ...T42, member: two }))
  .world(PresenceServer.join({ ...T42, member: three }))
  .world(PresenceServer.frames.drop(), PresenceServer.frames.drop({ at: "open" })) // close it, then refuse the next attempt
  .world(PresenceServer.leave({ ...T42, memberId: "dispatcher-2" }))
  .advance({ next: { operation: O.viewers, timer: "backoff" } })
  .expect({
    operations: { viewers: { connection: "Live", value: { "dispatcher-3": three } } },
  });

// The connection closes, then ten refused opens spend the budget (`upTo({ times: 10 })`): the session ends,
// the machine waits in RETRY_WAIT with a doubled delay, and its `reopen` schedule watches again.
export const budgetSpent = Array.from({ length: 10 })
  .reduce<ReturnType<typeof watching>>(
    (story) => story.advance({ next: { operation: O.viewers, timer: "backoff" } }),
    watching("presence/budget-spent")
      .world(PresenceServer.frames.drop()) // close the open connection first: `drop({ at: "open" })` closes nothing
      .world(PresenceServer.frames.drop({ at: "open", times: 10 })),
  )
  .expect({ state: S.RETRY_WAIT, memory: { reopenInMs: 2_000 } })
  .advance({ next: { schedule: "reopen" } }) // type-checked against the machine's schedules (2.10.3)
  .expect({ state: S.WATCHING, operations: { viewers: { connection: "Live" } } });

// Close code 4401 is terminal: SignedOut ends the session, and the watcher stops.
export const expired = watching("presence/token-expired")
  .world(PresenceServer.expireToken(T42))
  .expect({ state: S.SIGNED_OUT });
