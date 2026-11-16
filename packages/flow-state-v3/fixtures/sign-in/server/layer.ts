import { Effect, Layer } from "effect";
import { ProfileApi } from "../services.ts";
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
