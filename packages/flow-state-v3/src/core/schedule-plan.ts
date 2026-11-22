import { Option, Result } from "effect";
import {
  callSlot,
  Delay,
  Planned,
  type Schedule,
  type ScheduleInput,
  type Series,
  type StepSchedule,
} from "./compiled.ts";
import { TIMER_LIMIT_MS } from "./defaults.ts";
import { laneKeyText } from "./lane-moves.ts";
import { rowOf, type Row } from "./rows.ts";
import { chainOf } from "./tree.ts";
import type { Machines } from "./tx.ts";
import {
  type ActorId,
  actorKey,
  byCodeUnits,
  type Incarnation,
  Timer,
  type TimerId,
  type World,
} from "./world.ts";
import { Arming, type Run, timersIn, Timing, type Tracked } from "./timers.ts";

/**
 * Schedules' plans: delays, steps, the order timers fire in and what a record saves of them.
 */
const NO_SCHEDULES: ReadonlyArray<Schedule> = [];

/**
 * The schedules a machine declares on one state, by machine id.
 */
export const schedulesOf = (machines: Machines, machine: string) => (path: string) =>
  machines.get(machine)?.states.get(path)?.schedules ?? NO_SCHEDULES;

/**
 * The schedules declared on a leaf's chain, outermost state first, each state's in declaration
 * order: the order equal deadlines fire in.
 */
export const declaredOn = (machines: Machines, incarnation: Incarnation) =>
  chainOf(incarnation.state).flatMap(schedulesOf(machines, incarnation.actor.machine));

/**
 * The rows of an actor's write lanes, by operation and key text: what a snapshot shows and what a
 * schedule's `keys` and pause reasons read.
 */
export const operationsOf = (world: World, machines: Machines, actor: ActorId) => {
  const rows = new Map<string, Map<string, Row>>();

  for (const id of world.lanesOfActor.get(actorKey(actor)) ?? [])
    for (const lane of Option.toArray(Option.fromUndefinedOr(world.lanes.get(id))))
      for (const keyText of Option.toArray(laneKeyText(machines, lane))) {
        const byKey = rows.get(lane.operation) ?? new Map<string, Row>();
        byKey.set(keyText, rowOf(lane));
        rows.set(lane.operation, byKey);
      }

  return rows;
};

/**
 * One step a schedule plans: its delay in milliseconds, the Effect Schedule it steps and that
 * step's output (none for a Duration).
 */
export type Step = {
  readonly ms: number;
  readonly series: Option.Option<Series>;
  // FLOW_STATE_ALLOW_UNKNOWN: an Effect Schedule step's output, whatever its type.
  readonly output: unknown;
};

/**
 * A computed or stepped delay: a finite negative one counts as zero; NaN, infinite or past the
 * host timer's limit is out of range.
 */
export const inRange = (ms: number) =>
  Number.isFinite(ms) && ms <= TIMER_LIMIT_MS
    ? Result.succeed(Math.max(ms, 0))
    : Result.fail<"OutOfRange">("OutOfRange");

/**
 * A series' id for the host's stepper: one per timer and arming time.
 */
export const seriesId = (actor: ActorId, track: string, armedAt: number) =>
  `${actorKey(actor)}\u0000${track}\u0000${String(armedAt)}`;

// A step of an Effect Schedule, as a schedule asks the host for it.
type Stepping = (series: Series, attempt: number) => ReturnType<StepSchedule>;

// A step's delay checked, as the Step a timer runs with.
const checked = (
  schedule: Schedule,
  ms: number,
  series: Option.Option<Series>,
  // FLOW_STATE_ALLOW_UNKNOWN: an Effect Schedule step's output, whatever its type.
  output: unknown,
) =>
  Result.mapBoth(inRange(ms), {
    onFailure: () => schedule.slot,
    onSuccess: (inside) => Option.some<Step>({ ms: inside, series, output }),
  });

// The first step of an Effect Schedule; none when it is complete before one.
const firstOfSeries = (schedule: Schedule, series: Series, step: Stepping) =>
  Result.flatMap(Result.try({ try: () => step(series, 1), catch: () => schedule.slot }), (first) =>
    Option.match(first, {
      onNone: () => Result.succeed(Option.none<Step>()),
      onSome: ({ ms, output }) => checked(schedule, ms, Option.some(series), output),
    }),
  );

