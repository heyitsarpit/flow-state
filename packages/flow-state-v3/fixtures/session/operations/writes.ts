import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { IdentityApi, WorkspaceApi } from "../services.ts";

/**
 * One sign-in of a session, keyed by nothing: a lost answer is unknown.
 */
export const signIn = transaction({
  id: "Identity/sign-in",
  input: { user: Schema.String },
  key: [],
  concurrency: "latest",
  services: [IdentityApi],
  commit: (input, { attempt }) =>
    IdentityApi.use((api) => api.signIn(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});

/**
 * A team renamed. A lost answer is unknown.
 */
export const renameTeam = transaction({
  id: "Workspace/renameTeam",
  input: { org: Schema.String, team: Schema.String, name: Schema.String },
  key: ["org", "team"],
  concurrency: "latest",
  services: [WorkspaceApi],
  commit: (input, { attempt }) =>
    WorkspaceApi.use((api) => api.rename(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoAnswer", (e) => Outcome.unknown(e)),
    ),
});
