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

/**
 * No answer came back from the workspace service.
 */
export class NoAnswer extends Schema.TaggedError<NoAnswer>()("NoAnswer", {}) {}

/**
 * A signed-in user's workspace profile: the user and the name the workspace shows for them.
 */
export const WorkspaceProfile = Schema.Struct({ user: Schema.String, name: Schema.String });

/**
 * An org's team names, keyed by team.
 */
export const Teams = Schema.Struct({
  org: Schema.String,
  names: Schema.Record(Schema.String, Schema.String),
});

/**
 * A team's rename as the workspace answers it. A legacy answer leaves out the org.
 */
export const Renamed = Schema.Struct({
  org: Schema.optional(Schema.String),
  team: Schema.String,
  name: Schema.String,
});

/**
 * The workspace port: the signed-in user's profile, an org's team names, and a team rename.
 */
export class WorkspaceApi extends Context.Service<
  WorkspaceApi,
  {
    readonly profile: (input: {
      readonly user: string;
    }) => Effect.Effect<typeof WorkspaceProfile.Type, NoAnswer>;
    readonly teams: (input: { readonly org: string }) => Effect.Effect<typeof Teams.Type, NoAnswer>;
    readonly rename: (
      input: { readonly org: string; readonly team: string; readonly name: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<typeof Renamed.Type, NoAnswer>;
  }
>()("flow-state-v3/fixtures/session/WorkspaceApi") {}
