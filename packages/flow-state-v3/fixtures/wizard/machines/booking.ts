import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

/**
 * How long before a hold ends its warning shows.
 */
export const WARN_MS = 120_000;

/**
 * An inspection booking: the slot held for the quote and when the hold ends, in Runtime Clock
 * milliseconds, and whether the "hold ending soon" warning shows.
 */
export const Booking = definition({
  id: "Wizard/Booking",
  persist: true,
  states: ["PICKING", "HELD", "BOOKED", "EXPIRED"],
  events: {
    Held: { slotId: Schema.String, heldUntil: Schema.Number },
    Extended: { heldUntil: Schema.Number },
    DismissWarning: {},
    Book: {},
    PickAgain: {},
  },
  internalEvents: { Warned: {}, Expired: {} },
  memory: {
    slotId: Flow.initial(Schema.String, ""),
    heldUntil: Flow.initial(Schema.Number, 0),
    warning: Flow.initial(Schema.Boolean, false),
  },
  schedules: { expire: {}, warn: {} },
});

/**
 * The booking: a held slot expires when its hold ends, and warns two minutes before; extending the
 * hold restarts both from the new end, and dismissing the warning stops it until the next
 * extension. An expired hold returns to picking.
 */
export const BookingMachine = machine(Booking, ({ S, E }) => ({
  default: S.PICKING,
  states: {
    PICKING: {
      on: {
        Held: {
          target: S.HELD,
          updateMemory: ({ event }) => ({ slotId: event.slotId, heldUntil: event.heldUntil }),
        },
      },
    },
    HELD: {
      on: {
        Extended: {
          updateMemory: ({ event }) => ({ heldUntil: event.heldUntil, warning: false }),
        },
        Warned: { updateMemory: () => ({ warning: true }) },
        DismissWarning: { updateMemory: () => ({ warning: false }) },
        Expired: { target: S.EXPIRED, updateMemory: () => ({ slotId: "", warning: false }) },
        Book: { target: S.BOOKED, updateMemory: () => ({ warning: false }) },
      },
      schedules: {
        expire: {
          schedule: ({ memory, now }) => memory.heldUntil - now,
          send: E.Expired,
          armOn: [Flow.entry, E.Extended],
        },
        warn: {
          schedule: ({ memory, now }) => memory.heldUntil - WARN_MS - now,
          send: E.Warned,
          armOn: [Flow.entry, E.Extended],
          disarmOn: [E.DismissWarning],
        },
      },
    },
    EXPIRED: { on: { PickAgain: S.PICKING } },
  },
}));
