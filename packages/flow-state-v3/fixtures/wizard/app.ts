import { Layer } from "effect";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { BookingLive } from "./adapters/booking.ts";
import { BookingMachine } from "./machines/booking.ts";
import { SlotPickerMachine } from "./machines/slot-picker.ts";

/**
 * The quote's inspection booking.
 */
export const booking = actorRef(BookingMachine, "inspection");

/**
 * The wizard app: the inspection booking so far.
 */
export const wizardApp = app({ id: "wizard", machines: { booking: BookingMachine } });

/**
 * The wizard app's real setup: persisted, each capture written at once; it calls no service yet.
 */
export const wizardSetup = runtimeSetup({
  app: wizardApp,
  services: layerIndexedDb(),
  scope: "wizard",
  persistence: { captureMs: 0 },
});

/**
 * The inspection slot picker.
 */
export const picker = actorRef(SlotPickerMachine, "picker");

/**
 * The wizard app grown with the slot picker, which holds a slot and tells the booking.
 */
export const wizardGrown = app({
  id: "wizard",
  machines: { booking: BookingMachine, picker: SlotPickerMachine },
});

/**
 * The grown wizard app's real setup: the booking service over HTTP, persisted, each capture
 * written at once.
 */
export const wizardGrownSetup = runtimeSetup({
  app: wizardGrown,
  services: Layer.merge(BookingLive("https://booking.example"), layerIndexedDb()),
  scope: "wizard",
  persistence: { captureMs: 0 },
});
