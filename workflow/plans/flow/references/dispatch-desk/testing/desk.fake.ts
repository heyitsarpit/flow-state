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
  RemoveRefused,
  StoredAttachment,
  TooLarge,
} from "../features/Attachments/attachments-api.js";
import {
  CommentGone,
  CommentRejected,
  CommentRow,
  CommentsApi,
  EditWindowClosed,
  Reactions,
  ThreadPage,
} from "../features/Comments/comments-api.js";
import { assignResolver, TicketApi } from "../features/Tickets/ticket-api.js";
import {
  ActivityPage,
  AlreadyAssigned,
  ArchiveRefused,
  AssignResult,
  ClosePage,
  TicketRejected,
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
import { detailsClient, detailsControls, detailsEndpoints } from "./desk.details.fake.js";
import {
  techniciansClient,
  techniciansControls,
  techniciansEndpoints,
} from "./desk.technicians.fake.js";
import { visitClient, visitEndpoints } from "./desk.visit.fake.js";
import { rosterClient, rosterControls, rosterEndpoints } from "./desk.roster.fake.js";
import { CollabFake } from "./presence.fake.js";
import { socketClient, socketControls, socketEndpoints, socketPushes } from "./desk.socket.fake.js";

// --- the wire --------------------------------------------------------------------------------

// What the server answers: a status and a body, as HTTP does. Nothing in Flow reads either; the
// client half below (the adapter's role) turns them into the port's success and tagged failures,
// and the commit classifies those (2.7.2).
export const Wire = Schema.Struct({ status: Schema.Int, body: Schema.Unknown });

export type Wire = typeof Wire.Type;

const STATUS = {
  TicketNotFound: 404,
  TicketLocked: 423,
  TitleRejected: 422,
  TicketRejected: 422,
  ArchiveRefused: 403,
  CommentRejected: 422,
  CommentGone: 404,
  EditWindowClosed: 403,
  AlreadyAssigned: 409,
  TooLarge: 413,
  PartUnknown: 404,
  OutOfStock: 409,
  SignatureMissing: 422,
  BodyConflict: 412, // If-Match did not match: the body carries what is there now
  FieldRejected: 422,
  RemoveRefused: 403,
  // the roster's (desk.roster.fake.ts)
  TechnicianGone: 404,
  HasOpenTickets: 409,
  MergeConflict: 409,
  InviteRejected: 422,
} as const;

// A pure Result from the server core, as a response.
export const toWire = <A, E extends { readonly _tag: keyof typeof STATUS }>(
  result: Server.Result<A, E>,
): Wire =>
  result.ok
    ? { status: 200, body: result.value }
    : { status: STATUS[result.error._tag], body: { ...result.error } };

// The client half's reading of a response: decode a 200's body with the port's Schema (a body it
// cannot decode is an adapter bug: a `Defect`, 2.10.5), rebuild a known 4xx as its tagged failure,
// and turn a 5xx into `ServerError` (the commit makes that `unknown`).
export const fromWire = <A, E>(
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
export const lost = Effect.catchTag("Fake/Lost", () => Effect.fail(new NoResponse()));

// A read's 5xx is "nothing came back" too (the real adapter's `readBody`): the read's handler decides.
export const readFailed = Effect.catchTag("ServerError", () => Effect.fail(new NoResponse()));

// --- truth -----------------------------------------------------------------------------------

// The server core's truth is an Effect Schema (`Server.DeskTruth`): tickets, applied keys, locks,
// comments, files and the { epoch, seq } log. `describe`, digests and generated controls read it.

// How many more refused saves a lock gives before it lifts itself; "always" until `unlock`.
const Budget = Schema.Union([Schema.Int, Schema.Literal("always")]);

export type FakeTruth = {
  desk: Server.DeskTruth;
  pulseDown: boolean; // `Desk.pulseOutage`: every technician poll answers 503
  outage: boolean;
  replay: boolean; // whether a greeting proves a replay (`Desk.greet`)
  budget: Record<string, number | "always">;
};

export const withDesk = (truth: FakeTruth, desk: Server.DeskTruth): FakeTruth => ({
  ...truth,
  desk,
});

// A write through the core: the next truth and the response.
export const step = <A, E extends { readonly _tag: keyof typeof STATUS }>(
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

const commentKey = { ...ticketKey, commentId: Schema.String };

const edit = {
  title: Schema.optional(Schema.String),
  priority: Schema.optional(Schema.Int),
  customerId: Schema.optional(Schema.String),
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
    pulseDown: Schema.Boolean,
  },
  initial: { desk: Server.seed(), outage: false, replay: true, budget: {}, pulseDown: false },

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
      request: {
        ...ticketKey,
        pinned: Schema.optional(Schema.Boolean),
        before: Schema.optional(Schema.String),
      },
      handle: (truth, req) => [truth, toWire(Server.listThread(truth.desk, req))],
    }),
    mentions: Fake.call({
      request: { workspaceId: Schema.String, me: Schema.String },
      handle: (truth, req) => [truth, { status: 200, body: Server.listMentions(truth.desk, req) }],
    }),
    reactions: Fake.call({
      request: ticketKey,
      handle: (truth, req) => [truth, { status: 200, body: Server.reactionsOf(truth.desk, req) }],
    }),
    files: Fake.call({
      request: ticketKey,
      handle: (truth, req) => [truth, { status: 200, body: Server.listFiles(truth.desk, req) }],
    }),
    unassigned: Fake.call({
      request: { workspaceId: Schema.String, page: Schema.optional(Schema.Int) },
      handle: (truth, req) => [
        truth,
        { status: 200, body: Server.listUnassigned(truth.desk, req) },
      ],
    }),
    byCustomer: Fake.call({
      request: { workspaceId: Schema.String, customerId: Schema.String },
      handle: (truth, req) => [
        truth,
        { status: 200, body: Server.ticketsOfCustomer(truth.desk, req) },
      ],
    }),
    triage: Fake.call({
      request: { workspaceId: Schema.String, now: Schema.Number },
      handle: (truth, req) => [truth, { status: 200, body: Server.listTriage(truth.desk, req) }],
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
    // One request for many assignments; each item answered on its own (MD 2.7.11).
    assignBatch: Fake.call({
      request: {
        items: Schema.Array(
          Schema.Struct({
            input: Schema.Struct({ ...ticketKey, assignee: Schema.NullOr(Schema.String) }),
            idempotencyKey: Schema.String,
          }),
        ),
      },
      handle: (truth, req) => {
        const [desk, results] = Server.assignBatch(truth.desk, req.items);

        return [withDesk(truth, desk), { status: 200, body: results }];
      },
    }),
    closeMany: Fake.call({
      request: {
        workspaceId: Schema.String,
        tickets: Schema.Array(Schema.Struct(ticketKey)),
        key: Schema.String,
      },
      handle: (truth, req) => step(truth, Server.closeMany(truth.desk, req, req.key)),
    }),
    postComment: Fake.call({
      request: { ...ticketKey, clientId: Schema.String, text: Schema.String, key: Schema.String },
      handle: (truth, req) => step(truth, Server.postComment(truth.desk, req, req.key)),
    }),
    editComment: Fake.call({
      request: { ...commentKey, text: Schema.String, key: Schema.String },
      handle: (truth, req) => step(truth, Server.editComment(truth.desk, req, req.key)),
    }),
    removeComment: Fake.call({
      request: { ...commentKey, key: Schema.String },
      handle: (truth, req) => step(truth, Server.removeComment(truth.desk, req, req.key)),
    }),
    pinComment: Fake.call({
      request: { ...commentKey, pinned: Schema.Boolean, key: Schema.String },
      handle: (truth, req) => step(truth, Server.pinComment(truth.desk, req, req.key)),
    }),
    markRead: Fake.call({
      request: {
        workspaceId: Schema.String,
        comments: Schema.Array(Schema.Struct(commentKey)),
        at: Schema.Number,
        key: Schema.String,
      },
      handle: (truth, req) => step(truth, Server.markRead(truth.desk, req, req.key)),
    }),
    react: Fake.call({
      request: { ...commentKey, emoji: Schema.String, on: Schema.Boolean, key: Schema.String },
      handle: (truth, req) => step(truth, Server.react(truth.desk, req, req.key)),
    }),
    putFile: Fake.call({
      request: {
        ...ticketKey,
        ref: Schema.String,
        name: Schema.String,
        size: Schema.Int,
        key: Schema.String,
      },
      handle: (truth, req) => step(truth, Server.putFile(truth.desk, req, req.key)),
    }),
    removeFile: Fake.call({
      request: { ...ticketKey, ref: Schema.String, key: Schema.String },
      handle: (truth, req) => step(truth, Server.removeFile(truth.desk, req, req.key)),
    }),
    createTicket: Fake.call({
      request: {
        workspaceId: Schema.String,
        draftId: Schema.String,
        title: Schema.String,
        priority: Schema.Int,
        dueAt: Schema.NullOr(Schema.Number),
        key: Schema.String,
      },
      handle: (truth, req) => step(truth, Server.createTicket(truth.desk, req, req.key)),
    }),
    archiveTicket: Fake.call({
      request: { ...ticketKey, key: Schema.String },
      handle: (truth, req) => step(truth, Server.archiveTicket(truth.desk, req, req.key)),
    }),

    ...rosterEndpoints, // desk.roster.fake.ts: the roster's endpoints, reached through `Fake.fetch`
    ...detailsEndpoints, // desk.details.fake.ts: fields, body and history, reached through `Fake.fetch`
    ...techniciansEndpoints, // desk.technicians.fake.ts: pulses, breaks, nudges, dispatch, through `Fake.fetch`
    ...visitEndpoints, // desk.visit.fake.ts: find, parts, signatures, resolutions, through `Fake.fetch`

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

    // A comment past its author's fifteen-minute window: edits and deletes are refused (403) from now on.
    ageComment: Fake.control({ commentId: Schema.String }, (truth, { commentId }) =>
      withDesk(truth, { ...truth.desk, closedForEdit: [...truth.desk.closedForEdit, commentId] }),
    ),
    // Someone else writes `count` comments on a ticket, through the same rule a client post uses.
    commentsElsewhere: Fake.control(
      { ...ticketKey, count: Schema.Int },
      (truth, { count, ...key }) =>
        withDesk(
          truth,
          Array.from({ length: count }).reduce<Server.DeskTruth>(
            (desk, _, n) =>
              Server.postComment(
                desk,
                { ...key, clientId: `other-${n}`, text: `Note ${n + 1}` },
                `other-${n}`,
              )[0],
            truth.desk,
          ),
        ),
    ),

    ...rosterControls, // desk.roster.fake.ts
    ...detailsControls, // desk.details.fake.ts
    ...techniciansControls, // desk.technicians.fake.ts

    ...socketControls, // pending merge 6: greet, resetLog, retain, expireToken (desk.socket.fake.ts)
  },
});

