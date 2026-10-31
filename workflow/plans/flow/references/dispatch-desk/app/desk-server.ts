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
  CommentGone,
  CommentRejected,
  CommentRow,
  EditWindowClosed,
  Reactions,
  type CommentKey,
  type ThreadPage,
} from "../features/Comments/comments-api.js";
import {
  RemoveRefused,
  StoredAttachment,
  TooLarge,
} from "../features/Attachments/attachments-api.js";
import {
  CustomerRow,
  HasOpenTickets,
  InviteRejected,
  MergeConflict,
  RosterChange,
  TeamRow,
  TechnicianGone,
  TechnicianRow,
  type ChangeBatch,
  type Invite,
  type RosterPage,
  type TechnicianKey,
} from "../features/Roster/roster-api.js";
import { Members, type Member } from "../features/Presence/presence-api.js";
import {
  ActivityEntry,
  AlreadyAssigned,
  ArchiveRefused,
  TicketRejected,
  type NewTicket,
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

export const THREAD_PAGE_SIZE = 20;

export const ROSTER_PAGE_SIZE = 20;

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
    writes: Schema.Record(Schema.String, Schema.Unknown), // every other write's first reply, by key
  }),
  comments: Schema.Array(CommentRow),
  // Comments whose author's edit window has closed (a control ages them; the window is the server's rule).
  closedForEdit: Schema.Array(Schema.String),
  reactions: Schema.Record(Schema.String, Reactions), // "workspace/ticket" → per comment, per emoji
  files: Schema.Record(Schema.String, StoredAttachment),
  technicians: Schema.Array(TechnicianRow),
  teams: Schema.Array(TeamRow),
  customers: Schema.Array(CustomerRow),
  rosterLog: Schema.Array(RosterChange), // dense `seq` per server; the polling feed reads after a cursor
  rosterSeq: Schema.Int,
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

// A null due date sorts after every date: the server's choice. The client never compares a null pair, so it
// skips that key and goes on to the next one (merge 5, M5-D4).
const byDue = (a: number | null, b: number | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b;

// The order ticket.domain.ts declares: priority descending, due date ascending, then the key.
export const declaredOrder = (a: TicketRow, b: TicketRow) =>
  b.priority - a.priority ||
  byDue(a.dueAt, b.dueAt) ||
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
      priority: 1,
      dueAt: 7_200_000,
      customerId: "acme",
      commentCount: 0,
      updatedAt: 1,
      revision: 1,
    },
    {
      workspaceId: "north",
      ticketId: "T-43",
      title: "Fix loading dock door",
      status: "open",
      assignee: null,
      priority: 2,
      dueAt: 3_600_000,
      customerId: "acme-ltd",
      commentCount: 0,
      updatedAt: 1,
      revision: 1,
    },
    ...Array.from({ length: 43 }, (_, index): TicketRow => ({
      workspaceId: "north",
      ticketId: `T-${String(100 + index)}`,
      title: `Routine inspection ${index + 1}`,
      status: index % 3 === 0 ? "closed" : "open",
      assignee: null,
      priority: 1,
      dueAt: index % 4 === 0 ? null : 86_400_000 + index * 60_000, // some tickets have no deadline
      customerId: index % 2 === 0 ? "acme" : "acme-ltd",
      commentCount: 0,
      updatedAt: 0,
      revision: 1,
    })),
  ],
  locks: {},
  applied: { tickets: {}, comments: {}, files: {}, writes: {} },
  comments: [],
  closedForEdit: [],
  reactions: {},
  // One stored file someone else uploaded: removing it is refused (403) and the record comes back.
  files: {
    "r-old": {
      workspaceId: "north",
      ticketId: "T-42",
      ref: "r-old",
      name: "before.jpg",
      size: 120_000,
      url: "/uploads/r-old",
      uploadedBy: "dispatcher-2",
      revision: 1,
    },
  },
  technicians: [
    tech("tech-ana", "Ana", "team-east", ["electrical"]),
    tech("tech-ben", "Ben", "team-east", ["doors", "hvac"]),
    tech("tech-cy", "Cy", "team-west", ["plumbing"]),
    tech("tech-dee", "Dee", "team-west", ["electrical", "doors"]),
    tech("tech-eli", "Eli", null, []), // unplaced: shows under every team (`isNull(teamId)`)
  ],
  teams: [
    { workspaceId: "north", teamId: "team-east", name: "East", technicianCount: 2, revision: 1 },
    { workspaceId: "north", teamId: "team-west", name: "West", technicianCount: 2, revision: 1 },
  ],
  // Two records for one company, the case a merge exists for.
  customers: [
    { workspaceId: "north", customerId: "acme", name: "Acme", ticketCount: 23, revision: 1 },
    {
      workspaceId: "north",
      customerId: "acme-ltd",
      name: "ACME Ltd",
      ticketCount: 22,
      revision: 1,
    },
  ],
  rosterLog: [],
  rosterSeq: 0,
  epoch: 1,
  nextSeq: 1,
  log: [],
  viewers: { "north/T-42": { "dispatcher-2": { id: "dispatcher-2", name: "Dana" } } },
});

