import { Cause, Deferred, Effect, Exit, Option, Result, type Scope } from "effect";

import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import { isPermitRollbackFailure, type PermitRollbackFailure } from "./actor-state.js";
import type { ActorEngine } from "./actor-engine-types.js";
import type { LifecycleCommand } from "./lifecycle.js";

/** Roll back the prepared lifecycle permits exhaustively in reverse acquisition order. */
export const cancelPreparedLifecycleCut = (
  launches: { permit: { cancel(): void } }[],
  cancelNotification: () => void,
  cancelEvidence: () => void,
) => {
  const reasons: Cause.Reason<PublicDiagnostic>[] = [];

  const cancellations = [
    ...launches.toReversed().map((launch) => () => launch.permit.cancel()),
    cancelNotification,
    cancelEvidence,
  ];

  for (const cancel of cancellations) {
    const cancelled = Result.try({ try: cancel, catch: (cause) => cause });

    if (Result.isFailure(cancelled)) reasons.push(Cause.makeDieReason(cancelled.failure));
  }

  return reasons;
};

export const failActorPreparation = (failure: PublicDiagnostic | PermitRollbackFailure) => {
  if (!isPermitRollbackFailure(failure)) return Effect.fail(failure);

  const primary =
    failure.primary._tag === "Failure"
      ? Cause.makeFailReason(failure.primary.failure)
      : Cause.makeDieReason(failure.primary.defect);

  const reasons = [primary, ...failure.cleanupFailures.map(Cause.makeDieReason)];

  return Effect.failCause(Cause.fromReasons(reasons));
};

type ActorEnginePhase = "prepared" | "active" | "abandoned";

type ActorEngineActivation = {
  restored: boolean;
  ownerScope: Scope.Scope;
  runLifecycle(command: LifecycleCommand): Effect.Effect<void, PublicDiagnostic>;
  activateMailbox(): Effect.Effect<void, PublicDiagnostic>;
  afterAcknowledgement(): void;
  rejectAbandoned(): PublicDiagnostic;
};

type ActorEngineAbandonment = {
  shutdown(): Effect.Effect<void, PublicDiagnostic>;
  closeMailbox(): Effect.Effect<void, PublicDiagnostic>;
  completeObservation(): void;
  releaseCredit(): void;
};

/** Own the prepared/active/abandoned phase and single activation flight for one actor. */
export const makeActorEngineLifecycle = <D extends MachineDefinition>() => {
  let phase: ActorEnginePhase = "prepared";

  let activation: Option.Option<Deferred.Deferred<ActorEngine<D>, PublicDiagnostic>> =
    Option.none();

  return {
    phase: () => phase,
    retire: () => {
      phase = "abandoned";
    },
    awaitActivation: () =>
      Option.isSome(activation)
        ? Effect.exit(Deferred.await(activation.value)).pipe(Effect.asVoid)
        : Effect.void,
    activate: (engine: ActorEngine<D>, options: ActorEngineActivation) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          if (phase === "abandoned") return yield* Effect.fail(options.rejectAbandoned());

          let completion: Deferred.Deferred<ActorEngine<D>, PublicDiagnostic>;

          if (Option.isSome(activation)) completion = activation.value;
          else if (phase === "active") return engine;
          else {
            completion = Deferred.makeUnsafe<ActorEngine<D>, PublicDiagnostic>();
            activation = Option.some(completion);

            const worker = Effect.uninterruptibleMask((restoreWorker) =>
              Effect.gen(function* () {
                const exit = yield* Effect.exit(
                  restoreWorker(
                    Effect.gen(function* () {
                      if (options.restored) {
                        yield* options.runLifecycle({ to: "prepared", cause: { kind: "restore" } });
                        options.afterAcknowledgement();
                      }

                      yield* options.runLifecycle({ to: "active", cause: { kind: "fresh" } });
                      yield* options.activateMailbox();
                      phase = "active";
                      options.afterAcknowledgement();

                      return engine;
                    }),
                  ),
                );

                Deferred.doneUnsafe(
                  completion,
                  Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause),
                );

                if (Option.isSome(activation) && activation.value === completion)
                  activation = Option.none();
              }),
            );

            yield* Effect.forkIn(worker, options.ownerScope, { startImmediately: true });
          }

          return yield* restore(Deferred.await(completion));
        }),
      ),
    abandon: (options: ActorEngineAbandonment) =>
      Effect.gen(function* () {
        if (Option.isSome(activation)) return yield* options.shutdown();

        if (phase !== "prepared") return;
        phase = "abandoned";
        yield* options.closeMailbox();
        options.completeObservation();
        options.releaseCredit();
      }),
  };
};
