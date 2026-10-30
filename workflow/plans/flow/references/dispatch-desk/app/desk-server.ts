// The server's rules as pure functions over plain truth: filter, declared order, paging, idempotency,
// locks and the event log. There is one implementation. The demo Layers (demo-api.ts) and the Story
// fake (testing/desk.fake.ts) both call it, so "filters and orders exactly as the real server does"
// is true by construction, and it is the oracle of the entity property test (desk.property.test.ts).
// The domain's declarations are checked against it, never the other way round.
//
// Nothing here is Effect: a function takes truth and a request and returns the next truth and a
// reply. Latency, holds, drops and pushes are the callers' concerns.
import { Schema } from "effect";
import {
  CommentRejected,
  CommentRow,
  type CommentThread,
} from "../features/Comments/comments-api.js";
import { StoredAttachment, TooLarge } from "../features/Attachments/attachments-api.js";
import { Members, type Member } from "../features/Presence/presence-api.js";
import {
  ActivityEntry,
  AlreadyAssigned,
  TicketEvent,
  TicketLocked,
  TicketNotFound,
  TicketRow,
  TitleRejected,
  type ActivityPage,
  type Cursor,
  type TicketKey,
  type TicketListInput,
  type TicketPage,
} from "../features/Tickets/types.js";

export const PAGE_SIZE = 20;

export const ACTIVITY_PAGE_SIZE = 25;

export const MAX_FILE_BYTES = 5_000_000;

// The signed-in dispatcher: the author of comments and the actor of the client's own writes.
export const ME = "dispatcher-1";

export type Result<A, E> = { ok: true; value: A } | { ok: false; error: E };

// A write returns the next truth and its reply. A refused write returns the truth unchanged.
export type Step<A, E> = readonly [DeskTruth, Result<A, E>];

// One logged change and the activity line derived from it. They share a cursor, so the socket's
// `change` and `activity` frames for one event carry the same position.
export const LogItem = Schema.Struct({
  workspaceId: Schema.String,
  event: TicketEvent,
  entry: ActivityEntry,
});

export type LogItem = typeof LogItem.Type;

// The server's whole truth as an Effect Schema, so a fake can declare it as its `truth`: `describe`,
// digests and generated controls read it (2.10.4, 2.10.16).
export const DeskTruth = Schema.Struct({
  clock: Schema.Int,
  tickets: Schema.Array(TicketRow),
  locks: Schema.Record(Schema.String, Schema.String), // "workspace/ticket" → who holds it
  // First reply per idempotency key. Only successes are kept: a refused write may be tried again.
  applied: Schema.Struct({
    tickets: Schema.Record(Schema.String, TicketRow),
    comments: Schema.Record(Schema.String, CommentRow),
    files: Schema.Record(Schema.String, StoredAttachment),
  }),
  comments: Schema.Array(CommentRow),
  files: Schema.Record(Schema.String, StoredAttachment),
  // One log for the server, filtered by workspace on read. A reset starts a new epoch at seq 1.
  epoch: Schema.Int,
  nextSeq: Schema.Int,
  log: Schema.Array(LogItem), // only what retention still keeps
  viewers: Schema.Record(Schema.String, Members), // "workspace/ticket" → who has it open
});

export type DeskTruth = typeof DeskTruth.Type;

export const keyOf = (key: TicketKey) => `${key.workspaceId}/${key.ticketId}`;

// Code-point order, never localeCompare: the declared asc(ticketId) is the same on every host.
const byCodePoint = (a: string, b: string) => {
  if (a < b) return -1;

  if (a > b) return 1;

  return 0;
};

// The order ticket.domain.ts declares: updatedAt descending, then the key.
export const declaredOrder = (a: TicketRow, b: TicketRow) =>
  b.updatedAt - a.updatedAt ||
  byCodePoint(a.workspaceId, b.workspaceId) ||
  byCodePoint(a.ticketId, b.ticketId);

// Two named tickets the Stories use, plus enough filler that the queue has three pages.
export const seed = (): DeskTruth => ({
  clock: 1,
  tickets: [
    {
      workspaceId: "north",
      ticketId: "T-42",
      title: "Replace lobby light",
      status: "assigned",
      assignee: "dispatcher-7",
      updatedAt: 1,
      revision: 1,
    },
    {
      workspaceId: "north",
      ticketId: "T-43",
      title: "Fix loading dock door",
      status: "open",
      assignee: null,
      updatedAt: 1,
      revision: 1,
    },
    ...Array.from({ length: 43 }, (_, index): TicketRow => ({
      workspaceId: "north",
      ticketId: `T-${String(100 + index)}`,
      title: `Routine inspection ${index + 1}`,
      status: index % 3 === 0 ? "closed" : "open",
      assignee: null,
      updatedAt: 0,
      revision: 1,
    })),
  ],
  locks: {},
  applied: { tickets: {}, comments: {}, files: {} },
  comments: [],
  files: {},
  epoch: 1,
  nextSeq: 1,
  log: [],
  viewers: { "north/T-42": { "dispatcher-2": { id: "dispatcher-2", name: "Dana" } } },
});