/**
 * The first step of a schedule armed now: its delay from the read, a fixed one as written, a
 * computed or stepped one checked; none when its Effect Schedule is complete before its first
 * step. A callback that throws, or a delay out of range, fails with the schedule's slot.
 */
export const firstStep = (schedule: Schedule, read: ScheduleInput, step: Stepping) =>
  Result.flatMap(
    Delay.$match(schedule.delay, {
      Fixed: ({ planned }) => Result.succeed(planned),
      Computed: ({ plan }) => callSlot(plan, read),
    }),
    (planned) =>
      Planned.$match(planned, {
        Ms: ({ ms }) => checked(schedule, ms, Option.none(), undefined),
        Stepped: ({ series }) => firstOfSeries(schedule, series, step),
      }),
  );

/**
 * A run due, with the incarnation, the schedule and the timer it belongs to.
 */
export type Due = {
  readonly incarnation: Incarnation;
  readonly tracked: Tracked;
  readonly run: Run;
  readonly dueAt: number;
};

const keyTextOf = (tracked: Tracked) =>
  Option.match(tracked.key, { onNone: () => "", onSome: (k) => k.text });

/**
 * Orders timers due together: by deadline, then actor admission, then outermost state and
 * declaration order, then key in code-unit order.
 */
const byDue = (machines: Machines) => {
  const placeOf = (d: Due) =>
    declaredOn(machines, d.incarnation).findIndex((s) => s.name === d.tracked.name);

  return (a: Due, b: Due) =>
    a.dueAt - b.dueAt ||
    a.incarnation.started - b.incarnation.started ||
    placeOf(a) - placeOf(b) ||
    byCodeUnits(keyTextOf(a.tracked), keyTextOf(b.tracked));
};

// A timer's run while it is due, with its deadline.
const dueRunOf = (incarnation: Incarnation, tracked: Tracked) =>
  Arming.$is("Armed")(tracked.arming) && Timing.$is("Due")(tracked.arming.run.timing)
    ? Option.some({
        incarnation,
        tracked,
        run: tracked.arming.run,
        dueAt: tracked.arming.run.timing.dueAt,
      })
    : Option.none<Due>();

/**
 * Every due run of an incarnation, in its schedules' order.
 */
export const dueRunsOf = (incarnation: Incarnation) =>
  [...incarnation.schedules.values()].flatMap((scheduled) =>
    timersIn(scheduled).flatMap((tracked) => Option.toArray(dueRunOf(incarnation, tracked))),
  );

/**
 * The due runs of an incarnation whose deadline has passed with no live host alarm: those that
 * came due while it was unused, in firing order.
 */
export const waitingIn = (
  world: World,
  machines: Machines,
  incarnation: Incarnation,
  now: number,
) =>
  dueRunsOf(incarnation)
    .filter(
      (d) =>
        d.dueAt <= now &&
        !Option.exists(Option.fromUndefinedOr(incarnation.alarms.get(d.run.arming)), (alarm) =>
          world.timers.has(alarm.timer),
        ),
    )
    .toSorted(byDue(machines));

// The due run a live host alarm stands for, while it is still that run's.
const dueOf = (world: World, id: TimerId, timer: Timer) => {
  if (!Timer.$is("Schedule")(timer)) return Option.none();

  return Option.flatMap(
    Option.fromUndefinedOr(world.incarnations.get(actorKey(timer.actor))),
    (incarnation) =>
      Option.map(
        Option.fromUndefinedOr(
          dueRunsOf(incarnation).find(
            (d) =>
              d.run.arming === timer.arming && incarnation.alarms.get(timer.arming)?.timer === id,
          ),
        ),
        (d) => ({ ...d, id, fired: timer }),
      ),
  );
};

/**
 * Every live schedule timer due by now, across actors, in firing order: a host timer firing
 * takes the timers due with it, so equal deadlines fire in one order whatever order the host
 * fired them in.
 */
export const dueIn = (world: World, machines: Machines, now: number) =>
  [...world.timers]
    .flatMap(([id, timer]) => Option.toArray(dueOf(world, id, timer)))
    .filter((d) => d.dueAt <= now)
    .toSorted(byDue(machines));
