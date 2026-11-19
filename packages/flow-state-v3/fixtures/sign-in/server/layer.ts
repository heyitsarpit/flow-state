import { Effect, Layer } from "effect";
import { AuthApi, ProfileApi } from "../services.ts";
import { Auth } from "./auth.ts";
import { Profiles } from "./profiles.ts";

/**
 * The profile service's port fake: `ProfileApi` over the profiles server, whose lost answer is the
 * port's Unanswered.
 */
export const ProfileFake = Layer.effect(
  ProfileApi,
  Effect.map(Profiles, (profiles) =>
    ProfileApi.of({
      setUsername: (input, { idempotencyKey }) =>
        profiles.setUsername({ ...input, key: idempotencyKey }),
      me: profiles.me,
    }),
  ),
);

/**
 * The port fake: `AuthApi` over the auth server, whose lost answer is the port's NoResponse.
 */
export const AuthFake = Layer.effect(
  AuthApi,
  Effect.map(Auth, (auth) =>
    AuthApi.of({
      begin: (input, { idempotencyKey }) =>
        auth.begin({ ...input, key: idempotencyKey }).pipe(Effect.asVoid),
      verify: (input, { idempotencyKey }) =>
        auth.verify({ ...input, key: idempotencyKey }).pipe(Effect.asVoid),
    }),
  ),
);