const ok = <A>(value: A): Result<A, never> => ({ ok: true, value });

const fail = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const find = (truth: DeskTruth, key: TicketKey) =>
  truth.tickets.find(
    (ticket) => ticket.workspaceId === key.workspaceId && ticket.ticketId === key.ticketId,
  );

// --- reads ---------------------------------------------------------------------------------

export const loadTicket = (truth: DeskTruth, key: TicketKey): Result<TicketRow, TicketNotFound> => {
  const ticket = find(truth, key);

  return ticket ? ok({ ...ticket }) : fail(new TicketNotFound({ ticketId: key.ticketId }));
};

// Filters are conjunctive and an absent filter is no constraint. Search is a case-insensitive
// substring of the title.
export const listTickets = (truth: DeskTruth, input: TicketListInput): TicketPage => {
  const { workspaceId, status, assignee, search, page = 0 } = input;
  const needle = search?.trim().toLowerCase() ?? "";

  const matching = truth.tickets
    .filter(
      (ticket) =>
        ticket.workspaceId === workspaceId &&
        (status === undefined || ticket.status === status) &&
        (assignee === undefined || ticket.assignee === assignee) &&
        ticket.title.toLowerCase().includes(needle),
    )
    .sort(declaredOrder); // filter returned a new array

  const slice = matching.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (page + 1) * PAGE_SIZE < matching.length
    ? { tickets: slice.map((ticket) => ({ ...ticket })), nextPage: page + 1 }
    : { tickets: slice.map((ticket) => ({ ...ticket })) };
};

export const openCount = (truth: DeskTruth, workspaceId: string) =>
  truth.tickets.filter((ticket) => ticket.workspaceId === workspaceId && ticket.status === "open")
    .length;

// --- the event log ---------------------------------------------------------------------------

// Appends one change and its activity line, at the next position.
const record = (
  truth: DeskTruth,
  workspaceId: string,
  ticketId: string,
  text: string,
  make: (cursor: Cursor) => TicketEvent,
): DeskTruth => {
  const cursor: Cursor = { epoch: truth.epoch, seq: truth.nextSeq };

  const entry: ActivityEntry = {
    id: `${String(cursor.epoch)}:${String(cursor.seq)}`,
    cursor,
    workspaceId,
    ticketId,
    text,
    at: truth.clock,
  };

  return {
    ...truth,
    nextSeq: truth.nextSeq + 1,
    log: [...truth.log, { workspaceId, event: make(cursor), entry }],
  };
};

// Retention drops the oldest items: a catch-up from before the first kept one is `truncated`.
export const retain = (truth: DeskTruth, count: number): DeskTruth => ({
  ...truth,
  log: truth.log.slice(-count),
});

// A restart of the log: a new epoch, so old and new positions never compare equal.
export const resetLog = (truth: DeskTruth): DeskTruth => ({
  ...truth,
  epoch: truth.epoch + 1,
  nextSeq: 1,
  log: [],
});

const isAfter = (cursor: Cursor, after: Cursor) =>
  cursor.epoch === after.epoch && cursor.seq > after.seq;

export type Replay = { replayedFrom?: Cursor; items: ReadonlyArray<LogItem> };

// What a socket registration replays. The server replays only when `from` is in this epoch and the
// kept log still reaches it; then it echoes `from` as `replayedFrom`. Otherwise it greets without
// one, and the client must catch up over HTTP.
export const replay = (truth: DeskTruth, workspaceId: string, from: Cursor | undefined): Replay => {
  if (from === undefined || !reaches(truth, from)) return { items: [] };

  return {
    replayedFrom: from,
    items: truth.log.filter(
      (item) => item.workspaceId === workspaceId && isAfter(item.event.cursor, from),
    ),
  };
};

// The kept log reaches `after` when nothing between it and the first kept item was dropped.
const reaches = (truth: DeskTruth, after: Cursor) => {
  if (after.epoch !== truth.epoch) return false;

  const first = truth.log[0];

  return first === undefined || after.seq >= first.event.cursor.seq - 1;
};

