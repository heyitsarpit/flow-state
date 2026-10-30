// The Desk fake, in the shape of machine-design 2.10.4. Two halves with two lifetimes:
//
//   `Desk`        the server: typed truth, a request log per endpoint, handlers, controls. One per run,
//                 shared by every tab and reload. It holds the dispatch desk's whole truth.
//   `DeskClient`  the client half: one Layer per tab that provides every port by calling the server's
//                 endpoints, and says what a lost request raises (`Fake/Lost` -> `NoResponse`).
//
// Every rule is app/desk-server.ts, the one implementation the demo Layers and the entity property
// test (desk.property.test.ts) also call. This file adds only what a fake adds: wire statuses, the
// outage and lock-budget truth, controls, and the two stream endpoints. Stories drive it with wire
// words, never with injected results (2.10.5):
//
//   SlowSave           -> Desk.saveTitle.hold()           (then release())
//   LockedSave         -> Desk.lock({ ..., times: "always" })
//   UnavailableQueue   -> Desk.listOutage({ on: true })
//   RenamedElsewhere   -> Desk.renameElsewhere({ ... })   (pushes on the socket)
//   countingTicketApi  -> expect(Desk.list, [...])        (the endpoint's request log)
import { Fake } from "flow-state/testing";
import { Effect, Layer, Schema, Stream } from "effect";
import * as Server from "../app/desk-server.js";
import {
  AttachmentsApi,
  StoredAttachment,
  TooLarge,
} from "../features/Attachments/attachments-api.js";
import { AssistantApi, Refused, SuggestFrame } from "../features/Assistant/assistant-api.js";
import { CommentRejected, CommentRow, CommentsApi } from "../features/Comments/comments-api.js";
import {
  DeskFrame,
  DeskSocket,
  closedWith,
  decodeFrame,
} from "../features/Tickets/feed/desk-socket.js";
import { TicketApi } from "../features/Tickets/ticket-api.js";
import {
  ActivityPage,
  AlreadyAssigned,
  Cursor,
  NoResponse,
  QueueUnavailable,
  ServerError,
  TicketLocked,
  TicketNotFound,
  TicketPage,
  TicketRow,
  TicketStatus,
  TitleRejected,
} from "../features/Tickets/types.js";

// --- the wire --------------------------------------------------------------------------------

// What the server answers: a status and a body, as HTTP does. Nothing in Flow reads either; the
// client half below (the adapter's role) turns them into the port's success and tagged failures,
// and the commit classifies those (2.7.2).
const Wire = Schema.Struct({ status: Schema.Int, body: Schema.Unknown });

type Wire = typeof Wire.Type;

const STATUS = {
  TicketNotFound: 404,
  TicketLocked: 423,
  TitleRejected: 422,
  CommentRejected: 422,
  AlreadyAssigned: 409,
  TooLarge: 413,
} as const;

// A pure Result from the server core, as a response.
const toWire = <A, E extends { readonly _tag: keyof typeof STATUS }>(
  result: Server.Result<A, E>,
): Wire =>
  result.ok
    ? { status: 200, body: result.value }
    : { status: STATUS[result.error._tag], body: { ...result.error } };

// The client half's reading of a response: decode a 200's body with the port's Schema (a body it
// cannot decode is an adapter bug: a `Defect`, 2.10.5), rebuild a known 4xx as its tagged failure,
// and turn a 5xx into `ServerError` (the commit makes that `unknown`).
const fromWire = <A, E>(
  wire: Wire,
  ok: Schema.Decoder<A>,
  refused: Readonly<Record<number, (body: any) => E>>,
): Effect.Effect<A, E | ServerError> => {
  if (wire.status === 200) return Schema.decodeUnknownEffect(ok)(wire.body).pipe(Effect.orDie);

  const rebuild = refused[wire.status];

  if (rebuild) return Effect.fail(rebuild(wire.body));

  if (wire.status >= 500) return Effect.fail(new ServerError({ status: wire.status }));

  return Effect.die(new Error(`unexpected ${String(wire.status)}`));
};

// A lost request, for a write: the port declares `NoResponse`.
const lostWrite = Effect.catchTag("Fake/Lost", () => Effect.fail(new NoResponse()));

