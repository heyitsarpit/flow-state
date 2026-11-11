// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: error SharedContract  WrongShared: two write operations, `rename` and `retitle`, on one contract `DispatchDesk/save-title` in one actor (rule 40)
import { definition } from "flow-state";
import { TicketsDomain } from "../../features/Tickets/ticket.domain.js";

// WRONG: one write contract, two operations. Two lanes for one thing would let `reject` pass two writes.
export const WrongShared = definition({
  id: "Findings/WrongShared",
  states: ["OPEN"],
  events: {},
  memory: {},
  operations: () => ({ rename: TicketsDomain.saveTitle, retitle: TicketsDomain.saveTitle }),
});

export const expected = { code: "SharedContract", level: "error", at: "WrongShared" } as const;
