import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";

const AuthTruth = Schema.Struct({
  codes: Schema.Record(Schema.String, Schema.String),
  sessions: Schema.Array(Schema.String),
  throttled: Schema.Number,
});

type Truth = typeof AuthTruth.Type;

const Throttled = Schema.TaggedStruct("Throttled", {});

const WrongCode = Schema.TaggedStruct("WrongCode", {});

/**
 * The code the auth server sends to every address.
 */
export const CODE = "123456";

/**
 * The auth server's truth: the code it sent each address and the addresses signed in. A code is
 * right only for an address it was sent to; `throttle` turns the next code requests away.
 */
export const Auth = Fake.server("Auth", {
  truth: AuthTruth,
  initial: { codes: {}, sessions: [], throttled: 0 },
  endpoints: {
    begin: Fake.call({
      request: { email: Schema.String, key: Schema.String },
      success: Schema.Struct({}),
      failure: Throttled,
      handle: (truth: Truth, { email }) =>
        truth.throttled > 0
          ? {
              truth: { ...truth, throttled: truth.throttled - 1 },
              exit: Exit.fail(Throttled.make({})),
            }
          : {
              truth: { ...truth, codes: { ...truth.codes, [email]: CODE } },
              exit: Exit.succeed({}),
            },
    }),
    verify: Fake.call({
      request: { email: Schema.String, code: Schema.String, key: Schema.String },
      success: Schema.Struct({}),
      failure: WrongCode,
      handle: (truth: Truth, { email, code }) =>
        truth.codes[email] === code
          ? { truth: { ...truth, sessions: [...truth.sessions, email] }, exit: Exit.succeed({}) }
          : { truth, exit: Exit.fail(WrongCode.make({})) },
    }),
  },
  controls: {
    throttle: Fake.control({}, (truth: Truth) => ({ ...truth, throttled: truth.throttled + 1 })),
  },
});
