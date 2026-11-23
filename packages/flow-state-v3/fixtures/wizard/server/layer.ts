import { Effect, Layer } from "effect";
import { BookingApi } from "../services.ts";
import { Inspections } from "./booking.ts";

/**
 * The booking port over the inspections server, each hold carrying its idempotency key; a lost
 * answer is the port's NoResponse.
 */
export const BookingFake = Layer.effect(
  BookingApi,
  Effect.map(Inspections, (server) =>
    BookingApi.of({
      area: server.area,
      slots: server.slots,
      hold: (input, { idempotencyKey }) => server.hold({ ...input, key: idempotencyKey }),
    }),
  ),
);
