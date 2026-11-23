import { Effect, Layer } from "effect";
import { SensorsApi, ThermostatApi } from "../services.ts";
import { Sensors } from "./sensors.ts";
import { Thermostat } from "./thermostat.ts";

const sensorsApi = (steadfast: boolean) =>
  Effect.map(Sensors, (sensors) =>
    SensorsApi.of({
      reading: (input) =>
        steadfast ? Effect.uninterruptible(sensors.reading(input)) : sensors.reading(input),
    }),
  );

/**
 * The sensors port over its fake; a lost answer is the port's NoResponse.
 */
export const SensorsFake = Layer.effect(SensorsApi, sensorsApi(false));

/**
 * The sensors port over a hub that never stops a reading once asked, as a hub whose abort the
 * sensor never sees.
 */
export const SensorsFakeSteadfast = Layer.effect(SensorsApi, sensorsApi(true));

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
