// TRIAL (fakes-v2.md): the Desk server's socket half. `pushes` is gone (fakes-v2 "Not added"), so a handler that appends to the log
// now says `send: pushed(before, after)` itself; `renameElsewhere` shows it, and RESULTS counts the other call sites.
import { Effect, Layer, Schema, Stream } from "effect";
import { Socket } from "effect/socket";
import { Fake } from "flow-state/testing";
import * as Server from "@desk/app/desk-server.js";
import {
  DeskFrame,
  DeskSocket,
  closedWith,
  decodeFrame,
} from "@desk/features/Tickets/feed/desk-socket.js";
import { Cursor, SocketDropped, type SignedOut } from "@desk/features/Tickets/types.js";

// STAND-IN for `desk.fake.ts`'s `FakeTruth` and `withDesk`: importing that file would drag in the whole old Fake.
type FakeTruth = { readonly desk: Server.DeskTruth; readonly replay: boolean };

const withDesk = (truth: FakeTruth, desk: Server.DeskTruth): FakeTruth => ({ ...truth, desk });

// The workspace socket. `open` is the registration: the greeting `hello` or `reset`, then the replay, as the core computes them.
export const socket = Fake.stream({
  request: { workspaceId: Schema.String, from: Schema.optional(Cursor) },
  frame: Schema.fromJsonString(DeskFrame), // NEW: frame. Replaces the `text` helper; the real `decodeFrame` still reads the text
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

    return { frames: [greeting, ...replay] }; // NEW: an object, not [truth, frames, { accept: true }]
  },
});

// The tail of the log a step appended. A reset restarts at seq 1 and appends nothing.
const appended = (before: FakeTruth, after: FakeTruth) =>
  after.desk.epoch === before.desk.epoch
    ? after.desk.log.filter((item) => item.event.cursor.seq >= before.desk.nextSeq)
    : [];

// NEW: what `pushes` did, now called by each handler or control that appends to the log.
export const pushed = (before: FakeTruth, after: FakeTruth) =>
  appended(before, after).map((item) =>
    socket.frames(
      (c) => c.workspaceId === item.workspaceId,
      [
        { t: "change", event: item.event },
        { t: "activity", entry: item.entry },
      ],
    ),
  );

const ticketKey = { workspaceId: Schema.String, ticketId: Schema.String };

export const socketControls = {
  // What the next greetings say: with `replay: false` a reconnect must `catchUp`.
  greet: Fake.control({ replay: Schema.Boolean }, (truth: FakeTruth, { replay }) => ({
    truth: { ...truth, replay },
  })),
  resetLog: Fake.control({}, (truth: FakeTruth) => ({
    truth: withDesk(truth, Server.resetLog(truth.desk)),
  })),
  retain: Fake.control({ last: Schema.Int }, (truth: FakeTruth, { last }) => ({
    truth: withDesk(truth, Server.retain(truth.desk, last)),
  })),
  // The token expires: every open socket closes with 4401 (`closedWith` makes it `SignedOut`).
  expireToken: Fake.control({}, () => ({ send: [socket.close(() => true, 4401, "expired")] })), // NEW: socket.close. Was `{ to, close }`
};

// One of the controls that spread into `Desk` from desk.fake.ts; the other nine writers (saveTitle, assign, assignBatch, closeMany,
// postComment, createTicket, changeElsewhere, removeElsewhere, commentsElsewhere) take the same two lines.
export const renameElsewhere = Fake.control(
  { ...ticketKey, title: Schema.String, by: Schema.optionalKey(Schema.String) },
  (truth: FakeTruth, { title, by = "dispatcher-2", ...key }) => {
    const next = withDesk(truth, Server.changeElsewhere(truth.desk, key, { title }, by)[0]);

    return { truth: next, send: pushed(truth, next) };
  },
);

// STAND-IN for `Desk` in desk.fake.ts, which spreads the endpoint and the controls in with its other 31. `eventsSince`, `list` and
// `openCount` are copied in so the Stories below can name them.
export const Desk = Fake.server("Desk", {
  truth: { desk: Server.DeskTruth, replay: Schema.Boolean },
  initial: { desk: Server.seed(), replay: true },
  endpoints: {
    socket,
    eventsSince: Fake.call({
      request: { workspaceId: Schema.String, after: Cursor },
      handle: (truth: FakeTruth, req) => ({
        response: { status: 200, body: Server.eventsSince(truth.desk, req.workspaceId, req.after) },
      }),
    }),
    list: Fake.call({
      request: { workspaceId: Schema.String },
      handle: () => ({ response: { status: 200, body: [] } }),
    }),
    openCount: Fake.call({
      request: { workspaceId: Schema.String },
      handle: () => ({ response: { status: 200, body: 0 } }),
    }),
  },
  controls: { ...socketControls, renameElsewhere },
});

// The socket as the real adapter does it (next/http-api.ts) over `Socket.WebSocketConstructor`. A Story replaces the transport,
// never the adapter: the close-code reading below runs over the fake's frames.
const ORIGIN = "http://desk.test";

const classify = (error: Socket.SocketError): SocketDropped | SignedOut =>
  closedWith(error.reason._tag === "SocketCloseError" ? error.reason.code : 1006);

const socketText = (url: URL) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const open = yield* Socket.makeWebSocket(url.toString(), { highWaterMark: 1_048_576 });
      const pull = yield* Socket.readerString(open);

      return Stream.fromEffectRepeat(pull).pipe(Stream.flatMap(Stream.fromIterable));
    }),
  ).pipe(Stream.mapError((error) => classify(error)));
// CUT: Stream.timeoutOrElse(45 s): that is the contract's `idle`

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
          // CUT: the NoHello check. The first value registers, and a ping before it is `PingsWithoutLive` evidence
          Stream.provideService(Socket.WebSocketConstructor, constructor),
        );
      },
    }),
  ),
);

// Every port the socket needs, over the run's server. NEW: the route table replaces the 14-line `route` function.
export const socketClient = SocketOverWebSocket.pipe(
  Layer.provide(
    Fake.webSocket(Desk, {
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
