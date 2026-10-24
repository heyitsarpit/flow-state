import { Result } from "effect";
import { can, definition, machine, type ActorSnapshot } from "flow-state";
import { ticketById } from "../ticket.operations.js";

/**
 * Alternate ticket watcher: redirects, ordered transitions, reentry, and independent declarations.
 * These machines are alternatives, not additional machines in DeskApp.
 */

const Watcher = definition({
  id: "DispatchDesk/TicketWatcher",
  states: ["WATCHING", "PAUSED"],
  events: {
    Selected: (ticketId: string) => ({ ticketId }),
    Pause: "bare",
    Resume: "bare",
    Restart: "bare",
  },
  memory: ({ input }: { input: { workspaceId: string; ticketId: string } }) => ({
    workspaceId: input.workspaceId,
    ticketId: input.ticketId,
    watching: true,
  }),
  operations: { ticketById },
});

export const WatcherMachine = Result.getOrThrow(
  machine(Watcher, ({ S, O, onMemory }) => {
    // One declaration returns one continuing plan or a sentinel, never a runtime-sized list.
    onMemory(({ memory }) => (memory.watching ? O.ticketById.subscribe(memory) : null));

    return {
      default: S.WATCHING,
      states: {
        WATCHING: {
          redirect: {
            when: ({ memory }) => !memory.watching,
            target: S.PAUSED,
          },
          on: {
            Selected: [
              {
                target: S.WATCHING,
                guard: ({ event }) => event.ticketId.trim().length > 0,
                updateMemory: ({ event }) => ({ ticketId: event.ticketId }),
              },
              { target: S.PAUSED, updateMemory: () => ({ watching: false }) },
            ],
            Pause: { target: S.PAUSED, updateMemory: () => ({ watching: false }) },
            Restart: { target: S.WATCHING, reenter: S.WATCHING },
          },
        },
        PAUSED: {
          on: { Resume: { target: S.WATCHING, updateMemory: () => ({ watching: true }) } },
        },
      },
    };
  }),
);

// A second authoring variant demonstrates selected-memory comparison without a comparator.
export const SelectedWatcherMachine = Result.getOrThrow(
  machine(Watcher, ({ S, O, onMemory }) => {
    onMemory.select(
      ({ memory }) => ({
        workspaceId: memory.workspaceId,
        ticketId: memory.ticketId,
        watching: memory.watching,
      }),
      (current, _previous) => {
        // _previous is undefined at activation/reentry, the preceding selected value afterward.
        return current.watching ? O.ticketById.subscribe(current) : false;
      },
    );

    return {
      default: S.WATCHING,
      states: {
        WATCHING: {
          on: { Pause: { target: S.PAUSED, updateMemory: () => ({ watching: false }) } },
        },
        PAUSED: {
          on: { Resume: { target: S.WATCHING, updateMemory: () => ({ watching: true }) } },
        },
      },
    };
  }),
);

export const watcherDefinition = Result.getOrThrow(Watcher);

// Call with a real compatible snapshot, for example one captured by a focused Story.
export function isPauseEligible(snapshot: ActorSnapshot<typeof WatcherMachine>) {
  return can(snapshot, Result.getOrThrow(watcherDefinition.E.Pause()));
}

/**
 * definition/machine return direct Results; machine never invokes its callback on failed input.
 * Bare event constructors take no arguments; callable declarations produce record payloads.
 * Events are nominal. Send successful envelopes, never constructor Results or structural copies.
 * The main example unwraps authored values at the application configuration boundary.
 *
 * S.OPEN.S.EDITING in features/Tickets/editor/editor.machine.ts is an exact leaf; S.OPEN is its compound boundary.
 * Root/compound defaults select direct children. One actor has one active leaf and shared memory.
 * CLOSED is ordinary state, not finality. Input initializes memory once; later behavior uses memory.
 *
 * Guard/updateMemory/actions use the same pre-turn cut. A partial memory patch merges once.
 * Redirects read candidate state/memory, never the causal event. No-handler/all-declining is silent.
 * Return a finite action or finite list from accepted events; invalid batches publish no valid prefix.
 * Equal continuing descriptor/key retains work and executable parameters. False/null releases one slot.
 * Compound activities survive descendant changes; exact containing reentry releases/restarts them.
 *
 * Timer example: core OPEN.timers.reminder targets E.ReminderDue after 60000 milliseconds.
 * A timer's event is a later FIFO turn, not an action executed inside the timer callback.
 * Timer get("reminder") has exact names; its snapshot accessor spelling is not fixed by the Plans.
 * idle: name; scheduled: name/state/generation/startedAt/dueAt; fired adds firedAt;
 * interrupt retains scheduled identity/deadline fields. Do not invent snapshot.timers here.
 *
 * Authority: ../../../../Statecharts.plan; context syntax also in ../../../../../archive/PublicSurface.plan.
 */
