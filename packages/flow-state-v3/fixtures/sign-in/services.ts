import { Context, type Effect, Schema } from "effect";

/**
 * The handle is taken by someone else.
 */
export class Taken extends Schema.TaggedError<Taken>()("Taken", { handle: Schema.String }) {}

/**
 * The profile service did not answer.
 */
export class Unanswered extends Schema.TaggedError<Unanswered>()("Unanswered", {}) {}

/**
 * The profile service: where a signed-in account's handle is saved and read, with the refresh
 * token of its session.
 */
export class ProfileApi extends Context.Service<
  ProfileApi,
  {
    readonly setUsername: (
      input: { readonly email: string; readonly handle: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<{ readonly handle: string }, Taken | Unanswered>;
    readonly me: (input: {
      readonly email: string;
    }) => Effect.Effect<{ readonly handle: string; readonly refreshToken: string }, Unanswered>;
  }
>()("flow-state-v3/fixtures/sign-in/ProfileApi") {}

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
