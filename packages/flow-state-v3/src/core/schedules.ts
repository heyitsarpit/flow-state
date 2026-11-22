import { Option, Predicate, Result, Schema } from "effect";
import {
  callSlot,
  type FiringMetadata,
  type Schedule,
  type ScheduleInput,
  type Series,
} from "./compiled.ts";
import { encodeCanonical } from "./codec.ts";
import { Act } from "./evidence-of.ts";
import {
  decide,
  type Firing,
  Next,
  Occasion,
  type Raised,
  type Reads,
  Seen,
} from "./schedule-decision.ts";
import {
  alarmOf,
  declaredOn,
  dueRunsOf,
  firstStep,
  inRange,
  operationsOf,
  overdueIn,
  seriesId,
  trackedAt,
} from "./schedule-plan.ts";
import { issueOf } from "./schedule-issues.ts";
import type { Arming as TurnArming } from "./turn.ts";
import type { Tx } from "./tx.ts";
import { readsOf, scopeOf } from "./reads.ts";
import { Life } from "./life.ts";
import { type ActorId, type ArmingId, type Incarnation, trackOf } from "./world.ts";
import { alarmKey } from "./alarms.ts";
import {
  Arming,
  Cursor,
  type Failure,
  type Run,
  type Scheduled,
  type TimerKey,
  Timing,
  type Tracked,
} from "./timers.ts";

// Schedules: the owner of an incarnation's timers. Each schedule's state for an occasion is decided
// by `decide`, the only code that builds it; `pass` hands each declared schedule its occasion,
// records what the decision met, and keeps the host alarms in step with the due runs.

// FLOW_STATE_ALLOW_UNKNOWN: the rows a schedule's callbacks read, typed by the definition.
type Operations = ReadonlyMap<string, ReadonlyMap<string, unknown>>;

const NO_NAMES: ReadonlySet<string> = new Set();

// What a committed turn did to the schedules of its incarnation: the states it exited, the armings
// it checked, the schedules its event lists in `disarmOn`, and the firing whose send it was.
type TurnWork = {
  readonly exits: ReadonlyArray<string>;
  readonly arms: ReadonlyArray<TurnArming>;
  readonly disarms: ReadonlyArray<string>;
  readonly fired: Option.Option<Firing>;
};

