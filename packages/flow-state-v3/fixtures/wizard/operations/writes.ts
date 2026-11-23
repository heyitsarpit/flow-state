import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { BookingApi } from "../services.ts";

/**
 * Holds one slot for the quote; a second hold while one is out is refused. A lost answer is
 * unknown.
 */
export const holdSlot = transaction({
  id: "Wizard/holdSlot",
  input: { area: Schema.String, slot: Schema.String },
  key: [],
  concurrency: "reject",
  services: [BookingApi],
  commit: (input, { attempt }) =>
    BookingApi.use((api) => api.hold(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});