function tech(
  technicianId: string,
  name: string,
  teamId: string | null,
  skills: ReadonlyArray<string>,
): TechnicianRow {
  return {
    workspaceId: "north",
    technicianId,
    name,
    teamId,
    skills,
    status: "free",
    lastSeenAt: 0,
    revision: 1,
  };
}

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
  change: Partial<
    Pick<TicketRow, "title" | "status" | "assignee" | "priority" | "commentCount" | "customerId">
  >,
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
  change: Partial<Pick<TicketRow, "title" | "status" | "assignee" | "priority" | "customerId">>,
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

// --- more ticket lists, creates and archives -------------------------------------------------------

const page = (rows: ReadonlyArray<TicketRow>, index: number): TicketPage => {
  const slice = rows
    .slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE)
    .map((ticket) => ({ ...ticket }));

  return (index + 1) * PAGE_SIZE < rows.length
    ? { tickets: slice, nextPage: index + 1 }
    : { tickets: slice };
};

// `isNull(assignee)`: tickets nobody holds, closed or not (the domain's condition, nothing else).
export const listUnassigned = (truth: DeskTruth, input: { workspaceId: string; page?: number }) =>
  page(
    truth.tickets
      .filter((ticket) => ticket.workspaceId === input.workspaceId && ticket.assignee === null)
      .sort(declaredOrder),
    input.page ?? 0,
  );

// `or(eq(priority, urgent), and(isNull(assignee), lt(dueAt, now)))`. Three-valued, as the domain reads it: a
// null due date is not before anything, so an unassigned ticket with no deadline is not overdue.
export const listTriage = (truth: DeskTruth, input: { workspaceId: string; now: number }) =>
  page(
    truth.tickets
      .filter(
        (ticket) =>
          ticket.workspaceId === input.workspaceId &&
          (ticket.priority === 2 ||
            (ticket.assignee === null && ticket.dueAt !== null && ticket.dueAt < input.now)),
      )
      .sort(declaredOrder),
    0,
  );

export const ticketsOfCustomer = (
  truth: DeskTruth,
  input: { workspaceId: string; customerId: string },
) =>
  truth.tickets
    .filter(
      (ticket) =>
        ticket.workspaceId === input.workspaceId && ticket.customerId === input.customerId,
    )
    .sort(declaredOrder);

// The first reply per idempotency key, for writes that have no table of their own.
const replayed = <A>(truth: DeskTruth, key: string) => truth.applied.writes[key] as A | undefined;

const rememberWrite = (truth: DeskTruth, key: string, reply: unknown): DeskTruth => ({
  ...truth,
  applied: { ...truth.applied, writes: { ...truth.applied.writes, [key]: reply } },
});