export const makeSchedules = (tx: Tx) => {
  // Whether an actor's schedules are awake: it is used and the Runtime is open.
  const awake = (actor: ActorId) => Life.$is("Open")(tx.world().life) && tx.used(actor);

  const stepper =
    (actor: ActorId, track: string, armedAt: number) => (series: Series, attempt: number) =>
      tx.env.step({
        id: seriesId(actor, track, armedAt),
        series,
        attempt,
        armedAt,
        now: tx.env.now,
      });

  // A declared schedule's codecs, by its machine.
  const codecsOf = (incarnation: Incarnation, name: string) =>
    Option.fromUndefinedOr(tx.machines.get(incarnation.actor.machine)?.schedules.get(name));

  /**
   * A key's text by the schedule's declared key codec; a key that is no record or that the codec
   * refuses fails.
   */
  const keyOf = (
    incarnation: Incarnation,
    name: string,
    // FLOW_STATE_ALLOW_UNKNOWN: whatever a keys callback returned, checked here.
    value: unknown,
  ) => {
    if (!Predicate.isReadonlyObject(value) || Array.isArray(value)) return Result.fail("key");

    const text = Option.match(
      Option.flatMap(codecsOf(incarnation, name), (c) => c.key),
      {
        onNone: () => Result.mapError(encodeCanonical(value), () => "key"),
        onSome: (codec) => Result.mapError(Schema.encodeUnknownResult(codec)(value), () => "key"),
      },
    );

    return Result.map(text, (t) => ({ text: t, value: tx.env.admit(value) }) satisfies TimerKey);
  };

  // The keys a keyed schedule returns, each repeat dropped, or its slot when it throws or returns
  // something other than keys its codec reads.
  const keysOf = (
    incarnation: Incarnation,
    schedule: Schedule,
    keys: Option.Option.Value<Schedule["keys"]>,
    read: ScheduleInput,
  ) =>
    Result.flatMap(callSlot(keys, read), (list) => {
      if (!Array.isArray(list)) return Result.fail(keys.slot);

      const seen = new Map<string, TimerKey>();

      for (const value of list) {
        const key = keyOf(incarnation, schedule.name, value);

        if (Result.isFailure(key)) return Result.fail(keys.slot);

        if (!seen.has(key.success.text)) seen.set(key.success.text, key.success);
      }

      return Result.succeed([...seen.values()]);
    });

  // A `restartOn` selection as its declared codec's text; a value the codec refuses is the read's
  // failure.
  const selectionOf = (
    incarnation: Incarnation,
    schedule: Schedule,
    restartOn: Option.Option.Value<Schedule["restartOn"]>,
    read: ScheduleInput,
  ) =>
    Result.flatMap(callSlot(restartOn, read), (value) =>
      Option.match(
        Option.flatMap(codecsOf(incarnation, schedule.name), (c) => c.selection),
        {
          onNone: () => Result.mapError(encodeCanonical({ value }), () => restartOn.slot),
          onSome: (codec) =>
            Result.mapError(Schema.encodeUnknownResult(codec)(value), () => restartOn.slot),
        },
      ),
    );

  // The active reason names of a timer, in declaration order, or the slot of the one that threw.
  const reasonsOf = (schedule: Schedule, read: ScheduleInput) => {
    const active: Array<string> = [];

    for (const { reason, check } of schedule.paused) {
      const held = callSlot(check, read);

      if (Result.isFailure(held)) return Result.fail(held.failure);

      if (held.success === true) active.push(reason);
    }

    return Result.succeed<ReadonlyArray<string>>(active);
  };

  // What one schedule's functions read for the decision, after the occasion; the lanes' rows are
  // gathered once, when a function first reads them.
  const checksOf = (incarnation: Incarnation, schedule: Schedule, operations: () => Operations) => {
    const scope = scopeOf(incarnation);

    const read = (key: Option.Option<TimerKey>) =>
      readsOf(scope, "Schedule", { key, operations: operations(), now: tx.env.now });

    return {
      keys: () =>
        Option.match(schedule.keys, {
          onNone: () => Result.succeed([]),
          onSome: (keys) => keysOf(incarnation, schedule, keys, read(Option.none())),
        }),
      selection: (key: Option.Option<TimerKey>) =>
        Option.match(schedule.restartOn, {
          onNone: () => Result.succeed(""),
          onSome: (restartOn) => selectionOf(incarnation, schedule, restartOn, read(key)),
        }),
      reasons: (key: Option.Option<TimerKey>) => reasonsOf(schedule, read(key)),
      first: (key: Option.Option<TimerKey>) =>
        Result.mapError(
          firstStep(
            schedule,
            read(key),
            stepper(incarnation.actor, trackOf(schedule.name, key), tx.env.now),
          ),
          (slot) => ({ code: "InvalidTurn", slot }) satisfies Failure,
        ),
    } satisfies Reads;
  };

  // A decision's pause evidence and its failures, each recorded; neither is state.
  const reported = (
    incarnation: Incarnation,
    schedule: Schedule,
    seen: ReadonlyArray<Seen>,
    raised: ReadonlyArray<Raised>,
  ) => {
    const at = { actor: incarnation.actor, schedule: schedule.name };

    for (const s of seen)
      tx.act(
        Seen.$match(s, {
          Paused: (p) => Act.Paused({ ...at, ...p }),
          Resumed: (r) => Act.Resumed({ ...at, ...r }),
        }),
      );

    for (const failure of raised)
      tx.refuse(incarnation.actor, issueOf(schedule.name, failure.key, failure));
  };

  /**
   * Keeps an actor's schedule alarms in step with its due runs: one alarm per due run while the
   * actor is awake (used, the Runtime open), none while it sleeps; an alarm whose run left, moved
   * or stopped is cleared. `before` and `after` are the actor's incarnation around one change;
   * none when it does not exist on that side.
   */
  const syncAlarms = (before: Option.Option<Incarnation>, after: Option.Option<Incarnation>) => {
    const wanted = Option.match(after, {
      onNone: () => [],
      onSome: (incarnation) => (awake(incarnation.actor) ? dueRunsOf(incarnation) : []),
    }).map((due) => ({ alarm: alarmOf(due), at: due.dueAt }));

    const kept = new Set(wanted.map(({ alarm }) => alarmKey(alarm)));

    for (const incarnation of Option.toArray(before))
      for (const due of dueRunsOf(incarnation)) {
        const alarm = alarmOf(due);

        if (!kept.has(alarmKey(alarm))) tx.clearAlarm(alarm);
      }

    for (const { alarm, at } of wanted) tx.setAlarm(alarm, at);
  };

  /**
   * Wakes an actor's schedules at a first use: each later due run has its alarm, and the runs that
   * came due while it slept are returned, in firing order, to fire once each.
   */
  const wake = (incarnation: Incarnation) => {
    const overdue = overdueIn(tx.machines, incarnation, tx.env.now);
    const late = new Set(overdue.map((d) => d.run.arming));

    if (awake(incarnation.actor))
      for (const due of dueRunsOf(incarnation))
        if (!late.has(due.run.arming)) tx.setAlarm(alarmOf(due), due.dueAt);

    return overdue;
  };

  // Decides every schedule declared on an incarnation's chain for one occasion, from `before`;
  // a schedule in `fresh` starts its scope again, with no state. A schedule no longer declared
  // goes. The same incarnation when nothing changes.
  const pass = (
    incarnation: Incarnation,
    before: ReadonlyMap<string, Scheduled>,
    occasionOf: (schedule: Schedule) => Occasion,
    fresh: ReadonlySet<string>,
  ) => {
    const declared = declaredOn(tx.machines, incarnation);

    if (declared.length === 0 && before.size === 0 && incarnation.schedules.size === 0)
      return incarnation;

    let rows: Option.Option<Operations> = Option.none();

    const operations = () =>
      Option.getOrElse(rows, () => {
        const gathered = operationsOf(tx.world(), tx.machines, incarnation.actor);

        rows = Option.some(gathered);

        return gathered;
      });

    const after = new Map<string, Scheduled>();
    let changed = before !== incarnation.schedules;

    for (const schedule of declared) {
      const was = fresh.has(schedule.name)
        ? Option.none<Scheduled>()
        : Option.fromUndefinedOr(before.get(schedule.name));

      const decision = decide(
        schedule,
        was,
        occasionOf(schedule),
        checksOf(incarnation, schedule, operations),
        { now: tx.env.now, mint: tx.mintArming },
      );

      reported(incarnation, schedule, decision.seen, decision.raised);
      after.set(schedule.name, decision.after);
      changed = changed || !Option.exists(was, (w) => w === decision.after);
    }

    changed = changed || [...before.keys()].some((name) => !after.has(name));

    return changed ? { ...incarnation, schedules: after } : incarnation;
  };

  const namesIn = (incarnation: Incarnation, paths: ReadonlyArray<string>) =>
    new Set(
      paths.flatMap(
        (path) =>
          tx.machines
            .get(incarnation.actor.machine)
            ?.states.get(path)
            ?.schedules.map((s) => s.name) ?? [],
      ),
    );

  /**
   * Decides an incarnation's schedules after a committed turn, its creation included: a schedule
   * of a state the turn exited starts again with no state; the turn's armings, disarms and firing
   * apply; keys, `restartOn` and the pause reasons read the memory and lanes the turn left.
   * `before` holds its schedules when the turn began.
   */
  const turned = (
    incarnation: Incarnation,
    before: ReadonlyMap<string, Scheduled>,
    work: TurnWork,
  ) =>
    pass(
      incarnation,
      before,
      (schedule) =>
        Occasion.Turn({
          disarmed: work.disarms.includes(schedule.name),
          started: Option.map(
            Option.fromUndefinedOr(work.arms.find((a) => a.name === schedule.name)),
            (a) => a.first,
          ),
          fired: Option.filter(work.fired, (f) => f.name === schedule.name),
        }),
      namesIn(incarnation, work.exits),
    );

  /**
   * Decides an incarnation's schedules after a firing whose send did not commit: the fired
   * schedule hears its firing and its refusal, if refused; every other schedule hears a lane move.
   */
  const firingSettled = (
    incarnation: Incarnation,
    firing: Firing,
    refusal: Option.Option<Failure>,
  ) =>
    pass(
      incarnation,
      incarnation.schedules,
      (schedule) =>
        schedule.name === firing.name ? Occasion.Settled({ firing, refusal }) : Occasion.Lanes(),
      NO_NAMES,
    );

  /**
   * Re-checks an incarnation's schedules on a context change or a lane move.
   */
  const rechecked = (incarnation: Incarnation, occasion: Occasion) =>
    pass(incarnation, incarnation.schedules, () => occasion, NO_NAMES);

  /**
   * An incarnation's schedules woken from their decoded record: each decided on a silent wake.
   */
  const woke = (incarnation: Incarnation, saved: ReadonlyMap<string, Scheduled>) =>
    pass({ ...incarnation, schedules: saved }, saved, () => Occasion.Wake(), NO_NAMES);

  /**
   * What a timer's firing carries: its metadata for the send's mapper.
   */
  const metadataOf = (tracked: Tracked, run: Run, dueAt: number) =>
    ({
      attempt: run.attempt + 1,
      armedAt: run.armedAt,
      dueAt,
      firedAt: tx.env.now,
      output: Cursor.$is("Stepping")(run.cursor) ? run.cursor.output : undefined,
      key: Option.getOrUndefined(Option.map(tracked.key, (k) => k.value)),
    }) satisfies FiringMetadata;

  /**
   * A firing's next step, read before its send: a Duration is done; a series steps from now, done
   * once complete, over when the step is past the timer limit or its stepper throws; a broken
   * cursor is over.
   */
  const nextOf = (incarnation: Incarnation, tracked: Tracked, run: Run) =>
    Cursor.$match(run.cursor, {
      Once: () => Next.Done(),
      Broken: () => Next.Over(),
      Stepping: ({ series }) => {
        const track = trackOf(tracked.name, tracked.key);

        const step = Result.try(() =>
          stepper(incarnation.actor, track, run.armedAt)(series, run.attempt + 2),
        );

        if (Result.isFailure(step)) return Next.Over();

        return Option.match(step.success, {
          onNone: () => Next.Done(),
          onSome: ({ ms, output }) =>
            Result.match(inRange(ms), {
              onFailure: () => Next.Over(),
              onSuccess: (inside) => Next.Again({ ms: inside, output }),
            }),
        });
      },
    });

  /**
   * The timer a firing names, while its arming is still live and its deadline has passed: a
   * firing queued twice for one step finds the next step not yet due.
   */
  const firingRun = (incarnation: Incarnation, schedule: string, track: string, arming: ArmingId) =>
    Option.filter(
      Option.flatMap(trackedAt(incarnation, schedule, track), (tracked) =>
        Arming.$is("Armed")(tracked.arming) && Timing.$is("Due")(tracked.arming.run.timing)
          ? Option.some({
              tracked,
              run: tracked.arming.run,
              dueAt: tracked.arming.run.timing.dueAt,
            })
          : Option.none(),
      ),
      (due) => due.run.arming === arming && due.dueAt <= tx.env.now,
    );

  /**
   * The schedule of an active state by name.
   */
  const scheduleNamed = (incarnation: Incarnation, name: string) =>
    Option.fromUndefinedOr(declaredOn(tx.machines, incarnation).find((s) => s.name === name));

  return {
    turned,
    rechecked,
    firingSettled,
    woke,
    syncAlarms,
    metadataOf,
    nextOf,
    firingRun,
    scheduleNamed,
    stepper,
    keyOf,
    wake,
  };
};

/**
 * Schedules.
 */
export type ScheduleSteps = ReturnType<typeof makeSchedules>;
