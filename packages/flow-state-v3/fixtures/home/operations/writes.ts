import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { ThermostatApi } from "../services.ts";

/**
 * Sets a room's target temperature; a newer target for the same room supersedes the one before it.
 */
export const setTarget = transaction({
  id: "Home/setTarget",
  input: { room: Schema.String, celsius: Schema.Number },
  key: ["room"],
  concurrency: "latest",
  services: [ThermostatApi],
  commit: (input, { attempt }) =>
    ThermostatApi.use((api) => api.setTarget(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});
