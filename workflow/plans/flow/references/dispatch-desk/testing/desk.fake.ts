// The Desk fake, in the shape of machine-design 2.10.4. This file is merged code only; the socket endpoint,
// its pushes, its controls and its client half are in desk.socket.fake.ts (pending merge 6). Two halves
// with two lifetimes:
//
//   `Desk`        the server: typed truth, a request log per endpoint, handlers, controls. One per run,
//                 shared by every tab and reload. It holds the dispatch desk's whole truth.
//   `DeskClient`  the client half: one Layer per tab that provides every port by calling the server's
//                 endpoints, and says what a lost request raises (`Fake/Lost` -> `NoResponse`).
//
// Every rule is app/desk-server.ts, the one implementation the demo Layers and the entity property
// test (desk.property.test.ts) also call. This file adds only what a fake adds: wire statuses, the
// outage and lock-budget truth, controls, and the socket endpoint. Stories drive it with wire
// words, never with injected results (2.10.5):
//
//   SlowSave           -> Desk.saveTitle.hold()           (then release())
//   LockedSave         -> Desk.lock({ ..., times: "always" })
//   UnavailableQueue   -> Desk.listOutage({ on: true })
//   RenamedElsewhere   -> Desk.renameElsewhere({ ... })   (pushes on the socket)
//   countingTicketApi  -> expect(Desk.list, [...])        (the endpoint's request log)
import { Fake } from "flow-state/testing";
import { Effect, Layer, Schema } from "effect";
import * as Server from "../app/desk-server.js";
import {
  AttachmentsApi,
  StoredAttachment,
  TooLarge,
} from "../features/Attachments/attachments-api.js";
import { CommentRejected, CommentRow, CommentsApi } from "../features/Comments/comments-api.js";
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
import { socketClient, socketControls, socketEndpoints, socketPushes } from "./desk.socket.fake.js";

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

// A lost request or answer, for a read or a write: every port declares `NoResponse`, which is what `fetch`
// rejecting becomes in the real adapter (REVIEW gap 34: a lost read is a network fact, never a `Defect`).
const lost = Effect.catchTag("Fake/Lost", () => Effect.fail(new NoResponse()));

// A read's 5xx is "nothing came back" too (the real adapter's `readBody`): the read's handler decides.
const readFailed = Effect.catchTag("ServerError", () => Effect.fail(new NoResponse()));

// --- truth -----------------------------------------------------------------------------------

// The server core's truth is an Effect Schema (`Server.DeskTruth`): tickets, applied keys, locks,
// comments, files and the { epoch, seq } log. `describe`, digests and generated controls read it.

// How many more refused saves a lock gives before it lifts itself; "always" until `unlock`.
const Budget = Schema.Union([Schema.Int, Schema.Literal("always")]);

export type FakeTruth = {
  desk: Server.DeskTruth;
  outage: boolean;
  replay: boolean; // whether a greeting proves a replay (`Desk.greet`)
  budget: Record<string, number | "always">;
};

export const withDesk = (truth: FakeTruth, desk: Server.DeskTruth): FakeTruth => ({
  ...truth,
  desk,
});

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

// --- the server ------------------------------------------------------------------------------

export const Desk = Fake.server("Desk", {
  truth: {
    desk: Server.DeskTruth,
    outage: Schema.Boolean,
    replay: Schema.Boolean,
    budget: Schema.Record(Schema.String, Budget),
  },
  initial: { desk: Server.seed(), outage: false, replay: true, budget: {} },

  pushes: socketPushes, // pending merge 6: desk.socket.fake.ts (gap 36)

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

    ...socketEndpoints, // pending merge 6: desk.socket.fake.ts
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

    ...socketControls, // pending merge 6: greet, resetLog, retain, expireToken (desk.socket.fake.ts)
  },
});

const SocketOverDesk = socketClient(Desk); // pending merge 6

// --- the client half -------------------------------------------------------------------------

// Each port is the adapter's job over the server's endpoints. `Fake/Lost` is what the wire raises
// for a lost request; what it means is said here, per port.

const TicketsOverDesk = Layer.effect(
  TicketApi,
  Effect.map(Desk, (server) =>
    TicketApi.of({
      load: (key) =>
        server.load(key).pipe(
          lost,
          Effect.flatMap((wire) =>
            fromWire(wire, TicketRow, { 404: (body) => new TicketNotFound(body) }),
          ),
          readFailed,
        ),
      list: (input) =>
        server.list(input).pipe(
          lost,
          Effect.flatMap((wire) =>
            fromWire(wire, TicketPage, { 503: (body) => new QueueUnavailable(body) }),
          ),
          readFailed,
        ),
      openCount: (input) =>
        server.openCount(input).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, Schema.Number, {})),
          readFailed,
        ),
      saveTitle: (input, { idempotencyKey }) =>
        server.saveTitle({ ...input, key: idempotencyKey }).pipe(
          lost,
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
          lost,
          Effect.flatMap((wire) =>
            fromWire(wire, TicketRow, {
              404: (body) => new TicketNotFound(body),
              409: (body) => new AlreadyAssigned(body),
            }),
          ),
        ),
      eventsSince: (input) =>
        server.eventsSince(input).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, ActivityPage, {})),
          readFailed,
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
          lost,
          Effect.flatMap((wire) =>
            fromWire(wire, Schema.Array(CommentRow), { 404: (body) => new TicketNotFound(body) }),
          ),
          readFailed,
        ),
      post: (input, { idempotencyKey }) =>
        server.postComment({ ...input, key: idempotencyKey }).pipe(
          lost,
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
          lost,
          Effect.flatMap((wire) =>
            fromWire(wire, StoredAttachment, { 413: (body) => new TooLarge(body) }),
          ),
        ),
    }),
  ),
);

// Every port the editor, queue, comments, upload and feed use, over the run's server. The assistant has its
// own server (assistant.fake.ts).
// A tab builds this again on reload; it holds no state (STF15). Presence has its own server
// (presence.fake.ts, PM6). `PendingFiles` is tab memory, so setup provides it, not the fake.
export const DeskClient = Layer.mergeAll(
  TicketsOverDesk,
  CommentsOverDesk,
  AttachmentsOverDesk,
  SocketOverDesk, // pending merge 6: desk.socket.fake.ts
);
