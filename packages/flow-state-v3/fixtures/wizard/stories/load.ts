import { Fake } from "../../../src/host/testing/index.ts";
import { actorRef } from "../../../src/index.ts";
import { booking } from "../app.ts";
import { Booking, BookingMachine } from "../machines/booking.ts";
import { wizardStory } from "./usual.ts";

/**
 * How many quotes the load Story books: a first guess, to be set from the bench.
 */
export const QUOTES = 16;

/**
 * The booking of the `n`th of many quotes.
 */
export const quoteOf = (n: number) => actorRef(BookingMachine, `quote-${String(n)}`);

/**
 * L1 and S3 × 16: sixteen quotes' bookings in one Runtime, each holding a slot a minute longer
 * than the last; the tab reloads (L4) and each is opened again; each expires at its own end.
 */
export const manyBookings = Array.from({ length: QUOTES }, (_, n) => quoteOf(n))
  .reduce(
    (story, ref, n) =>
      story
        .ensure(ref)
        .send(ref, Booking.E.Held({ slotId: `s-${String(n)}`, heldUntil: (n + 5) * 60_000 })),
    wizardStory("wizard/stress-many-bookings"),
  )
  .checkpoint("held")
  .reload()
  .advance("30 minutes")
  .checkpoint("expired");

/**
 * The stress run the generator prints from the wizard samples with seed 36.
 */
export const seededStress = wizardStory("wizard-booking/stress-36")
  .ensure(booking)
  .world(Fake.storage.hold())
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2147483647 }))
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2147483647 }))
  .send(booking, Booking.E.Extended({ heldUntil: 900000 }))
  .send(booking, Booking.E.Held({ slotId: "", heldUntil: 600000 }))
  .send(booking, Booking.E.DismissWarning())
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2147483647 }))
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2147483647 }))
  .send(booking, Booking.E.PickAgain())
  .reload({ reattach: false })
  .send(booking, Booking.E.Held({ slotId: "s-past", heldUntil: -1 }))
  .send(booking, Booking.E.Held({ slotId: "s-now", heldUntil: 0 }))
  .send(booking, Booking.E.Held({ slotId: "s-past", heldUntil: -1 }))
  .send(booking, Booking.E.PickAgain())
  .send(booking, Booking.E.Held({ slotId: "s-far", heldUntil: 2147483648 }))
  .send(booking, Booking.E.DismissWarning())
  .send(booking, Booking.E.Book())
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2147483647 }))
  .send(booking, Booking.E.Held({ slotId: "s-0900", heldUntil: 600000 }))
  .send(booking, Booking.E.Held({ slotId: "s-now", heldUntil: 0 }))
  .world(Fake.network.offline())
  .send(booking, Booking.E.PickAgain())
  .dispose(booking, { how: "forget" })
  .send(booking, Booking.E.Book())
  .send(booking, Booking.E.Held({ slotId: "s-past", heldUntil: -1 }))
  .advance("20 millis")
  .disposeRuntime()
  .reload()
  .advance("7 millis")
  .send(booking, Booking.E.Held({ slotId: "s-past", heldUntil: -1 }))
  .advance("20 millis")
  .send(booking, Booking.E.DismissWarning())
  .advance("3 millis")
  .send(booking, Booking.E.Held({ slotId: "s-far", heldUntil: 2147483648 }))
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2147483647 }))
  .advance("16 millis")
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2147483647 }))
  .send(booking, Booking.E.PickAgain())
  .send(booking, Booking.E.Book())
  .send(booking, Booking.E.Extended({ heldUntil: 900000 }))
  .send(booking, Booking.E.Held({ slotId: "s-0900", heldUntil: 600000 }))
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2147483647 }))
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2147483647 }))
  .send(booking, Booking.E.DismissWarning())
  .send(booking, Booking.E.Held({ slotId: "", heldUntil: 600000 }))
  .advance("5 millis")
  .send(booking, Booking.E.DismissWarning())
  .advance("2 millis")
  .send(booking, Booking.E.PickAgain())
  .advance("17 millis")
  .send(booking, Booking.E.Held({ slotId: "s-now", heldUntil: 0 }))
  .send(booking, Booking.E.Book())
  .send(booking, Booking.E.Book())
  .advance("18 millis")
  .send(booking, Booking.E.Held({ slotId: "s-far", heldUntil: 2147483648 }))
  .send(booking, Booking.E.Held({ slotId: "s-past", heldUntil: -1 }))
  .send(booking, Booking.E.Held({ slotId: "s-past", heldUntil: -1 }))
  .send(booking, Booking.E.Held({ slotId: "s-far", heldUntil: 2147483648 }))
  .send(booking, Booking.E.Held({ slotId: "s-past", heldUntil: -1 }))
  .send(booking, Booking.E.Held({ slotId: "", heldUntil: 600000 }))
  .world(Fake.storage.refuseLoad())
  .reload({ reattach: false })
  .advance("4 millis")
  .send(booking, Booking.E.Extended({ heldUntil: 900000 }))
  .advance("10 millis")
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2147483647 }))
  .send(booking, Booking.E.Book())
  .send(booking, Booking.E.DismissWarning())
  .send(booking, Booking.E.Held({ slotId: "s-past", heldUntil: -1 }))
  .send(booking, Booking.E.Held({ slotId: "s-now", heldUntil: 0 }))
  .send(booking, Booking.E.Held({ slotId: "s-far", heldUntil: 2147483648 }))
  .send(booking, Booking.E.Held({ slotId: "s-far", heldUntil: 2147483648 }))
  .send(booking, Booking.E.Held({ slotId: "", heldUntil: 600000 }))
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2147483647 }))
  .send(booking, Booking.E.Held({ slotId: "s-past", heldUntil: -1 }))
  .send(booking, Booking.E.Held({ slotId: "", heldUntil: 600000 }))
  .send(booking, Booking.E.Held({ slotId: "s-0900", heldUntil: 600000 }))
  .advance("20 millis")
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2147483647 }))
  .send(booking, Booking.E.PickAgain())
  .send(booking, Booking.E.Held({ slotId: "s-now", heldUntil: 0 }))
  .send(booking, Booking.E.Book())
  .advance("15 millis")
  .send(booking, Booking.E.Held({ slotId: "", heldUntil: 600000 }))
  .send(booking, Booking.E.DismissWarning())
  .send(booking, Booking.E.Book())
  .advance("8 millis")
  .send(booking, Booking.E.DismissWarning())
  .send(booking, Booking.E.PickAgain())
  .advance("7 millis")
  .send(booking, Booking.E.Held({ slotId: "s-far", heldUntil: 2147483648 }))
  .send(booking, Booking.E.Book())
  .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2147483647 }))
  .advance("15 millis")
  .send(booking, Booking.E.Held({ slotId: "s-far", heldUntil: 2147483648 }))
  .advance("15 millis")
  .send(booking, Booking.E.Held({ slotId: "s-far", heldUntil: 2147483648 }))
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .advance("2 minutes");