export const createTicket = (
  truth: DeskTruth,
  input: NewTicket,
  idempotencyKey: string,
): Step<TicketRow, TicketRejected> => {
  const previous = replayed<TicketRow>(truth, idempotencyKey);

  if (previous) return [truth, ok(previous)];

  if (input.title.trim() === "")
    return [truth, fail(new TicketRejected({ reason: "Give the ticket a title" }))];

  const clock = truth.clock + 1;
  const row: TicketRow = {
    workspaceId: input.workspaceId,
    ticketId: `T-${String(1000 + truth.tickets.length)}`, // the server's id; `draftId` never leaves the device
    title: input.title,
    status: "open",
    assignee: null,
    priority: input.priority,
    dueAt: input.dueAt,
    customerId: null,
    commentCount: 0,
    updatedAt: clock,
    revision: 1,
  };

  const next = record(
    { ...truth, clock, tickets: [...truth.tickets, row] },
    row.workspaceId,
    row.ticketId,
    `${ME} opened ${row.ticketId}`,
    (cursor) => ({ _tag: "TicketSaved", cursor, ticket: row }),
  );

  return [rememberWrite(next, idempotencyKey, row), ok(row)];
};

// A ticket someone is working on cannot be archived: the 403 restores it in every list.
export const archiveTicket = (
  truth: DeskTruth,
  key: TicketKey,
  idempotencyKey: string,
): Step<void, TicketNotFound | ArchiveRefused> => {
  if (replayed(truth, idempotencyKey) !== undefined) return [truth, ok(undefined)];

  const ticket = find(truth, key);

  if (!ticket) return [truth, fail(new TicketNotFound({ ticketId: key.ticketId }))];

  if (ticket.status === "assigned")
    return [
      truth,
      fail(new ArchiveRefused({ reason: `${ticket.assignee ?? "Someone"} is working on it` })),
    ];

  const [next] = removeElsewhere(truth, key, ME);

  return [rememberWrite(next, idempotencyKey, true), ok(undefined)];
};

// --- comments --------------------------------------------------------------------------------

const commentsOf = (truth: DeskTruth, key: TicketKey) =>
  truth.comments.filter(
    (comment) => comment.workspaceId === key.workspaceId && comment.ticketId === key.ticketId,
  );

// The order comments.domain.ts declares: oldest first, then the key.
const byCreated = (a: CommentRow, b: CommentRow) =>
  a.createdAt - b.createdAt || byCodePoint(a.commentId, b.commentId);

// Pages run backwards: the newest page first, and `older` names the page before it (a cursor is the index of
// the first comment the next page must end before).
export const listThread = (
  truth: DeskTruth,
  input: TicketKey & { pinned?: boolean; before?: string },
): Result<ThreadPage, TicketNotFound> => {
  if (!find(truth, input)) return fail(new TicketNotFound({ ticketId: input.ticketId }));

  const all = commentsOf(truth, input)
    .filter((comment) => input.pinned === undefined || comment.pinned === input.pinned)
    .sort(byCreated);
  const end = input.before === undefined ? all.length : Number(input.before);
  const start = Math.max(0, end - THREAD_PAGE_SIZE);
  const comments = all.slice(start, end);

  return ok(start > 0 ? { comments, older: String(start) } : { comments });
};

// `and(contains(mentions, me), isNull(readAt))`, across the workspace.
export const listMentions = (truth: DeskTruth, input: { workspaceId: string; me: string }) =>
  truth.comments
    .filter(
      (comment) =>
        comment.workspaceId === input.workspaceId &&
        comment.mentions.includes(input.me) &&
        comment.readAt === null,
    )
    .sort(byCreated);

const mentionsIn = (text: string) => [...text.matchAll(/@([\w-]+)/g)].map((match) => match[1]!);

// A comment changes its ticket's `commentCount`, and the change is logged for the socket.
const countComments = (truth: DeskTruth, key: TicketKey, by: number, text: string) => {
  const ticket = find(truth, key);

  if (!ticket) return truth;

  return update(truth, ticket, { commentCount: ticket.commentCount + by }, text)[0];
};

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
    workspaceId: input.workspaceId,
    ticketId: input.ticketId,
    commentId: `c-${String(truth.comments.length + 1)}`,
    clientId: input.clientId,
    attemptId: idempotencyKey,
    author: ME,
    text: input.text,
    mentions: mentionsIn(input.text),
    pinned: false,
    readAt: null,
    editedAt: null,
    createdAt: clock,
    revision: 1,
  };

  const counted = countComments(
    { ...truth, clock, comments: [...truth.comments, row] },
    input,
    1,
    `${ME} commented on ${input.ticketId}`,
  );

  return [
    {
      ...counted,
      applied: {
        ...counted.applied,
        comments: { ...counted.applied.comments, [idempotencyKey]: row },
      },
    },
    ok(row),
  ];
};