// One page of activity after a position, with the server's own word on completeness.
export const eventsSince = (truth: DeskTruth, workspaceId: string, after: Cursor): ActivityPage => {
  const first = truth.log[0];

  if (first && !reaches(truth, after)) {
    const oldest = first.event.cursor;

    return {
      entries: [],
      complete: false,
      truncated: { oldest, beforeOldest: { epoch: oldest.epoch, seq: oldest.seq - 1 } },
    };
  }

  const rest = truth.log
    .filter((item) => item.workspaceId === workspaceId && isAfter(item.entry.cursor, after))
    .map((item) => item.entry);

  const entries = rest.slice(0, ACTIVITY_PAGE_SIZE);
  const last = entries.at(-1);

  return rest.length > ACTIVITY_PAGE_SIZE && last
    ? { entries, complete: false, next: last.cursor }
    : { entries, complete: true };
};

// --- ticket writes ---------------------------------------------------------------------------

const update = (
  truth: DeskTruth,
  ticket: TicketRow,
  change: Partial<Pick<TicketRow, "title" | "status" | "assignee">>,
  text: string,
): readonly [DeskTruth, TicketRow] => {
  const clock = truth.clock + 1;
  const next: TicketRow = { ...ticket, ...change, updatedAt: clock, revision: ticket.revision + 1 };

  const moved: DeskTruth = {
    ...truth,
    clock,
    tickets: truth.tickets.map((current) => (current === ticket ? next : current)),
  };

  return [
    record(moved, next.workspaceId, next.ticketId, text, (cursor) => ({
      _tag: "TicketSaved",
      cursor,
      ticket: next,
    })),
    next,
  ];
};

// A repeated idempotency key returns the first result and changes nothing.
const remember = (truth: DeskTruth, idempotencyKey: string, row: TicketRow): DeskTruth => ({
  ...truth,
  applied: { ...truth.applied, tickets: { ...truth.applied.tickets, [idempotencyKey]: row } },
});

// Order of checks: a replay, then the ticket, then its lock, then the title.
export const saveTitle = (
  truth: DeskTruth,
  input: TicketKey & { title: string },
  idempotencyKey: string,
): Step<TicketRow, TicketNotFound | TicketLocked | TitleRejected> => {
  const previous = truth.applied.tickets[idempotencyKey];

  if (previous) return [truth, ok({ ...previous })];

  const ticket = find(truth, input);

  if (!ticket) return [truth, fail(new TicketNotFound({ ticketId: input.ticketId }))];

  const lockedBy = truth.locks[keyOf(input)];

  if (lockedBy !== undefined) return [truth, fail(new TicketLocked({ lockedBy }))];

  if (input.title.trim() === "")
    return [truth, fail(new TitleRejected({ reason: "Enter a ticket title" }))];

  const [next, row] = update(
    truth,
    ticket,
    { title: input.title },
    `${ME} renamed ${input.ticketId}`,
  );

  return [remember(next, idempotencyKey, row), ok({ ...row })];
};

// A ticket held by someone else cannot be taken; assigning it to its holder again is a no-op that
// still succeeds, so a re-sent assignment is safe even without the key.
export const assign = (
  truth: DeskTruth,
  input: TicketKey & { assignee: string },
  idempotencyKey: string,
): Step<TicketRow, TicketNotFound | AlreadyAssigned> => {
  const previous = truth.applied.tickets[idempotencyKey];

  if (previous) return [truth, ok({ ...previous })];

  const ticket = find(truth, input);

  if (!ticket) return [truth, fail(new TicketNotFound({ ticketId: input.ticketId }))];

  if (ticket.assignee !== null && ticket.assignee !== input.assignee)
    return [truth, fail(new AlreadyAssigned({ assignee: ticket.assignee }))];

  const [next, row] = update(
    truth,
    ticket,
    { assignee: input.assignee, status: "assigned" },
    `${input.assignee} took ${input.ticketId}`,
  );

  return [remember(next, idempotencyKey, row), ok({ ...row })];
};

export const lock = (truth: DeskTruth, key: TicketKey, by: string): DeskTruth => ({
  ...truth,
  locks: { ...truth.locks, [keyOf(key)]: by },
});

export const unlock = (truth: DeskTruth, key: TicketKey): DeskTruth => {
  const { [keyOf(key)]: _released, ...locks } = truth.locks;

  return { ...truth, locks };
};

// Another dispatcher's change, through the same state the API reads. The caller pushes the logged
// event on the socket.
export const changeElsewhere = (
  truth: DeskTruth,
  key: TicketKey,
  change: Partial<Pick<TicketRow, "title" | "status" | "assignee">>,
  by: string,
): Step<TicketRow, TicketNotFound> => {
  const ticket = find(truth, key);

  if (!ticket) return [truth, fail(new TicketNotFound({ ticketId: key.ticketId }))];

  const [next, row] = update(truth, ticket, change, `${by} updated ${key.ticketId}`);

  return [next, ok({ ...row })];
};

