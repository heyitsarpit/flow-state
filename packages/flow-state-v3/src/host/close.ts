import { Array as Arr, Cause, Data, Deferred, Effect, Exit, Fiber, Option, Scope } from "effect";
import { RuntimeDefaults } from "../core/defaults.ts";
import { laneKeyText } from "../core/lane-moves.ts";
import { Input } from "../core/step.ts";
import { isInFlight } from "../core/tx.ts";
import { actorKey, byCodeUnits } from "../core/world.ts";
import { type FlowError, flowError, flowErrorOf } from "../error.ts";
import type { Driver } from "./driver.ts";
import type { Fibers } from "./fibers.ts";
import type { Store } from "./host.ts";

/**
 * One identity with writes still out, as `runtime.unsettledWrites()` lists it.
 *
 * **Details**
 *
 * `bound` is whether a live actor or its saved record holds the lanes; an unbound lane waits for an
 * adopting ensure or its owner's cancel. Each lane names its operation, its key text (none for an
 * unkeyed operation), its head's Attempt and its state: `Held` when its outcome is unsure,
 * `InFlight` for any other head (queued for its write, on the wire, or waiting to re-send).
 */
export type Unsettled = {
  readonly actor: { readonly machine: string; readonly name: string };
  readonly bound: boolean;
  readonly lanes: ReadonlyArray<{
    readonly operation: string;
    readonly key: Option.Option<string>;
    readonly attempt: string;
    readonly state: "InFlight" | "Held";
  }>;
};

/**
 * Every identity with a non-Idle lane, by key, each lane in lane order.
 */
// RETURN_TYPE: the exported Unsettled contract.
export const unsettledOf = (driver: Driver): ReadonlyArray<Unsettled> => {
  const world = driver.world();

  const byActor = Arr.groupBy(
    [...world.lanes].toSorted(([a], [b]) => byCodeUnits(a, b)).map(([, lane]) => lane),
    (lane) => actorKey(lane.actor),
  );

  return Object.entries(byActor)
    .toSorted(([a], [b]) => byCodeUnits(a, b))
    .map(([key, lanes]) => ({
      actor: { machine: lanes[0].actor.machine, name: lanes[0].actor.name },
      bound: world.incarnations.has(key) || world.records.has(key),
      lanes: lanes.map((lane) => ({
        operation: lane.operation,
        key: laneKeyText(driver.machines, lane),
        attempt: lane.head.id,
        state: isInFlight(lane) ? ("InFlight" as const) : ("Held" as const),
      })),
    }));
};

// FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
const cleanupFailed = (failures: readonly [Cause.Cause<unknown>, ...Array<Cause.Cause<unknown>>]) =>
  flowErrorOf(
    [
      {
        code: "CleanupFailed",
        path: ["dispose"],
        summary: `${failures.length} cleanups failed as the Runtime closed`,
        help: "Fix the failing cleanup; every failure's cause is on this error.",
      },
    ],
    failures.reduce((all, failure) => Cause.combine(all, failure)),
  );

const forgetFailed = flowError([
  {
    code: "StorageFailure",
    path: ["dispose", "forget"],
    summary: "the store did not delete the scope's records",
    help: "The saved data may still be there; dispose with forget again once the store answers.",
  },
]);

/**
 * `dispose({ forget: true })`'s deletion: every record the scope holds, in one batch, after the
 * disposal's own writes.
 *
 * **Details**
 *
 * It fails StorageFailure with no store call when it cannot know it deleted everything: a write of
 * the disposal still unanswered may land later, and a Runtime that never booted, or whose load
 * failed, never owned what it would delete. A Runtime with no persisting store has nothing to
 * forget.
 */
export const makeForget = (
  driver: Driver,
  store: Option.Option<Store>,
  booted: Deferred.Deferred<void, FlowError>,
) =>
  Effect.fn("Runtime.forget")(function* () {
    if (Option.isNone(store)) return;

    const opened = (yield* Deferred.isDone(booted))
      ? Exit.isSuccess(yield* Effect.exit(Deferred.await(booted)))
      : false;

    if (!opened || !driver.world().persistence || !driver.stored())
      return yield* Effect.fail(forgetFailed);

    yield* store.value.load.pipe(
      Effect.flatMap((saved) =>
        store.value.write(
          [...saved.keys()].map((key) => ({ key, value: Option.none() })),
          "flush",
          [],
        ),
      ),
      Effect.mapError(() => forgetFailed),
    );
  });

/**
 * A close stage that did not end within the disposal's bound: a cleanup that cannot be interrupted
 * or never returns. The close stops waiting for it and goes on.
 */
export class CleanupOverdue extends Data.TaggedError("CleanupOverdue")<{
  readonly stage: "fibers" | "services";
}> {}

// A close stage's Exit, or an overdue failure once it runs past the disposal's bound; an overdue
// stage keeps running detached, since a Scope's close cannot be interrupted. A stage that ended as
// it started needs no timer, so a Runtime with nothing to wait for closes synchronously.
const withinBound = (stage: "fibers" | "services", close: Effect.Effect<void>) =>
  Effect.flatMap(Effect.forkDetach(close, { startImmediately: true }), (fiber) =>
    // oxlint-disable-next-line lint-bomb/no-unsafe-fiber-methods -- a stage that already ended is read without a timer
    Option.match(Option.fromUndefinedOr(fiber.pollUnsafe()), {
      onSome: (exit) => Effect.succeed(exit),
      onNone: () =>
        Fiber.await(fiber).pipe(
          Effect.timeoutOption(RuntimeDefaults.disposalBound),
          Effect.map(
            Option.getOrElse(() => Exit.failCause(Cause.fail(new CleanupOverdue({ stage })))),
          ),
        ),
    }),
  );

/**
 * The Runtime's one ordered close and the result every caller shares: once the core's life ends
 * (Disposed, or Stopped by a defect), every fiber is interrupted and awaited, then the Scope
 * releases the services, so no interrupt cleanup that ends within the bound runs on a released
 * service.
 *
 * **Details**
 *
 * The close runs on its own fiber from construction, and every caller joins it, so it runs exactly
 * once whoever asks and however a caller leaves. Each stage is waited for at most the disposal's
 * bound; one still running then is a failed cleanup, `CleanupOverdue`. Each cleanup that failed (an
 * interrupt cleanup of a fiber the driver judged, a services finalizer, an overdue stage) fails the
 * close with one CleanupFailed keeping every Cause, and is reported as an Issue while the life is
 * Disposed; a defect that stopped the Runtime is its failure instead, with every cleanup's Cause
 * beside it.
 */
export const makeClose = (driver: Driver, fibers: Fibers, scope: Scope.Closeable) => {
  const close = Effect.gen(function* () {
    const ended = yield* Effect.exit(driver.ended);
    const stopped = yield* withinBound("fibers", fibers.close);
    const released = yield* withinBound("services", Scope.close(scope, Exit.void));

    const failures = [stopped, released].reduce(
      (all, exit) => (Exit.isFailure(exit) ? [...all, exit.cause] : all),
      driver.cleanups(),
    );

    if (failures.length > 0) driver.input(Input.Closed({ failures: failures.length }));

    return yield* Arr.match(failures, {
      onEmpty: () => ended,
      onNonEmpty: (all) =>
        Exit.match(ended, {
          onFailure: (defect) =>
            Exit.failCause(Cause.combine(defect, Cause.die(cleanupFailed(all)))),
          onSuccess: () => Exit.fail(cleanupFailed(all)),
        }),
    });
  });

  return Fiber.join(fibers.detach(close));
};
