// The Desk server's streams half (pending merge 6, 2.10.9; M6 2.11), split out of desk.fake.ts so that file
// holds only merged code. One server still owns all of it: the socket reads the same `{ epoch, seq }` log a
// client's own save appends to, and a fake cannot share truth with another server, so this file exports the
// pieces desk.fake.ts spreads into `Desk` (an endpoint, its pushes, four controls) and the client half that
// binds the real adapter to it.
//
// Written against merged/streams/proposal-v2.md revision 7.1, S1–S10. Every line here is a stream line.
import { Effect, Layer, Schema, Stream } from "effect";
import { Socket } from "effect/socket";
import { Fake } from "flow-state/testing"; // pending merge 6
import * as Server from "../app/desk-server.js";
import {
  DeskFrame,
  DeskSocket,
  closedWith,
  decodeFrame,
} from "../features/Tickets/feed/desk-socket.js";
import { Cursor, SocketDropped, type SignedOut } from "../features/Tickets/types.js";
import { withDesk, type Desk, type FakeTruth } from "./desk.fake.js";

// Frames are JSON text, as on the wire, so the real `decodeFrame` reads them.
const text = (frame: DeskFrame) => JSON.stringify(frame);

// A control's effect on open connections (one spelling in every fake): `{ to, send }` sends text frames and
// `{ to, close }` closes with a code. `to` names the endpoint and the request fields a connection must have.
const sockets = (items: ReadonlyArray<Server.LogItem>) =>
  items.map((item) => ({
    to: { socket: { workspaceId: item.workspaceId } },
    send: [text({ t: "change", event: item.event }), text({ t: "activity", entry: item.entry })],
  }));

// The tail of the log a step appended. A reset restarts at seq 1 and appends nothing.
const appended = (before: FakeTruth, after: FakeTruth) =>
  after.desk.epoch === before.desk.epoch
    ? after.desk.log.filter((item) => item.event.cursor.seq >= before.desk.nextSeq)
    : [];

// The tail of the log a step appended goes to the open sockets of its workspace, whichever call or control
// caused it, so a rename elsewhere and a client's own save push alike.
// design gap: `pushes` is not in 2.10.4 (gap 36). Declaring it once beats wiring each handler to the socket.
export const socketPushes = {
  socket: (before: FakeTruth, after: FakeTruth) => sockets(appended(before, after)),
};

export const socketEndpoints = {
  // The workspace socket. `open` is the registration: the greeting `hello` or `reset`, then the
  // replay, as the core computes them. Frames are JSON text, as on the wire, so the real
  // `decodeFrame` reads them. A frame after open comes from `pushes` or a control.
  socket: Fake.stream({
    request: { workspaceId: Schema.String, from: Schema.optional(Cursor) },
    open: (truth, req) => {
      const { replayedFrom, items } = Server.replay(truth.desk, req.workspaceId, req.from);
      const proven = truth.replay ? replayedFrom : undefined; // `Desk.greet({ replay: false })`
      const stale = req.from !== undefined && req.from.epoch !== truth.desk.epoch;

      const greeting: DeskFrame = stale
        ? { t: "reset", epoch: truth.desk.epoch }
        : proven
          ? { t: "hello", replayedFrom: proven }
          : { t: "hello" };

      const replay = items.flatMap((item): ReadonlyArray<DeskFrame> => [
        { t: "change", event: item.event },
        { t: "activity", entry: item.entry },
      ]);

      // [truth, first frames, accept] (2.10.9), the same shape in every fake.
      return [truth, [greeting, ...replay].map(text), { accept: true }];
    },
  }),
};

