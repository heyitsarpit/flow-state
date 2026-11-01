// The visit's behaviour: the wizard's filling (its input, its guard port, its callbacks, its two exits) and every
// write it asks for.
import { deny, machine } from "flow-state";
import { emptyDraft, Visit } from "./visit.definition.js";

type Memory = typeof Visit.Memory.Type;

const ticket = ({ memory }: { memory: Memory }) => ({
  workspaceId: memory.workspaceId,
  ticketId: memory.ticketId,
});

export const VisitMachine = machine(Visit, ({ S, E, O }) => ({
  default: S.ON_SITE,

  // Every ending, wherever it lands: a new incarnation adopts these lanes in any leaf (rule 44).
  on: {
    Reserved: { target: "self" },
    ReserveRefused: { target: "self", updateMemory: ({ event }) => ({ notice: event.reason }) },
    ReserveUnsure: [
      { target: "self", guard: [O.reserve.retryable({ times: 1 })], actions: [O.reserve.retry] },
      { target: "self", actions: [O.reserve.cancel] }, // the release on abandon gives back whatever it held
    ],
    Released: { target: "self", updateMemory: () => ({ releasing: [] }) },
    ReleaseUnsure: [
      { target: "self", guard: [O.release.retryable({ times: 3 })], actions: [O.release.retry] },
      {
        target: "self",
        updateMemory: () => ({ notice: "Parts may still be held: tell the depot" }),
        actions: [O.release.cancel],
      },
    ],
    // Late (the technician pressed Done before the answer) or adopted: the explicit "nothing to move" (rule 20).
    Resolved: { target: "self", updateMemory: () => ({ notice: "Resolved" }) },
    ResolveRefused: { target: "self", updateMemory: ({ event }) => ({ notice: event.reason }) },
    // The hold (rule 45): kept until RESOLVED's "Check again" re-sends it, wherever it was adopted.
    ResolveUnsure: {
      target: "self",
      updateMemory: () => ({ notice: "We couldn't confirm the resolution" }),
    },
  },

  states: {
    ON_SITE: {
      on: {
        StartResolve: S.RESOLVING,
      },
    },

    // The wizard's filling, on its state (2.3). Its input seeds the draft an earlier entry handed back.
    RESOLVING: {
      input: ({ memory }) => ({ draft: memory.draft }),
      guards: {
        canResolve: ({ memory, context }) =>
          memory.assignee === context.me || deny("NotAssignedToYou"),
      },
      callbacks: {
        onProgressed: { updateMemory: ({ payload }) => ({ step: payload.step }) },
        // A part added: the host reserves it, a host write (the wizard may not own one, rule 48).
        onPartAdded: {
          actions: [
            O.reserve.commit(({ memory, payload }) => ({
              ...ticket({ memory }),
              partNumber: payload.partNumber,
            })),
          ],
        },
        onDraft: { updateMemory: ({ payload }) => ({ draft: payload.draft }) },
      },
      exits: {
        // The resolution leaves the wizard and is committed in the same turn. RESOLVED owns it, so its endings are
        // current there; the signature's own upload, a bare write inside the wizard, may still be finishing (F11).
        Resolved: {
          target: S.RESOLVED,
          updateMemory: () => ({ draft: emptyDraft }),
          actions: [
            O.resolve.commit(({ memory, payload }) => ({
              ...ticket({ memory }),
              reason: payload.resolution.reason,
              parts: payload.resolution.parts,
              signatureRef: payload.resolution.signatureRef,
            })),
          ],
        },
        // Compensation (O20): the parts reserved for a resolution nobody finished go back on the shelf.
        Abandoned: {
          target: S.RELEASING,
          updateMemory: ({ payload }) => ({ draft: emptyDraft, releasing: payload.parts }),
          actions: [
            O.release.commit(({ memory, payload }) => ({
              ...ticket({ memory }),
              partNumbers: payload.parts,
            })),
          ],
        },
      },
      on: {
        // The step bar raises the wizard's host event (F16); the wizard decides where it may go.
        StepChosen: {
          target: "self",
          raise: [E.RESOLVING.JumpTo.from(({ event }) => ({ step: event.step }))],
        },
        // Leaving mid-resolve abandons the wizard: its `whenAbandoned` hands the draft back in this turn, and the parts
        // it held are released by the same transition.
        CalledAway: {
          target: S.ON_SITE,
          actions: [
            O.release.commit(({ memory }) => ({
              ...ticket({ memory }),
              partNumbers: memory.RESOLVING?.parts.map((p) => p.partNumber) ?? [],
            })),
          ],
        },
      },
    },

    RESOLVED: {
      on: {
        // Done: back to the ticket. The resolution's ending, if it has not landed, is then late: it routes to the
        // root, whose handlers do not move (LateMayNotLeave cannot arise, O10).
        Done: S.ON_SITE,
        // Resolution refused (no signature): back into the wizard at sign-off, with what was there.
        ResolveRefused: {
          target: S.RESOLVING,
          updateMemory: ({ event }) => ({ notice: event.reason }),
        },
        CheckAgain: [
          {
            target: "self",
            guard: [O.resolve.retryable(ticket, { times: 3 })],
            actions: [O.resolve.retry(ticket)],
          },
          {
            target: "self",
            updateMemory: () => ({ notice: "Still unconfirmed. Call the desk." }),
            actions: [O.resolve.cancel(ticket)],
          },
        ],
      },
    },

    RELEASING: { on: { Released: { target: S.ON_SITE, updateMemory: () => ({ releasing: [] }) } } },
  },
}));
