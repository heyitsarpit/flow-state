// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: error UnresolvedHold  WrongHold.save: a `reject` write maps `success` and `failure` but not `unknown`: an unknown answer would hold the lane with no owner (rule 45)
import { Schema } from "effect";
import { definition, machine } from "flow-state";
import { TicketsDomain } from "../../features/Tickets/ticket.domain.js";
import { TicketRow } from "../../features/Tickets/types.js";

export const WrongHold = definition({
  id: "Findings/WrongHold",
  states: ["OPEN"],
  events: { Save: { title: Schema.String } },
  internalEvents: { Saved: { ticket: TicketRow }, Failed: {} },
  memory: {},
  operations: ({ E }) => ({
    // WRONG: no `unknown:`. `reject` holds an unknown, so something must retry or release it.
    save: TicketsDomain.saveTitle.outcomes({
      success: E.Saved.from((ticket) => ({ ticket })),
      failure: {
        TitleRejected: E.Failed,
        TicketNotFound: E.Failed,
        TicketLocked: E.Failed,
        NotSent: E.Failed,
      },
    }),
  }),
});

export const WrongHoldMachine = machine(WrongHold, ({ S, O }) => ({
  default: S.OPEN,
  on: { Saved: { target: "self" }, Failed: { target: "self" } },
  states: {
    OPEN: {
      on: {
        Save: {
          target: "self",
          actions: [
            O.save.commit(({ event }) => ({
              workspaceId: "north",
              ticketId: "T-42",
              title: event.title,
            })),
          ],
        },
      },
    },
  },
}));

export const expected = { code: "UnresolvedHold", level: "error", at: "WrongHold.save" } as const;
