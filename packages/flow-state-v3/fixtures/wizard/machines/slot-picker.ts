import { Schema } from "effect";
import { actorRef, definition, deny, Flow, machine, send } from "../../../src/index.ts";
import { area, slots } from "../operations/reads.ts";
import { holdSlot } from "../operations/writes.ts";
import { Booking, BookingMachine } from "./booking.ts";

/**
 * The inspection slot picker: the postcode as typed, the area it is in, the day chosen, that day's
 * open slots, the slot asked for and a notice.
 */
export const SlotPicker = definition({
  id: "Wizard/SlotPicker",
  states: ["POSTCODE", "DAY", "HOLDING", "DONE"],
  events: {
    Postcode: { text: Schema.String },
    Day: { day: Schema.String },
    Pick: { slot: Schema.String },
  },
  internalEvents: {
    Located: { area: Schema.String },
    NotCovered: {},
    Listed: { slots: Schema.Array(Schema.String) },
    Held: { slot: Schema.String, heldUntil: Schema.Number },
    Taken: { slot: Schema.String },
    HoldRefused: { why: Schema.String },
    HoldUnsure: Flow.uncertain({}),
    Offline: {},
  },
  memory: {
    postcode: Flow.initial(Schema.String, ""),
    area: Flow.initial(Schema.String, ""),
    day: Flow.initial(Schema.String, ""),
    open: Flow.initial(Schema.Array(Schema.String), []),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    area: area.outcomes({
      success: E.Located.from((v) => ({ area: v.area })),
      failure: {
        Uncovered: E.NotCovered,
        NoResponse: E.Offline,
        Defect: E.Offline,
        Interrupted: E.Offline,
      },
    }),
    slots: slots.outcomes({
      success: E.Listed.from((v) => ({ slots: v.slots })),
      failure: { NoResponse: E.Offline, Defect: E.Offline, Interrupted: E.Offline },
    }),
    holdSlot: holdSlot.outcomes({
      success: E.Held.from((v, { input }) => ({ slot: input.slot, heldUntil: v.heldUntil })),
      failure: { Taken: E.Taken.from((_, { input }) => ({ slot: input.slot })) },
      notSent: E.HoldRefused.from((n) => ({ why: n.why })),
      unknown: E.HoldUnsure,
    }),
  }),
});

const toBooking = () => actorRef(BookingMachine, "inspection");

// A postcode as typed, as the booking service takes it: trimmed, upper case, one space.
const normal = (text: string) => text.trim().toUpperCase().replace(/\s+/gu, " ");

/**
 * Typing a postcode finds its area, until a hold is asked; choosing a day lists its slots; picking
 * one holds it and tells the booking, and the picker is done. A slot taken meanwhile lists the day
 * again.
 */
export const SlotPickerMachine = machine(SlotPicker, ({ S, O }) => ({
  default: S.POSTCODE,
  on: {
    Postcode: {
      target: S.POSTCODE,
      guard: [({ state }) => (state !== "HOLDING" && state !== "DONE") || deny("Holding")],
      updateMemory: ({ event }) => ({ postcode: normal(event.text), notice: "" }),
      actions: [O.area.lookup(({ memory }) => ({ postcode: memory.postcode }))],
    },
    Located: { target: S.DAY, updateMemory: ({ event }) => ({ area: event.area }) },
    NotCovered: { target: S.POSTCODE, updateMemory: () => ({ notice: "not covered" }) },
    Offline: { updateMemory: () => ({ notice: "offline" }) },
  },
  states: {
    POSTCODE: {},
    DAY: {
      on: {
        Day: {
          updateMemory: ({ event }) => ({ day: event.day, open: [] }),
          actions: [O.slots.lookup(({ memory }) => ({ area: memory.area, day: memory.day }))],
        },
        Listed: { updateMemory: ({ event }) => ({ open: event.slots }) },
        Pick: {
          target: S.HOLDING,
          actions: [
            O.holdSlot.commit(({ memory, event }) => ({ area: memory.area, slot: event.slot })),
          ],
        },
      },
    },
    HOLDING: {
      on: {
        Pick: {
          actions: [
            O.holdSlot.commit(({ memory, event }) => ({ area: memory.area, slot: event.slot })),
          ],
        },
        Held: {
          target: S.DONE,
          updateMemory: ({ event }) => ({ notice: `held ${event.slot}` }),
          actions: [
            send(
              toBooking,
              Booking.E.Held.from(({ event }) => ({
                slotId: event.slot,
                heldUntil: event.heldUntil,
              })),
            ),
          ],
        },
        Taken: {
          target: S.DAY,
          updateMemory: ({ event }) => ({ notice: `${event.slot} was taken` }),
          actions: [O.slots.lookup(({ memory }) => ({ area: memory.area, day: memory.day }))],
        },
        HoldRefused: { updateMemory: ({ event }) => ({ notice: `hold ${event.why}` }) },
        HoldUnsure: {
          target: S.DAY,
          updateMemory: () => ({ notice: "the hold may have gone through" }),
        },
      },
    },
    DONE: {},
  },
}));
