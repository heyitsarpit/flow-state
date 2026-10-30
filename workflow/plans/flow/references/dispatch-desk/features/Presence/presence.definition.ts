// One small actor per ticket that watches who has it open. Demonstrates rule 25 (a machine-level re-open
// is a state and a schedule), rule 47 (named operations) and M6 2.6/2.7: a state feed needs no handlers for
// its data (that is the row, K3), so only the ending is mapped.
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7.1, S1–S10.
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { ticketViewers } from "./presence.contracts.js";

export const MIN_REOPEN_MS = 1_000;
export const MAX_REOPEN_MS = 30_000;

export const Presence = definition({
  id: "DispatchDesk/Presence",
  states: ["WATCHING", "RETRY_WAIT", "SIGNED_OUT"],
  events: {},
  internalEvents: { Ended: {}, SignedOut: {}, Reopen: {}, Healthy: {} },
  memory: {
    workspaceId: Flow.input(Schema.String),
    ticketId: Flow.input(Schema.String),
    reopenInMs: Flow.initial(Schema.Int, MIN_REOPEN_MS), // in memory, so a reload keeps the backoff
  },
  operations: ({ E }) => ({
    // The plan calls this operation bare. It is bare for `value`: members live in the row and no event
    // carries them. `failure` is still mapped, because RETRY_WAIT needs an event to leave WATCHING.
    // M6 2.7: a state feed's `value` is optional and `failure` is required when anything is mapped, so
    // mapping `failure` alone is allowed.
    viewers: ticketViewers.outcomes({
      failure: {
        SocketDropped: E.Ended,
        SignedOut: E.SignedOut,
        Closed: E.Ended,
        Overflow: E.Ended,
        Defect: E.Ended,
        Interrupted: E.Ended,
      },
    }),
  }),
});