// A lost request, for a read: the B0 read ports declare no `NoResponse`, so the client half has
// nothing to raise but a defect, which the read reports as `Defect`. // design gap: B0 read ports
const lostRead = Effect.catchTag("Fake/Lost", (lost) => Effect.die(lost));

// --- truth -----------------------------------------------------------------------------------

// design gap: the server core's `DeskTruth` is plain data, declared here structurally. It already
// holds tickets, applied keys, locks, comments, files and the { epoch, seq } log.
const DeskTruthSchema = Schema.declare(
  (u: unknown): u is Server.DeskTruth =>
    typeof u === "object" && u !== null && "log" in u && "applied" in u,
);

// How many more refused saves a lock gives before it lifts itself; "always" until `unlock`.
const Budget = Schema.Union([Schema.Int, Schema.Literal("always")]);

type FakeTruth = {
  desk: Server.DeskTruth;
  outage: boolean;
  budget: Record<string, number | "always">;
};

const withDesk = (truth: FakeTruth, desk: Server.DeskTruth): FakeTruth => ({ ...truth, desk });

// A write through the core: the next truth and the response.
const step = <A, E extends { readonly _tag: keyof typeof STATUS }>(
  truth: FakeTruth,
  [desk, result]: Server.Step<A, E>,
): readonly [FakeTruth, Wire] => [withDesk(truth, desk), toWire(result)];

// A lock whose budget is spent has lifted: the core sees no lock. Otherwise a refusal spends one.
const effectiveLocks = (truth: FakeTruth, key: string): FakeTruth => {
  const left = truth.budget[key];

  return left === 0
    ? withDesk(
        truth,
        Server.unlock(truth.desk, {
          workspaceId: key.split("/")[0]!,
          ticketId: key.split("/")[1]!,
        }),
      )
    : truth;
};

const spendLock = (truth: FakeTruth, key: string, wire: Wire): FakeTruth => {
  const left = truth.budget[key];

  return wire.status === STATUS.TicketLocked && typeof left === "number"
    ? { ...truth, budget: { ...truth.budget, [key]: left - 1 } }
    : truth;
};

const ticketKey = { workspaceId: Schema.String, ticketId: Schema.String };

const edit = {
  title: Schema.optional(Schema.String),
  status: Schema.optional(TicketStatus),
  assignee: Schema.optional(Schema.String),
};

const sockets = (items: ReadonlyArray<Server.LogItem>) =>
  items.map((item) => ({
    to: (request: { workspaceId: string }) => request.workspaceId === item.workspaceId,
    frames: [
      { t: "change", event: item.event },
      { t: "activity", entry: item.entry },
    ] satisfies ReadonlyArray<DeskFrame>,
  }));

// The tail of the log a step appended. A reset restarts at seq 1 and appends nothing.
const appended = (before: FakeTruth, after: FakeTruth) =>
  after.desk.epoch === before.desk.epoch
    ? after.desk.log.filter((item) => item.event.cursor.seq >= before.desk.nextSeq)
    : [];

// --- the server ------------------------------------------------------------------------------

