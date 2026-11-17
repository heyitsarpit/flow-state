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
    latest: Inbox.Provider.select((s) =>
      Option.getOrUndefined(Option.map(newest(s.memory.messages), arrivedAt)),
    ),
    unread: Inbox.Provider.select(
      (s) => (s.memory.messages.length - s.memory.read) / s.memory.messages.length,
    ),
    owed: Inbox.Provider.select((s) => -(s.memory.messages.length - s.memory.read)),
    bySender: Inbox.Provider.select((s) => countsBySender(s.memory.messages)),
    senders: Inbox.Provider.select((s) => new Set(s.memory.messages.map((m) => m.from))),
    writers: Inbox.Provider.select((s) => new Set(s.memory.messages.map((m) => m.from)).size),
    envelope: Inbox.Provider.select((s) =>
      Option.getOrUndefined(
        Option.map(newest(s.memory.messages), (m) => new Envelope({ from: m.from, at: m.at })),
      ),
    ),
    first: Inbox.Provider.select((s) =>
      Option.map(Option.fromUndefinedOr(s.memory.messages[0]), (m) => m.from),
    ),
    summary: Inbox.Provider.select((s) => ({
      latest: Option.map(newest(s.memory.messages), arrivedAt),
      ids: idsBySender(s.memory.messages),
    })),
  },
});

/**
 * The digest: each changed slot is one more heard; the inbox turning busy or quiet against the
 * digest's own threshold is one more busy.
 */
export const DigestMachine = machine(Digest, ({ S, E }) => ({
  default: S.SHOWN,
  onContext: [
    { select: ({ context }) => context.latest, event: E.Heard },
    { select: ({ context }) => context.unread, event: E.Heard },
    { select: ({ context }) => context.owed, event: E.Heard },
    { select: ({ context }) => context.bySender, event: E.Heard },
    { select: ({ context }) => context.senders, event: E.Heard },
    { select: ({ context }) => context.envelope, event: E.Heard },
    { select: ({ context }) => context.first, event: E.Heard },
    { select: ({ context }) => context.summary, event: E.Heard },
    { select: ({ context, memory }) => context.writers >= memory.quietFrom, event: E.Busy },
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
  context: { thread: Inbox.Provider.select((s) => threadOf(s.memory.messages)) },
});

/**
 * The thread view: each changed tree is one more heard.
 */
export const ThreadViewMachine = machine(ThreadView, ({ S, E }) => ({
  default: S.SHOWN,
  onContext: [{ select: ({ context }) => context.thread, event: E.Heard }],
  on: { Heard: { updateMemory: ({ memory }) => ({ heard: memory.heard + 1 }) } },
}));