export const removeElsewhere = (
  truth: DeskTruth,
  key: TicketKey,
  by: string,
): Step<void, TicketNotFound> => {
  const ticket = find(truth, key);

  if (!ticket) return [truth, fail(new TicketNotFound({ ticketId: key.ticketId }))];

  const removed: DeskTruth = {
    ...truth,
    clock: truth.clock + 1,
    tickets: truth.tickets.filter((current) => current !== ticket),
  };

  return [
    record(removed, key.workspaceId, key.ticketId, `${by} removed ${key.ticketId}`, (cursor) => ({
      _tag: "TicketRemoved",
      cursor,
      workspaceId: key.workspaceId,
      ticketId: key.ticketId,
      revision: ticket.revision + 1,
    })),
    ok(undefined),
  ];
};

// --- comments --------------------------------------------------------------------------------

export const listComments = (
  truth: DeskTruth,
  key: TicketKey,
): Result<CommentThread, TicketNotFound> =>
  find(truth, key)
    ? ok(
        truth.comments.filter(
          (comment) => comment.workspaceId === key.workspaceId && comment.ticketId === key.ticketId,
        ),
      )
    : fail(new TicketNotFound({ ticketId: key.ticketId }));

export const postComment = (
  truth: DeskTruth,
  input: TicketKey & { clientId: string; text: string },
  idempotencyKey: string,
): Step<CommentRow, TicketNotFound | CommentRejected> => {
  const previous = truth.applied.comments[idempotencyKey];

  if (previous) return [truth, ok(previous)];

  if (!find(truth, input)) return [truth, fail(new TicketNotFound({ ticketId: input.ticketId }))];

  if (input.text.trim() === "")
    return [truth, fail(new CommentRejected({ reason: "Write a comment first" }))];

  const clock = truth.clock + 1;

  const row: CommentRow = {
    id: `c-${String(truth.comments.length + 1)}`,
    clientId: input.clientId,
    workspaceId: input.workspaceId,
    ticketId: input.ticketId,
    author: ME,
    text: input.text,
    at: clock,
  };

  return [
    {
      ...truth,
      clock,
      comments: [...truth.comments, row],
      applied: { ...truth.applied, comments: { ...truth.applied.comments, [idempotencyKey]: row } },
    },
    ok(row),
  ];
};

// --- attachments -----------------------------------------------------------------------------

export const putFile = (
  truth: DeskTruth,
  input: { ref: string; name: string; size: number },
  idempotencyKey: string,
): Step<StoredAttachment, TooLarge> => {
  const previous = truth.applied.files[idempotencyKey];

  if (previous) return [truth, ok(previous)];

  if (input.size > MAX_FILE_BYTES) return [truth, fail(new TooLarge({ limit: MAX_FILE_BYTES }))];

  const stored: StoredAttachment = { ...input, url: `/uploads/${input.ref}` };

  return [
    {
      ...truth,
      files: { ...truth.files, [input.ref]: stored },
      applied: { ...truth.applied, files: { ...truth.applied.files, [idempotencyKey]: stored } },
    },
    ok(stored),
  ];
};

// --- presence --------------------------------------------------------------------------------

export const viewersOf = (truth: DeskTruth, key: TicketKey): Members =>
  truth.viewers[keyOf(key)] ?? {};

// Returns the diff the socket pushes to everyone else who has the ticket open.
export const join = (
  truth: DeskTruth,
  key: TicketKey,
  member: Member,
): readonly [DeskTruth, { joins: Members; leaves: Members }] => [
  {
    ...truth,
    viewers: { ...truth.viewers, [keyOf(key)]: { ...viewersOf(truth, key), [member.id]: member } },
  },
  { joins: { [member.id]: member }, leaves: {} },
];

export const leave = (
  truth: DeskTruth,
  key: TicketKey,
  memberId: string,
): readonly [DeskTruth, { joins: Members; leaves: Members }] => {
  const members = viewersOf(truth, key);
  const gone = members[memberId];
  const { [memberId]: _left, ...rest } = members;

  return [
    { ...truth, viewers: { ...truth.viewers, [keyOf(key)]: rest } },
    { joins: {}, leaves: gone ? { [memberId]: gone } : {} },
  ];
};

// --- assistant -------------------------------------------------------------------------------

// The reply's tokens, in order. A real model streams these; the demo splits a fixed sentence.
export const replyTokens = (ticket: TicketRow): ReadonlyArray<string> =>
  `Thanks for reporting "${ticket.title}". A technician will visit today, and we will confirm the time here.`.split(
    /(?<= )/,
  );
