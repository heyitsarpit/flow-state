import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { ActionFailed } from "../services.ts";

const CommandsTruth = Schema.Struct({
  ran: Schema.Record(Schema.String, Schema.String),
  failing: Schema.Record(Schema.String, Schema.String),
});

type Truth = typeof CommandsTruth.Type;

/**
 * The app's actions as a server: each idempotency key runs its command once, and a key it has seen
 * answers again without running; a command marked `fail` is refused with its reason until `heal`.
 */
export const Commands = Fake.server("Commands", {
  truth: CommandsTruth,
  initial: { ran: {}, failing: {} },
  endpoints: {
    run: Fake.call({
      request: { command: Schema.String, key: Schema.String },
      success: Schema.Struct({}),
      failure: ActionFailed,
      handle: (truth: Truth, { command, key }) => {
        const reason = truth.failing[command];

        if (truth.ran[key] !== undefined) return { truth, exit: Exit.succeed({}) };

        if (reason !== undefined) return { truth, exit: Exit.fail(new ActionFailed({ reason })) };

        return {
          truth: { ...truth, ran: { ...truth.ran, [key]: command } },
          exit: Exit.succeed({}),
        };
      },
    }),
  },
  controls: {
    fail: Fake.control(
      { command: Schema.String, reason: Schema.String },
      (truth: Truth, { command, reason }) => ({
        ...truth,
        failing: { ...truth.failing, [command]: reason },
      }),
    ),
    heal: Fake.control({ command: Schema.String }, (truth: Truth, { command }) => ({
      ...truth,
      failing: Object.fromEntries(Object.entries(truth.failing).filter(([c]) => c !== command)),
    })),
  },
});
