// The panel's behaviour. Its reads live at the root for the actor's life; the pulse sessions follow `shown`, one per
// key: a technician who leaves the team's list releases its session, one who joins opens one (rule 23).
// Pending merge 6 for the pulse placement.
import { machine, send } from "flow-state";
import { Toasts } from "../../Toasts/toasts.definition.js";
import { ToastsRef } from "../../Toasts/toasts.ref.js";
import { breaksOf } from "./technicians.contracts.js";
import { Technicians } from "./technicians.definition.js";

export const TechniciansMachine = machine(Technicians, ({ S, O }) => {
  const toast = (text: (event: { technicianId: string }) => string) =>
    send(
      ToastsRef,
      Toasts.E.Push.from(({ event }) => ({ text: text(event) })),
    );

  return {
    default: S.PANEL,
    activities: [
      O.roster.subscribe(({ memory }) => ({
        workspaceId: memory.workspaceId,
        teamId: memory.teamId,
        locale: "en",
      })),
      O.pulse.subscribe.each(({ memory }) =>
        memory.shown.map((technicianId) => ({ workspaceId: memory.workspaceId, technicianId })),
      ), // pending merge 6
      O.breaks.subscribe(({ memory }) => ({ workspaceId: memory.workspaceId })),
    ],
    on: {
      TeamChosen: { target: "self", updateMemory: ({ event }) => ({ teamId: event.teamId }) },
      // Membership is host data (rule 9): the roster's confirmed value decides which cards and sessions exist.
      Shown: { target: "self", updateMemory: ({ event }) => ({ shown: event.technicianIds }) },

      // `allow`: each nudge is its own Attempt, and each ending toasts on its own, in its own turn.
      Nudge: {
        target: "self",
        actions: [
          O.nudge.commit(({ memory, context, event }) => ({
            workspaceId: memory.workspaceId,
            technicianId: event.technicianId,
            from: context.userId,
            text: event.text,
          })),
        ],
      },
      Nudged: { target: "self", actions: [toast((e) => `Nudged ${e.technicianId}`)] },
      NudgeFailed: { target: "self", actions: [toast((e) => `Couldn't nudge ${e.technicianId}`)] },
      // Key-less `retry` exists under `allow` only here, in this ending's own handler (rule N2). Then it is let go.
      NudgeUnsure: [
        { target: "self", guard: [O.nudge.retryable({ times: 1 })], actions: [O.nudge.retry] },
        { target: "self", actions: [toast((e) => `Not sure ${e.technicianId} got the nudge`)] },
      ],

      // The look is the commit's `optimistic` (rule 36), over the plain `breaks` entry.
      // design gap: `setData`'s `data` is written as an updater of the entry's current value; 3.4 passes a value.
      ToggleBreak: {
        target: "self",
        actions: [
          O.setBreak.commit(
            ({ memory, event }) => ({
              workspaceId: memory.workspaceId,
              technicianId: event.technicianId,
              onBreak: event.onBreak,
            }),
            {
              optimistic: [
                breaksOf.setData(({ memory, input }) => ({
                  key: { workspaceId: memory.workspaceId },
                  data: (current: Record<string, boolean> | undefined) => ({
                    ...current,
                    [input.technicianId]: input.onBreak,
                  }),
                })),
              ],
            },
          ),
        ],
      },
      BreakSet: { target: "self" },
      RosterFailed: {
        target: "self",
        updateMemory: () => ({ notice: "The team's list could not be read" }),
      },
      BreakUnsure: { target: "self", actions: [O.setBreak.cancel] }, // release; the look stays marked uncertain

      // A dispatch predicts the ticket's assignee AND the technician's status: the card changes column at once.
      Dispatch: {
        target: "self",
        guard: [
          O.dispatch.idle(({ memory, event }) => ({
            workspaceId: memory.workspaceId,
            ticketId: event.ticketId,
          })),
        ],
        updateMemory: () => ({ notice: "" }),
        actions: [
          O.dispatch.commit(({ memory, event }) => ({
            workspaceId: memory.workspaceId,
            ticketId: event.ticketId,
            technicianId: event.technicianId,
          })),
        ],
      },
      Dispatched: { target: "self" },
      DispatchRefused: { target: "self", updateMemory: ({ event }) => ({ notice: event.reason }) },
      DispatchUnsure: [
        {
          target: "self",
          guard: [O.dispatch.retryable({ times: 2 })],
          actions: [O.dispatch.retry],
        },
        {
          target: "self",
          updateMemory: () => ({ notice: "We couldn't confirm that dispatch" }),
          actions: [O.dispatch.cancel],
        },
      ],
    },
    states: { PANEL: {} },
  };
});
