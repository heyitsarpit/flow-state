import { Context, Effect, Schema } from "effect";

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
