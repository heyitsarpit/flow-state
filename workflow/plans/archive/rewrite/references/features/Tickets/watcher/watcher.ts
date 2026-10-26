// Alternate ticket watcher: redirects, ordered alternatives, reentry and a conditional root activity.
// A standalone example machine; it is not part of DeskApp.
import { Schema } from "effect";
import { can, definition, deny, machine, type ActorSnapshot } from "flow-state";
import { ticketById } from "../ticket.operations.js";

const Watcher = definition({
  id: "DispatchDesk/TicketWatcher",
  states: ["WATCHING", "PAUSED"],
  events: {
    Selected: { ticketId: Schema.String },
    Pause: {},
    Resume: {},
    Restart: {},
  },
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  memory: { workspaceId: Schema.String, ticketId: Schema.String, watching: Schema.Boolean },
  initial: ({ input }) => ({
    workspaceId: input.workspaceId,
    ticketId: input.ticketId,
    watching: true,
  }),
  operations: { ticketById },
});

export const WatcherMachine = machine(Watcher, ({ S, O }) => ({
  default: S.WATCHING,
  activities: {
    // A root activity lives for the actor's lifetime. Its parameters follow memory: selecting
    // another ticket changes the key and replaces the subscription; when false releases it.
    // This is what onMemory used to do (D16).
    ticket: O.ticketById.subscribe(
      ({ memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.ticketId }),
      { when: ({ memory }) => memory.watching },
    ),
  },
  states: {
    WATCHING: {
      redirect: { when: ({ memory }) => !memory.watching, target: S.PAUSED },
      on: {
        // Ordered alternatives: the first eligible transition wins.
        Selected: [
          {
            target: S.WATCHING,
            guard: ({ event }) => event.ticketId.trim() !== "" || deny("EmptySelection"),
            updateMemory: ({ event }) => ({ ticketId: event.ticketId }),
          },
          { target: S.PAUSED, updateMemory: () => ({ watching: false }) },
        ],
        Pause: { target: S.PAUSED, updateMemory: () => ({ watching: false }) },
        Restart: { target: S.WATCHING, reenter: S.WATCHING }, // Restarts WATCHING's own work.
      },
    },
    PAUSED: {
      on: { Resume: { target: S.WATCHING, updateMemory: () => ({ watching: true }) } },
    },
  },
}));

// Any captured snapshot answers eligibility; the same import works inside useView selectors.
export function isPauseEligible(snapshot: ActorSnapshot<typeof WatcherMachine>) {
  return can(snapshot, Watcher.E.Pause());
}
