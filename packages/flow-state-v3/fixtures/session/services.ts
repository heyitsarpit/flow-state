import { Context, Effect, Schema } from "effect";

/**
 * The identity provider turned a sign-in away: the user is unknown or locked.
 */
export class Refused extends Schema.TaggedError<Refused>()("Refused", {
  reason: Schema.String,
}) {}

/**
 * The identity provider's answer did not come back, or came back broken.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

/**
 * A signed-in user's profile, as the identity provider returns it.
 */
export const Profile = Schema.Struct({ user: Schema.String, displayName: Schema.String });

/**
 * The identity provider's API: where the data comes from. Its production Layer is `IdentityLive`;
 * each sign-in carries its Attempt's id as the idempotency key.
 */
export class IdentityApi extends Context.Service<
  IdentityApi,
  {
    readonly signIn: (
      input: { readonly user: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<typeof Profile.Type, Refused | NoResponse>;
  }
>()("workspace/IdentityApi") {}
