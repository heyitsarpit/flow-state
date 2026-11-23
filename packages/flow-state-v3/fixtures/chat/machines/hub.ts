import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { history } from "../operations/reads.ts";
import { Account } from "./account.ts";

/**
 * The sidebar: the thread the user has open and its latest message as a preview, read from the
 * same history the thread itself shows.
 */
export const Hub = definition({
  id: "Chat/Hub",
  states: ["IDLE", "OPEN"],
  events: { Open: { thread: Schema.String } },
  internalEvents: { Previewed: { last: Schema.String }, PreviewFailed: {} },
  memory: {
    thread: Flow.initial(Schema.String, ""),
    preview: Flow.initial(Schema.String, ""),
  },
  context: { who: Flow.context(Account.M.who) },
  operations: ({ E }) => ({
    history: history.outcomes({
      success: E.Previewed.from((v) => ({ last: v.messages.at(-1)?.text ?? "" })),
      failure: {
        NoResponse: E.PreviewFailed,
        Defect: E.PreviewFailed,
        Interrupted: E.PreviewFailed,
      },
    }),
  }),
});

/**
 * Opening a thread, once signed in, reads its history for the preview; a newer open replaces the
 * older one's read.
 */
export const HubMachine = machine(Hub, ({ S, O }) => ({
  default: S.IDLE,
  on: {
    Open: {
      target: S.OPEN,
      guard: [({ context }) => (context.who ?? "") !== "" || deny("SignedOut")],
      updateMemory: ({ event }) => ({ thread: event.thread, preview: "" }),
      actions: [O.history.lookup(({ event }) => ({ thread: event.thread }))],
    },
    Previewed: { updateMemory: ({ event }) => ({ preview: event.last }) },
    PreviewFailed: { updateMemory: () => ({ preview: "offline" }) },
  },
  states: { IDLE: {}, OPEN: {} },
}));