const findComment = (truth: DeskTruth, key: CommentKey) =>
  truth.comments.find(
    (comment) =>
      comment.workspaceId === key.workspaceId &&
      comment.ticketId === key.ticketId &&
      comment.commentId === key.commentId,
  );

const replaceComment = (truth: DeskTruth, row: CommentRow): DeskTruth => ({
  ...truth,
  clock: truth.clock + 1,
  comments: truth.comments.map((comment) => (comment.commentId === row.commentId ? row : comment)),
});

// Edits and deletes are the author's, within the window.
const editable = (
  truth: DeskTruth,
  key: CommentKey,
): Result<CommentRow, CommentGone | EditWindowClosed> => {
  const comment = findComment(truth, key);

  if (!comment) return fail(new CommentGone({ commentId: key.commentId }));

  if (truth.closedForEdit.includes(key.commentId))
    return fail(new EditWindowClosed({ closedAt: comment.createdAt + 900_000 }));

  return ok(comment);
};

export const editComment = (
  truth: DeskTruth,
  input: CommentKey & { text: string },
  idempotencyKey: string,
): Step<CommentRow, CommentGone | EditWindowClosed | CommentRejected> => {
  const previous = replayed<CommentRow>(truth, idempotencyKey);

  if (previous) return [truth, ok(previous)];

  const found = editable(truth, input);

  if (!found.ok) return [truth, found];

  if (input.text.trim() === "")
    return [truth, fail(new CommentRejected({ reason: "A comment needs text" }))];

  const row: CommentRow = {
    ...found.value,
    text: input.text,
    mentions: mentionsIn(input.text),
    editedAt: truth.clock + 1,
    revision: found.value.revision + 1,
  };

  return [rememberWrite(replaceComment(truth, row), idempotencyKey, row), ok(row)];
};

export const removeComment = (
  truth: DeskTruth,
  input: CommentKey,
  idempotencyKey: string,
): Step<void, CommentGone | EditWindowClosed> => {
  if (replayed(truth, idempotencyKey) !== undefined) return [truth, ok(undefined)];

  const found = editable(truth, input);

  if (!found.ok) return [truth, found];

  const removed = countComments(
    { ...truth, comments: truth.comments.filter((comment) => comment !== found.value) },
    input,
    -1,
    `${ME} deleted a comment on ${input.ticketId}`,
  );

  return [rememberWrite(removed, idempotencyKey, true), ok(undefined)];
};

export const pinComment = (
  truth: DeskTruth,
  input: CommentKey & { pinned: boolean },
  idempotencyKey: string,
): Step<CommentRow, CommentGone> => {
  const previous = replayed<CommentRow>(truth, idempotencyKey);

  if (previous) return [truth, ok(previous)];

  const comment = findComment(truth, input);

  if (!comment) return [truth, fail(new CommentGone({ commentId: input.commentId }))];

  const row = { ...comment, pinned: input.pinned, revision: comment.revision + 1 };

  return [rememberWrite(replaceComment(truth, row), idempotencyKey, row), ok(row)];
};

// Many records in one write; the answer carries none of them (the client predicted `readAt`).
export const markRead = (
  truth: DeskTruth,
  input: { comments: ReadonlyArray<CommentKey>; at: number },
  idempotencyKey: string,
): Step<void, never> => {
  if (replayed(truth, idempotencyKey) !== undefined) return [truth, ok(undefined)];

  const ids = new Set(input.comments.map((key) => key.commentId));
  const next: DeskTruth = {
    ...truth,
    comments: truth.comments.map((comment) =>
      ids.has(comment.commentId) && comment.readAt === null
        ? { ...comment, readAt: input.at, revision: comment.revision + 1 }
        : comment,
    ),
  };

  return [rememberWrite(next, idempotencyKey, true), ok(undefined)];
};

