import { Context, Effect, Schema } from "effect";
import { Outcome, resource, transaction } from "../../src/index.ts";

/**
 * The Git host turned a sync away for now; it may be sent again after `retryAfterMs`.
 */
export class RateLimited extends Schema.TaggedError<RateLimited>()("RateLimited", {
  retryAfterMs: Schema.Number,
}) {}

/**
 * The Git host's answer did not come back, or came back broken.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

/**
 * The Git host's API: where the data comes from. Its production Layer is `GitLive`; each sync
 * carries its Attempt's id as the idempotency key.
 */
export class GitApi extends Context.Service<
  GitApi,
  {
    readonly sync: (
      input: { readonly repo: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<void, RateLimited | NoResponse>;
    readonly remoteHead: (input: {
      readonly repo: string;
    }) => Effect.Effect<{ readonly head: string }, NoResponse>;
  }
>()("flow-state-v3/fixtures/sync/GitApi") {}

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

/**
 * Reads a repository's remote head.
 */
export const remoteHead = resource({
  id: "Git/remote-head",
  input: { repo: Schema.String },
  key: ["repo"],
  services: [GitApi],
  staleTime: 0,
  gcTime: 0,
  lookup: (input) => Effect.flatMap(Effect.service(GitApi), (api) => api.remoteHead(input)),
});
