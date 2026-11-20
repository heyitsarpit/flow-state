import { layerIndexedDb } from "../../src/host/persistence.ts";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { BookingMachine } from "./machines/booking.ts";

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