export const reactionsOf = (truth: DeskTruth, key: TicketKey): Reactions =>
  truth.reactions[keyOf(key)] ?? {};

export const react = (
  truth: DeskTruth,
  input: CommentKey & { emoji: string; on: boolean },
  idempotencyKey: string,
): Step<Reactions, CommentGone> => {
  const previous = replayed<Reactions>(truth, idempotencyKey);

  if (previous) return [truth, ok(previous)];

  if (!findComment(truth, input))
    return [truth, fail(new CommentGone({ commentId: input.commentId }))];

  const all = reactionsOf(truth, input);
  const counts = all[input.commentId] ?? {};
  const count = Math.max(0, (counts[input.emoji] ?? 0) + (input.on ? 1 : -1));
  const reactions = { ...all, [input.commentId]: { ...counts, [input.emoji]: count } };

  return [
    rememberWrite(
      { ...truth, reactions: { ...truth.reactions, [keyOf(input)]: reactions } },
      idempotencyKey,
      reactions,
    ),
    ok(reactions),
  ];
};

// --- attachments -----------------------------------------------------------------------------

export const listFiles = (truth: DeskTruth, key: TicketKey) =>
  Object.values(truth.files).filter(
    (file) => file.workspaceId === key.workspaceId && file.ticketId === key.ticketId,
  );

export const putFile = (
  truth: DeskTruth,
  input: TicketKey & { ref: string; name: string; size: number },
  idempotencyKey: string,
): Step<StoredAttachment, TooLarge> => {
  const previous = truth.applied.files[idempotencyKey];

  if (previous) return [truth, ok(previous)];

  if (input.size > MAX_FILE_BYTES) return [truth, fail(new TooLarge({ limit: MAX_FILE_BYTES }))];

  const stored: StoredAttachment = {
    ...input,
    url: `/uploads/${input.ref}`,
    uploadedBy: ME,
    revision: 1,
  };

  return [
    {
      ...truth,
      files: { ...truth.files, [input.ref]: stored },
      applied: { ...truth.applied, files: { ...truth.applied.files, [idempotencyKey]: stored } },
    },
    ok(stored),
  ];
};

// Only the uploader removes a file.
export const removeFile = (
  truth: DeskTruth,
  input: TicketKey & { ref: string },
  idempotencyKey: string,
): Step<void, RemoveRefused> => {
  if (replayed(truth, idempotencyKey) !== undefined) return [truth, ok(undefined)];

  const file = truth.files[input.ref];

  if (!file) return [rememberWrite(truth, idempotencyKey, true), ok(undefined)]; // already gone: done

  if (file.uploadedBy !== ME)
    return [truth, fail(new RemoveRefused({ uploadedBy: file.uploadedBy }))];

  const { [input.ref]: _removed, ...files } = truth.files;

  return [rememberWrite({ ...truth, files }, idempotencyKey, true), ok(undefined)];
};

// --- the roster --------------------------------------------------------------------------------

const techKey = (key: TechnicianKey) => `${key.workspaceId}/${key.technicianId}`;

const findTech = (truth: DeskTruth, key: TechnicianKey) =>
  truth.technicians.find((t) => techKey(t) === techKey(key));

// A team-less technician sorts after every team, as a null due date does; then the name, then the key. Names
// are strings, which the client never compares (entity-domain 4.4).
const byTeam = (a: TechnicianRow, b: TechnicianRow) =>
  (a.teamId === b.teamId
    ? 0
    : a.teamId === null
      ? 1
      : b.teamId === null
        ? -1
        : byCodePoint(a.teamId, b.teamId)) ||
  byCodePoint(a.name, b.name) ||
  byCodePoint(a.technicianId, b.technicianId);

