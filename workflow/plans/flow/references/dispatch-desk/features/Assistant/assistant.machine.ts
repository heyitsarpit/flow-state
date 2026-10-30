// IDLE asks; ASKING waits for the stream's ending. Stop cancels the Attempt, and every unknown ending
// releases the lane's hold with a key-less `cancel` before it returns to IDLE, so the next Ask is
// admitted (`concurrency: "reject"` holds the lane until then; FC39, FC70). Demonstrates rules 13 and 24.
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7, 4.4.
import { deny, machine } from "flow-state";
import { Assistant } from "./assistant.definition.js";

export const AssistantMachine = machine(Assistant, ({ S, O }) => {
  const own = ({ memory }: { memory: { workspaceId: string; ticketId: string } }) => ({
    workspaceId: memory.workspaceId,
    ticketId: memory.ticketId,
  });

  return {
    default: S.IDLE,
    states: {
      IDLE: {
        on: {
          Ask: {
            target: S.ASKING,
            guard: [
              ({ event }) => event.prompt.trim() !== "" || deny("EmptyPrompt"),
              O.suggest.idle(own), // a held Stop has not been released: refuse rather than queue
            ],
            updateMemory: () => ({ refused: false }),
            actions: [
              O.suggest.commit(({ memory, event }) => ({
                workspaceId: memory.workspaceId,
                ticketId: memory.ticketId,
                prompt: event.prompt,
              })),
            ],
          },
        },
      },
      ASKING: {
        on: {
          // On the wire: interrupts the fetch (its signal aborts), and the ending is `Stopped`. The
          // lane stays held, under `reject`, until `Stopped` releases it.
          Stop: { target: "self", actions: [O.suggest.cancel(own)] },
          Answered: {
            target: S.IDLE,
            updateMemory: ({ event }) => ({ last: event.text, incomplete: false }),
          },
          // Release the hold, then go idle: the cancel is applied in this turn, so an Ask from IDLE is
          // admitted. Key-less, as in the upload trait: nothing newer is waiting on this lane.
          Stopped: {
            target: S.IDLE,
            updateMemory: ({ event }) => ({ last: event.partial, incomplete: true }),
            actions: [O.suggest.cancel],
          },
          Cut: {
            target: S.IDLE,
            updateMemory: ({ event }) => ({ last: event.partial, incomplete: true }), // never shown as a success (SR30)
            actions: [O.suggest.cancel],
          },
          AskFailed: { target: S.IDLE, updateMemory: () => ({ refused: true }) },
        },
      },
    },
  };
});
