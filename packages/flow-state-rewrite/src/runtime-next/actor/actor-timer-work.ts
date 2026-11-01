import { Cause, Clock, Deferred, Duration, Effect, Exit, Fiber, Option, Scope } from "effect";

import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";

/** The actor retains absolute due time and one optional owner-provided firing effect. */
export type LifecycleDeadline = {
  name: string;
  startedAt: number;
  dueAt: number;
  generation: number;
  status: "armed" | "fired" | "cancelled";
  fire: Option.Option<Effect.Effect<void, PublicDiagnostic>>;
};

export type TimerClaim = {
  deadline: LifecycleDeadline;
  fiber: Fiber.Fiber<void, PublicDiagnostic>;
};

export type PreparedTimerClaims = {
  claims: TimerClaim[];
  start: Deferred.Deferred<void>;
};

const invalidTimer = (reason: string) =>
  Failure({
    code: "SchemaValidation",
    path: ["actor", "timer"],
    details: { reason },
    summary: "Actor timer deadline is invalid",
    help: "Restore a named timer with a safe absolute deadline and generation.",
  });

const validDeadline = (deadline: LifecycleDeadline) =>
  deadline.name.length > 0 &&
  Number.isSafeInteger(deadline.startedAt) &&
  Number.isSafeInteger(deadline.dueAt) &&
  Number.isSafeInteger(deadline.generation) &&
  deadline.startedAt >= 0 &&
  deadline.dueAt >= deadline.startedAt &&
  deadline.generation >= 0;

/** Prepare retained claims under the actor scope; their work waits for the active cut. */
// RETURN_TYPE: The timer preflight can fail before claims become active and must retain that typed channel.
export const prepareTimerClaims = (
  deadlines: LifecycleDeadline[],
  clock: Clock.Clock,
  scope: Scope.Scope,
): Effect.Effect<PreparedTimerClaims, PublicDiagnostic> =>
  Effect.gen(function* () {
    const names = new Set<string>();

    for (const deadline of deadlines) {
      if (!validDeadline(deadline) || names.has(deadline.name))
        return yield* Effect.fail(invalidTimer("invalid-or-duplicate"));

      names.add(deadline.name);
    }

    const start = Deferred.makeUnsafe<void>();
    const claims: TimerClaim[] = [];

    for (const deadline of deadlines) {
      if (deadline.status !== "armed") continue;

      const run = Effect.gen(function* () {
        yield* Deferred.await(start);
        const now = yield* clock.currentTimeMillis;
        const remaining = deadline.dueAt - now;

        if (remaining > 0) yield* clock.sleep(Duration.millis(remaining));

        if (deadline.status !== "armed") return;
        deadline.status = "fired";

        if (Option.isSome(deadline.fire)) yield* deadline.fire.value;
      });

      const fiber = yield* Effect.forkIn(run, scope, { startImmediately: true });
      claims.push({ deadline, fiber });
    }

    return { claims, start };
  });

/** Release the gate only after the actor's active lifecycle publication commits. */
export const activateTimerClaims = (prepared: PreparedTimerClaims) => {
  Deferred.doneUnsafe(prepared.start, Effect.void);
};

const appendTimerExitReasons = (
  reasons: Cause.Reason<PublicDiagnostic>[],
  exit: Exit.Exit<void, PublicDiagnostic>,
  cleanupFiberId: number,
) => {
  if (Exit.isSuccess(exit)) return;

  for (const reason of exit.cause.reasons)
    if (!Cause.isInterruptReason(reason) || reason.fiberId !== cleanupFiberId) reasons.push(reason);
};

/** Suspension keeps armed absolute deadlines and retains every non-interruption failure. */
export const stopTimerClaims = (claims: TimerClaim[]) =>
  Effect.gen(function* () {
    const reasons: Cause.Reason<PublicDiagnostic>[] = [];

    for (const claim of [...claims].reverse()) {
      const cleanupFiberId = yield* Effect.fiberId;
      yield* Fiber.interruptAs(claim.fiber, cleanupFiberId);
      appendTimerExitReasons(reasons, yield* Fiber.await(claim.fiber), cleanupFiberId);
    }

    return reasons;
  });