// `or(eq(teamId, input.teamId), isNull(teamId))`: my team, and everyone not placed yet. `locale` changes how
// the page renders "last seen", never which technicians or their order (the domain `.ignoring`s it).
export const listTechnicians = (
  truth: DeskTruth,
  input: { workspaceId: string; teamId: string; page?: number },
): RosterPage => {
  const rows = truth.technicians
    .filter(
      (t) =>
        t.workspaceId === input.workspaceId && (t.teamId === input.teamId || t.teamId === null),
    )
    .sort(byTeam);
  const index = input.page ?? 0;
  const slice = rows.slice(index * ROSTER_PAGE_SIZE, (index + 1) * ROSTER_PAGE_SIZE);

  return (index + 1) * ROSTER_PAGE_SIZE < rows.length
    ? { technicians: slice, nextPage: index + 1 }
    : { technicians: slice };
};

export const loadTechnician = (
  truth: DeskTruth,
  key: TechnicianKey,
): Result<TechnicianRow, TechnicianGone> => {
  const found = findTech(truth, key);

  return found ? ok(found) : fail(new TechnicianGone({ technicianId: key.technicianId }));
};

export const teamSizes = (truth: DeskTruth, workspaceId: string) =>
  Object.fromEntries(
    truth.teams
      .filter((team) => team.workspaceId === workspaceId)
      .map((team) => [
        team.teamId,
        truth.technicians.filter((t) => t.teamId === team.teamId).length,
      ]),
  );

export const rosterChanges = (
  truth: DeskTruth,
  workspaceId: string,
  after: number,
): ChangeBatch => {
  const changes = truth.rosterLog.filter(
    (change) =>
      change.seq > after &&
      (change._tag === "TechnicianSaved" ? change.technician.workspaceId : change.workspaceId) ===
        workspaceId,
  );

  return { changes, cursor: changes.at(-1)?.seq ?? after };
};

const logTech = (truth: DeskTruth, technician: TechnicianRow): DeskTruth => {
  const seq = truth.rosterSeq + 1;

  return {
    ...truth,
    rosterSeq: seq,
    rosterLog: [...truth.rosterLog, { _tag: "TechnicianSaved", seq, technician }],
  };
};

const saveTech = (truth: DeskTruth, row: TechnicianRow): DeskTruth =>
  logTech(
    {
      ...truth,
      technicians: truth.technicians.map((t) => (techKey(t) === techKey(row) ? row : t)),
    },
    row,
  );

const recount = (truth: DeskTruth): DeskTruth => ({
  ...truth,
  teams: truth.teams.map((team) => ({
    ...team,
    technicianCount: truth.technicians.filter((t) => t.teamId === team.teamId).length,
    revision: team.revision + 1,
  })),
});

const techWrite = (
  truth: DeskTruth,
  key: TechnicianKey,
  idempotencyKey: string,
  change: (row: TechnicianRow) => TechnicianRow,
): Step<TechnicianRow, TechnicianGone> => {
  const previous = replayed<TechnicianRow>(truth, idempotencyKey);

  if (previous) return [truth, ok(previous)];

  const found = findTech(truth, key);

  if (!found) return [truth, fail(new TechnicianGone({ technicianId: key.technicianId }))];

  const row = change({ ...found, revision: found.revision + 1 });

  return [rememberWrite(recount(saveTech(truth, row)), idempotencyKey, row), ok(row)];
};

export const moveTechnician = (
  truth: DeskTruth,
  input: TechnicianKey & { to: string },
  idempotencyKey: string,
) => techWrite(truth, input, idempotencyKey, (row) => ({ ...row, teamId: input.to }));

export const renameTechnician = (
  truth: DeskTruth,
  input: TechnicianKey & { name: string },
  idempotencyKey: string,
) => techWrite(truth, input, idempotencyKey, (row) => ({ ...row, name: input.name }));

export const setSkills = (
  truth: DeskTruth,
  input: TechnicianKey & { skills: ReadonlyArray<string> },
  idempotencyKey: string,
) => techWrite(truth, input, idempotencyKey, (row) => ({ ...row, skills: input.skills }));

// Another device changes a technician's status (a poller sees it): no idempotency, a plain change.
export const setStatusElsewhere = (
  truth: DeskTruth,
  key: TechnicianKey,
  status: TechnicianRow["status"],
): DeskTruth => {
  const found = findTech(truth, key);

  return found ? saveTech(truth, { ...found, status, revision: found.revision + 1 }) : truth;
};

