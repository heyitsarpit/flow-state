// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: warning DuplicateListen  TicketFeed.changes, WrongListenTwice.changes: two `listen` sessions on `DispatchDesk/ticket-changes` for one key in one Runtime (M6-D6).
import { definition, machine } from "flow-state";
import { TicketFeed } from "../../features/Tickets/feed/feed.domain.js";

// WRONG: the desk's feed already listens to this workspace; a second actor listening too doubles
// every push and every gap.
export const WrongListenTwice = definition({
  id: "Findings/WrongListenTwice",
  states: ["OPEN"],
  events: {},
  internalEvents: {},
  memory: {},
  operations: () => ({ changes: TicketFeed.changes }),
});

export const WrongListenTwiceMachine = machine(WrongListenTwice, ({ S, O }) => ({
  default: S.OPEN,
  activities: [O.changes.subscribe(() => ({ workspaceId: "north" }))],
  states: { OPEN: {} },
}));

export const expected = {
  code: "DuplicateListen",
  level: "warning",
  at: "TicketFeed.changes, WrongListenTwice.changes",
} as const;
