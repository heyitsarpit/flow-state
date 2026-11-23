// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: warning UnresolvedHold  WrongReset.preview (rule 56): `Preview` writes the `resetOn` value with no `Poster.O.post.idle` guard: a held post for the old subject may have no incarnation to adopt it
import { Schema } from "effect";
import { definition, Flow, machine } from "flow-state";
import { Comments } from "../../features/Comments/comments.trait.js";

export const WrongReset = definition({
  id: "Findings/WrongReset",
  states: ["OPEN"],
  events: { Preview: { ticketId: Schema.String } },
  memory: { previewId: Flow.initial(Schema.String, "") },
  traits: { preview: Comments },
});

// WARNING (rule 56): changing the reset value with no `Comments.O.post.idle` guard. The queue accepts this on
// purpose (its preview walks "A, B, A"); here it is the bare case.
export const WrongResetMachine = machine(WrongReset, ({ S }) => ({
  default: S.OPEN,
  traits: {
    preview: {
      input: ({ memory }) => ({ workspaceId: "north", ticketId: memory.previewId }),
      resetOn: ({ memory }) => memory.previewId,
    },
  },
  on: { Preview: { target: "self", updateMemory: ({ event }) => ({ previewId: event.ticketId }) } },
  states: { OPEN: {} },
}));

export const expected = {
  code: "UnresolvedHold",
  level: "warning",
  at: "WrongReset.preview (rule 56)",
} as const;
