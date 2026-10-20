import { Cause, Deferred, Effect, Exit, Option, Result } from "effect";

import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { ActorSnapshot } from "../runtime.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import type { ContextNotification } from "../context/context-coordinator.js";
import type { EvidenceCredit } from "../evidence/evidence-journal.js";
import type { EvidenceProvenance } from "../evidence/evidence-record.js";
import type { ActorIdentity } from "./actor-directory.js";
import type { ActorPublication, ActorSnapshotCopyPolicy } from "./actor-snapshot.js";
import { checkedActorSuccessor } from "./actor-state.js";
import { preparePublishedSnapshot } from "./actor-snapshot.js";
import type { makeRuntimeEvidencePolicy } from "../runtime-services.js";

export type ActorLifecycle = ActorSnapshot<MachineDefinition>["lifecycle"];

export const isActorInactive = (lifecycle: ActorLifecycle) =>
  lifecycle === "suspended" || lifecycle === "disposed";

export type LifecycleCause =
  | { kind: "fresh" }
  | { kind: "restore" }
  | { kind: "attachment" }
  | { kind: "owner-disposal" }
  | { kind: "runtime-disposal" };

export type LifecycleCommand = {
  to: ActorLifecycle;
  cause: LifecycleCause;
};

/** Await the engine mailbox acknowledgement for one reserved lifecycle command. */
export const admitLifecycleCommand = <Outcome>(input: {
  command: LifecycleCommand;
  admit(
    command: LifecycleCommand,
  ): Result.Result<Deferred.Deferred<Outcome, PublicDiagnostic>, PublicDiagnostic>;
}) => {
  const admitted = input.admit(input.command);

  return Result.isFailure(admitted)
    ? Effect.fail(admitted.failure)
    : Deferred.await(admitted.success).pipe(Effect.asVoid);
};

/** Run only fallible lifecycle preparation and cleanup before the engine's total commit. */
export const runPreparedLifecycleWork = <Prepared, Receipt, Error = PublicDiagnostic>(input: {
  prepare(): Result.Result<Prepared, Error>;
  work: Effect.Effect<void, PublicDiagnostic>;
  cancel(prepared: Prepared): void;
  commit(prepared: Prepared): Effect.Effect<Receipt>;
}) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const prepared = input.prepare();

      if (Result.isFailure(prepared)) return yield* Effect.fail(prepared.failure);
      const workExit = yield* Effect.exit(restore(input.work));

      if (Exit.isFailure(workExit)) {
        input.cancel(prepared.success);

        return yield* Effect.failCause(workExit.cause);
      }

      return yield* input.commit(prepared.success);
    }),
  );

/** Report a committed cleanup failure after all prepared permits have been consumed. */
export const settleCommittedLifecycle = <Receipt>(
  receipt: Receipt,
  command: LifecycleCommand,
  cleanupFailure: Option.Option<Cause.Cause<PublicDiagnostic>>,
) =>
  Option.isSome(cleanupFailure) && command.to !== "prepared"
    ? Effect.failCause(cleanupFailure.value)
    : Effect.succeed(receipt);

const invalidTransition = (from: ActorLifecycle, command: LifecycleCommand) =>
  Failure({
    code: "InvariantViolation",
    path: ["actor", "lifecycle"],
    details: { from, to: command.to, cause: command.cause.kind },
    summary: "Actor lifecycle transition is not legal",
    help: "Use the transition admitted for this actor state and cause.",
  });

type LegalEdge = {
  from: ActorLifecycle;
  to: LifecycleCommand["to"];
  cause: LifecycleCause["kind"];
};

const legalEdges: LegalEdge[] = [
  { from: "prepared", to: "prepared", cause: "restore" },
  { from: "prepared", to: "active", cause: "fresh" },
  { from: "prepared", to: "active", cause: "attachment" },
  { from: "active", to: "suspended", cause: "attachment" },
  { from: "suspended", to: "active", cause: "attachment" },
  { from: "prepared", to: "disposed", cause: "owner-disposal" },
  { from: "active", to: "disposed", cause: "owner-disposal" },
  { from: "suspended", to: "disposed", cause: "owner-disposal" },
  { from: "prepared", to: "disposed", cause: "runtime-disposal" },
  { from: "active", to: "disposed", cause: "runtime-disposal" },
  { from: "suspended", to: "disposed", cause: "runtime-disposal" },
];

/** One canonical legal graph; boot restoration is a prepared baseline, not a transition. */
export const planLifecycleTransition = (from: ActorLifecycle, command: LifecycleCommand) => {
  return legalEdges.some(
    (edge) => edge.from === from && edge.to === command.to && edge.cause === command.cause.kind,
  )
    ? Result.succeed(command)
    : Result.fail(invalidTransition(from, command));
};

