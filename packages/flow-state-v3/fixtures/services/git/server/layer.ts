import { Effect, Layer } from "effect";
import { GitApi, NoResponse, RateLimited } from "../services.ts";
import { Git } from "./git.ts";

const lost = () => Effect.fail(new NoResponse());

const gitApi = Effect.map(Git, (git) =>
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
);

/**
 * The port fake: `GitApi` over the Git host's server; a lost or broken answer is the port's
 * NoResponse.
 */
export const GitFake = Layer.effect(GitApi, gitApi);

/**
 * The port fake over a Git client whose connection to the host, opened when the services start,
 * fails to close when they are released, as a client whose disconnect rejects does.
 */
export const GitFakeConnectionCloseFails = Layer.effect(
  GitApi,
  Effect.tap(gitApi, () =>
    Effect.addFinalizer(() => Effect.die("the Git host connection did not close")),
  ),
);
