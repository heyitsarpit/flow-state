/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-call -- each line under an `@ts-expect-error` uses a read member or mapper context the Operations Spec adds and the package lacks, so its values type as any until it lands */
import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { history } from "../operations/reads.ts";
import { ask, deleteMessage, send } from "../operations/writes.ts";
import { Message } from "../services.ts";
import { Account } from "./account.ts";

/**
 * One chat thread, named by its id: its messages as last read, with the ones the user sent since
 * kept after them, each shown at once under its client id until the server's id replaces it, the undo links of deleted messages,
 * the assistant's last answer and a notice.
 */
export const Thread = definition({
  id: "Chat/Thread",
  persist: true,
  states: ["JOINING", "READY"],
  events: {
    Join: {},
    Send: { clientId: Schema.String, text: Schema.String },
    Resend: {},
    Delete: { messageId: Schema.String },
    LetGo: { messageId: Schema.String },
    Ask: { question: Schema.String },
  },
  internalEvents: {
    Joined: { messages: Schema.Array(Message) },
    JoinFailed: {},
    Sent: { clientId: Schema.String, id: Schema.String },
    SendUnsure: Flow.uncertain({}),
    Deleted: { messageId: Schema.String, undo: Schema.String },
    DeleteFailed: { messageId: Schema.String },
    DeleteUnsure: Flow.uncertain({}),
    Answered: { answer: Schema.String },
    AskRefused: { why: Schema.String },
    AskUnsure: Flow.uncertain({}),
  },
  memory: {
    thread: Flow.input(Schema.String),
    messages: Flow.initial(Schema.Array(Message), []),
    pending: Flow.initial(Schema.Array(Schema.String), []),
    // Each sent message's client id and the server's id for it, so an echo read back is dropped.
    sent: Flow.initial(Schema.Record(Schema.String, Schema.String), {}),
    undo: Flow.initial(Schema.Record(Schema.String, Schema.String), {}),
    answer: Flow.initial(Schema.String, ""),
    notice: Flow.initial(Schema.String, ""),
  },
  context: { author: Flow.context(Account.M.who) },
  operations: ({ E }) => ({
    history: history.outcomes({
      success: E.Joined.from((v) => ({ messages: v.messages })),
      failure: { NoResponse: E.JoinFailed, Defect: E.JoinFailed, Interrupted: E.JoinFailed },
    }),
    send: send.outcomes({
      success: E.Sent.from((v, { input }) => ({ clientId: input.clientId, id: v.id })),
      failure: {},
      unknown: E.SendUnsure,
    }),
    deleteMessage: deleteMessage.outcomes({
      // The undo link is kept as its path; a link the server garbled throws, as `URL` does.
      success: E.Deleted.from((v) => ({
        messageId: v.messageId,
        undo: new URL(v.undo).pathname,
      })),
      failure: { Gone: E.DeleteFailed.from((_, { key }) => ({ messageId: key.messageId })) },
      unknown: E.DeleteUnsure,
    }),
    ask: ask.outcomes({
      success: E.Answered.from((v) => ({ answer: v.answer })),
      failure: { Busy: E.AskRefused.from(() => ({ why: "busy" })) },
      notSent: E.AskRefused.from((n) => ({ why: n.why })),
      unknown: E.AskUnsure,
    }),
  }),
});

const byThread = ({ memory }: { readonly memory: typeof Thread.Memory.Type }) => ({
  thread: memory.thread,
});

/**
 * Joining reads the thread's history, again on each join; once joined, a send shows the message
 * at once and posts it, a resend tries an unsure send again at most twice, a delete removes a
 * message the server confirms, letting go stops waiting on a delete, and a question goes to the
 * assistant.
 */
export const ThreadMachine = machine(Thread, ({ S, O }) => ({
  default: S.JOINING,
  on: {
    Join: { actions: [O.history.lookup(({ memory }) => ({ thread: memory.thread }))] },
    Joined: {
      target: S.READY,
      updateMemory: ({ memory, event }) => {
        const read = event.messages.filter((m) => memory.sent[m.id] === undefined);

        return {
          messages: [...read, ...memory.messages.filter((m) => !read.some((s) => s.id === m.id))],
        };
      },
    },
    JoinFailed: { updateMemory: () => ({ notice: "offline" }) },
  },
  states: {
    JOINING: {},
    READY: {
      on: {
        Send: {
          guard: [({ context }) => (context.author ?? "") !== "" || deny("SignedOut")],
          updateMemory: ({ memory, event, context }) => ({
            messages: [
              ...memory.messages,
              { id: event.clientId, author: context.author ?? "", text: event.text },
            ],
            pending: [...memory.pending, event.clientId],
          }),
          actions: [
            O.send.commit(
              ({ memory, event }) => ({
                thread: memory.thread,
                clientId: event.clientId,
                text: event.text,
              }),
              // @ts-expect-error Plan Operations O5: a commit's `optimistic` value on a read
              {
                // The echo: the thread's history shows the message this turn added under its client
                // id at once.
                // @ts-expect-error Plan Operations O5: `optimistic` reads the starting turn's memory and event
                optimistic: ({ memory, event }) => ({
                  history: {
                    key: { thread: memory.thread },
                    // @ts-expect-error Plan Operations O5: an optimistic value updates the read's current data
                    data: (current) => ({
                      messages: [
                        ...current.messages,
                        // @ts-expect-error Plan Operations O5: the starting turn's memory is typed once `optimistic` is
                        ...memory.messages.filter((m) => m.id === event.clientId),
                      ],
                    }),
                  },
                }),
              },
            ),
          ],
        },
        Sent: {
          updateMemory: ({ memory, event }) => ({
            messages: memory.messages.map((m) =>
              m.id === event.clientId ? { ...m, id: event.id } : m,
            ),
            pending: memory.pending.filter((c) => c !== event.clientId),
            sent: { ...memory.sent, [event.clientId]: event.id },
          }),
        },
        SendUnsure: { updateMemory: () => ({ notice: "not sure it sent" }) },
        Resend: [
          {
            guard: [O.send.retryable(byThread, { times: 2 })],
            updateMemory: () => ({ notice: "" }),
            actions: [O.send.retry(byThread)],
          },
          { updateMemory: () => ({ notice: "gave up resending" }) },
        ],
        Delete: {
          actions: [
            O.deleteMessage.commit(({ memory, event }) => ({
              thread: memory.thread,
              messageId: event.messageId,
            })),
          ],
        },
        Deleted: {
          updateMemory: ({ memory, event }) => ({
            messages: memory.messages.filter((m) => m.id !== event.messageId),
            undo: { ...memory.undo, [event.messageId]: event.undo },
          }),
        },
        DeleteFailed: { updateMemory: ({ event }) => ({ notice: `${event.messageId} was gone` }) },
        DeleteUnsure: { updateMemory: () => ({ notice: "not sure it was deleted" }) },
        LetGo: {
          actions: [
            O.deleteMessage.cancel(({ memory, event }) => ({
              thread: memory.thread,
              messageId: event.messageId,
            })),
          ],
        },
        Ask: {
          actions: [
            O.ask.commit(({ memory, event }) => ({
              thread: memory.thread,
              question: event.question,
            })),
          ],
        },
        Answered: { updateMemory: ({ event }) => ({ answer: event.answer }) },
        AskRefused: { updateMemory: ({ event }) => ({ notice: `assistant ${event.why}` }) },
        AskUnsure: { updateMemory: () => ({ notice: "the assistant may have answered" }) },
      },
    },
  },
}));
