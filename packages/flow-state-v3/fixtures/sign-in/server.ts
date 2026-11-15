import { Effect, Exit, Layer, Schema } from "effect";
import { Fake } from "../../src/host/testing/index.ts";
import { AuthApi, NoResponse, Throttled, WrongCode } from "./contracts.ts";

const AuthTruth = Schema.Struct({
  codes: Schema.Record(Schema.String, Schema.String),
  sessions: Schema.Array(Schema.String),
  throttled: Schema.Number,
});

type Truth = typeof AuthTruth.Type;

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
      failure: Schema.TaggedStruct("Throttled", {}),
      handle: (truth: Truth, { email }) =>
        truth.throttled > 0
          ? {
              truth: { ...truth, throttled: truth.throttled - 1 },
              exit: Exit.fail({ _tag: "Throttled" as const }),
            }
          : {
              truth: { ...truth, codes: { ...truth.codes, [email]: CODE } },
              exit: Exit.succeed({}),
            },
    }),
    verify: Fake.call({
      request: { email: Schema.String, code: Schema.String, key: Schema.String },
      success: Schema.Struct({}),
      failure: Schema.TaggedStruct("WrongCode", {}),
      handle: (truth: Truth, { email, code }) =>
        truth.codes[email] === code
          ? { truth: { ...truth, sessions: [...truth.sessions, email] }, exit: Exit.succeed({}) }
          : { truth, exit: Exit.fail({ _tag: "WrongCode" as const }) },
    }),
  },
  controls: {
    throttle: Fake.control({}, (truth: Truth) => ({ ...truth, throttled: truth.throttled + 1 })),
  },
});

const lost = () => Effect.fail(new NoResponse());

/**
 * The port fake: `AuthApi` over the auth server, a lost answer read as the port's NoResponse.
 */
export const AuthFake = Layer.effect(
  AuthApi,
  Effect.map(Auth, (auth) =>
    AuthApi.of({
      begin: (input, { idempotencyKey }) =>
        auth
          .begin({ ...input, key: idempotencyKey })
          .pipe(
            Effect.asVoid,
            Effect.catchTags({ FakeLost: lost, Throttled: () => Effect.fail(new Throttled()) }),
          ),
      verify: (input, { idempotencyKey }) =>
        auth
          .verify({ ...input, key: idempotencyKey })
          .pipe(
            Effect.asVoid,
            Effect.catchTags({ FakeLost: lost, WrongCode: () => Effect.fail(new WrongCode()) }),
          ),
    }),
  ),
);
