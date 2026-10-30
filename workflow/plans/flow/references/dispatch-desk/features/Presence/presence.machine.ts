// WATCHING places the session; an ended session waits in RETRY_WAIT with a doubling delay that only a
// healthy minute resets (M6 2.7, RV1 M9). Demonstrates rules 25 and 50 (only the fragment subscribes).
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7, S1–S10.
import { Duration } from "effect";
import { machine } from "flow-state";
import { MAX_REOPEN_MS, MIN_REOPEN_MS, Presence } from "./presence.definition.js";

export const PresenceMachine = machine(Presence, ({ S, E, O }) => ({
  default: S.WATCHING,
  states: {
    WATCHING: {
      activities: [
        O.viewers.subscribe(({ memory }) => ({
          workspaceId: memory.workspaceId,
          ticketId: memory.ticketId,
        })),
      ],
      // The backoff resets only after the session stayed registered for a minute, so a server that
      // accepts and drops again and again keeps growing the delay.
      schedules: { healthy: { schedule: "1 minute", send: E.Healthy } },
      on: {
        Healthy: {
          target: "self",
          guard: [({ operations }) => operations.viewers?.connection === "Live"], // accepted: connection
          updateMemory: () => ({ reopenInMs: MIN_REOPEN_MS }),
        },
        Ended: {
          target: S.RETRY_WAIT,
          updateMemory: ({ memory }) => ({
            reopenInMs: Math.min(MAX_REOPEN_MS, memory.reopenInMs * 2),
          }),
        },
        SignedOut: S.SIGNED_OUT,
      },
    },
    RETRY_WAIT: {
      schedules: {
        reopen: { schedule: ({ memory }) => Duration.millis(memory.reopenInMs), send: E.Reopen },
      },
      on: { Reopen: S.WATCHING, SignedOut: S.SIGNED_OUT },
    },
    SIGNED_OUT: {}, // the Session actor closes the panel; nothing to re-open
  },
}));
