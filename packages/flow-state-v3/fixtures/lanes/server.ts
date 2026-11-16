import { Effect, Layer } from "effect";
import { GitApi, NoResponse, RateLimited } from "../sync/contracts.ts";
import { Git } from "../sync/server.ts";

const lost = () => Effect.fail(new NoResponse());

/**
 * The Git port fake over a network that will not interrupt a sync: once sent, it runs to its
 * answer even when its caller is interrupted.
 */
export const GitFakeSteadfast = Layer.effect(
  GitApi,
  Effect.map(Git, (git) =>
    GitApi.of({
      sync: (input, { idempotencyKey }) =>
        Effect.uninterruptible(
          git.sync({ ...input, key: idempotencyKey }).pipe(
            Effect.asVoid,
            Effect.catchTags({
              FakeLost: lost,
              RateLimited: (e) => Effect.fail(new RateLimited({ retryAfterMs: e.retryAfterMs })),
            }),
          ),
        ),
      remoteHead: (input) =>
        git.remoteHead(input).pipe(Effect.catchTags({ FakeLost: lost, ServerError: lost })),
    }),
  ),
);
