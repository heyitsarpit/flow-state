import { Effect, Layer } from "effect";
import { GitApi, NoResponse } from "../../services/git/services.ts";
import { Git } from "../../services/git/server/git.ts";

/**
 * The Git port fake over a network that will not interrupt a sync: once sent, it runs to its
 * answer even when its caller is interrupted.
 */
export const GitFakeSteadfast = Layer.effect(
  GitApi,
  Effect.map(Git, (git) =>
    GitApi.of({
      sync: (input, { idempotencyKey }) =>
        Effect.uninterruptible(git.sync({ ...input, key: idempotencyKey }).pipe(Effect.asVoid)),
      remoteHead: (input) =>
        git
          .remoteHead(input)
          .pipe(Effect.catchTag("ServerError", () => Effect.fail(new NoResponse()))),
    }),
  ),
);

/**
 * The Git port fake over a network that carries every sync out and never brings an answer back,
 * nor lets its caller interrupt it: a host that hangs. Only a reload ends such a sync.
 */
export const GitFakeUnanswered = Layer.succeed(
  GitApi,
  GitApi.of({
    sync: () => Effect.uninterruptible(Effect.never),
    remoteHead: () => Effect.never,
  }),
);
