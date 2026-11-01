import { Cause, Deferred, Effect, Exit, Fiber, Option, Result, Scope } from "effect";

import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import type { ActorIdentity } from "../actor/actor-directory.js";
import type { ActorSnapshot } from "../runtime.js";
import type { InitialContextWork } from "./context-participant.js";

export type ContextRootWork = {
  identity: ActorIdentity;
  snapshot: ActorSnapshot<MachineDefinition>;
  generation: number;
  done: Deferred.Deferred<void, PublicDiagnostic>;
  cancelled: Deferred.Deferred<void, PublicDiagnostic>;
};

type RootSlot = {
  active: Option.Option<ContextRootWork>;
  pending: Option.Option<ContextRootWork>;
  latest: Option.Option<ContextRootWork>;
  queued: boolean;
};

const diagnostic = (reason: string, key: string) =>
  Failure({
    code: "MissingContextProvider",
    path: ["context", key],
    details: { reason, actor: key },
    summary: "Context root scheduling could not complete this cut.",
    help: "Reconcile a current registered provider and retry the context update.",
  });

export type ContextRootQueue = {
  enqueueInitial(key: string, initial: InitialContextWork): Result.Result<void, PublicDiagnostic>;
  offer(
    identity: ActorIdentity,
    snapshot: ActorSnapshot<MachineDefinition>,
    generation: number,
  ): "accepted" | "coalesced";
  cancelInitial(key: string): void;
  cancelIdentity(key: string): void;
  drain(): Effect.Effect<void, PublicDiagnostic>;
  close(): Effect.Effect<void, PublicDiagnostic>;
};