export const socketControls = {
  // What the next greetings say: with `replay: false` the server registers the workspace but proves no
  // replay, so a reconnect must `catchUp`. `open` reads it.
  greet: Fake.control({ replay: Schema.Boolean }, (truth, { replay }) => ({ ...truth, replay })),

  // The log: a restart in a new epoch, and retention that no longer reaches an old position.
  resetLog: Fake.control({}, (truth) => withDesk(truth, Server.resetLog(truth.desk))),
  retain: Fake.control({ last: Schema.Int }, (truth, { last }) =>
    withDesk(truth, Server.retain(truth.desk, last)),
  ),

  // The token expires: every open socket closes with 4401 (`closedWith` makes it `SignedOut`).
  // design gap: a control's close result is `{ to, close }` here (gap 37).
  expireToken: Fake.control({}, (truth) => [truth, { to: { socket: {} }, close: 4401 }]),
};

// pending merge 6: the socket, written as the real adapter does it (next/http-api.ts) but over
// `Socket.WebSocketConstructor`, and bound to the Desk server by `Fake.webSocket`. A Story replaces the
// transport, never the adapter (M6 2.11): the idle deadline, the NoHello check and the close-code reading
// below all run, on the TestClock, over the fake's frames.
// design gap: a stream endpoint's failure is `Fake/Closed { code }` or `Fake/Lost`; `Fake.webSocket` turns
// them into a close with that code and 1006 (2.10.4), so no client half reads those tags (gap 38).
const ORIGIN = "http://desk.test";

const classify = (error: Socket.SocketError): SocketDropped | SignedOut =>
  closedWith(error.reason._tag === "SocketCloseError" ? error.reason.code : 1006);

const socketText = (url: URL) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const socket = yield* Socket.makeWebSocket(url.toString(), { highWaterMark: 1_048_576 }); // M6 4.1
      const pull = yield* Socket.readerString(socket);

      return Stream.fromEffectRepeat(pull).pipe(Stream.flatMap(Stream.fromIterable));
    }),
  ).pipe(
    Stream.mapError((error) => classify(error)),
    // An idle deadline on every frame; the server pings every 20 s.
    Stream.timeoutOrElse({
      duration: "45 seconds",
      orElse: () => Stream.fail(new SocketDropped({ why: "Silent" })),
    }),
  );

const SocketOverWebSocket = Layer.effect(
  DeskSocket,
  Effect.map(Socket.WebSocketConstructor, (constructor) =>
    DeskSocket.of({
      frames: (workspaceId, from) => {
        const url = new URL(`/api/workspaces/${encodeURIComponent(workspaceId)}/socket`, ORIGIN);
        url.protocol = "ws:";

        if (from !== undefined) {
          url.searchParams.set("epoch", String(from.epoch));
          url.searchParams.set("seq", String(from.seq));
        }

        return socketText(url).pipe(
          Stream.mapEffect(decodeFrame),
          // Registration comes first: a server that only pings must not hold the row in "Connecting".
          Stream.zipWithIndex,
          Stream.mapEffect(([frame, index]) =>
            index === 0 && frame.t !== "hello" && frame.t !== "reset"
              ? Effect.fail(new SocketDropped({ why: "NoHello" }))
              : Effect.succeed(frame),
          ),
          Stream.provideService(Socket.WebSocketConstructor, constructor),
        );
      },
    }),
  ),
);

// `route` maps a socket URL to an endpoint and its input; Flow parses nothing else (2.10.4).
const route = (url: URL) => {
  const workspace = /^\/api\/workspaces\/([^/]+)\/socket$/.exec(url.pathname)?.[1];

  if (workspace === undefined) return undefined;

  const epoch = url.searchParams.get("epoch");
  const seq = url.searchParams.get("seq");

  return {
    endpoint: "socket",
    input:
      epoch === null || seq === null
        ? { workspaceId: decodeURIComponent(workspace) }
        : {
            workspaceId: decodeURIComponent(workspace),
            from: { epoch: Number(epoch), seq: Number(seq) },
          },
  };
};

// Every port the socket needs, over the run's server. Built per tab, holding no state (STF15).
export const socketClient = (desk: typeof Desk) =>
  SocketOverWebSocket.pipe(Layer.provide(Fake.webSocket(desk, route)));
