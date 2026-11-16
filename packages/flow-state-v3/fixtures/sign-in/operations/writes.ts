import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { ProfileApi } from "../services.ts";

/**
 * Saves an account's handle, one save per account at a time: a lost answer is unknown.
 */
export const setUsername = transaction({
  id: "Auth/set-username",
  input: { email: Schema.String, handle: Schema.String },
  key: ["email"],
  concurrency: "reject",
  services: [ProfileApi],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(ProfileApi), (api) =>
      api.setUsername(input, { idempotencyKey: attempt.id }),
    ).pipe(Effect.catchTag("Unanswered", (e) => Outcome.unknown(e))),
});
