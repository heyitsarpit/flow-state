import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { NoResponse, Offline } from "../services.ts";

const ThermostatTruth = Schema.Struct({
  targets: Schema.Record(Schema.String, Schema.Number),
  offline: Schema.Array(Schema.String),
});

type Truth = typeof ThermostatTruth.Type;

/**
 * The thermostats' fake: each room's target, and the rooms whose heater is offline.
 */
export const Thermostat = Fake.server("Thermostat", {
  truth: ThermostatTruth,
  initial: { targets: {}, offline: [] },
  endpoints: {
    setTarget: Fake.call({
      request: { room: Schema.String, celsius: Schema.Number, key: Schema.String },
      success: Schema.Struct({}),
      failure: Offline,
      handle: (truth: Truth, { room, celsius }) =>
        truth.offline.includes(room)
          ? { truth, exit: Exit.fail(new Offline()) }
          : {
              truth: { ...truth, targets: { ...truth.targets, [room]: celsius } },
              exit: Exit.succeed({}),
            },
    }),
  },
  controls: {
    unplug: Fake.control({ room: Schema.String }, (truth: Truth, { room }) => ({
      ...truth,
      offline: [...truth.offline, room],
    })),
  },
  lost: () => new NoResponse(),
});
