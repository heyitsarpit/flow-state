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
  type Run,
  Timer,
  type TimerId,
  Timing,
  type Tracked,
  type World,
} from "./world.ts";

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

// A saved timer's run, as the record holds it.
const savedRun = (run: Run) => ({
  armedAt: run.armedAt,
  attempt: run.attempt,
  ...Timing.$match(run.timing, {
    Running: ({ dueAt }) => ({ dueAt }),
    Held: ({ left, pausedBy }) => ({ left, pausedBy }),
  }),
});

/**
 * A record's timers: each armed timer of the incarnation, and each idle one a restore would
 * otherwise start (a keyed one, or one its state's entry arms), so a restore tells a schedule that
 * ended from one the definition added. `armsOnEntry` names the schedules their entry arms.
 */
export const savedTimersOf = (incarnation: Incarnation, armsOnEntry: (name: string) => boolean) =>
  [...incarnation.schedules.values()]
    .filter((t) => Option.isSome(t.run) || Option.isSome(t.key) || armsOnEntry(t.name))
    .map((tracked) => ({
      name: tracked.name,
      ...Option.match(tracked.key, { onNone: () => ({}), onSome: (k) => ({ key: k.value }) }),
      ...Option.match(tracked.run, { onNone: () => ({}), onSome: savedRun }),
    }));

/**
 * A timer due, with the incarnation it belongs to.
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

// A running timer of an incarnation, with its deadline.
const runningOf = (incarnation: Incarnation, tracked: Tracked) =>
  Option.flatMap(tracked.run, (run) =>
    Timing.$match(run.timing, {
      Running: ({ dueAt, timer }) => Option.some({ incarnation, tracked, run, dueAt, timer }),
      Held: () => Option.none(),
    }),
  );

/**
 * The running timers of an incarnation whose deadline has passed with no live host timer: those
 * that came due while it was unused, in firing order.
 */
export const waitingIn = (
  world: World,
  machines: Machines,
  incarnation: Incarnation,
  now: number,
) =>
  [...incarnation.schedules.values()]
    .flatMap((tracked) => Option.toArray(runningOf(incarnation, tracked)))
    .filter((d) => !world.timers.has(d.timer) && d.dueAt <= now)
    .toSorted(byDue(machines));

// The running timer a live host timer stands for, when it is still that timer's.
const dueOf = (world: World, id: TimerId, timer: Timer) =>
  Timer.$is("Schedule")(timer)
    ? Option.filter(
        Option.flatMap(Option.fromUndefinedOr(world.incarnations.get(actorKey(timer.actor))), (i) =>
          Option.flatMap(Option.fromUndefinedOr(i.schedules.get(timer.track)), (t) =>
            runningOf(i, t),
          ),
        ),
        (d) => d.timer === id,
      ).pipe(Option.map((d) => ({ ...d, id, fired: timer })))
    : Option.none();

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
