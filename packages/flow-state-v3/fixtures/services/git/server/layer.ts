import { Effect, Layer, Ref } from "effect";
import { GitApi, NoResponse } from "../services.ts";
import { Git } from "./git.ts";

const gitApi = Effect.map(Git, (git) =>
  GitApi.of({
    sync: (input, { idempotencyKey }) =>
      git.sync({ ...input, key: idempotencyKey }).pipe(Effect.asVoid),
    remoteHead: (input) =>
      git
        .remoteHead(input)
        .pipe(Effect.catchTag("ServerError", () => Effect.fail(new NoResponse()))),
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

/**
 * The port fake over a Git client whose cleanup of an abandoned sync throws, as a client whose
 * abort hook throws does.
 */
export const GitFakeCleanupThrows = Layer.effect(
  GitApi,
  Effect.map(gitApi, (api) =>
    GitApi.of({
      ...api,
      sync: (input, options) =>
        Effect.onInterrupt(api.sync(input, options), () =>
          Effect.die("the sync's abort hook threw"),
        ),
    }),
  ),
);

/**
 * The port fake over a Git client that, when a sync is abandoned, reads the remote head to learn
 * whether the push landed, then cancels it, both over the connection it opened when the services
 * started: a request over a closed connection fails.
 */
export const GitFakeCancelsAbandoned = Layer.effect(
  GitApi,
  Effect.gen(function* () {
    const open = yield* Ref.make(true);
    yield* Effect.addFinalizer(() => Ref.set(open, false));
    const git = yield* Git;
    const api = yield* gitApi;

    const connected = <A, E>(request: Effect.Effect<A, E>) =>
      Effect.flatMap(Ref.get(open), (live) =>
        live ? Effect.ignore(request) : Effect.die("the Git host connection was closed"),
      );

    return GitApi.of({
      ...api,
      sync: (input, options) =>
        Effect.onInterrupt(api.sync(input, options), () =>
          connected(git.remoteHead({ repo: input.repo })).pipe(
            Effect.andThen(connected(git.cancel({ key: options.idempotencyKey }))),
          ),
        ),
    });
  }),
);
