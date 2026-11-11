// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: error LateMayNotLeave  WrongLate.on.Saved: a late `Saved` (after SAVING was left) targets CLOSED, which would leave LOADING's pending `ticket` lookup (rule 15)
import { definition, Flow, machine } from "flow-state";
import { TicketsDomain } from "../../features/Tickets/ticket.domain.js";
import { TicketRow } from "../../features/Tickets/types.js";

export const WrongLate = definition({
  id: "Findings/WrongLate",
  states: ["SAVING", "LOADING", "CLOSED"],
  events: { Save: {}, Load: {} },
  internalEvents: {
    Saved: { ticket: TicketRow },
    Failed: {},
    Unsure: Flow.uncertain({}),
    Loaded: {},
    LoadFailed: {},
  },
  memory: {},
  operations: ({ E }) => ({
    save: TicketsDomain.saveTitle.outcomes({
      success: E.Saved.from((ticket) => ({ ticket })),
      failure: E.Failed,
      unknown: E.Unsure,
    }),
    ticket: TicketsDomain.ticketById.outcomes({ success: E.Loaded, failure: E.LoadFailed }),
  }),
});

export const WrongLateMachine = machine(WrongLate, ({ S, O }) => ({
  default: S.SAVING,
  on: {
    // WRONG: a late turn's only alternative leaves a state that owns another pending call. End in one that stays.
    Saved: S.CLOSED,
    Failed: { target: "self" },
    Unsure: { target: "self", actions: [O.save.cancel] },
    Loaded: { target: "self" },
    LoadFailed: { target: "self" },
  },
  states: {
    SAVING: {
      on: {
        Save: {
          target: "self",
          actions: [
            O.save.commit(() => ({ workspaceId: "north", ticketId: "T-42", title: "Late" })),
          ],
        },
        Load: {
          target: S.LOADING,
          actions: [O.ticket.lookup(() => ({ workspaceId: "north", ticketId: "T-42" }))],
        },
      },
    },
    LOADING: {},
    CLOSED: {},
  },
}));

export const expected = {
  code: "LateMayNotLeave",
  level: "error",
  at: "WrongLate.on.Saved",
} as const;