export const Desk = Fake.server("Desk", {
  truth: {
    desk: DeskTruthSchema,
    outage: Schema.Boolean,
    budget: Schema.Record(Schema.String, Budget),
  },
  initial: { desk: Server.seed(), outage: false, budget: {} },

  // design gap: `pushes` is not in 2.10.4. Every logged change goes to the open `socket`
  // connections of its workspace, whichever call or control caused it, so a rename elsewhere and a
  // client's own save push alike. Declaring it once beats wiring each handler to the socket.
  pushes: {
    socket: (before: FakeTruth, after: FakeTruth) => sockets(appended(before, after)),
  },

  endpoints: {
    // --- reads ---
    load: Fake.call({
      request: ticketKey,
      handle: (truth, req) => [truth, toWire(Server.loadTicket(truth.desk, req))],
    }),
    list: Fake.call({
      request: {
        workspaceId: Schema.String,
        status: Schema.optional(TicketStatus),
        assignee: Schema.optional(Schema.String),
        search: Schema.optional(Schema.String),
        page: Schema.optional(Schema.Int),
      },
      handle: (truth, req) =>
        truth.outage
          ? [truth, { status: 503, body: { retryAfter: 5 } }]
          : [truth, { status: 200, body: Server.listTickets(truth.desk, req) }],
    }),
    openCount: Fake.call({
      request: { workspaceId: Schema.String },
      handle: (truth, req) => [
        truth,
        { status: 200, body: Server.openCount(truth.desk, req.workspaceId) },
      ],
    }),
    eventsSince: Fake.call({
      request: { workspaceId: Schema.String, after: Cursor },
      handle: (truth, req) => [
        truth,
        { status: 200, body: Server.eventsSince(truth.desk, req.workspaceId, req.after) },
      ],
    }),
    comments: Fake.call({
      request: ticketKey,
      handle: (truth, req) => [truth, toWire(Server.listComments(truth.desk, req))],
    }),

    // --- writes: `key` is the idempotency key the client put on the wire (rule 19) ---
    saveTitle: Fake.call({
      request: { ...ticketKey, title: Schema.String, key: Schema.String },
      handle: (truth, req) => {
        const lock = Server.keyOf(req);
        const ready = effectiveLocks(truth, lock);
        const [next, wire] = step(ready, Server.saveTitle(ready.desk, req, req.key));

        return [spendLock(next, lock, wire), wire];
      },
    }),
    assign: Fake.call({
      request: { ...ticketKey, assignee: Schema.String, key: Schema.String },
      handle: (truth, req) => step(truth, Server.assign(truth.desk, req, req.key)),
    }),
    postComment: Fake.call({
      request: { ...ticketKey, clientId: Schema.String, text: Schema.String, key: Schema.String },
      handle: (truth, req) => step(truth, Server.postComment(truth.desk, req, req.key)),
    }),
    putFile: Fake.call({
      request: { ref: Schema.String, name: Schema.String, size: Schema.Int, key: Schema.String },
      handle: (truth, req) => step(truth, Server.putFile(truth.desk, req, req.key)),
    }),

    // --- streams (pending merge 6, 2.10.9) ---
    // The workspace socket. `open` is the registration: the greeting `hello` or `reset`, then the
    // replay, as the core computes them. Frames are JSON text, as on the wire, so the real
    // `decodeFrame` reads them. A frame after open comes from `pushes` or a control.
    socket: Fake.stream({
      request: { workspaceId: Schema.String, from: Schema.optional(Cursor) },
      open: (truth, req) => {
        const { replayedFrom, items } = Server.replay(truth.desk, req.workspaceId, req.from);
        const stale = req.from !== undefined && req.from.epoch !== truth.desk.epoch;

        const greeting: DeskFrame = stale
          ? { t: "reset", epoch: truth.desk.epoch }
          : replayedFrom
            ? { t: "hello", replayedFrom }
            : { t: "hello" };

        const replay = items.flatMap((item): ReadonlyArray<DeskFrame> => [
          { t: "change", event: item.event },
          { t: "activity", entry: item.entry },
        ]);

        return [
          truth,
          [greeting, ...replay].map((frame) => JSON.stringify(frame)),
          { accept: true },
        ];
      },
    }),

    // The assistant's NDJSON body: the tokens, then `done`. An unknown ticket is refused with 404
    // before any body. Pace comes from the Story (`hold`, `release`), not a sleep.
    suggest: Fake.stream({
      request: { ...ticketKey, prompt: Schema.String, key: Schema.String },
      open: (truth, req) => {
        const ticket = Server.find(truth.desk, req);

        if (!ticket) return [truth, [], { accept: false, code: 404 }];

        const tokens = Server.replyTokens(ticket);

        const frames: ReadonlyArray<SuggestFrame> = [
          ...tokens.map((text): SuggestFrame => ({ t: "token", text })),
          { t: "done", usage: { tokens: tokens.length } },
        ];

        return [truth, frames.map((frame) => `${JSON.stringify(frame)}\n`), { accept: true }];
      },
    }),
  },

  // Controls: the author's typed messages to the server. Their arguments are Schemas, so a property
  // test can generate them (STF16). `Desk.renameElsewhere(...)` changes a ticket through the same
  // core a client write uses; `pushes` then sends the logged event.
  controls: {
    lock: Fake.control(
      { ...ticketKey, by: Schema.String, times: Schema.optionalKey(Budget) },
      (truth, { by, times = "always", ...key }) => ({
        ...withDesk(truth, Server.lock(truth.desk, key, by)),
        budget: { ...truth.budget, [Server.keyOf(key)]: times },
      }),
    ),
    unlock: Fake.control(ticketKey, (truth, key) => {
      const { [Server.keyOf(key)]: _spent, ...budget } = truth.budget;

      return { ...withDesk(truth, Server.unlock(truth.desk, key)), budget };
    }),
    listOutage: Fake.control({ on: Schema.Boolean }, (truth, { on }) => ({ ...truth, outage: on })),

    renameElsewhere: Fake.control(
      { ...ticketKey, title: Schema.String, by: Schema.optionalKey(Schema.String) },
      (truth, { title, by = "dispatcher-2", ...key }) =>
        withDesk(truth, Server.changeElsewhere(truth.desk, key, { title }, by)[0]),
    ),
    changeElsewhere: Fake.control(
      { ...ticketKey, ...edit, by: Schema.optionalKey(Schema.String) },
      (truth, { by = "dispatcher-2", ...rest }) => {
        const { workspaceId, ticketId, ...change } = rest;

        return withDesk(
          truth,
          Server.changeElsewhere(truth.desk, { workspaceId, ticketId }, change, by)[0],
        );
      },
    ),
    removeElsewhere: Fake.control(
      { ...ticketKey, by: Schema.optionalKey(Schema.String) },
      (truth, { by = "dispatcher-2", ...key }) =>
        withDesk(truth, Server.removeElsewhere(truth.desk, key, by)[0]),
    ),

    // The log: a restart in a new epoch, and retention that no longer reaches an old position.
    resetLog: Fake.control({}, (truth) => withDesk(truth, Server.resetLog(truth.desk))),
    retain: Fake.control({ last: Schema.Int }, (truth, { last }) =>
      withDesk(truth, Server.retain(truth.desk, last)),
    ),

    // The token expires: every open socket closes with 4401 (`closedWith` makes it `SignedOut`).
    // design gap: `Fake.closeStreams(endpoint, code)` as a control's result is not spelled in 2.10.4.
    expireToken: Fake.control({}, (truth) => [truth, Fake.closeStreams("socket", 4401)]),
  },
});

