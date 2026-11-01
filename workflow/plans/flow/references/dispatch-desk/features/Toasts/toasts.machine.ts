import { deny, machine } from "flow-state";
import { Toasts } from "./toasts.definition.js";

// The expiry schedule belongs to SHOWING, so it exists only while there is a toast to expire.
// Each toast gets its own four seconds: Expire re-enters SHOWING (an explicit target re-enters
// the state and restarts its schedule), while Push stays put with "self" and restarts nothing.
export const ToastsMachine = machine(Toasts, ({ S, E }) => ({
  default: S.EMPTY,
  on: {
    Push: {
      target: S.SHOWING,
      updateMemory: ({ event, memory }) => ({ messages: [...memory.messages, event.text] }),
    },
    Dismiss: { target: S.EMPTY, updateMemory: () => ({ messages: [] }) },
  },
  states: {
    EMPTY: {},
    SHOWING: {
      schedules: { expire: { schedule: "4 seconds", send: E.Expire } },
      on: {
        Push: {
          target: "self",
          updateMemory: ({ event, memory }) => ({ messages: [...memory.messages, event.text] }),
        },
        Expire: [
          {
            target: S.SHOWING,
            guard: ({ memory }) => memory.messages.length > 1 || deny("LastToast"),
            updateMemory: ({ memory }) => ({ messages: memory.messages.slice(1) }),
          },
          { target: S.EMPTY, updateMemory: () => ({ messages: [] }) },
        ],
      },
    },
  },
}));
