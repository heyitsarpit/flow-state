import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../../src/index.ts";
import { GitApi } from "../services.ts";

/**
 * One sync of a repository, keyed by the repository: a lost answer is unknown.
 */
export const sync = transaction({
  id: "Git/sync",
  input: { repo: Schema.String },
  key: ["repo"],
  concurrency: "reject",
  services: [GitApi],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(GitApi), (api) =>
      api.sync(input, { idempotencyKey: attempt.id }),
    ).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e))),
});
