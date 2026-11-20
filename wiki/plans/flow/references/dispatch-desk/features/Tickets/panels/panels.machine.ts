// Tabs as nodes, each with its resumable trait. `resetOn` is the ticket, a string (rule 48: a writing placement's
// reset value is recorded with the slice), so returning to a tab of the SAME ticket thaws it, and returning after
// the ticket changed resets it: fresh memory, a new life, and its parked endings for the old ticket stay with the
// old subject path (rule 51).
import { deny, machine } from "flow-state";
import { Panels } from "./panels.definition.js";

export const PanelsMachine = machine(Panels, ({ S, E }) => {
  const isTab =
    (tab: "history" | "customer") =>
    ({ event }: { event: { tab: string } }) =>
      event.tab === tab || deny("OtherTab");

  return {
    default: S.TABS,
    on: {
      ShowTicket: {
        target: "self",
        updateMemory: ({ event }) => ({ ticketId: event.ticketId, customerId: event.customerId }),
      },
    },
    states: {
      TABS: {
        default: S.TABS.HISTORY,
        on: {
          // Leaving a tab freezes its trait; entering one thaws it, or resets it if the ticket changed meanwhile.
          OpenTab: [
            { target: S.TABS.HISTORY, guard: isTab("history") },
            { target: S.TABS.CUSTOMER, guard: isTab("customer") },
            { target: S.TABS.PARTS },
          ],
        },
        states: {
          HISTORY: {
            traits: {
              history: {
                input: ({ memory }) => ({
                  workspaceId: memory.workspaceId,
                  ticketId: memory.ticketId,
                }),
                resetOn: ({ memory }) => memory.ticketId,
              },
            },
            // The deep link: the panels machine raises into its trait (F16). It is handled only while the History
            // tab is active, so a link sends `OpenTab` first, then `ShowEntry`.
            // design gap: whether a transition that ENTERS (or thaws) a node may raise into the trait that node
            // places, in the same turn. Rule 12 makes "a raise into a fragment a later state change enters" a
            // defect; this file avoids the question with two events.
            on: {
              ShowEntry: {
                target: "self",
                raise: [E.history.Highlight.from(({ event }) => ({ entryId: event.entryId }))],
              },
            },
          },
          CUSTOMER: {
            traits: {
              customer: {
                input: ({ memory }) => ({
                  workspaceId: memory.workspaceId,
                  customerId: memory.customerId,
                }),
                resetOn: ({ memory }) => memory.ticketId,
              },
            },
          },
          PARTS: {
            traits: {
              parts: {
                input: ({ memory }) => ({ ticketId: memory.ticketId }),
                resetOn: ({ memory }) => memory.ticketId,
              },
            },
          },
        },
      },
    },
  };
});
