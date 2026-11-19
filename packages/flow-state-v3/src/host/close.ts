import { Array as Arr, Cause, Deferred, Effect, Exit, Option, Scope } from "effect";
import { laneKeyText } from "../core/lane-moves.ts";
import { Input } from "../core/step.ts";
import { isInFlight } from "../core/tx.ts";
import { actorKey, byCodeUnits } from "../core/world.ts";
import { type FlowError, flowErrorOf } from "../error.ts";
import type { Driver } from "./driver.ts";
import type { Fibers } from "./fibers.ts";

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

/**
 * The Runtime's one ordered close and the result every caller shares: once the core's life ends
 * (Disposed, or Stopped by a defect), every fiber is interrupted and awaited, then the Scope
 * releases the services, so no interrupt cleanup runs on a released service.
 *
 * **Details**
 *
 * The close waits on its own fiber from construction, so it runs exactly once whoever asks and
 * however a caller leaves. Each cleanup that failed (a call's interrupt cleanup the driver judged,
 * or a services finalizer) is reported as an Issue, and the close fails with one CleanupFailed
 * keeping every Cause; a defect that stopped the Runtime is its failure instead, with every
 * cleanup's Cause beside it.
 */
export const makeClose = (driver: Driver, fibers: Fibers, scope: Scope.Closeable) => {
  const closed = Deferred.makeUnsafe<void, FlowError>();

  const close = Effect.gen(function* () {
    const ended = yield* Effect.exit(driver.ended);
    yield* fibers.clear;
    const released = yield* Effect.exit(Scope.close(scope, Exit.void));

    const failures = Exit.match(released, {
      onSuccess: () => driver.cleanups(),
      onFailure: (cause) => [...driver.cleanups(), cause],
    });

    if (failures.length > 0) driver.input(Input.Closed({ failures: failures.length }));

    return Arr.match(failures, {
      onEmpty: () => ended,
      onNonEmpty: (all) =>
        Exit.match(ended, {
          onFailure: (defect) =>
            Exit.failCause(Cause.combine(defect, Cause.die(cleanupFailed(all)))),
          onSuccess: () => Exit.fail(cleanupFailed(all)),
        }),
    });
  });

  fibers.detach(Effect.flatMap(close, (exit) => Deferred.done(closed, exit)));

  return Deferred.await(closed);
};
