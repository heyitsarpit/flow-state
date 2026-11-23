import { Story } from "../../../src/host/testing/index.ts";
import { booking, wizardSetup } from "../app.ts";
import { Booking } from "../machines/booking.ts";

/**
 * The wizard app, with no steps yet: every wizard Story starts here.
 */
export const wizardStory = (id: string) => Story.app(wizardSetup, { id, fixtures: [] });

const MINUTE = 60_000;

/**
 * A slot is held for ten minutes: the warning shows at eight, is dismissed, the hold is extended
 * by five minutes (the warning returns two minutes before the new end), and the slot is booked.
 */
export const usual = wizardStory("wizard/usual")
  .ensure(booking)
  .send(booking, Booking.E.Held({ slotId: "s-0900", heldUntil: 10 * MINUTE }))
  .checkpoint("held")
  .advance("8 minutes")
  .checkpoint("warned")
  .send(booking, Booking.E.DismissWarning())
  .checkpoint("dismissed")
  .send(booking, Booking.E.Extended({ heldUntil: 15 * MINUTE }))
  .advance("5 minutes")
  .checkpoint("warned again")
  .send(booking, Booking.E.Book())
  .advance("10 minutes")
  .checkpoint("booked");

/**
 * A hold runs out: the slot is released and the quote picks again.
 */
export const expired = wizardStory("wizard/expired")
  .ensure(booking)
  .send(booking, Booking.E.Held({ slotId: "s-0900", heldUntil: 10 * MINUTE }))
  .advance("10 minutes")
  .checkpoint("expired")
  .send(booking, Booking.E.PickAgain())
  .checkpoint("picking");

/**
 * The tab reloads while a slot is held, and the booking stays unused past the hold's end: its saved
 * deadline is overdue, so it expires once when the booking is opened again, and the warning, also
 * overdue, fires once before it.
 */
export const reloadedPastHold = wizardStory("wizard/reloaded-past-hold")
  .ensure(booking)
  .send(booking, Booking.E.Held({ slotId: "s-0900", heldUntil: 10 * MINUTE }))
  .checkpoint("held")
  .reload({ reattach: false })
  .advance("30 minutes")
  .ensure(booking)
  .checkpoint("reopened")
  .advance("0 millis")
  .checkpoint("expired once");

/**
 * An extension that lands inside the warning window: the warning's computed delay is negative, so
 * it shows on the next turn.
 */
export const extendedLate = wizardStory("wizard/extended-late")
  .ensure(booking)
  .send(booking, Booking.E.Held({ slotId: "s-0900", heldUntil: 10 * MINUTE }))
  .advance("9 minutes")
  .send(booking, Booking.E.DismissWarning())
  .send(booking, Booking.E.Extended({ heldUntil: 10 * MINUTE + 30_000 }))
  .checkpoint("extended")
  .advance("0 millis")
  .checkpoint("warned at once");

/**
 * Holds ending at the edges of a computed delay: a millisecond ago, now, 2^31 − 1 ms on and 2^31 ms
 * on, past the longest timer, whose Held turn is refused and leaves the booking picking.
 */
export const holdEdges = wizardStory("wizard/hold-edges")
  .ensure(booking)
  .send(booking, Booking.E.Held({ slotId: "s-past", heldUntil: -1 }))
  .advance("0 millis")
  .checkpoint("minus one")
  .send(booking, Booking.E.PickAgain())
  .send(booking, Booking.E.Held({ slotId: "s-now", heldUntil: 0 }))
  .advance("0 millis")
  .checkpoint("zero")
  .send(booking, Booking.E.PickAgain())
  .send(booking, Booking.E.Held({ slotId: "s-far", heldUntil: 2 ** 31 }))
  .checkpoint("past")
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2 ** 31 - 1 }))
  .checkpoint("longest");

/**
 * L5: a burst of 200 extensions, each a second later than the last, faster than turns: the hold
 * ends once, at the last extension's end.
 */
export const extendBurst = Array.from({ length: 200 }, (_, n) => n)
  .reduce(
    (story, n) => story.send(booking, Booking.E.Extended({ heldUntil: 10 * MINUTE + n * 1000 })),
    wizardStory("wizard/stress-extend-burst")
      .ensure(booking)
      .send(booking, Booking.E.Held({ slotId: "s-0900", heldUntil: 10 * MINUTE })),
  )
  .checkpoint("extended")
  .advance("15 minutes")
  .checkpoint("expired");

/**
 * Every named Story of the wizard fixture.
 */
export const stories = { usual, expired, reloadedPastHold, extendedLate, holdEdges, extendBurst };
