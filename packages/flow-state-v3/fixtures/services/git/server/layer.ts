import { Effect, Layer } from "effect";
import { GitApi, NoResponse, RateLimited } from "../services.ts";
import { Git } from "./git.ts";

const lost = () => Effect.fail(new NoResponse());

/**
 * The port fake: `GitApi` over the Git host's server; a lost or broken answer is the port's
 * NoResponse.
 */
export const GitFake = Layer.effect(
  GitApi,
  Effect.map(Git, (git) =>
    GitApi.of({
      sync: (input, { idempotencyKey }) =>
        git.sync({ ...input, key: idempotencyKey }).pipe(
          Effect.asVoid,
          Effect.catchTags({
            FakeLost: lost,
            RateLimited: (e) => Effect.fail(new RateLimited({ retryAfterMs: e.retryAfterMs })),
          }),
        ),
      remoteHead: (input) =>
        git.remoteHead(input).pipe(Effect.catchTags({ FakeLost: lost, ServerError: lost })),
    }),
  ),
);
