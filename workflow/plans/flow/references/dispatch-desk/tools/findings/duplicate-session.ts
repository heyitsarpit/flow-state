// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: warning DuplicateSession  WrongSessions.viewers, WrongSessions.watchers: two operations on `DispatchDesk/ticket-viewers` can be placed at once with equal keys.
import { definition, machine } from "flow-state";
import { ticketViewers } from "../../features/Presence/presence.contracts.js";

// WRONG: two sessions of one stream on one key in one actor, both live: twice the traffic.
export const WrongSessions = definition({
  id: "Findings/WrongSessions",
  states: ["OPEN"],
  events: {},
  memory: {},
  operations: () => ({ viewers: ticketViewers, watchers: ticketViewers }),
});

export const WrongSessionsMachine = machine(WrongSessions, ({ S, O }) => ({
  default: S.OPEN,
  activities: [
    O.viewers.subscribe(() => ({ workspaceId: "north", ticketId: "T-42" })),
    O.watchers.subscribe(() => ({ workspaceId: "north", ticketId: "T-42" })),
  ],
  states: { OPEN: {} },
}));

export const expected = {
  code: "DuplicateSession",
  level: "warning",
  at: "WrongSessions.viewers, WrongSessions.watchers",
} as const;
