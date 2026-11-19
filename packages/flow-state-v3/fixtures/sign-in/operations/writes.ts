import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { AuthApi, ProfileApi } from "../services.ts";

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
    ProfileApi.use((api) => api.setUsername(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("Unanswered", (e) => Outcome.unknown(e)),
    ),
});

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
    AuthApi.use((api) => api.begin(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
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
    AuthApi.use((api) => api.verify(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});