const SocketOverDesk = socketClient(Desk); // pending merge 6

// --- the client half -------------------------------------------------------------------------

// Each port is the adapter's job over the server's endpoints. `Fake/Lost` is what the wire raises
// for a lost request; what it means is said here, per port.

const TicketsOverDesk = Layer.effect(
  TicketApi,
  Effect.map(Desk, (server) => {
    const assignBatched = assignResolver(
      (items) =>
        server.assignBatch({ items }).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, Schema.Array(AssignResult), {})),
        ),
      {
        gone: (ticketId) => new TicketNotFound({ ticketId }),
        held: (assignee) => new AlreadyAssigned({ assignee }),
      },
    );

    return TicketApi.of({
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
      unassigned: (input) =>
        server.unassigned(input).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, TicketPage, {})),
          readFailed,
        ),
      triage: (input) =>
        server.triage(input).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, TicketPage, {})),
          readFailed,
        ),
      // The client half batches as the real adapter does: the same `assignResolver` (ticket-api.ts) over this
      // server's batch endpoint, so a Story sees one request with several Attempts in its `via` (2.10.4).
      setAssignee: (input, { idempotencyKey }) => assignBatched(input, idempotencyKey),
      closeMany: (input, { idempotencyKey }) =>
        server.closeMany({ ...input, key: idempotencyKey }).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, ClosePage, {})),
        ),
      byCustomer: (input) =>
        server.byCustomer(input).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, Schema.Array(TicketRow), {})),
          readFailed,
        ),
      create: (input, { idempotencyKey }) =>
        server.createTicket({ ...input, key: idempotencyKey }).pipe(
          lost,
          Effect.flatMap((wire) =>
            fromWire(wire, TicketRow, { 422: (body) => new TicketRejected(body) }),
          ),
        ),
      archive: (input, { idempotencyKey }) =>
        server.archiveTicket({ ...input, key: idempotencyKey }).pipe(
          lost,
          Effect.flatMap((wire) =>
            fromWire(wire, Schema.Void, {
              404: (body) => new TicketNotFound(body),
              403: (body) => new ArchiveRefused(body),
            }),
          ),
        ),
    });
  }),
);

