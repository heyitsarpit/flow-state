import { Effect, Layer } from "effect";
import { AuthApi, NoResponse, ProfileApi, Throttled, WrongCode } from "../services.ts";
import { Auth } from "./auth.ts";
import { Profiles } from "./profiles.ts";

const unanswered = () => Effect.fail({ _tag: "Unanswered" } as const);

/**
 * The profile service's port fake: `ProfileApi` over the profiles server, a lost answer read as the
 * port's Unanswered.
 */
export const ProfileFake = Layer.effect(
  ProfileApi,
  Effect.map(Profiles, (profiles) =>
    ProfileApi.of({
      setUsername: (input, { idempotencyKey }) =>
        profiles
          .setUsername({ ...input, key: idempotencyKey })
          .pipe(Effect.catchTag("FakeLost", unanswered)),
      me: (input) => profiles.me(input).pipe(Effect.catchTag("FakeLost", unanswered)),
    }),
  ),
);

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
