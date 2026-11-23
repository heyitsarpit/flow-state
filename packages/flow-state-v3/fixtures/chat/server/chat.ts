import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { Busy, Gone, Message, NoResponse, Removed } from "../services.ts";

const ChatTruth = Schema.Struct({
  threads: Schema.Record(Schema.String, Schema.Array(Message)),
  sent: Schema.Record(Schema.String, Schema.String),
  nextId: Schema.Number,
  undoLinks: Schema.Boolean,
  thinking: Schema.Array(Schema.String),
});

type Truth = typeof ChatTruth.Type;

const messagesOf = (truth: Truth, thread: string) => truth.threads[thread] ?? [];

/**
 * The chat server's truth: each thread's messages, oldest first; one message per idempotency key,
 * replayed for a key it has seen; whether delete answers carry a working undo link; the threads
 * whose assistant is answering. `general` starts with two messages from `grace`.
 */
export const Chat = Fake.server("Chat", {
  truth: ChatTruth,
  initial: {
    threads: {
      general: [
        { id: "m-1", author: "grace", text: "morning" },
        { id: "m-2", author: "grace", text: "standup at ten" },
      ],
    },
    sent: {},
    nextId: 3,
    undoLinks: true,
    thinking: [],
  },
  endpoints: {
    history: Fake.call({
      request: { thread: Schema.String },
      success: Schema.Struct({ messages: Schema.Array(Message) }),
      failure: Schema.Never,
      handle: (truth: Truth, { thread }) => ({
        truth,
        exit: Exit.succeed({ messages: messagesOf(truth, thread) }),
      }),
    }),
    send: Fake.call({
      request: {
        thread: Schema.String,
        clientId: Schema.String,
        text: Schema.String,
        key: Schema.String,
      },
      success: Schema.Struct({ id: Schema.String }),
      failure: Schema.Never,
      handle: (truth: Truth, { thread, text, key }) => {
        const known = truth.sent[key];

        if (known !== undefined) return { truth, exit: Exit.succeed({ id: known }) };

        const id = `m-${String(truth.nextId)}`;

        return {
          truth: {
            ...truth,
            threads: {
              ...truth.threads,
              [thread]: [...messagesOf(truth, thread), { id, author: "ada", text }],
            },
            sent: { ...truth.sent, [key]: id },
            nextId: truth.nextId + 1,
          },
          exit: Exit.succeed({ id }),
        };
      },
    }),
    remove: Fake.call({
      request: { thread: Schema.String, messageId: Schema.String, key: Schema.String },
      success: Removed,
      failure: Gone,
      handle: (truth: Truth, { thread, messageId }) => {
        if (!messagesOf(truth, thread).some((m) => m.id === messageId))
          return { truth, exit: Exit.fail(new Gone()) };

        return {
          truth: {
            ...truth,
            threads: {
              ...truth.threads,
              [thread]: messagesOf(truth, thread).filter((m) => m.id !== messageId),
            },
          },
          exit: Exit.succeed({
            messageId,
            undo: truth.undoLinks ? `https://chat.example/undo/${messageId}` : "undo unavailable",
          }),
        };
      },
    }),
    ask: Fake.call({
      request: { thread: Schema.String, question: Schema.String },
      success: Schema.Struct({ answer: Schema.String }),
      failure: Busy,
      handle: (truth: Truth, { thread, question }) =>
        truth.thinking.includes(thread)
          ? { truth, exit: Exit.fail(new Busy()) }
          : { truth, exit: Exit.succeed({ answer: `About "${question}": ask in standup.` }) },
    }),
  },
  controls: {
    post: Fake.control(
      { thread: Schema.String, author: Schema.String, text: Schema.String },
      (truth: Truth, { thread, author, text }) => ({
        ...truth,
        threads: {
          ...truth.threads,
          [thread]: [
            ...messagesOf(truth, thread),
            { id: `m-${String(truth.nextId)}`, author, text },
          ],
        },
        nextId: truth.nextId + 1,
      }),
    ),
    undoLinks: Fake.control({ working: Schema.Boolean }, (truth: Truth, { working }) => ({
      ...truth,
      undoLinks: working,
    })),
    thinking: Fake.control({ thread: Schema.String }, (truth: Truth, { thread }) => ({
      ...truth,
      thinking: [...truth.thinking, thread],
    })),
  },
  lost: () => new NoResponse(),
});