/** Build the complete lifecycle publication permit before any work or owner state changes. */
export const prepareLifecycleCut = <D extends MachineDefinition>(
  input: {
    copyPolicy: ActorSnapshotCopyPolicy;
    publication: ActorPublication<D>;
    command: LifecycleCommand;
    mayResume: boolean;
    identity: ActorIdentity;
    provenance: EvidenceProvenance;
    credit: EvidenceCredit;
    evidence: Pick<ReturnType<typeof makeRuntimeEvidencePolicy>, "prepareLifecycle">;
    prepareNotification(
      snapshot: ActorSnapshot<D>,
    ): Result.Result<Option.Option<ContextNotification>, PublicDiagnostic>;
  },
  registerRollback: (cancel: () => void) => void,
) => {
  const before = input.publication.snapshot;
  const legal = planLifecycleTransition(before.lifecycle, input.command);

  if (Result.isFailure(legal)) return Result.fail(legal.failure);

  if (input.command.to === "active" && !input.mayResume)
    return Result.fail(invalidTransition(before.lifecycle, input.command));

  const revision = checkedActorSuccessor(before.revision, "revision");

  if (Result.isFailure(revision)) return Result.fail(revision.failure);

  const owned = preparePublishedSnapshot(
    {
      ...before,
      lifecycle: input.command.to,
      revision: revision.success,
    },
    input.copyPolicy,
  );

  if (Result.isFailure(owned)) return Result.fail(owned.failure);

  const evidence = input.evidence.prepareLifecycle(input.credit, {
    _tag: "lifecycle",
    machineTurn: false,
    from: before.lifecycle,
    to: input.command.to,
    terminal: input.command.to === "disposed",
    cause: input.command.cause,
    fence: input.identity,
    provenance: input.provenance,
    timestamp: 0,
    publicationRevision: revision.success,
    machineTurnRevision: input.publication.machineTurnRevision,
    before,
    after: owned.success,
  });

  if (Result.isFailure(evidence)) return Result.fail(evidence.failure);
  registerRollback(() => evidence.success.cancel());
  const notification = input.prepareNotification(owned.success);

  if (Result.isFailure(notification)) return Result.fail(notification.failure);

  return Result.succeed({
    snapshot: owned.success,
    evidence: evidence.success,
    notification: notification.success,
  });
};

/** Finish an actor's terminal lifecycle edge before releasing its mailbox and observation routes. */
export const shutdownActor = (input: {
  seal(): void;
  awaitActivation(): Effect.Effect<void>;
  drain(): Effect.Effect<void, PublicDiagnostic>;
  phase(): "prepared" | "active" | "abandoned";
  lifecycle(): ActorLifecycle;
  retire(): void;
  dispose(): Effect.Effect<void, PublicDiagnostic>;
  close(): Effect.Effect<void>;
  complete(): void;
  release(): void;
}) =>
  Effect.gen(function* () {
    input.seal();
    yield* input.awaitActivation();
    const phase = input.phase();

    if (phase === "abandoned") return;
    const reasons: Cause.Reason<PublicDiagnostic>[] = [];

    if (phase !== "prepared") {
      yield* input.drain();

      if (input.lifecycle() !== "disposed") {
        const terminal = yield* Effect.exit(input.dispose());

        if (Exit.isFailure(terminal)) {
          if (input.lifecycle() !== "disposed") return yield* Effect.failCause(terminal.cause);
          reasons.push(...terminal.cause.reasons);
        }
      }
    }

    const closed = yield* Effect.exit(input.close());

    if (Exit.isFailure(closed)) reasons.push(...closed.cause.reasons);

    const completed = yield* Effect.exit(Effect.sync(() => input.complete()));

    if (Exit.isFailure(completed)) reasons.push(...completed.cause.reasons);

    const released = yield* Effect.exit(Effect.sync(() => input.release()));

    if (Exit.isFailure(released)) reasons.push(...released.cause.reasons);
    input.retire();

    if (reasons.length > 0) return yield* Effect.failCause(Cause.fromReasons(reasons));
  });

/** Coalesce terminal cleanup so interrupted and concurrent callers observe one owner cut. */
export const makeActorShutdown = <Outcome>(
  input: Omit<Parameters<typeof shutdownActor>[0], "dispose"> & {
    startWorker(worker: Effect.Effect<void>): Effect.Effect<void>;
    unseal(): void;
    admitTerminal(command: LifecycleCommand): Effect.Effect<Outcome, PublicDiagnostic>;
  },
) => {
  let inFlight: Deferred.Deferred<Exit.Exit<void, PublicDiagnostic>> | undefined;

  return () =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        let completion = inFlight;

        if (completion === undefined) {
          if (input.phase() === "abandoned") return;

          const claimed = Deferred.makeUnsafe<Exit.Exit<void, PublicDiagnostic>>();
          completion = claimed;
          inFlight = claimed;

          const worker = Effect.uninterruptibleMask((restoreCleanup) =>
            Effect.gen(function* () {
              const exit = yield* Effect.exit(
                restoreCleanup(
                  shutdownActor({
                    ...input,
                    dispose: () =>
                      input
                        .admitTerminal({ to: "disposed", cause: { kind: "runtime-disposal" } })
                        .pipe(Effect.asVoid),
                  }),
                ),
              );

              if (Exit.isFailure(exit) && input.lifecycle() !== "disposed") {
                input.unseal();
              }

              Deferred.doneUnsafe(claimed, Effect.succeed(exit));
              inFlight = undefined;
            }),
          );

          yield* input.startWorker(worker);
        }

        return yield* restore(Deferred.await(completion)).pipe(Effect.flatMap((exit) => exit));
      }),
    );
};
