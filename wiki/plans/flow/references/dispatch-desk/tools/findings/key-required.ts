// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: error KeyRequired  WrongKeyless.OPEN.on.Release: `O.save.cancel` without a key on a keyed operation, in the handler of `Release`, which no operation maps (rule 43)
import { definition, Flow, machine } from "flow-state";
import { TicketsDomain } from "../../features/Tickets/ticket.domain.js";

export const WrongKeyless = definition({
  id: "Findings/WrongKeyless",
  states: ["OPEN"],
  events: { Release: {} },
  internalEvents: { Done: {}, Unsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({
    save: TicketsDomain.saveTitle.outcomes({ success: E.Done, failure: E.Done, unknown: E.Unsure }),
  }),
});

export const WrongKeylessMachine = machine(WrongKeyless, ({ S, O }) => ({
  default: S.OPEN,
  on: { Done: { target: "self" }, Unsure: { target: "self", actions: [O.save.cancel] } }, // fine: `save` alone maps it
  states: {
    // WRONG: `Release` is a view's event; a key-less member names no lane here. Write `O.save.cancel(ticketKey)`.
    OPEN: { on: { Release: { target: "self", actions: [O.save.cancel] } } },
  },
}));

export const expected = {
  code: "KeyRequired",
  level: "error",
  at: "WrongKeyless.OPEN.on.Release",
} as const;
