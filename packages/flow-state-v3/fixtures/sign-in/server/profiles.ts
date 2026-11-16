import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";

const ProfilesTruth = Schema.Struct({
  handles: Schema.Record(Schema.String, Schema.String),
  refusals: Schema.Number,
});

type Truth = typeof ProfilesTruth.Type;

/**
 * The profile service's truth: each account's saved handle, none until saved. `taken` makes the
 * next save find the handle taken.
 */
export const Profiles = Fake.server("Profiles", {
  truth: ProfilesTruth,
  initial: { handles: {}, refusals: 0 },
  endpoints: {
    setUsername: Fake.call({
      request: { email: Schema.String, handle: Schema.String, key: Schema.String },
      success: Schema.Struct({ handle: Schema.String }),
      failure: Schema.TaggedStruct("Taken", { handle: Schema.String }),
      handle: (truth: Truth, { email, handle }) =>
        truth.refusals > 0
          ? {
              truth: { ...truth, refusals: truth.refusals - 1 },
              exit: Exit.fail({ _tag: "Taken" as const, handle }),
            }
          : {
              truth: { ...truth, handles: { ...truth.handles, [email]: handle } },
              exit: Exit.succeed({ handle }),
            },
    }),
    me: Fake.call({
      request: { email: Schema.String },
      success: Schema.Struct({ handle: Schema.String }),
      failure: Schema.Never,
      handle: (truth: Truth, { email }) => ({
        truth,
        exit: Exit.succeed({ handle: truth.handles[email] ?? "" }),
      }),
    }),
  },
  controls: {
    taken: Fake.control({}, (truth: Truth) => ({ ...truth, refusals: truth.refusals + 1 })),
  },
});
