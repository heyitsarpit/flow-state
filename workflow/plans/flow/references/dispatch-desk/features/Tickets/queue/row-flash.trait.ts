// A row that another dispatcher just changed flashes for two seconds. A pure copy per changed row (F5: `.each` over
// keys a live source fills: the host adds a key when the list's confirmed value shows a new revision), which asks
// the host to remove it when its time is up (rule 9: membership is host data).
import { Schema } from "effect";
import { Flow, trait } from "flow-state";

export const RowFlash = trait(
  {
    id: "RowFlash",
    internalEvents: { Faded: {} },
    callbacks: { onFaded: Flow.Callback({ ticketId: Schema.String }) },
    memory: { ticketId: Flow.input(Schema.String) },
  },
  ({ E, callbacks }) => ({
    schedules: { fade: { schedule: "2 seconds", armOn: [Flow.entry], send: E.Faded } },
    on: {
      Faded: {
        target: "self",
        notify: [callbacks.onFaded.from(({ memory }) => ({ ticketId: memory.ticketId }))],
      },
    },
  }),
);
