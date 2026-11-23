import { Context, Effect, Schema } from "effect";

/**
 * The thermostat said the room's heater is offline.
 */
export class Offline extends Schema.TaggedError<Offline>()("Offline", {}) {}

/**
 * No answer came back: the thermostat may have taken the target.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

/**
 * The sensors port the readings read calls: a room's temperature now.
 */
export class SensorsApi extends Context.Service<
  SensorsApi,
  {
    readonly reading: (input: {
      readonly room: string;
    }) => Effect.Effect<{ readonly celsius: number }, NoResponse>;
  }
>()("flow-state-v3/fixtures/home/SensorsApi") {}

/**
 * The thermostat port the target contract calls.
 */
export class ThermostatApi extends Context.Service<
  ThermostatApi,
  {
    readonly setTarget: (
      input: { readonly room: string; readonly celsius: number },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<void, Offline | NoResponse>;
  }
>()("flow-state-v3/fixtures/home/ThermostatApi") {}
