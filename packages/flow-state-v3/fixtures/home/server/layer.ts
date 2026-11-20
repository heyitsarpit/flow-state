import { Effect, Layer } from "effect";
import { ThermostatApi } from "../services.ts";
import { Thermostat } from "./thermostat.ts";

/**
 * The thermostat port over its fake, for Stories; a lost answer is the port's NoResponse.
 */
export const ThermostatFake = Layer.effect(
  ThermostatApi,
  Effect.map(Thermostat, (thermostat) =>
    ThermostatApi.of({
      setTarget: (input, { idempotencyKey }) =>
        thermostat.setTarget({ ...input, key: idempotencyKey }).pipe(Effect.asVoid),
    }),
  ),
);
