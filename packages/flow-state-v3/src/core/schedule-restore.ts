import { Option, Result } from "effect";
import { callSlot, Delay, Planned, type Schedule, type Series } from "./compiled.ts";
import { declaredOn, seriesId } from "./schedule-plan.ts";
import type { ScheduleSteps } from "./schedules.ts";
import type { Tx } from "./tx.ts";
import type { SavedTimer } from "./vocabulary.ts";
import {
  type Incarnation,
  type Run,
  type TimerKey,
  Timing,
  type Tracked,
  trackOf,
} from "./world.ts";

/**
 * Restoring an incarnation's timers from its record.
 */
export const makeScheduleRestore = (tx: Tx, schedules: ScheduleSteps) => {
  // The Effect Schedule a restored run steps: a stepped delay planned again from the restored
  // memory; none for a Duration.
  const seriesOf = (incarnation: Incarnation, tracked: Tracked, schedule: Schedule) =>
    Option.flatMap(
      Delay.$match(schedule.delay, {
        Fixed: ({ planned }) => Option.some(planned),
        Computed: ({ plan }) =>
          Result.getSuccess(
            callSlot(plan, schedules.readOf(incarnation, tracked.key, schedules.noOperations)),
          ),
      }),
      (planned) =>
        Planned.$match(planned, {
          Ms: () => Option.none<Series>(),
          Stepped: ({ series }) => Option.some(series),
        }),
    );

  // The output of a restored run's current step, replayed from its arming.
  const outputOf = (
    incarnation: Incarnation,
    tracked: Tracked,
    series: Option.Option<Series>,
    timer: { readonly armedAt: number; readonly attempt: number },
  ) =>
    Option.getOrUndefined(
      Option.flatMap(series, (s) =>
        Option.flatMap(
          Result.getSuccess(
            Result.try(() =>
              tx.env.step({
                id: seriesId(incarnation.actor, trackOf(tracked.name, tracked.key), timer.armedAt),
                series: s,
                attempt: timer.attempt + 1,
                armedAt: timer.armedAt,
                now: timer.armedAt,
              }),
            ),
          ),
          (step) => Option.map(step, (x) => x.output),
        ),
      ),
    );

  // A saved timer's run: its `dueAt` on a new host timer, or its `left` held; none when idle.
  const runOf = (
    incarnation: Incarnation,
    tracked: Tracked,
    schedule: Schedule,
    timer: SavedTimer,
  ) => {
    const armedAt = timer.armedAt ?? tx.env.now;
    const attempt = timer.attempt ?? 0;
    const arming = tx.mintArming();

    const timing: Option.Option<Timing> =
      timer.left === undefined
        ? Option.map(Option.fromUndefinedOr(timer.dueAt), (dueAt) =>
            schedules.runningTo(incarnation, tracked, arming, dueAt),
          )
        : Option.some(Timing.Held({ left: timer.left, pausedBy: timer.pausedBy ?? [] }));

    return Option.map(timing, (t) => {
      const series = seriesOf(incarnation, tracked, schedule);

      return {
        arming,
        armedAt,
        attempt,
        series,
        output: outputOf(incarnation, tracked, series, { armedAt, attempt }),
        timing: t,
      } satisfies Run;
    });
  };

  // A saved timer of an active schedule as a tracked timer: none when its schedule is no longer
  // active, its keying changed or its key does not read.
  const trackedOf = (
    incarnation: Incarnation,
    byName: ReadonlyMap<string, Schedule>,
    timer: SavedTimer,
  ) =>
    Option.flatMap(Option.fromUndefinedOr(byName.get(timer.name)), (schedule) => {
      if (Option.isSome(schedule.keys) !== (timer.key !== undefined)) return Option.none();

      const key =
        timer.key === undefined
          ? Result.succeed(Option.none<TimerKey>())
          : Result.map(schedules.keyOf(timer.key), Option.some);

      return Option.map(Result.getSuccess(key), (k) => {
        const tracked: Tracked = {
          name: timer.name,
          key: k,
          baseline: Option.none(),
          run: Option.none(),
        };

        return { ...tracked, run: runOf(incarnation, tracked, schedule, timer) };
      });
    });

  /**
   * An incarnation's timers from its record: each saved timer of an active schedule keeps its
   * `dueAt` or `left` and its attempt; a schedule its state's entry arms that the record lacks (the
   * definition added it) starts now from its first step, and any other stays idle; keys,
   * baselines and pause reasons are then re-evaluated silently.
   */
  const restore = (incarnation: Incarnation, saved: ReadonlyArray<SavedTimer>) => {
    const declared = declaredOn(tx.machines, incarnation);
    const byName = new Map(declared.map((s) => [s.name, s]));
    const timers = new Map<string, Tracked>();

    for (const tracked of saved.flatMap((t) => Option.toArray(trackedOf(incarnation, byName, t))))
      timers.set(trackOf(tracked.name, tracked.key), tracked);

    const adds = new Set(
      declared
        .filter((s) => Option.isNone(s.keys) && s.onEntry && !timers.has(s.name))
        .map((s) => s.name),
    );

    return schedules.restored(incarnation, timers, adds);
  };

  return { restore };
};
