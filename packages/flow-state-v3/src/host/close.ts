import {
  Array as Arr,
  Cause,
  Clock,
  type Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Option,
  Scope,
} from "effect";
import { RuntimeDefaults } from "../core/defaults.ts";
import { laneKeyText } from "../core/lane-moves.ts";
import { Input } from "../core/step.ts";
import { isInFlight } from "../core/tx.ts";
import { actorKey, type AttemptId, byCodeUnits } from "../core/world.ts";
import { type FlowError, flowError, flowErrorOf } from "../error.ts";
import type { Driver } from "./driver.ts";
import {
  detach,
  OwnerRecord,
  releaseTraced,
  type RuntimeReport,
  type Traced,
  waitAtMost,
} from "./owners/owners.ts";
import { Store, StoreRefused } from "./store.ts";
import type { AnyDefinition } from "../definition.ts";

/**
 * One identity with writes still out, as `runtime.unsettledWrites()` lists it.
 *
 * **Details**
 *
 * `bound` is whether a live actor or its saved record holds the lanes; an unbound lane waits for an
 * adopting ensure or its owner's cancel. Each lane names its operation, its key text (none for an
 * unkeyed operation), its head's Attempt and its state: `Held` when its outcome is unsure,
 * `InFlight` for any other head (queued for its write, on the wire, or waiting to re-send).
 *
 * `Ds` is the Runtime's app's definitions: each identity's machine and its lanes' operations are
 * one definition's.
 */
export type Unsettled<Ds extends AnyDefinition = AnyDefinition> = Ds extends AnyDefinition
  ? UnsettledOf<Ds["id"], keyof Ds["operations"] & string>
  : never;

type UnsettledOf<Machine extends string, Operation extends string> = {
  readonly actor: { readonly machine: Machine; readonly name: string };
  readonly bound: boolean;
  readonly lanes: ReadonlyArray<{
    readonly operation: Operation;
    readonly key: Option.Option<string>;
    readonly attempt: AttemptId;
    readonly state: "InFlight" | "Held";
  }>;
};

/**
 * Every identity with a non-Idle lane, by key, each lane in lane order, named by the Runtime's
 * app's definitions `Ds`.
 */
// RETURN_TYPE: the exported Unsettled contract, by the app's definitions.
export function unsettledOf<Ds extends AnyDefinition>(driver: Driver): ReadonlyArray<Unsettled<Ds>>;
// The core's world mixes every machine's lanes, so the rows it builds are named by text; each
// machine and operation comes from a lane the app's own definition opened.
// RETURN_TYPE: the wide rows the overload above names by the app.
export function unsettledOf(driver: Driver): ReadonlyArray<Unsettled> {
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
}

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
 * failed, never owned what it would delete. A Runtime that saves nothing has nothing to forget.
 */
export const makeForget = (
  driver: Driver,
  persistence: boolean,
  storeOf: () => Option.Option<Store["Service"]>,
  booted: Deferred.Deferred<void, FlowError>,
) =>
  Effect.fn("Runtime.forget")(function* () {
    if (!persistence) return;

    const store = storeOf();

    const opened = (yield* Deferred.isDone(booted))
      ? Exit.isSuccess(yield* Effect.exit(Deferred.await(booted)))
      : false;

    if (!opened || Option.isNone(store) || !driver.world().persistence || !driver.stored())
      return yield* Effect.fail(forgetFailed);

    yield* store.value.load.pipe(
      Effect.flatMap((saved) =>
        store.value.write([...saved.keys()].map((key) => ({ key, value: Option.none() }))),
      ),
      Effect.mapError(() => forgetFailed),
    );
  });

/**
 * The scope's Store as the Runtime holds it, whichever host gave it: once the services' Scope
 * starts its release every load and write refuses `closed` without reaching the store, as a closed
 * connection's would, so no stage of a close uses it late.
 */
export const heldUntilReleased = (given: Store["Service"], services: Scope.Scope) =>
  Effect.gen(function* () {
    const open = { services: true };

    // Added after the services were built, so it runs first as they release.
    yield* Scope.addFinalizer(
      services,
      Effect.sync(() => {
        open.services = false;
      }),
    );

    const guarded = <A>(use: Effect.Effect<A, StoreRefused>) =>
      Effect.suspend(() =>
        open.services ? use : Effect.fail(new StoreRefused({ reason: "closed" })),
      );

    return Store.of({ load: guarded(given.load), write: (batch) => guarded(given.write(batch)) });
  });

/**
 * A close that did not end within one disposal bound of the core's end: a cleanup that cannot be interrupted or
 * never returns. Dispose stops waiting for it; the close goes on, and each failure it finds later
 * goes to the host's report.
 */
export class CleanupOverdue extends Data.TaggedError("CleanupOverdue")<Record<string, never>> {}

