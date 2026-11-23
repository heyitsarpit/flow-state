import { Option, Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

const Message = Schema.Struct({
  id: Schema.String,
  from: Schema.String,
  at: Schema.Number,
  replyTo: Schema.String,
});

type Message = typeof Message.Type;

/**
 * The workspace inbox: the messages that arrived, oldest first, and how many of them are read;
 * kept across reloads.
 */
export const Inbox = definition({
  id: "Workspace/Inbox",
  persist: true,
  states: ["OPEN"],
  events: {
    Arrive: { id: Schema.String, from: Schema.String, at: Schema.Number, replyTo: Schema.String },
    ReadAll: {},
    Clear: {},
  },
  memory: {
    messages: Flow.initial(Schema.Array(Message), []),
    read: Flow.initial(Schema.Number, 0),
  },
});

/**
 * The inbox: a message arrives at its end, reading all marks every message read, and clearing
 * empties it.
 */
export const InboxMachine = machine(Inbox, ({ S }) => ({
  default: S.OPEN,
  on: {
    Arrive: {
      updateMemory: ({ event, memory }) => ({
        messages: [
          ...memory.messages,
          { id: event.id, from: event.from, at: event.at, replyTo: event.replyTo },
        ],
      }),
    },
    ReadAll: { updateMemory: ({ memory }) => ({ read: memory.messages.length }) },
    Clear: { updateMemory: () => ({ messages: [], read: 0 }) },
  },
}));

/**
 * The newest message as the digest shows it: who sent it and when.
 */
export class Envelope extends Schema.Class<Envelope>("Workspace/Envelope")({
  from: Schema.String,
  at: Schema.Number,
}) {}

const newest = (messages: ReadonlyArray<Message>) => Option.fromUndefinedOr(messages.at(-1));

// The instant a message arrived, as the Date a screen shows: built from the stored time, never read
// from the clock.
// oxlint-disable-next-line flow-state/no-clock -- a Date of a stored instant; nothing reads the clock
const arrivedAt = (m: Message) => new Date(m.at);

const countsBySender = (messages: ReadonlyArray<Message>) => {
  const counts = new Map<string, number>();

  for (const m of messages) counts.set(m.from, (counts.get(m.from) ?? 0) + 1);

  return counts;
};

const idsBySender = (messages: ReadonlyArray<Message>) => {
  const ids = new Map<string, Set<string>>();

  for (const m of messages) ids.set(m.from, new Set([...(ids.get(m.from) ?? []), m.id]));

  return ids;
};

/**
 * A nested mix: when the newest message came, and each sender's message ids.
 */
const Summary = Schema.Struct({
  latest: Schema.Option(Schema.Date),
  ids: Schema.ReadonlyMap(Schema.String, Schema.ReadonlySet(Schema.String)),
});

/**
 * The inbox digest in the header: when the newest message came (a Date, or undefined when the inbox
 * is empty), the share still unread (NaN when empty), how many it owes the reader as a negative
 * count (-0 when all are read), counts by sender (a Map), the senders (a Set), the newest message
 * (a class instance), the first sender (an Option) and a nested mix of them. It counts each change
 * it hears, and whether the inbox is busy: as many writers as a threshold its own memory holds;
 * kept across reloads.
 */
export const Digest = definition({
  id: "Workspace/Digest",
  persist: true,
  states: ["SHOWN"],
  events: { Quiet: { from: Schema.Number } },
  internalEvents: { Heard: {}, Busy: {} },
  memory: {
    heard: Flow.initial(Schema.Number, 0),
    busy: Flow.initial(Schema.Number, 0),
    quietFrom: Flow.initial(Schema.Number, 2),
  },
  context: {
    latest: Flow.context(Schema.UndefinedOr(Schema.Date), {
      reads: { messages: Inbox.M.messages },
      select: ({ messages }) => Option.getOrUndefined(Option.map(newest(messages), arrivedAt)),
    }),
    unread: Flow.context(Schema.Number, {
      reads: { messages: Inbox.M.messages, read: Inbox.M.read },
      select: ({ messages, read }) => (messages.length - read) / messages.length,
    }),
    owed: Flow.context(Schema.Number, {
      reads: { messages: Inbox.M.messages, read: Inbox.M.read },
      select: ({ messages, read }) => -(messages.length - read),
    }),
    bySender: Flow.context(Schema.ReadonlyMap(Schema.String, Schema.Number), {
      reads: { messages: Inbox.M.messages },
      select: ({ messages }) => countsBySender(messages),
    }),
    senders: Flow.context(Schema.ReadonlySet(Schema.String), {
      reads: { messages: Inbox.M.messages },
      select: ({ messages }) => new Set(messages.map((m) => m.from)),
    }),
    writers: Flow.context(Schema.Number, {
      reads: { messages: Inbox.M.messages },
      select: ({ messages }) => new Set(messages.map((m) => m.from)).size,
    }),
    envelope: Flow.context(Schema.UndefinedOr(Envelope), {
      reads: { messages: Inbox.M.messages },
      select: ({ messages }) =>
        Option.getOrUndefined(
          Option.map(newest(messages), (m) => new Envelope({ from: m.from, at: m.at })),
        ),
    }),
    first: Flow.context(Schema.Option(Schema.String), {
      reads: { messages: Inbox.M.messages },
      select: ({ messages }) => Option.map(Option.fromUndefinedOr(messages[0]), (m) => m.from),
    }),
    summary: Flow.context(Summary, {
      reads: { messages: Inbox.M.messages },
      select: ({ messages }) => ({
        latest: Option.map(newest(messages), arrivedAt),
        ids: idsBySender(messages),
      }),
    }),
  },
});

/**
 * The digest: each changed slot is one more heard; a change of writers that turns the inbox busy or
 * quiet against the digest's own threshold is one more busy.
 */
export const DigestMachine = machine(Digest, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [
    C.latest.change({ event: E.Heard }),
    C.unread.change({ event: E.Heard }),
    C.owed.change({ event: E.Heard }),
    C.bySender.change({ event: E.Heard }),
    C.senders.change({ event: E.Heard }),
    C.envelope.change({ event: E.Heard }),
    C.first.change({ event: E.Heard }),
    C.summary.change({ event: E.Heard }),
    C.writers.change({
      when: (current, previous, { memory }) =>
        previous === undefined || current >= memory.quietFrom !== previous >= memory.quietFrom,
      event: E.Busy,
    }),
  ],
  on: {
    Heard: { updateMemory: ({ memory }) => ({ heard: memory.heard + 1 }) },
    Busy: { updateMemory: ({ memory }) => ({ busy: memory.busy + 1 }) },
    Quiet: { updateMemory: ({ event }) => ({ quietFrom: event.from }) },
  },
}));