export const removeTechnician = (
  truth: DeskTruth,
  key: TechnicianKey,
  idempotencyKey: string,
): Step<void, HasOpenTickets | TechnicianGone> => {
  if (replayed(truth, idempotencyKey) !== undefined) return [truth, ok(undefined)];

  const found = findTech(truth, key);

  if (!found) return [truth, fail(new TechnicianGone({ technicianId: key.technicianId }))];

  const open = truth.tickets.filter(
    (t) => t.assignee === key.technicianId && t.status !== "closed",
  ).length;

  if (open > 0) return [truth, fail(new HasOpenTickets({ open }))];

  const seq = truth.rosterSeq + 1;
  const next: DeskTruth = recount({
    ...truth,
    technicians: truth.technicians.filter((t) => t !== found),
    rosterSeq: seq,
    rosterLog: [
      ...truth.rosterLog,
      {
        _tag: "TechnicianRemoved",
        seq,
        workspaceId: key.workspaceId,
        technicianId: key.technicianId,
        revision: found.revision + 1,
      },
    ],
  });

  return [rememberWrite(next, idempotencyKey, true), ok(undefined)];
};

// One write over two entities: the merged customer goes, the survivor's count grows, and every listed ticket
// is re-pointed. Refused whole when either record is not what the client saw.
export const mergeCustomers = (
  truth: DeskTruth,
  input: {
    workspaceId: string;
    survivorId: string;
    mergedId: string;
    tickets: ReadonlyArray<TicketKey>;
  },
  idempotencyKey: string,
): Step<CustomerRow, MergeConflict> => {
  const previous = replayed<CustomerRow>(truth, idempotencyKey);

  if (previous) return [truth, ok(previous)];

  const survivor = truth.customers.find((c) => c.customerId === input.survivorId);
  const merged = truth.customers.find((c) => c.customerId === input.mergedId);

  if (!survivor || !merged)
    return [truth, fail(new MergeConflict({ reason: "One of them was merged already" }))];

  // The client re-points exactly the tickets it showed. If the merged customer's tickets changed meanwhile, the
  // client's prediction is wrong about which ones move: refuse, and let it look again.
  const moved = new Set(input.tickets.map((t) => t.ticketId));
  const current = truth.tickets
    .filter((t) => t.customerId === input.mergedId)
    .map((t) => t.ticketId);

  if (current.length !== moved.size || current.some((id) => !moved.has(id)))
    return [truth, fail(new MergeConflict({ reason: "Its tickets changed; check them again" }))];

  const row = {
    ...survivor,
    ticketCount: survivor.ticketCount + moved.size,
    revision: survivor.revision + 1,
  };
  const next: DeskTruth = {
    ...truth,
    clock: truth.clock + 1,
    customers: truth.customers.filter((c) => c !== merged).map((c) => (c === survivor ? row : c)),
    tickets: truth.tickets.map((t) =>
      moved.has(t.ticketId) ? { ...t, customerId: input.survivorId, revision: t.revision + 1 } : t,
    ),
  };

  return [rememberWrite(next, idempotencyKey, row), ok(row)];
};

export const invite = (
  truth: DeskTruth,
  input: Invite,
  idempotencyKey: string,
): Step<TechnicianRow, InviteRejected> => {
  const previous = replayed<TechnicianRow>(truth, idempotencyKey);

  if (previous) return [truth, ok(previous)];

  if (!input.email.includes("@"))
    return [truth, fail(new InviteRejected({ reason: "Not an email address" }))];

  if (truth.technicians.some((t) => t.name === input.name))
    return [truth, fail(new InviteRejected({ reason: `${input.name} is on the roster already` }))];

  const row: TechnicianRow = {
    workspaceId: input.workspaceId,
    technicianId: `tech-${input.name.toLowerCase()}`,
    name: input.name,
    teamId: null,
    skills: [],
    status: "off",
    lastSeenAt: 0,
    revision: 1,
  };

  return [
    rememberWrite(
      logTech({ ...truth, technicians: [...truth.technicians, row] }, row),
      idempotencyKey,
      row,
    ),
    ok(row),
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