// --- the client half -------------------------------------------------------------------------

// Each port is the adapter's job over the server's endpoints. `Fake/Lost` is what the wire raises
// for a lost request; what it means is said here, per port.

const TicketsOverDesk = Layer.effect(
  TicketApi,
  Effect.map(Desk, (server) =>
    TicketApi.of({
      load: (key) =>
        server.load(key).pipe(
          lostRead,
          Effect.flatMap((wire) =>
            fromWire(wire, TicketRow, { 404: (body) => new TicketNotFound(body) }),
          ),
          Effect.catchTag("ServerError", Effect.die),
        ),
      list: (input) =>
        server.list(input).pipe(
          lostRead,
          Effect.flatMap((wire) =>
            fromWire(wire, TicketPage, { 503: (body) => new QueueUnavailable(body) }),
          ),
          Effect.catchTag("ServerError", Effect.die),
        ),
      openCount: (input) =>
        server.openCount(input).pipe(
          lostRead,
          Effect.flatMap((wire) => fromWire(wire, Schema.Number, {})),
          Effect.orDie,
        ),
      saveTitle: (input, { idempotencyKey }) =>
        server.saveTitle({ ...input, key: idempotencyKey }).pipe(
          lostWrite,
          Effect.flatMap((wire) =>
            fromWire(wire, TicketRow, {
              404: (body) => new TicketNotFound(body),
              423: (body) => new TicketLocked(body),
              422: (body) => new TitleRejected(body),
            }),
          ),
        ),
      assign: (input, { idempotencyKey }) =>
        server.assign({ ...input, key: idempotencyKey }).pipe(
          lostWrite,
          Effect.flatMap((wire) =>
            fromWire(wire, TicketRow, {
              404: (body) => new TicketNotFound(body),
              409: (body) => new AlreadyAssigned(body),
            }),
          ),
        ),
      eventsSince: (input) =>
        server.eventsSince(input).pipe(
          Effect.catchTag("Fake/Lost", () => Effect.fail(new NoResponse())),
          Effect.flatMap((wire) => fromWire(wire, ActivityPage, {})),
          Effect.catchTag("ServerError", () => Effect.fail(new NoResponse())),
        ),
    }),
  ),
);

