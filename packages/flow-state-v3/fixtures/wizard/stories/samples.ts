import { samplesOf } from "../../../src/host/testing/index.ts";
import { booking } from "../app.ts";
import { Booking } from "../machines/booking.ts";
import { wizardStory } from "./usual.ts";

/**
 * What a quote's booker can do, for generated runs: hold a slot ending a millisecond ago, now, in
 * ten minutes, at the longest delay and past it; extend, dismiss the warning, book, pick again.
 */
export const samples = samplesOf({
  id: "wizard-booking",
  story: wizardStory("wizard-booking/samples"),
  names: { setup: "wizardSetup", fixtures: [] },
  actors: { booking },
  servers: {},
  failures: [],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(booking, Booking.E.Held({ slotId: "s-past", heldUntil: -1 }))
      .send(booking, Booking.E.Held({ slotId: "s-now", heldUntil: 0 }))
      .send(booking, Booking.E.Held({ slotId: "s-0900", heldUntil: 600_000 }))
      .send(booking, Booking.E.Held({ slotId: "s-longest", heldUntil: 2 ** 31 - 1 }))
      .send(booking, Booking.E.Held({ slotId: "s-far", heldUntil: 2 ** 31 }))
      .send(booking, Booking.E.Extended({ heldUntil: 900_000 }))
      .send(booking, Booking.E.DismissWarning())
      .send(booking, Booking.E.Book())
      .send(booking, Booking.E.PickAgain()),
});
