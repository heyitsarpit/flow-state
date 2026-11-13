// The Desk server's socket half, split out of desk.fake.ts. One server owns all of it: the socket reads the same `{ epoch, seq }`
// log a client's own save appends to, and a fake cannot share truth with another server (MD 2.10.4). So this file exports the
// pieces desk.fake.ts spreads into `Desk` (the endpoint, four controls and `pushed`) and the client half that binds the real
// adapter to it.
//
// A handler that appends to the log says so: it returns `{ ...pushed(truth, next), response }` (a call) or `pushed(truth, next)`
// (a control), and the open sockets of that workspace get the new events. There is no server-wide hook, so a writer that
// forgets `pushed` changes truth and sends nothing. desk.fake.ts lists the writers.
import { Effect, Layer, Schema, Stream } from "effect";
import { Socket } from "effect/socket";
import { Fake } from "flow-state/testing";
import * as Server from "../app/desk-server.js";
import {
  DeskFrame,
  DeskSocket,
  closedWith,
  decodeFrame,
} from "../features/Tickets/feed/desk-socket.js";
import { Cursor, SocketDropped, type SignedOut } from "../features/Tickets/types.js";
import { type Desk, type FakeTruth, withDesk } from "./desk.fake.js";

// The workspace socket. `open` is the registration: the greeting `hello` or `reset`, then the replay, as the core computes them.
// Frames are JSON text, as on the wire, so the real `decodeFrame` reads them.
export const socket = Fake.stream({
  request: { workspaceId: Schema.String, from: Schema.optional(Cursor) },
  frame: Schema.fromJsonString(DeskFrame),
  open: (truth: FakeTruth, req) => {
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

    return { frames: [greeting, ...replay] };
  },
  // The server pings every 20 s and the contract's `idleTime` is 45 s: without it every Story's clock trips `Silent`.
  ping: { every: "20 seconds", frame: { t: "ping" } },
});

// The tail of the log a step appended. A reset restarts at seq 1 and appends nothing.
const appended = (before: FakeTruth, after: FakeTruth) =>
  after.desk.epoch === before.desk.epoch
    ? after.desk.log.filter((item) => item.event.cursor.seq >= before.desk.nextSeq)
    : [];

// The result a handler returns when its step appended to the log: the next truth, and the new events sent to the open sockets of
// their workspace, whichever call or control caused them, so a rename elsewhere and a client's own save push alike. A call adds
// `response`: `{ ...pushed(truth, next), response }`.
export const pushed = (before: FakeTruth, after: FakeTruth) => ({
  truth: after,
  send: appended(before, after).map((item) =>
    socket.frames(
      (connection) => connection.workspaceId === item.workspaceId,
      [
        { t: "change", event: item.event },
        { t: "activity", entry: item.entry },
      ],
    ),
  ),
});

const ticketKey = { workspaceId: Schema.String, ticketId: Schema.String };

export const socketControls = {
  // What the next greetings say: with `replay: false` the server registers the workspace but proves no replay, so a reconnect
  // must `catchUp`. `open` reads it.
  greet: Fake.control({ replay: Schema.Boolean }, (truth: FakeTruth, { replay }) => ({
    truth: { ...truth, replay },
  })),

  // The log: a restart in a new epoch, and retention that no longer reaches an old position.
  resetLog: Fake.control({}, (truth: FakeTruth) => ({
    truth: withDesk(truth, Server.resetLog(truth.desk)),
  })),
  retain: Fake.control({ last: Schema.Int }, (truth: FakeTruth, { last }) => ({
    truth: withDesk(truth, Server.retain(truth.desk, last)),
  })),

  // The token expires: every open socket closes with 4401 (`closedWith` makes it `SignedOut`).
  expireToken: Fake.control({}, () => ({ send: [socket.close(() => true, 4401, "expired")] })),

  // Someone else renames a ticket, through the same core a client write uses; the logged event is pushed on the socket.
  renameElsewhere: Fake.control(
    { ...ticketKey, title: Schema.String, by: Schema.optionalKey(Schema.String) },
    (truth: FakeTruth, { title, by = "dispatcher-2", ...key }) => {
      const next = withDesk(truth, Server.changeElsewhere(truth.desk, key, { title }, by)[0]);

      return pushed(truth, next);
    },
  ),
};

// The socket, written as the real adapter does it (next/http-api.ts) over `Socket.WebSocketConstructor`, and bound to the Desk
// server by `Fake.webSocket`. A Story replaces the transport, never the adapter (MD 2.10.4): the close-code reading below runs
// over the fake's frames. A stream endpoint's failure is `FakeClosed { code }` or `FakeLost`, which `Fake.webSocket` turns into
// a close with that code and 1006, so no client half reads those tags.
const ORIGIN = "http://desk.test";

const classify = (error: Socket.SocketError): SocketDropped | SignedOut =>
  closedWith(error.reason._tag === "SocketCloseError" ? error.reason.code : 1006);

// No idle deadline here: that is the contract's `idleTime`, which the Feed machine applies, not the adapter.
const socketText = (url: URL) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const open = yield* Socket.makeWebSocket(url.toString(), { highWaterMark: 1_048_576 });
      const pull = yield* Socket.readerString(open);

      return Stream.fromEffectRepeat(pull).pipe(Stream.flatMap(Stream.fromIterable));
    }),
  ).pipe(Stream.mapError((error) => classify(error)));

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

        // No NoHello check either: the first value registers, and a ping before it is `PingsWithoutLive` evidence.
        return socketText(url).pipe(
          Stream.mapEffect(decodeFrame),
          Stream.provideService(Socket.WebSocketConstructor, constructor),
        );
      },
    }),
  ),
);

// Every port the socket needs, over the run's server. Built per tab, holding no state. `desk` is a parameter because `Desk`
// (desk.fake.ts) spreads this file's endpoint and controls, so the import here is type-only.
export const socketClient = (desk: typeof Desk) =>
  SocketOverWebSocket.pipe(
    Layer.provide(
      Fake.webSocket(desk, {
        "GET /api/workspaces/:workspaceId/socket": {
          endpoint: "socket",
          input: ({ params, query }) => ({
            workspaceId: params.workspaceId,
            ...(query["epoch"] !== undefined && query["seq"] !== undefined
              ? { from: { epoch: Number(query["epoch"]), seq: Number(query["seq"]) } }
              : {}),
          }),
        },
      }),
    ),
  );
