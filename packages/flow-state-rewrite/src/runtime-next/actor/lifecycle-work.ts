import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FiberMap,
  Option,
  type Clock,
  type Scope,
} from "effect";

import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { LifecycleCommand } from "./lifecycle.js";
import {
  activateTimerClaims,
  prepareTimerClaims,
  stopTimerClaims,
  type LifecycleDeadline,
  type PreparedTimerClaims,
} from "./actor-timer-work.js";

export type { LifecycleDeadline } from "./actor-timer-work.js";

/** A live resource carries the exact effect that can reacquire it after suspension. */
export type LifecycleResource = {
  name: string;
  release: Effect.Effect<void, PublicDiagnostic>;
  reacquire: Option.Option<Effect.Effect<LifecycleResource, PublicDiagnostic>>;
};

/** Owned work is interrupted before resources are released. */
export type LifecycleTask = {
  name: string;
  fiber: Fiber.Fiber<void, PublicDiagnostic>;
  finalize: Effect.Effect<void, PublicDiagnostic>;
  reacquire: Option.Option<Effect.Effect<LifecycleTask, PublicDiagnostic>>;
};

export type LiveLifecycleWork = {
  resources: LifecycleResource[];
  tasks: OwnedLifecycleTask[];
  deadlines: LifecycleDeadline[];
  timers: PreparedTimerClaims;
};

export type DetachedLifecycleWork = {
  resources: Effect.Effect<LifecycleResource, PublicDiagnostic>[];
  tasks: Effect.Effect<LifecycleTask, PublicDiagnostic>[];
  deadlines: LifecycleDeadline[];
};

type StoppedLifecycleWork = {
  detached: DetachedLifecycleWork;
  cause: Option.Option<Cause.Cause<PublicDiagnostic>>;
};

type TaskOwner = { fiber: Fiber.Fiber<void>; release: Deferred.Deferred<void> };

type OwnedLifecycleTask = { task: LifecycleTask; owner: TaskOwner };

const appendExitReasons = (
  reasons: Cause.Reason<PublicDiagnostic>[],
  exit: Exit.Exit<void, PublicDiagnostic>,
  cleanupFiberId?: number,
) => {
  if (Exit.isSuccess(exit)) return;

  for (const reason of exit.cause.reasons)
    if (
      cleanupFiberId === undefined ||
      !Cause.isInterruptReason(reason) ||
      reason.fiberId !== cleanupFiberId
    )
      reasons.push(reason);
};

const releaseOwnedTask = (owned: OwnedLifecycleTask, reasons: Cause.Reason<PublicDiagnostic>[]) =>
  Effect.gen(function* () {
    const cleanupFiberId = yield* Effect.fiberId;
    yield* Fiber.interruptAs(owned.task.fiber, cleanupFiberId);

    appendExitReasons(reasons, yield* Fiber.await(owned.task.fiber), cleanupFiberId);
    appendExitReasons(reasons, yield* Effect.exit(owned.task.finalize));
    yield* Deferred.succeed(owned.owner.release, undefined);
    appendExitReasons(reasons, yield* Fiber.await(owned.owner.fiber));
  });

/** Keep absolute deadlines and reacquisition effects while draining owned work in order. */
// RETURN_TYPE: Stopping work always returns the retained attachments and complete cleanup Cause as data.
export const stopLifecycleWork = (live: LiveLifecycleWork): Effect.Effect<StoppedLifecycleWork> =>
  Effect.gen(function* () {
    const reasons = yield* stopTimerClaims(live.timers.claims);

    for (const owned of [...live.tasks].reverse()) yield* releaseOwnedTask(owned, reasons);

    for (const resource of [...live.resources].reverse()) {
      const finalization = yield* Effect.exit(resource.release);
      appendExitReasons(reasons, finalization);
    }

    return {
      detached: {
        resources: live.resources.flatMap((resource) =>
          Option.isSome(resource.reacquire) ? [resource.reacquire.value] : [],
        ),
        tasks: live.tasks.flatMap(({ task }) =>
          Option.isSome(task.reacquire) ? [task.reacquire.value] : [],
        ),
        deadlines: live.deadlines,
      },
      cause: reasons.length > 0 ? Option.some(Cause.fromReasons(reasons)) : Option.none(),
    };
  });

const rollbackLifecycleWork = (
  resources: LifecycleResource[],
  tasks: OwnedLifecycleTask[],
  original: Cause.Cause<PublicDiagnostic>,
) =>
  Effect.gen(function* () {
    const reasons = [...original.reasons];

    for (const owned of [...tasks].reverse()) yield* releaseOwnedTask(owned, reasons);

    for (const resource of [...resources].reverse()) {
      const exit = yield* Effect.exit(resource.release);
      appendExitReasons(reasons, exit);
    }

    return yield* Effect.failCause(Cause.fromReasons(reasons));
  });

