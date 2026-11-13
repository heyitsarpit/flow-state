// The assistant for one ticket: IDLE until asked, ASKING while the reply streams. Demonstrates rule 13
// (`unknown` mapped by tag), `concurrency: "cancel"` (Regenerate interrupts the reply on the wire; its ending is
// evidence, never an event) and a streamed write's `progress`.
// How this module is different (COVERAGE.md 5.1): the desk's only `cancel` lane and only streamed write.
// md revision 7.1, 4.4.
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { suggestReply } from "./assistant.contracts.js";

export const Assistant = definition({
  id: "DispatchDesk/Assistant",
  states: ["IDLE", "ASKING"],
  events: {
    Ask: { prompt: Schema.String },
    Regenerate: {},
    Stop: {},
  },
  internalEvents: {
    Answered: { text: Schema.String },
    AskFailed: {}, // a 4xx: the assistant will not answer. Nothing was generated.
    Stopped: { partial: Schema.String }, // the user's Stop; the ending is `unknown { Cancelled }`
    Cut: { partial: Schema.String }, // the answer ended early and may be incomplete
  },
  memory: {
    workspaceId: Flow.input(Schema.String),
    ticketId: Flow.input(Schema.String),
    last: Flow.initial(Schema.String, ""), // the last text shown: whole, or the partial of a stop or a cut
    incomplete: Flow.initial(Schema.Boolean, false),
    prompt: Flow.initial(Schema.String, ""), // what Regenerate asks again
    refused: Flow.initial(Schema.Boolean, false),
  },
  operations: ({ E }) => ({
    // Attempt's last progress through `ctx.progress`.
    suggest: suggestReply.outcomes({
      success: E.Answered.from((reply) => ({ text: reply.text })),
      failure: { Refused: E.AskFailed, NotSent: E.AskFailed }, // NotSent: a stop before the request left
      unknown: {
        Cancelled: E.Stopped.from((_r, { progress }) => ({ partial: progress?.text ?? "" })),
        NoResponse: E.Cut.from((_r, { progress }) => ({ partial: progress?.text ?? "" })),
        Stalled: E.Cut.from((_r, { progress }) => ({ partial: progress?.text ?? "" })),
        Truncated: E.Cut.from((_r, { progress }) => ({ partial: progress?.text ?? "" })),
        ServerError: E.Cut.from(() => ({ partial: "" })),
        // A reload while asking: progress is never persisted, so there is no partial text (FC70).
        Restored: E.Cut.from(() => ({ partial: "" })),
        Interrupted: E.Cut.from(() => ({ partial: "" })),
        Defect: E.Cut.from(() => ({ partial: "" })),
        StillUnknown: E.Cut.from(() => ({ partial: "" })),
      },
    }),
  }),
});
