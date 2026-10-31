// IDLE asks; ASKING waits for the stream's ending. Regenerate commits again while the reply streams: under
// `concurrency: "cancel"` that interrupts the Attempt on the wire, whose ending is evidence (rule 17), so no
// handler sees it and nothing is held (O8, T10). Stop cancels the Attempt; its `unknown { Cancelled }` is held
// for its own ending's turn only (`HeldThisTurn`), so no handler releases anything.
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7.1, 4.4.
import { deny, machine } from "flow-state";
import { Assistant } from "./assistant.definition.js";

export const AssistantMachine = machine(Assistant, ({ S, O }) => {
  const own = ({ memory }: { memory: { workspaceId: string; ticketId: string } }) => ({
    workspaceId: memory.workspaceId,
    ticketId: memory.ticketId,
  });

  return {
    default: S.IDLE,
    // Endings are handled at the root: an adopted ending (a reload while asking) is delivered to any leaf
    // of the arrival set (rule 20), and M6 4.4 puts them here.
    on: {
      Answered: {
        target: S.IDLE,
        updateMemory: ({ event }) => ({ last: event.text, incomplete: false }),
      },
      // Release the hold, then go idle: the cancel is applied in this turn, so an Ask from IDLE is
      // admitted. Key-less, as in the upload trait: nothing newer is waiting on this lane.
      Stopped: {
        target: S.IDLE,
        updateMemory: ({ event }) => ({ last: event.partial, incomplete: true }),
      },
      Cut: {
        target: S.IDLE,
        updateMemory: ({ event }) => ({ last: event.partial, incomplete: true }), // never shown as a success (SR30)
      },
      AskFailed: { target: S.IDLE, updateMemory: () => ({ refused: true }) },
    },
    states: {
      IDLE: {
        on: {
          Ask: {
            target: S.ASKING,
            guard: [({ event }) => event.prompt.trim() !== "" || deny("EmptyPrompt")],
            updateMemory: ({ event }) => ({ refused: false, prompt: event.prompt }),
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
          // On the wire: interrupts the fetch (its signal aborts), and the ending is `Stopped`.
          Stop: { target: "self", actions: [O.suggest.cancel(own)] },
          // A newer commit interrupts the one on the wire: its ending never arrives; this one's progress starts empty.
          Regenerate: {
            target: "self",
            actions: [
              O.suggest.commit(({ memory }) => ({
                workspaceId: memory.workspaceId,
                ticketId: memory.ticketId,
                prompt: memory.prompt,
              })),
            ],
          },
        },
      },
    },
  };
});
