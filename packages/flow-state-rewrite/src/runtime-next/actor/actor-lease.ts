import { Data, Deferred, Effect, Exit, Scope, SynchronizedRef } from "effect";

import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";

/** The sole terminal disposal authority for one exposed actor. */
export interface ActorLease<Actor> {
  // oxlint-disable-next-line anti-slop/no-readonly -- Lease contract exposes one fixed actor alongside its terminal disposal authority.
  readonly actor: Actor;
  dispose(): Effect.Effect<void, PublicDiagnostic>;
}

type LeaseOptions<Actor> = {
  actor: Actor;
  ownerScope: Scope.Scope;
  preflight(): Effect.Effect<void, PublicDiagnostic>;
  cleanup(): Effect.Effect<void, PublicDiagnostic>;
  retire(): Effect.Effect<void, PublicDiagnostic>;
};

type LeaseState =
  | { _tag: "idle" }
  | { _tag: "claimed"; completion: Deferred.Deferred<Exit.Exit<void, PublicDiagnostic>> };

type ClaimAction = Data.TaggedEnum<{
  reject: { exit: Exit.Exit<void, PublicDiagnostic> };
  start: { completion: Deferred.Deferred<Exit.Exit<void, PublicDiagnostic>> };
  join: { completion: Deferred.Deferred<Exit.Exit<void, PublicDiagnostic>> };
}>;

const claimAction = Data.taggedEnum<ClaimAction>();

/** A preflight rejection leaves the terminal claim open for a later attempt. */
// RETURN_TYPE: The private lease exposes only its actor and typed disposal effect.
export const makeActorLease = <Actor>(options: LeaseOptions<Actor>): ActorLease<Actor> => {
  const state = SynchronizedRef.makeUnsafe<LeaseState>({ _tag: "idle" });

  const awaitExit = (exit: Exit.Exit<void, PublicDiagnostic>) => exit;

  const dispose = () =>
    Effect.gen(function* () {
      const current = yield* SynchronizedRef.get(state);

      if (current._tag === "claimed")
        return yield* Deferred.await(current.completion).pipe(Effect.flatMap(awaitExit));

      const preflightExit = yield* Effect.exit(Effect.suspend(() => options.preflight()));

      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const action = yield* SynchronizedRef.modify(
            state,
            // RETURN_TYPE: Keep every atomic claim action distinct while returning one complete state.
            (latest): [ClaimAction, LeaseState] => {
              if (latest._tag === "claimed")
                return [claimAction.join({ completion: latest.completion }), latest];

              if (Exit.isFailure(preflightExit))
                return [claimAction.reject({ exit: preflightExit }), latest];

              const completion = Deferred.makeUnsafe<Exit.Exit<void, PublicDiagnostic>>();
              const claimed: LeaseState = { _tag: "claimed", completion };

              return [claimAction.start({ completion }), claimed];
            },
          );

          if (action._tag === "reject") return yield* restore(awaitExit(action.exit));

          if (action._tag === "start") {
            const worker = Effect.uninterruptibleMask((restoreCleanup) =>
              Effect.gen(function* () {
                const cleanupExit = yield* Effect.exit(
                  restoreCleanup(Effect.suspend(() => options.cleanup())),
                );

                const terminalExit = Exit.isSuccess(cleanupExit)
                  ? yield* Effect.exit(Effect.suspend(() => options.retire()))
                  : cleanupExit;

                yield* Deferred.succeed(action.completion, terminalExit);
              }),
            );

            yield* Effect.forkIn(worker, options.ownerScope, {
              startImmediately: true,
              uninterruptible: false,
            });
          }

          return yield* restore(Deferred.await(action.completion).pipe(Effect.flatMap(awaitExit)));
        }),
      );
    });

  return { actor: options.actor, dispose };
};
