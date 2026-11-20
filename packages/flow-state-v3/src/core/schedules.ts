import { Equal, Option, Predicate, Result } from "effect";
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
  declaredOn,
  dueIn,
  firstStep,
  inRange,
  operationsOf,
  schedulesOf,
  seriesId,
  type Step,
  waitingIn,
} from "./schedule-plan.ts";
import type { Tx } from "./tx.ts";
import {
  type ActorId,
  type Incarnation,
  type Issue,
  IssueSource,
  type Run,
  Timer,
  type TimerKey,
  Timing,
  type Tracked,
  trackOf,
  withIssue,
} from "./world.ts";

/**
 * Schedules: arming, keys, restarts, pauses and firings of an incarnation's timers.
 */
// FLOW_STATE_ALLOW_UNKNOWN: the rows a schedule's callbacks read, typed by the definition.
type Operations = ReadonlyMap<string, ReadonlyMap<string, unknown>>;

const NO_OPERATIONS: Operations = new Map();

/**
 * What a firing does to its timer: the next step's run, none when the series is complete or the
 * schedule is a Duration, and whether that next step was past the timer limit.
 */
export type Next = { readonly run: Option.Option<Run>; readonly over: boolean };

const sameReasons = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((r, n) => r === b[n]);

// RETURN_TYPE: a Tracked, so its Options widen to the timer's.
const idle = (name: string, key: Option.Option<TimerKey>): Tracked => ({
  name,
  key,
  baseline: Option.none(),
  run: Option.none(),
});

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

