import { Context, Effect, Schema } from "effect";
import { Outcome, transaction } from "../../src/index.ts";

/**
 * The auth server sent too many codes to this address lately.
 */
export class Throttled extends Schema.TaggedError<Throttled>()("Throttled", {}) {}

/**
 * The code does not match the one the auth server sent.
 */
export class WrongCode extends Schema.TaggedError<WrongCode>()("WrongCode", {}) {}

/**
 * The auth server's answer did not come back.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

/**
 * The auth server's API: where the data comes from. Its production Layer is `AuthLive`; each call
 * carries its Attempt's id as the idempotency key.
 */
export class AuthApi extends Context.Service<
  AuthApi,
  {
    readonly begin: (
      input: { readonly email: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<void, Throttled | NoResponse>;
    readonly verify: (
      input: { readonly email: string; readonly code: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<void, WrongCode | NoResponse>;
  }
>()("flow-state-v3/fixtures/sign-in/AuthApi") {}

/**
 * Asks for a one-time code by email: a lost answer is unknown.
 */
export const begin = transaction({
  id: "Auth/begin",
  input: { email: Schema.String },
  key: [],
  concurrency: "reject",
  services: [AuthApi],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(AuthApi), (api) =>
      api.begin(input, { idempotencyKey: attempt.id }),
    ).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e))),
});

/**
 * Checks a one-time code: a lost answer is unknown.
 */
export const verify = transaction({
  id: "Auth/verify",
  input: { email: Schema.String, code: Schema.String },
  key: [],
  concurrency: "reject",
  services: [AuthApi],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(AuthApi), (api) =>
      api.verify(input, { idempotencyKey: attempt.id }),
    ).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e))),
});