/** Give a task acquisition its own scope child so caller-forked work survives activation. */
const acquireOwnedTask = (
  acquire: Effect.Effect<LifecycleTask, PublicDiagnostic>,
  scope: Scope.Scope,
) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const ready = Deferred.makeUnsafe<LifecycleTask, PublicDiagnostic>();
      const release = Deferred.makeUnsafe<void>();

      const fiber = yield* Effect.forkIn(
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const exit = yield* Effect.exit(restore(acquire));
            Deferred.doneUnsafe(ready, exit);

            if (Exit.isSuccess(exit)) yield* restore(Deferred.await(release));
          }),
        ),
        scope,
        { startImmediately: true },
      );

      const exit = yield* Effect.exit(restore(Deferred.await(ready)));

      if (Exit.isFailure(exit)) {
        yield* Fiber.interrupt(fiber);

        return yield* Effect.failCause(exit.cause);
      }

      return { task: exit.value, owner: { fiber, release } satisfies TaskOwner };
    }),
  );

/** Validate providers first; failed reacquisition rolls back only the new live prefix. */
// RETURN_TYPE: Resume keeps provider or reacquisition failure in the typed Effect channel after rollback.
export const resumeLifecycleWork = (
  detached: DetachedLifecycleWork,
  validateProviders: Effect.Effect<void, PublicDiagnostic>,
  clock: Clock.Clock,
  scope: Scope.Scope,
): Effect.Effect<LiveLifecycleWork, PublicDiagnostic> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      yield* restore(validateProviders);
      const resources: LifecycleResource[] = [];
      const tasks: OwnedLifecycleTask[] = [];

      for (const acquire of detached.resources) {
        const exit = yield* Effect.exit(restore(acquire));

        if (Exit.isFailure(exit)) return yield* rollbackLifecycleWork(resources, tasks, exit.cause);

        resources.push(exit.value);
      }

      for (const acquire of detached.tasks) {
        const exit = yield* Effect.exit(restore(acquireOwnedTask(acquire, scope)));

        if (Exit.isFailure(exit)) return yield* rollbackLifecycleWork(resources, tasks, exit.cause);

        tasks.push(exit.value);
      }

      const timerExit = yield* Effect.exit(prepareTimerClaims(detached.deadlines, clock, scope));

      if (Exit.isFailure(timerExit))
        return yield* rollbackLifecycleWork(resources, tasks, timerExit.cause);

      return {
        resources,
        tasks,
        deadlines: detached.deadlines,
        timers: timerExit.value,
      };
    }),
  );

/** Reconcile one lifecycle edge while the ActorEngine retains the only current work record. */
export const reconcileLifecycleWork = (
  command: LifecycleCommand,
  detached: DetachedLifecycleWork,
  live: Option.Option<LiveLifecycleWork>,
  validateProviders: Effect.Effect<void, PublicDiagnostic>,
  clock: Clock.Clock,
  scope: Scope.Scope,
) =>
  Effect.gen(function* () {
    if (command.to === "active") {
      const resumed = yield* resumeLifecycleWork(detached, validateProviders, clock, scope);

      return {
        detached,
        live: Option.some(resumed),
        cause: Option.none<Cause.Cause<PublicDiagnostic>>(),
      };
    }

    if (command.to === "prepared" || Option.isNone(live))
      return { detached, live, cause: Option.none<Cause.Cause<PublicDiagnostic>>() };

    const stopped = yield* stopLifecycleWork(live.value);

    return {
      detached: stopped.detached,
      live: Option.none<LiveLifecycleWork>(),
      cause: stopped.cause,
    };
  });

/** Stop operation fibers at a leaving edge and return the next lifecycle work record. */
export const prepareActorLifecycleWork = (input: {
  command: LifecycleCommand;
  fibers: FiberMap.FiberMap<string, void>;
  clearActivities(): void;
  reconcile: ReturnType<typeof reconcileLifecycleWork>;
}) =>
  Effect.gen(function* () {
    if (input.command.to === "suspended" || input.command.to === "disposed") {
      yield* FiberMap.clear(input.fibers);
      input.clearActivities();
    }

    return yield* input.reconcile;
  });

export const startCommittedTimerWork = (live: Option.Option<LiveLifecycleWork>) => {
  if (Option.isSome(live)) activateTimerClaims(live.value.timers);
};
