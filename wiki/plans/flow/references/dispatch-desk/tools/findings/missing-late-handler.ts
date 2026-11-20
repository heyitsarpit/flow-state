// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: error Rule20  WrongLateHandler.Saved: `Saved` can arrive late after SAVING is left, and no strict ancestor handles it (rule 20)
import { definition, Flow, machine } from "flow-state";
import { TicketsDomain } from "../../features/Tickets/ticket.domain.js";

export const WrongLateHandler = definition({
  id: "Findings/WrongLateHandler",
  states: ["SAVING", "DONE"],
  events: { Close: {} },
  internalEvents: { Saved: {}, Failed: {}, Unsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({
    save: TicketsDomain.saveTitle.outcomes({
      success: E.Saved,
      failure: E.Failed,
      unknown: E.Unsure,
    }),
  }),
});

// WRONG: SAVING handles the endings, nothing above it does, and Close leaves SAVING. Add root handlers, even
// `{ target: "self" }`: a person decides what a late ending means.
export const WrongLateHandlerMachine = machine(WrongLateHandler, ({ S, O }) => ({
  default: S.SAVING,
  states: {
    SAVING: {
      on: {
        Saved: S.DONE,
        Failed: S.DONE,
        Unsure: { target: "self", actions: [O.save.cancel] },
        Close: S.DONE,
      },
    },
    DONE: {},
  },
}));

export const expected = { code: "Rule20", level: "error", at: "WrongLateHandler.Saved" } as const;
