// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: error Rule20  WrongNotSent.post (placement preview): `failure.NotSent` is not mapped, and the placement's subject path is not empty, so another path's commit can be declined `Rejected` (rules 20, 51)
import { Schema } from "effect";
import { definition, Flow, machine, trait } from "flow-state";
import { postComment } from "../../features/Comments/comments.contracts.js";

const Poster = trait(
  {
    id: "Findings/Poster",
    events: { Post: { text: Schema.String } },
    internalEvents: { Posted: {}, Rejected: {}, Unsure: Flow.uncertain({}) },
    memory: { ticketId: Flow.input(Schema.String) },
    // WRONG: no `NotSent`. Placed under `resetOn`, a commit from another subject's path is declined.
    operations: ({ E }) => ({
      post: postComment.outcomes({
        success: E.Posted,
        failure: { TicketNotFound: E.Rejected, CommentRejected: E.Rejected },
        unknown: E.Unsure,
      }),
    }),
  },
  ({ O }) => ({
    on: {
      Post: {
        target: "self",
        actions: [
          O.post.commit(({ memory, event }) => ({
            workspaceId: "north",
            ticketId: memory.ticketId,
            clientId: "x",
            text: event.text,
          })),
        ],
      },
      Posted: { target: "self" },
      Rejected: { target: "self" },
      Unsure: { target: "self", actions: [O.post.cancel] },
    },
  }),
);

export const WrongNotSent = definition({
  id: "Findings/WrongNotSent",
  states: ["OPEN"],
  events: { Preview: { ticketId: Schema.String } },
  memory: { previewId: Flow.initial(Schema.String, "") },
  traits: { preview: Poster },
});

export const WrongNotSentMachine = machine(WrongNotSent, ({ S }) => ({
  default: S.OPEN,
  traits: {
    preview: {
      input: ({ memory }) => ({ ticketId: memory.previewId }),
      resetOn: ({ memory }) => memory.previewId,
    },
  },
  on: { Preview: { target: "self", updateMemory: ({ event }) => ({ previewId: event.ticketId }) } },
  states: { OPEN: {} },
}));

export const expected = {
  code: "Rule20",
  level: "error",
  at: "WrongNotSent.post (placement preview)",
} as const;
