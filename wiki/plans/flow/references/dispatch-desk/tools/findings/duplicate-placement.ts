// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: error DuplicatePlacement  WrongPlacement.list: `list` is placed in ROOT and in OPEN, which can be active together (rule 41)
import { definition, machine } from "flow-state";
import { TicketsDomain } from "../../features/Tickets/ticket.domain.js";

export const WrongPlacement = definition({
  id: "Findings/WrongPlacement",
  states: ["OPEN", "CLOSED"],
  events: {},
  memory: {},
  operations: () => ({ list: TicketsDomain.list }),
});

// WRONG: one live operation placed twice where both can be active. Place it once, or make the placements exclusive
// with state tokens in `when`.
export const WrongPlacementMachine = machine(WrongPlacement, ({ S, O }) => ({
  default: S.OPEN,
  activities: [O.list.subscribe(() => ({ workspaceId: "north" }))],
  states: {
    OPEN: { activities: [O.list.subscribe(() => ({ workspaceId: "north" }))] },
    CLOSED: {},
  },
}));

export const expected = {
  code: "DuplicatePlacement",
  level: "error",
  at: "WrongPlacement.list",
} as const;