export const makeSchedules = (tx: Tx) => {
  const contextOf = (incarnation: Incarnation) =>
    Object.fromEntries([...incarnation.context].map(([slot, s]) => [slot, s.value]));

  // What a schedule's functions read for one timer.
  const readOf = (incarnation: Incarnation, key: Option.Option<TimerKey>, operations: Operations) =>
    ({
      key: Option.getOrUndefined(Option.map(key, (k) => k.value)),
      memory: incarnation.memory,
      context: contextOf(incarnation),
      operations,
      now: tx.env.now,
    }) satisfies ScheduleInput;

  const stepper =
    (actor: ActorId, track: string, armedAt: number) => (series: Series, attempt: number) =>
      tx.env.step({
        id: seriesId(actor, track, armedAt),
        series,
        attempt,
        armedAt,
        now: tx.env.now,
      });

  const disarmRun = (run: Run) =>
    Timing.$match(run.timing, {
      Running: ({ timer }) => tx.disarm(timer),
      Held: () => undefined,
    });

  const runningTimer = (
    incarnation: Incarnation,
    tracked: Tracked,
    arming: Run["arming"],
    at: number,
  ) =>
    tx.armTimer(
      Timer.Schedule({
        actor: incarnation.actor,
        incarnation: incarnation.id,
        schedule: tracked.name,
        track: trackOf(tracked.name, tracked.key),
        arming,
      }),
      at,
    );

  // A running timing to `dueAt` on a new host timer.
  const runningTo = (
    incarnation: Incarnation,
    tracked: Tracked,
    arming: Run["arming"],
    dueAt: number,
  ) => Timing.Running({ dueAt, timer: runningTimer(incarnation, tracked, arming, dueAt) });

  // A new run of a timer from its first step, armed now: it runs to its delay; a pause, checked
  // after, holds its full delay.
  const runFrom = (incarnation: Incarnation, tracked: Tracked, first: Step) => {
    const arming = tx.mintArming();

    return {
      arming,
      armedAt: tx.env.now,
      attempt: 0,
      series: first.series,
      output: first.output,
      timing: runningTo(incarnation, tracked, arming, tx.env.now + first.ms),
    } satisfies Run;
  };

  const issueOf = (actor: ActorId, name: string, code: Issue["code"], slot: string) =>
    tx.refuse(actor, { source: IssueSource.Schedule({ name }), code, slot: Option.some(slot) });

  /**
   * A timer armed now from its first step: a defective or out-of-range delay leaves it idle with
   * its schedule's issue.
   */
  const armed = (
    incarnation: Incarnation,
    tracked: Tracked,
    schedule: Schedule,
    operations: Operations,
  ) => {
    Option.map(tracked.run, disarmRun);

    const first = firstStep(
      schedule,
      readOf(incarnation, tracked.key, operations),
      stepper(incarnation.actor, trackOf(tracked.name, tracked.key), tx.env.now),
    );

    return Result.match(first, {
      onFailure: (slot) => ({
        tracked: { ...tracked, run: Option.none<Run>() },
        issue: Option.some(issueOf(incarnation.actor, schedule.name, "InvalidTurn", slot)),
      }),
      onSuccess: (step) => ({
        tracked: { ...tracked, run: Option.map(step, (s) => runFrom(incarnation, tracked, s)) },
        issue: Option.none<Issue>(),
      }),
    });
  };

  /**
   * Applies a turn's schedule work to the incarnation after it: each schedule of an entered state
   * gets its timer (idle until armed), each listed in the event's `disarmOn` stops, and each the
   * turn arms starts from its first step, the turn having checked it.
   */
  const apply = (
    incarnation: Incarnation,
    entered: ReadonlyArray<string>,
    disarmed: ReadonlyArray<string>,
    arms: ReadonlyArray<{ readonly name: string; readonly first: Option.Option<Step> }>,
  ) => {
    if (entered.length === 0 && disarmed.length === 0 && arms.length === 0) return incarnation;

    const timers = new Map(incarnation.schedules);
    const of = schedulesOf(tx.machines, incarnation.actor.machine);

    for (const s of entered.flatMap(of))
      if (Option.isNone(s.keys)) timers.set(s.name, idle(s.name, Option.none()));

    // A disarmed schedule stops every timer it has, each key's of a keyed one.
    for (const [track, tracked] of [...timers].filter(([, t]) => disarmed.includes(t.name)))
      for (const run of Option.toArray(tracked.run)) {
        disarmRun(run);
        timers.set(track, { ...tracked, run: Option.none() });
      }

    for (const { name, first } of arms) {
      const tracked = timers.get(name) ?? idle(name, Option.none());

      Option.map(tracked.run, disarmRun);
      timers.set(name, {
        ...tracked,
        run: Option.map(first, (step) => runFrom(incarnation, tracked, step)),
      });
    }

    return { ...incarnation, schedules: timers };
  };

  /**
   * Stops every timer of the named schedules: their states were exited.
   */
  const stopNamed = (incarnation: Incarnation, names: ReadonlySet<string>) => {
    if (![...incarnation.schedules.values()].some((t) => names.has(t.name))) return incarnation;

    const timers = new Map<string, Tracked>();

    for (const [track, tracked] of incarnation.schedules)
      if (names.has(tracked.name)) Option.map(tracked.run, disarmRun);
      else timers.set(track, tracked);

    return { ...incarnation, schedules: timers };
  };

  /**
   * Stops every timer: the incarnation ends.
   */
  const stopAll = (incarnation: Incarnation) => {
    for (const tracked of incarnation.schedules.values()) Option.map(tracked.run, disarmRun);

    return { ...incarnation, schedules: new Map<string, Tracked>() };
  };

  /**
   * A key's canonical text; a key that is no record or does not encode fails.
   */
  const keyOf = (
    // FLOW_STATE_ALLOW_UNKNOWN: whatever a keys callback returned or a record saved, checked here.
    value: unknown,
  ) =>
    Predicate.isReadonlyObject(value) && !Array.isArray(value)
      ? Result.mapBoth(encodeCanonical(value), {
          onFailure: () => "key",
          onSuccess: (text) => ({ text, value: tx.env.admit(value) }) satisfies TimerKey,
        })
      : Result.fail("key");

  // The keys a keyed schedule returns, each repeat dropped, or its slot when it throws or returns
  // something other than records.
  const keysOf = (keys: Option.Option.Value<Schedule["keys"]>, read: ScheduleInput) =>
    Result.flatMap(callSlot(keys, read), (list) => {
      if (!Array.isArray(list)) return Result.fail(keys.slot);

      const seen = new Map<string, TimerKey>();

      for (const value of list) {
        const key = keyOf(value);

        if (Result.isFailure(key)) return Result.fail(keys.slot);

        if (!seen.has(key.success.text)) seen.set(key.success.text, key.success);
      }

      return Result.succeed([...seen.values()]);
    });

  // A run held by its active reasons, or resumed when none holds it; the same run when nothing
  // changes. A silent change records no evidence.
  const paused = (
    incarnation: Incarnation,
    tracked: Tracked,
    run: Run,
    reasons: ReadonlyArray<string>,
    silent: boolean,
  ) => {
    const key = Option.map(tracked.key, (k) => k.value);
    const at = { actor: incarnation.actor, schedule: tracked.name, key };

    return Timing.$match(run.timing, {
      Running: ({ dueAt, timer }) => {
        if (reasons.length === 0) return run;

        const left = Math.max(dueAt - tx.env.now, 0);
        tx.disarm(timer);

        if (!silent) tx.act(Act.Paused({ ...at, reasons, left }));

        return { ...run, timing: Timing.Held({ left, pausedBy: reasons }) };
      },
      Held: ({ left, pausedBy }) => {
        if (reasons.length > 0)
          return sameReasons(reasons, pausedBy)
            ? run
            : { ...run, timing: Timing.Held({ left, pausedBy: reasons }) };

        const dueAt = tx.env.now + left;

        if (!silent) tx.act(Act.Resumed({ ...at, dueAt }));

        return { ...run, timing: runningTo(incarnation, tracked, run.arming, dueAt) };
      },
    });
  };

  /**
   * One settle's working state: the timers it changes and the issues it raises.
   */
  type Pass = {
    readonly incarnation: Incarnation;
    readonly operations: Operations;
    readonly timers: Map<string, Tracked>;
    readonly issues: Array<Issue>;
  };

  const put = (pass: Pass, track: string, tracked: Tracked) => void pass.timers.set(track, tracked);

  const timersOf = (pass: Pass, name: string) =>
    [...pass.timers].filter(([, t]) => t.name === name);

  const started = (pass: Pass, track: string, tracked: Tracked, schedule: Schedule) => {
    const arming = armed(pass.incarnation, tracked, schedule, pass.operations);

    for (const issue of Option.toArray(arming.issue)) pass.issues.push(issue);
    put(pass, track, arming.tracked);

    return arming.tracked;
  };

  // Keys: a new key arms, a gone key's timer stops.
  const keysPass = (
    pass: Pass,
    schedule: Schedule,
    keys: Option.Option.Value<Schedule["keys"]>,
  ) => {
    const listed = keysOf(keys, readOf(pass.incarnation, Option.none(), pass.operations));

    if (Result.isFailure(listed)) {
      pass.issues.push(issueOf(pass.incarnation.actor, schedule.name, "Defect", listed.failure));

      return;
    }

    const present = new Set(listed.success.map((k) => k.text));

    for (const [track, tracked] of timersOf(pass, schedule.name))
      if (!Option.exists(tracked.key, (k) => present.has(k.text))) {
        Option.map(tracked.run, disarmRun);
        pass.timers.delete(track);
      }

    for (const key of listed.success) {
      const track = trackOf(schedule.name, Option.some(key));

      if (!pass.timers.has(track))
        started(pass, track, idle(schedule.name, Option.some(key)), schedule);
    }
  };

  // restartOn: a changed selection restarts that timer from its first step; a timer with no
  // baseline takes one silently, and with `restart` off only those take one.
  const restartOne = (
    pass: Pass,
    schedule: Schedule,
    restartOn: Option.Option.Value<Schedule["restartOn"]>,
    restart: boolean,
    [track, tracked]: readonly [string, Tracked],
  ) => {
    const selected = callSlot(restartOn, readOf(pass.incarnation, tracked.key, pass.operations));

    if (Result.isFailure(selected)) {
      pass.issues.push(issueOf(pass.incarnation.actor, schedule.name, "Defect", selected.failure));

      return;
    }

    if (Option.exists(tracked.baseline, (b) => Equal.equals(b, selected.success))) return;

    const restarted =
      restart && Option.isSome(tracked.baseline)
        ? started(pass, track, tracked, schedule)
        : tracked;

    put(pass, track, { ...restarted, baseline: Option.some(selected.success) });
  };

  const restartPass = (
    pass: Pass,
    schedule: Schedule,
    restartOn: Option.Option.Value<Schedule["restartOn"]>,
    restart: boolean,
  ) => {
    for (const entry of timersOf(pass, schedule.name))
      if (restart || Option.isNone(entry[1].baseline))
        restartOne(pass, schedule, restartOn, restart, entry);
  };

  // paused: each armed timer is held or resumed by its reasons.
  const pausePass = (pass: Pass, schedule: Schedule, silent: boolean) => {
    for (const [track, tracked] of timersOf(pass, schedule.name))
      for (const run of Option.toArray(tracked.run)) {
        const reasons = reasonsOf(schedule, readOf(pass.incarnation, tracked.key, pass.operations));

        if (Result.isFailure(reasons))
          pass.issues.push(
            issueOf(pass.incarnation.actor, schedule.name, "Defect", reasons.failure),
          );
        else {
          const next = paused(pass.incarnation, tracked, run, reasons.success, silent);

          if (next !== run) put(pass, track, { ...tracked, run: Option.some(next) });
        }
      }
  };

  const checks = (s: Schedule) =>
    Option.isSome(s.keys) || Option.isSome(s.restartOn) || s.paused.length > 0;

  /**
   * Runs an incarnation's schedule checks after a change: for each active schedule, outermost
   * first, its keys, then with `restart` its `restartOn`, then its pause reasons. A defect raises
   * one issue and keeps the schedule's previous values. `silent` records no pause or resume and
   * restarts nothing: a restore's re-evaluation. The same incarnation when nothing changes.
   */
  const settle = (incarnation: Incarnation, restart: boolean, silent: boolean) => {
    const checked = declaredOn(tx.machines, incarnation).filter(checks);

    if (checked.length === 0) return incarnation;

    const pass: Pass = {
      incarnation,
      operations: operationsOf(tx.world(), tx.machines, incarnation.actor),
      timers: new Map(incarnation.schedules),
      issues: [],
    };

    for (const schedule of checked) {
      for (const keys of Option.toArray(schedule.keys)) keysPass(pass, schedule, keys);

      for (const restartOn of Option.toArray(schedule.restartOn))
        restartPass(pass, schedule, restartOn, restart && !silent);

      if (schedule.paused.length > 0) pausePass(pass, schedule, silent);
    }

    const same =
      pass.timers.size === incarnation.schedules.size &&
      [...pass.timers].every(([track, t]) => incarnation.schedules.get(track) === t);

    if (same && pass.issues.length === 0) return incarnation;

    return pass.issues.reduce(withIssue, { ...incarnation, schedules: pass.timers });
  };

  /**
   * What a timer's firing carries: its metadata for the send's mapper.
   */
  const metadataOf = (tracked: Tracked, run: Run, dueAt: number) =>
    ({
      name: tracked.name,
      attempt: run.attempt + 1,
      armedAt: run.armedAt,
      dueAt,
      firedAt: tx.env.now,
      output: run.output,
      key: Option.getOrUndefined(Option.map(tracked.key, (k) => k.value)),
    }) satisfies FiringMetadata;

  /**
   * The run after a firing: a multi-step Schedule's next step from now, a pause after it held by
   * the next check with its full delay; none once complete, for a Duration, or when the next step
   * is past the timer limit.
   */
  // RETURN_TYPE: Next, whichever branch builds it.
  const next = (incarnation: Incarnation, tracked: Tracked, run: Run): Next => {
    if (Option.isNone(run.series)) return { run: Option.none(), over: false };

    const series = run.series.value;
    const attempt = run.attempt + 1;
    const track = trackOf(tracked.name, tracked.key);

    const stepped = Result.try(() =>
      stepper(incarnation.actor, track, run.armedAt)(series, attempt + 1),
    );

    // A Schedule whose step throws ends as one past the limit does: with its schedule's issue.
    if (Result.isFailure(stepped)) return { run: Option.none(), over: true };

    return Option.match(stepped.success, {
      onNone: () => ({ run: Option.none(), over: false }),
      onSome: ({ ms, output }) =>
        Result.match(inRange(ms), {
          onFailure: () => ({ run: Option.none(), over: true }),
          onSuccess: (inside) => ({
            run: Option.some({
              ...run,
              attempt,
              output,
              timing: runningTo(incarnation, tracked, run.arming, tx.env.now + inside),
            }),
            over: false,
          }),
        }),
    });
  };

  /**
   * The timer a firing names, while the firing still names its live arming and its deadline has
   * passed: a firing queued twice for one step finds the next step not yet due.
   */
  const firingRun = (incarnation: Incarnation, track: string, arming: Run["arming"]) =>
    Option.flatMap(Option.fromUndefinedOr(incarnation.schedules.get(track)), (tracked) =>
      Option.map(
        Option.filter(
          tracked.run,
          (run) =>
            run.arming === arming &&
            Timing.$is("Running")(run.timing) &&
            run.timing.dueAt <= tx.env.now,
        ),
        (run) => ({ tracked, run }),
      ),
    );

  /**
   * The schedule of an active state by name.
   */
  const scheduleNamed = (incarnation: Incarnation, name: string) =>
    Option.fromUndefinedOr(declaredOn(tx.machines, incarnation).find((s) => s.name === name));

  return {
    apply,
    armed,
    stopNamed,
    stopAll,
    settle,
    metadataOf,
    next,
    firingRun,
    scheduleNamed,
    readOf,
    stepper,
    keyOf,
    runningTo,
    noOperations: NO_OPERATIONS,
    waiting: (incarnation: Incarnation) =>
      waitingIn(tx.world(), tx.machines, incarnation, tx.env.now),
    dueNow: () => dueIn(tx.world(), tx.machines, tx.env.now),
  };
};

/**
 * Schedules.
 */
export type ScheduleSteps = ReturnType<typeof makeSchedules>;