/**
 * The Runtime's one close and the result every caller shares: once the core's life ends
 * (Disposed, or Stopped by a defect), the Runtime's work closes (every task interrupted and
 * awaited, each incarnation's and each runPromise's Owner first), then a wanted forget deletes the
 * scope's records, then the root Scope releases the services, the Store among them.
 *
 * **Details**
 *
 * The close runs on its own fiber from construction, and every caller joins it, so it runs exactly
 * once whoever asks and however a caller leaves. Every use of the Store, the forget's included,
 * comes before the services' release: a forget asked once the close passed its forget fails
 * StorageFailure with no store call. Once the core's life ends (within its own disposal bound), the
 * Owner tree's close is waited for at most one more bound, the forget's storage wait not counted;
 * past it the close keeps running, dispose rejects CleanupFailed holding `CleanupOverdue`, and each
 * later failure goes to the host's report. A forget after a work close past its bound fails
 * StorageFailure with no store call: a task still closing may yet write. Each failed cleanup the
 * close hears (a task's, a services finalizer's, a quarantine no ensure reported) fails it with
 * one CleanupFailed keeping every Cause; a defect that stopped the Runtime is its failure instead,
 * with every cleanup's Cause beside it. Each failure was an Issue when it was found.
 */
export const makeClose = (
  driver: Driver,
  root: Scope.Closeable,
  report: RuntimeReport,
  forget: () => Effect.Effect<void, FlowError>,
  context: () => Context.Context<never>,
  traced: Traced,
) => {
  // Whether a dispose asked to forget before the close reached its forget.
  const wanted = { forget: false };

  const services = Effect.gen(function* () {
    const released = yield* releaseTraced(root, traced, "root", 0);

    for (const _ of released) driver.input(Input.CleanupFailed());

    if (Option.isSome(traced))
      traced.value(
        OwnerRecord.Report({
          owner: "root",
          parent: Option.none(),
          heardBy: "closer",
          causes: released.length,
        }),
      );

    report.hear(released);
  });

  const close = Effect.gen(function* () {
    const ended = yield* Effect.exit(driver.ended);
    const bound = Duration.toMillis(RuntimeDefaults.disposalBound);
    const started = yield* Clock.currentTimeMillis;

    // The services release after the work however long it takes, and after the forget.
    const work = detach(driver.work.end(report.hear), context);
    const workClosed = Option.isSome(yield* waitAtMost(work, Duration.millis(bound)));
    const spent = (yield* Clock.currentTimeMillis) - started;

    const forgot = wanted.forget;

    const deletion = () => (workClosed ? forget() : Effect.fail(forgetFailed));
    const forgotten = forgot ? yield* Effect.exit(deletion()) : Exit.void;

    const released = detach(Effect.andThen(Fiber.await(work), services), context);

    const servicesClosed =
      workClosed &&
      Option.isSome(yield* waitAtMost(released, Duration.millis(Math.max(0, bound - spent))));

    const overdue = servicesClosed ? [] : [Cause.fail(new CleanupOverdue({}))];

    if (overdue.length > 0) {
      driver.input(Input.CleanupFailed());

      // The wait that passed its bound, told as a task that failed with CleanupOverdue.
      if (Option.isSome(traced))
        for (const record of [
          OwnerRecord.Task({
            owner: "overdue",
            task: 0,
            key: "close",
            phase: "started",
            failed: false,
          }),
          OwnerRecord.Task({
            owner: "overdue",
            task: 0,
            key: "close",
            phase: "Failed",
            failed: true,
          }),
          OwnerRecord.Report({
            owner: "overdue",
            parent: Option.none(),
            heardBy: "closer",
            causes: 1,
          }),
        ])
          traced.value(record);
    }

    const failures = [...report.late(), ...overdue, ...driver.unheard()];

    const closed = Arr.match(failures, {
      onEmpty: () => ended,
      onNonEmpty: (all) =>
        // oxlint-disable-next-line flow-state/owners-only -- the core's own end, not a task's: a defect that stopped the Runtime leads its rejection
        Exit.match(ended, {
          onFailure: (defect) =>
            Exit.failCause(Cause.combine(defect, Cause.die(cleanupFailed(all)))),
          onSuccess: () => Exit.fail(cleanupFailed(all)),
        }),
    });

    return { closed, forgot, forgotten };
  });

  const shared = detach(close, context);

  return {
    // Asks the close to forget the scope's records before it releases the services.
    wantForget: () => {
      wanted.forget = true;
    },
    // What the close ended with, and the forget's result when one was wanted.
    join: (forgetting: boolean) =>
      Effect.flatMap(Fiber.join(shared), ({ closed, forgot, forgotten }) => {
        if (!forgetting) return closed;

        // A forget asked once the close passed its own finds the Store released.
        return Exit.asVoidAll([closed, forgot ? forgotten : Exit.fail(forgetFailed)]);
      }),
  };
};
