import { Effect, Exit, Layer, Schema } from "effect";
import { Fake } from "../../src/host/testing/index.ts";
import { IdentityApi, NoResponse, Profile, Refused } from "./contracts.ts";

const IdentityTruth = Schema.Struct({
  sessions: Schema.Record(Schema.String, Profile),
  locked: Schema.Array(Schema.String),
  nameChars: Schema.Number,
});

type Truth = typeof IdentityTruth.Type;

// A new session's profile, its display name padded to the provider's current length.
const opened = (truth: Truth, user: string, key: string) => {
  const profile = { user, displayName: user.padEnd(truth.nameChars, ".") };

  return {
    truth: { ...truth, sessions: { ...truth.sessions, [key]: profile } },
    exit: Exit.succeed(profile),
  };
};

/**
 * The identity provider's truth: one session per idempotency key, replayed for a key it has seen;
 * users it refuses; and how long the display names it returns are, padded to `nameChars`
 * characters as a provider that returns a long profile would send it.
 */
export const Identity = Fake.server("Identity", {
  truth: IdentityTruth,
  initial: { sessions: {}, locked: [], nameChars: 0 },
  endpoints: {
    signIn: Fake.call({
      request: { user: Schema.String, key: Schema.String },
      success: Profile,
      failure: Refused,
      handle: (truth: Truth, { user, key }) => {
        const known = truth.sessions[key];

        if (known !== undefined) return { truth, exit: Exit.succeed(known) };

        return truth.locked.includes(user)
          ? { truth, exit: Exit.fail(new Refused({ reason: "locked" })) }
          : opened(truth, user, key);
      },
    }),
  },
  controls: {
    lock: Fake.control({ user: Schema.String }, (truth: typeof IdentityTruth.Type, { user }) => ({
      ...truth,
      locked: [...truth.locked, user],
    })),
    unlock: Fake.control({ user: Schema.String }, (truth: typeof IdentityTruth.Type, { user }) => ({
      ...truth,
      locked: truth.locked.filter((u) => u !== user),
    })),
    names: Fake.control(
      { chars: Schema.Number },
      (truth: typeof IdentityTruth.Type, { chars }) => ({
        ...truth,
        nameChars: chars,
      }),
    ),
  },
});

/**
 * The port fake: `IdentityApi` over the identity provider's server, a lost answer read as the
 * port's NoResponse.
 */
export const IdentityFake = Layer.effect(
  IdentityApi,
  Effect.map(Identity, (identity) =>
    IdentityApi.of({
      signIn: (input, { idempotencyKey }) =>
        identity
          .signIn({ ...input, key: idempotencyKey })
          .pipe(Effect.catchTag("FakeLost", () => Effect.fail(new NoResponse()))),
    }),
  ),
);
