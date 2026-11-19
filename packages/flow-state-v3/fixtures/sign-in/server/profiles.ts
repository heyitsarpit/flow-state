import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { Taken, Unanswered } from "../services.ts";

const ProfilesTruth = Schema.Struct({
  handles: Schema.Record(Schema.String, Schema.String),
  refusals: Schema.Number,
});

type Truth = typeof ProfilesTruth.Type;

/**
 * The profile service's truth: each account's saved handle, none until saved, so an account with
 * none is new; a session's refresh token is named for its email. `taken` makes the next save find
 * the handle taken; `saved` gives an account a handle saved earlier.
 */
export const Profiles = Fake.server("Profiles", {
  truth: ProfilesTruth,
  initial: { handles: {}, refusals: 0 },
  endpoints: {
    setUsername: Fake.call({
      request: { email: Schema.String, handle: Schema.String, key: Schema.String },
      success: Schema.Struct({ handle: Schema.String }),
      failure: Taken,
      handle: (truth: Truth, { email, handle }) =>
        truth.refusals > 0
          ? {
              truth: { ...truth, refusals: truth.refusals - 1 },
              exit: Exit.fail(new Taken({ handle })),
            }
          : {
              truth: { ...truth, handles: { ...truth.handles, [email]: handle } },
              exit: Exit.succeed({ handle }),
            },
    }),
    me: Fake.call({
      request: { email: Schema.String },
      success: Schema.Struct({ handle: Schema.String, refreshToken: Schema.String }),
      failure: Schema.Never,
      handle: (truth: Truth, { email }) => ({
        truth,
        exit: Exit.succeed({ handle: truth.handles[email] ?? "", refreshToken: `rt-${email}` }),
      }),
    }),
  },
  controls: {
    taken: Fake.control({}, (truth: Truth) => ({ ...truth, refusals: truth.refusals + 1 })),
    saved: Fake.control(
      { email: Schema.String, handle: Schema.String },
      (truth: Truth, { email, handle }) => ({
        ...truth,
        handles: { ...truth.handles, [email]: handle },
      }),
    ),
  },
  lost: () => new Unanswered(),
});
