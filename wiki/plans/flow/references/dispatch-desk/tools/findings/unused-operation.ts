// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: warning UnusedOperation  WrongUnused.archive: `archive` is declared but no machine commits, retries or reads it
import { definition, machine } from "flow-state";
import { TicketsDomain } from "../../features/Tickets/ticket.domain.js";

export const WrongUnused = definition({
  id: "Findings/WrongUnused",
  states: ["OPEN"],
  events: {},
  memory: {},
  operations: () => ({ archive: TicketsDomain.archive }), // WRONG: nothing uses it
});

export const WrongUnusedMachine = machine(WrongUnused, ({ S }) => ({
  default: S.OPEN,
  states: { OPEN: {} },
}));

export const expected = {
  code: "UnusedOperation",
  level: "warning",
  at: "WrongUnused.archive",
} as const;