/** One bounded key queue and one serial worker for root and initial offers. */
// RETURN_TYPE: The scoped queue exposes its lifecycle Effect contract.
export const makeContextRootQueue = (
  ownerScope: Scope.Scope,
  maxNodes: number,
  maxFanout: number,
  runWave: (work: ContextRootWork) => Effect.Effect<void, PublicDiagnostic>,
): Effect.Effect<ContextRootQueue> =>
  Effect.gen(function* () {
    const queuedKeys: string[] = [];
    const roots = new Map<string, RootSlot>();
    const initials = new Map<string, InitialContextWork>();
    let wake = Deferred.makeUnsafe<void>();
    let closed = false;
    let closeCompletion: Deferred.Deferred<void, PublicDiagnostic> | undefined;

    const enqueue = (key: string, slot: RootSlot) => {
      if (slot.queued) return true;

      if (queuedKeys.length >= maxNodes) return false;
      queuedKeys.push(key);
      slot.queued = true;
      Deferred.doneUnsafe(wake, Effect.void);
      wake = Deferred.makeUnsafe();

      return true;
    };

    // RETURN_TYPE: Recursive wait retains the key result through empty queue wakeups.
    const take = (): Effect.Effect<string> =>
      Effect.suspend(() => {
        const key = queuedKeys.shift();

        return key === undefined
          ? Deferred.await(wake).pipe(Effect.flatMap(take))
          : Effect.succeed(key);
      });

    const settle = (work: ContextRootWork, result: Result.Result<void, PublicDiagnostic>) => {
      if (Result.isSuccess(result)) Deferred.doneUnsafe(work.done, Effect.void);
      else Deferred.doneUnsafe(work.done, Effect.fail(result.failure));
    };

    const cancelWork = (work: ContextRootWork, reason: string) => {
      const failure = diagnostic(reason, work.identity.key);
      Deferred.doneUnsafe(work.cancelled, Effect.fail(failure));
      settle(work, Result.fail(failure));
    };

    const settleInitial = (key: string, reason: string) => {
      const initial = initials.get(key);

      if (initial === undefined) return;
      initial.cancelTicket();
      initial.projection.cancel();
      Deferred.doneUnsafe(initial.done, Effect.fail(diagnostic(reason, key)));
      initials.delete(key);
    };

    const processInitial = (key: string) =>
      Effect.gen(function* () {
        const initial = initials.get(key);

        if (initial === undefined) return;

        const cancelled = Deferred.await(initial.done).pipe(
          Effect.flatMap(() => Effect.fail(diagnostic("initial-cancelled", key))),
        );

        const exit = yield* Effect.exit(Effect.raceFirst(initial.projection.wait, cancelled));
        initial.cancelTicket();

        if (initials.get(key) === initial) initials.delete(key);

        if (Exit.isSuccess(exit) && exit.value.status !== "stale")
          Deferred.doneUnsafe(initial.done, Effect.void);
        else
          Deferred.doneUnsafe(initial.done, Effect.fail(diagnostic("initial-offer-failed", key)));
      });

    const processRoot = (key: string, slot: RootSlot) =>
      Effect.gen(function* () {
        if (roots.get(key) !== slot) return;
        const work = Option.getOrUndefined(slot.pending);

        if (work === undefined) {
          roots.delete(key);

          return;
        }

        slot.pending = Option.none();
        slot.active = Option.some(work);

        const exit = yield* Effect.exit(
          Effect.raceFirst(runWave(work), Deferred.await(work.cancelled)),
        );

        slot.active = Option.none();

        if (roots.get(key) !== slot) return;

        if (Option.isNone(slot.pending) && Option.isSome(slot.latest)) {
          slot.pending = slot.latest;
          slot.latest = Option.none();
        }

        if (Option.isSome(slot.pending)) enqueue(key, slot);
        else roots.delete(key);

        if (Exit.isSuccess(exit)) settle(work, Result.succeed(undefined));
        else {
          const failure = exit.cause.reasons.find(Cause.isFailReason)?.error;

          settle(work, Result.fail(failure ?? diagnostic("wave-failed", key)));
        }
      });

    const worker = yield* Effect.forever(
      Effect.gen(function* () {
        const key = yield* take();
        const slot = roots.get(key);

        if (slot === undefined) return;
        slot.queued = false;
        yield* processInitial(key);
        yield* processRoot(key, slot);
      }),
    ).pipe(Effect.forkIn(ownerScope));

    const enqueueInitial: ContextRootQueue["enqueueInitial"] = (key, initial) => {
      if (closed || roots.has(key)) return Result.fail(diagnostic("duplicate-initial", key));

      const slot: RootSlot = {
        active: Option.none(),
        pending: Option.none(),
        latest: Option.none(),
        queued: false,
      };

      if (!enqueue(key, slot)) return Result.fail(diagnostic("root-capacity", key));
      initials.set(key, initial);
      roots.set(key, slot);

      return Result.succeed(undefined);
    };

    const offer: ContextRootQueue["offer"] = (identity, snapshot, generation) => {
      const key = identity.key;

      const work: ContextRootWork = {
        identity,
        snapshot,
        generation,
        done: Deferred.makeUnsafe(),
        cancelled: Deferred.makeUnsafe(),
      };

      const slot = roots.get(key) ?? {
        active: Option.none<ContextRootWork>(),
        pending: Option.none<ContextRootWork>(),
        latest: Option.none<ContextRootWork>(),
        queued: false,
      };

      if (closed) {
        cancelWork(work, "closed");

        return "coalesced";
      }

      roots.set(key, slot);

      if (Option.isNone(slot.active)) {
        if (Option.isSome(slot.pending)) {
          settle(slot.pending.value, Result.succeed(undefined));
          slot.pending = Option.some(work);

          return "coalesced";
        }

        slot.pending = Option.some(work);

        if (!enqueue(key, slot)) {
          cancelWork(work, "root-capacity");
          slot.pending = Option.none();
          roots.delete(key);

          return "coalesced";
        }

        return "accepted";
      }

      if (Option.isNone(slot.pending)) {
        slot.pending = Option.some(work);

        return "accepted";
      }

      if (Option.isSome(slot.latest)) settle(slot.latest.value, Result.succeed(undefined));
      slot.latest = Option.some(work);

      return "coalesced";
    };

    const cancelIdentity: ContextRootQueue["cancelIdentity"] = (key) => {
      settleInitial(key, "unregistered");
      const slot = roots.get(key);

      if (slot === undefined) return;

      for (const candidate of [slot.active, slot.pending, slot.latest])
        if (Option.isSome(candidate)) cancelWork(candidate.value, "unregistered");

      roots.delete(key);
      const index = queuedKeys.indexOf(key);

      if (index >= 0) queuedKeys.splice(index, 1);
    };

    const drain: ContextRootQueue["drain"] = () =>
      Effect.suspend(() => {
        const captured: Array<Deferred.Deferred<void, PublicDiagnostic>> = [];

        for (const slot of roots.values())
          for (const candidate of [slot.active, slot.pending, slot.latest])
            if (Option.isSome(candidate)) captured.push(candidate.value.done);

        for (const initial of initials.values()) captured.push(initial.done);

        return Effect.gen(function* () {
          const exits = yield* Effect.forEach(
            captured,
            (done) => Effect.exit(Deferred.await(done)),
            {
              concurrency: maxFanout,
            },
          );

          for (const exit of exits) {
            if (Exit.isSuccess(exit)) continue;
            const failure = exit.cause.reasons.find(Cause.isFailReason)?.error;

            return yield* Effect.fail(failure ?? diagnostic("drain-failed", "root"));
          }
        });
      });

    const close: ContextRootQueue["close"] = () =>
      Effect.suspend(() => {
        if (closeCompletion !== undefined) return Deferred.await(closeCompletion);
        closeCompletion = Deferred.makeUnsafe();
        const completion = closeCompletion;
        closed = true;

        for (const key of initials.keys()) settleInitial(key, "closed");

        for (const slot of roots.values())
          for (const candidate of [slot.active, slot.pending, slot.latest])
            if (Option.isSome(candidate)) cancelWork(candidate.value, "closed");

        roots.clear();
        queuedKeys.length = 0;

        return Effect.gen(function* () {
          yield* Fiber.interrupt(worker);
          yield* Deferred.succeed(completion, undefined);

          return yield* Deferred.await(completion);
        });
      }).pipe(Effect.uninterruptible);

    return {
      enqueueInitial,
      offer,
      cancelInitial: (key) => settleInitial(key, "provider-unregistered"),
      cancelIdentity,
      drain,
      close,
    };
  });
