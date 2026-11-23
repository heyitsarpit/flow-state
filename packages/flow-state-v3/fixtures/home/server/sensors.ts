import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { NoResponse } from "../services.ts";

const SensorsTruth = Schema.Struct({ celsius: Schema.Record(Schema.String, Schema.Number) });

type Truth = typeof SensorsTruth.Type;

/**
 * The sensors' fake: each room's temperature, 19 degrees until a control warms it.
 */
export const Sensors = Fake.server("Sensors", {
  truth: SensorsTruth,
  initial: { celsius: {} },
  endpoints: {
    reading: Fake.call({
      request: { room: Schema.String },
      success: Schema.Struct({ celsius: Schema.Number }),
      failure: Schema.Never,
      handle: (truth: Truth, { room }) => ({
        truth,
        exit: Exit.succeed({ celsius: truth.celsius[room] ?? 19 }),
      }),
    }),
  },
  controls: {
    warm: Fake.control(
      { room: Schema.String, celsius: Schema.Number },
      (truth: Truth, { room, celsius }) => ({
        celsius: { ...truth.celsius, [room]: celsius },
      }),
    ),
  },
  lost: () => new NoResponse(),
});