/**
 * A message in a thread, linked both ways: to its replies and back to what it answers.
 */
export type Post = {
  readonly id: string;
  readonly from: string;
  readonly replies: Array<Post>;
  parent: Option.Option<Post>;
};

/**
 * A thread as a screen draws it: each message with its replies, without the links back.
 */
export type Thread = {
  readonly id: string;
  readonly from: string;
  readonly replies: ReadonlyArray<Thread>;
};

// RETURN_TYPE: a recursive Schema names its own type.
const Thread: Schema.Codec<Thread> = Schema.Struct({
  id: Schema.String,
  from: Schema.String,
  replies: Schema.Array(Schema.suspend(() => Thread)),
});

// The inbox's messages as a tree under one root, each reply under the message it answers.
const threadOf = (messages: ReadonlyArray<Message>) => {
  const root: Post = { id: "", from: "", replies: [], parent: Option.none() };
  const posts = new Map<string, Post>();

  for (const m of messages) {
    const parent = posts.get(m.replyTo) ?? root;
    const post: Post = { id: m.id, from: m.from, replies: [], parent: Option.some(parent) };
    parent.replies.push(post);
    posts.set(m.id, post);
  }

  return root;
};

/**
 * The thread view: the inbox as a tree whose replies point back at what they answer, so its
 * selection holds cycles; it counts each change of the tree it hears; kept across reloads.
 */
