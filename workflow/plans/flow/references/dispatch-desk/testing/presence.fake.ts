// The presence server for Stories: its own `Fake.server` with one `Fake.stream` endpoint, and the client
// half that provides `PresenceApi` from it. It shares no truth with `Desk`: who is viewing is a separate
// service from the ticket store. Demonstrates 2.10.4 (truth, endpoints, controls) and 2.10.9 (stream
// endpoints, the greeting, a close code).
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7, S1–S10.
import { Effect, Layer, Schema, Stream } from "effect";
import { Fake } from "flow-state/testing"; // pending merge 6
import { closedWith } from "../features/Tickets/feed/desk-socket.js";
import { Member, Members, PresenceApi } from "../features/Presence/presence-api.js";

const where = { workspaceId: Schema.String, ticketId: Schema.String };

const at = (key: { workspaceId: string; ticketId: string }) => `${key.workspaceId}/${key.ticketId}`;

export const Presence = Fake.server("Presence", {
  // Members per ticket, as the server holds them.
  truth: { viewers: Schema.Record(Schema.String, Members) },
  initial: { viewers: {} },
  endpoints: {
    // A connection. Every join gets the full state first (Phoenix Presence), so a reconnect is right again
    // even when nobody joined or left. A refused open is the wire word `drop({ at: "open" })`.
    // design gap: 2.10.9 says `open` returns the truth, the greeting frames and whether to accept; the
    // tuple below is this file's spelling of that.
    frames: Fake.stream({
      request: where,
      open: (truth, key) => [
        truth,
        { accept: true, frames: [{ t: "presence_state", members: truth.viewers[at(key)] ?? {} }] },
      ],
    }),
  },
  controls: {
    // Someone opens the ticket: the truth changes and every open connection for it gets the diff.
    // design gap: 2.10.9 says a control "returns frames to send on open connections, or a close with a
    // code"; `{ to, send }` and `{ to, close }` are this file's spelling.
    join: Fake.control({ ...where, member: Member }, (truth, { member, ...key }) => [
      {
        viewers: {
          ...truth.viewers,
          [at(key)]: { ...(truth.viewers[at(key)] ?? {}), [member.id]: member },
        },
      },
      {
        to: key,
        send: [{ t: "presence_diff", joins: { [member.id]: member }, leaves: {} }],
      },
    ]),
    leave: Fake.control({ ...where, memberId: Schema.String }, (truth, { memberId, ...key }) => {
      const { [memberId]: gone, ...rest } = truth.viewers[at(key)] ?? {};

      return [
        { viewers: { ...truth.viewers, [at(key)]: rest } },
        {
          to: key,
          send: [{ t: "presence_diff", joins: {}, leaves: gone ? { [memberId]: gone } : {} }],
        },
      ];
    }),
    // The token expires: the server closes the connection with 4401, which the port maps to SignedOut.
    expireToken: Fake.control(where, (truth, key) => [truth, { to: key, close: 4401 }]),
  },
});

// The client half: what the app's `PresenceApi` raises. A lost request or a close becomes the port's
// own failures through `closedWith`, the classification the real adapter uses (SR15).
// design gap: how a client half reads a stream endpoint (STR19 says "a client half over the same
// endpoint"); here the endpoint is a function from the request to a Stream of frames.
export const PresenceFake = Layer.effect(
  PresenceApi,
  Effect.map(Presence, (server) =>
    PresenceApi.of({
      frames: (key) =>
        server.frames(key).pipe(
          Stream.catchTag("Fake/Lost", () => Stream.fail(closedWith(1006))),
          Stream.catchTag("Fake/Closed", ({ code }) => Stream.fail(closedWith(code))),
        ),
    }),
  ),
);