const CommentsOverDesk = Layer.effect(
  CommentsApi,
  Effect.map(Desk, (server) => {
    const comment = {
      404: (body: any) => new CommentGone(body),
      403: (body: any) => new EditWindowClosed(body),
    };

    return CommentsApi.of({
      list: (input) =>
        server.comments(input).pipe(
          lost,
          Effect.flatMap((wire) =>
            fromWire(wire, ThreadPage, { 404: (body) => new TicketNotFound(body) }),
          ),
          readFailed,
        ),
      mentions: (input) =>
        server.mentions(input).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, Schema.Array(CommentRow), {})),
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
      edit: (input, { idempotencyKey }) =>
        server.editComment({ ...input, key: idempotencyKey }).pipe(
          lost,
          Effect.flatMap((wire) =>
            fromWire(wire, CommentRow, { ...comment, 422: (body) => new CommentRejected(body) }),
          ),
        ),
      remove: (input, { idempotencyKey }) =>
        server.removeComment({ ...input, key: idempotencyKey }).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, Schema.Void, comment)),
        ),
      pin: (input, { idempotencyKey }) =>
        server.pinComment({ ...input, key: idempotencyKey }).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, CommentRow, { 404: comment[404] })),
        ),
      markRead: (input, { idempotencyKey }) =>
        server.markRead({ ...input, key: idempotencyKey }).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, Schema.Void, {})),
        ),
      reactions: (input) =>
        server.reactions(input).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, Reactions, {})),
          readFailed,
        ),
      react: (input, { idempotencyKey }) =>
        server.react({ ...input, key: idempotencyKey }).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, Reactions, { 404: comment[404] })),
        ),
    });
  }),
);