const CommentsOverDesk = Layer.effect(
  CommentsApi,
  Effect.map(Desk, (server) =>
    CommentsApi.of({
      list: (key) =>
        server.comments(key).pipe(
          lostRead,
          Effect.flatMap((wire) =>
            fromWire(wire, Schema.Array(CommentRow), { 404: (body) => new TicketNotFound(body) }),
          ),
          Effect.catchTag("ServerError", Effect.die),
        ),
      post: (input, { idempotencyKey }) =>
        server.postComment({ ...input, key: idempotencyKey }).pipe(
          lostWrite,
          Effect.flatMap((wire) =>
            fromWire(wire, CommentRow, {
              404: (body) => new TicketNotFound(body),
              422: (body) => new CommentRejected(body),
            }),
          ),
        ),
    }),
  ),
);

// The XHR reports its bytes handed to the network before the answer, so the client half does too:
// `sent` is an upper bound and a full bar still reads "Waiting for the server...".
const AttachmentsOverDesk = Layer.effect(
  AttachmentsApi,
  Effect.map(Desk, (server) =>
    AttachmentsApi.of({
      put: (ref, bytes, { idempotencyKey, onProgress }) =>
        Effect.sync(() => {
          onProgress({ sent: Math.round(bytes.size / 2), total: bytes.size });
          onProgress({ sent: bytes.size, total: bytes.size });
        }).pipe(
          Effect.andThen(
            server.putFile({
              ref,
              name: bytes instanceof File ? bytes.name : ref,
              size: bytes.size,
              key: idempotencyKey,
            }),
          ),
          lostWrite,
          Effect.flatMap((wire) =>
            fromWire(wire, StoredAttachment, { 413: (body) => new TooLarge(body) }),
          ),
        ),
    }),
  ),
);

// pending merge 6: the stream ports. The real adapter's decoding and close-code reading run over
// the fake's frames. design gap: a stream endpoint's failure is `Fake/Closed { code }` (a server or
// pushed close) or `Fake/Lost` (the network); 2.10.4 names the wire's effects, not the error tags.
const SocketOverDesk = Layer.effect(
  DeskSocket,
  Effect.map(Desk, (server) =>
    DeskSocket.of({
      frames: (workspaceId, from) =>
        server.socket(from === undefined ? { workspaceId } : { workspaceId, from }).pipe(
          Stream.mapError((error) =>
            error._tag === "Fake/Closed" ? closedWith(error.code) : closedWith(1006),
          ),
          Stream.mapEffect(decodeFrame),
        ),
    }),
  ),
);

const AssistantOverDesk = Layer.effect(
  AssistantApi,
  Effect.map(Desk, (server) =>
    AssistantApi.of({
      suggest: (input, { idempotencyKey }) =>
        server.suggest({ ...input, key: idempotencyKey }).pipe(
          Stream.mapError((error) =>
            error._tag === "Fake/Closed" && error.code >= 400 && error.code < 500
              ? new Refused({ status: error.code })
              : error._tag === "Fake/Closed"
                ? new ServerError({ status: error.code })
                : new NoResponse(),
          ),
          Stream.splitLines,
          Stream.mapEffect((line) =>
            Schema.decodeUnknownEffect(Schema.fromJsonString(SuggestFrame))(line).pipe(
              Effect.orDie,
            ),
          ),
        ),
    }),
  ),
);

// Every port the editor, queue, comments, upload, feed and assistant use, over the run's server.
// A tab builds this again on reload; it holds no state (STF15). Presence has its own server
// (presence.fake.ts, PM6). `PendingFiles` is tab memory, so setup provides it, not the fake.
export const DeskClient = Layer.mergeAll(
  TicketsOverDesk,
  CommentsOverDesk,
  AttachmentsOverDesk,
  SocketOverDesk,
  AssistantOverDesk,
);
