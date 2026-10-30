// The presence server for Stories: its own `Fake.server` with one `Fake.stream` endpoint, and the client
// half that provides `PresenceApi` from it. It shares no truth with `Desk`: who is viewing is a separate
// service from the ticket store. Demonstrates 2.10.4 (truth, endpoints, controls) and 2.10.9 (stream
// endpoints, the greeting, a close code).
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7.1, S1–S10.
import { Effect, Layer, Schema, Stream } from "effect";
import { Socket } from "effect/unstable/socket";
import { Fake } from "flow-state/testing"; // pending merge 6
import {
  Member,
  Members,
  PresenceApi,
  PresenceFrame,
  presenceClosedWith,
} from "../features/Presence/presence-api.js";
import { SocketDropped } from "../features/Tickets/types.js";

const where = { workspaceId: Schema.String, ticketId: Schema.String };

const at = (key: { workspaceId: string; ticketId: string }) => `${key.workspaceId}/${key.ticketId}`;

export const Presence = Fake.server("Presence", {
  // Members per ticket, as the server holds them.
  truth: { viewers: Schema.Record(Schema.String, Members) },
  initial: { viewers: {} },
  endpoints: {
    // A connection. Every join gets the full state first (Phoenix Presence), so a reconnect is right again
    // even when nobody joined or left. A refused open is the wire word `drop({ at: "open" })`.
    // design gap: `open` returns `[truth, frames, { accept: true } | { accept: false, code }]`, the same shape
    // in every fake (gap 31). Frames are JSON text, as on the wire.
    frames: Fake.stream({
      request: where,
      open: (truth, key) => [
        truth,
        [JSON.stringify({ t: "presence_state", members: truth.viewers[at(key)] ?? {} })],
        { accept: true },
      ],
    }),
  },
  controls: {
    // Someone opens the ticket: the truth changes and every open connection for it gets the diff.
    // design gap: a control returns `{ to, send }` (text frames) or `{ to, close }` (a code), where `to` names
    // the endpoint and the request fields a connection must have; the same in every fake (gap 32).
    join: Fake.control({ ...where, member: Member }, (truth, { member, ...key }) => [
      {
        viewers: {
          ...truth.viewers,
          [at(key)]: { ...(truth.viewers[at(key)] ?? {}), [member.id]: member },
        },
      },
      {
        to: { frames: key },
        send: [JSON.stringify({ t: "presence_diff", joins: { [member.id]: member }, leaves: {} })],
      },
    ]),
    leave: Fake.control({ ...where, memberId: Schema.String }, (truth, { memberId, ...key }) => {
      const { [memberId]: gone, ...rest } = truth.viewers[at(key)] ?? {};

      return [
        { viewers: { ...truth.viewers, [at(key)]: rest } },
        {
          to: { frames: key },
          send: [
            JSON.stringify({
              t: "presence_diff",
              joins: {},
              leaves: gone ? { [memberId]: gone } : {},
            }),
          ],
        },
      ];
    }),
    // The token expires: the server closes the connection with 4401, which the port maps to SignedOut.
    expireToken: Fake.control(where, (truth, key) => [truth, { to: { frames: key }, close: 4401 }]),
  },
});

// The client half is the app's own adapter over `Socket.WebSocketConstructor` (next/http-api.ts does the same
// with the global one), bound to the Presence server by `Fake.webSocket`. A Story replaces the transport, never
// the adapter (M6 2.11): the idle deadline, the BadFrame check and the close-code reading all run.
const ORIGIN = "http://desk.test";

const PresenceOverWebSocket = Layer.effect(
  PresenceApi,
  Effect.map(Socket.WebSocketConstructor, (constructor) =>
    PresenceApi.of({
      frames: (key) => {
        const url = new URL(
          `/api/workspaces/${encodeURIComponent(key.workspaceId)}/tickets/${encodeURIComponent(key.ticketId)}/presence`,
          ORIGIN,
        );
        url.protocol = "ws:";

        return Stream.unwrap(
          Effect.gen(function* () {
            const socket = yield* Socket.makeWebSocket(url.toString(), {
              highWaterMark: 1_048_576,
            });
            const pull = yield* Socket.readerString(socket);

            return Stream.fromEffectRepeat(pull).pipe(Stream.flatMap(Stream.fromIterable));
          }),
        ).pipe(
          Stream.mapError((error) =>
            presenceClosedWith(error.reason._tag === "SocketCloseError" ? error.reason.code : 1006),
          ),
          // An idle deadline on every frame; the server pings every 20 s.
          Stream.timeoutOrElse({
            duration: "45 seconds",
            orElse: () => Stream.fail(new SocketDropped({ why: "Silent" })),
          }),
          Stream.mapEffect((frame) =>
            Schema.decodeUnknownEffect(Schema.fromJsonString(PresenceFrame))(frame).pipe(
              Effect.mapError(() => new SocketDropped({ why: "BadFrame" })),
            ),
          ),
          Stream.provideService(Socket.WebSocketConstructor, constructor),
        );
      },
    }),
  ),
);

const PresenceWebSocket = Fake.webSocket(Presence, (url: URL) => {
  const match = /^\/api\/workspaces\/([^/]+)\/tickets\/([^/]+)\/presence$/.exec(url.pathname);

  if (match === null) return undefined;

  return {
    endpoint: "frames",
    input: { workspaceId: decodeURIComponent(match[1]!), ticketId: decodeURIComponent(match[2]!) },
  };
});

export const PresenceFake = PresenceOverWebSocket.pipe(Layer.provide(PresenceWebSocket));