// The XHR reports its bytes handed to the network before the answer, so the client half does too:
// `sent` is an upper bound and a full bar still reads "Waiting for the server...".
const AttachmentsOverDesk = Layer.effect(
  AttachmentsApi,
  Effect.map(Desk, (server) =>
    AttachmentsApi.of({
      files: (key) =>
        server.files(key).pipe(
          lost,
          Effect.flatMap((wire) => fromWire(wire, Schema.Array(StoredAttachment), {})),
          readFailed,
        ),
      remove: (input, { idempotencyKey }) =>
        server.removeFile({ ...input, key: idempotencyKey }).pipe(
          lost,
          Effect.flatMap((wire) =>
            fromWire(wire, Schema.Void, { 403: (body) => new RemoveRefused(body) }),
          ),
        ),
      put: (ticket, ref, bytes, { idempotencyKey, onProgress }) =>
        Effect.sync(() => {
          onProgress({ sent: Math.round(bytes.size / 2), total: bytes.size });
          onProgress({ sent: bytes.size, total: bytes.size });
        }).pipe(
          Effect.andThen(
            server.putFile({
              ...ticket,
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
  rosterClient(Desk), // desk.roster.fake.ts: the real `RosterHttp` adapter over `Fake.fetch`
  detailsClient(Desk), // desk.details.fake.ts: the real `DetailsHttp` adapter over `Fake.fetch`
  techniciansClient(Desk), // desk.technicians.fake.ts: the real `TechniciansHttp` adapter over `Fake.fetch`
  visitClient(Desk), // desk.visit.fake.ts: the real `FindHttp` and `ResolveHttp` adapters over `Fake.fetch`
  // The collaboration SDK is its own service with its own server (presence.fake.ts): who is on a channel is not desk
  // truth. It is in the desk's fixture because the queue and the roster place its sessions.
  CollabFake, // pending merge 6
  SocketOverDesk, // pending merge 6: desk.socket.fake.ts
);