export const ThreadView = definition({
  id: "Workspace/ThreadView",
  persist: true,
  states: ["SHOWN"],
  events: {},
  internalEvents: { Heard: {} },
  memory: { heard: Flow.initial(Schema.Number, 0) },
  context: {
    thread: Flow.context(Thread, {
      reads: { messages: Inbox.M.messages },
      select: ({ messages }) => threadOf(messages),
    }),
  },
});

/**
 * The thread view: each changed tree is one more heard.
 */
export const ThreadViewMachine = machine(ThreadView, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [C.thread.change({ event: E.Heard })],
  on: { Heard: { updateMemory: ({ memory }) => ({ heard: memory.heard + 1 }) } },
}));

/**
 * The unread badge: the id of the oldest unread message, which its Schema requires non-empty, so an
 * inbox with nothing unread is its selector's defect until a message arrives; opening a message
 * named `spam` fails its mapper. Its issues clear when their source next succeeds.
 */
export const Unread = definition({
  id: "Workspace/Unread",
  persist: true,
  states: ["SHOWN"],
  events: {},
  internalEvents: { Opened: { id: Schema.String } },
  memory: { opened: Flow.initial(Schema.Array(Schema.String), []) },
  context: {
    oldest: Flow.context(Schema.NonEmptyString, {
      reads: { messages: Inbox.M.messages, read: Inbox.M.read },
      select: ({ messages, read }) => messages[read]?.id ?? "",
    }),
  },
});

/**
 * The unread badge: each new oldest unread message is opened, unless it is spam.
 */
export const UnreadMachine = machine(Unread, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [
    C.oldest.change({
      event: E.Opened.from((id) => {
        if (id === "spam") throw new Error("spam");

        return { id };
      }),
    }),
  ],
  on: {
    Opened: { updateMemory: ({ event, memory }) => ({ opened: [...memory.opened, event.id] }) },
  },
}));

/**
 * The archive: a long log of message ids, filled by an import. Three reactions hear each newest
 * message of the inbox, and each logs it beside the log's size, its last entry and whether it holds
 * the message, so memory moves on after every wave; kept across reloads.
 */
export const Archive = definition({
  id: "Workspace/Archive",
  persist: true,
  states: ["SHOWN"],
  events: { Import: { ids: Schema.Array(Schema.String) } },
  internalEvents: {
    SizeHeard: { newest: Schema.String },
    LastHeard: { newest: Schema.String },
    HeldHeard: { newest: Schema.String },
  },
  memory: { log: Flow.initial(Schema.Array(Schema.String), []) },
  context: {
    newest: Flow.context(Schema.String, {
      reads: { messages: Inbox.M.messages },
      select: ({ messages }) => messages.at(-1)?.id ?? "",
    }),
  },
});

const heard = (newest: string) => ({ newest });

/**
 * The archive: each newest message logs three entries, in the reactions' order.
 */
export const ArchiveMachine = machine(Archive, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [
    C.newest.change({ event: E.SizeHeard.from(heard) }),
    C.newest.change({ event: E.LastHeard.from(heard) }),
    C.newest.change({ event: E.HeldHeard.from(heard) }),
  ],
  on: {
    Import: { updateMemory: ({ event, memory }) => ({ log: [...memory.log, ...event.ids] }) },
    SizeHeard: {
      updateMemory: ({ event, memory }) => ({
        log: [...memory.log, `size ${event.newest}@${String(memory.log.length)}`],
      }),
    },
    LastHeard: {
      updateMemory: ({ event, memory }) => ({
        log: [...memory.log, `last ${event.newest}<${memory.log.at(-1) ?? ""}`],
      }),
    },
    HeldHeard: {
      updateMemory: ({ event, memory }) => ({
        log: [...memory.log, `held ${String(memory.log.includes(event.newest))}`],
      }),
    },
  },
}));
