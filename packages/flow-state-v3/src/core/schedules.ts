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
  checkSlotsOf,
  decide,
  sameReasons,
  type Decision,
  Occasion,
  Plan,
  type PlannedRun,
  type PlannedTrack,
  Seen,
} from "./schedule-decision.ts";
import {
  declaredOn,
  dueIn,
  firstStep,
  inRange,
  operationsOf,
  seriesId,
  waitingIn,
} from "./schedule-plan.ts";
import type { Arming } from "./turn.ts";
import type { Tx } from "./tx.ts";
import {
  type ActorId,
  type Incarnation,
  IssueSource,
  type Run,
  Timer,
  type TimerKey,
  Timing,
  type Tracked,
  trackOf,
  withIssue,
} from "./world.ts";

// Schedules: an incarnation's timers, the one place that writes them. Each schedule's change for
// an occasion is decided by `decide` and applied by `pass`; a firing's next step is its one timer's
// change, applied by `fired`.

// FLOW_STATE_ALLOW_UNKNOWN: the rows a schedule's callbacks read, typed by the definition.
type Operations = ReadonlyMap<string, ReadonlyMap<string, unknown>>;

const NO_OPERATIONS: Operations = new Map();

/**
 * What a firing does to its timer: the next step's run, none when the series is complete or the
 * schedule is a Duration, and whether that next step was past the timer limit.
 */
type Next = { readonly run: Option.Option<Run>; readonly over: boolean };

// What a committed turn did to the schedules of its incarnation: the states it exited, the armings
// it checked, and the schedules its event lists in `disarmOn`.
type TurnWork = {
  readonly exits: ReadonlyArray<string>;
  readonly arms: ReadonlyArray<Arming>;
  readonly disarms: ReadonlyArray<string>;
};

// Whether a decided run is its timer's run unchanged.
const unchanged = (before: Run, after: PlannedRun) =>
  Option.exists(after.arming, (a) => a === before.arming) &&
  before.attempt === after.attempt &&
  Plan.$match(after.plan, {
    Due: ({ dueAt }) => Timing.$is("Running")(before.timing) && before.timing.dueAt === dueAt,
    Held: ({ left, pausedBy }) =>
      Timing.$is("Held")(before.timing) &&
      before.timing.left === left &&
      sameReasons(before.timing.pausedBy, pausedBy),
  });

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
    tracked: Pick<Tracked, "name" | "key">,
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
    tracked: Pick<Tracked, "name" | "key">,
    arming: Run["arming"],
    dueAt: number,
  ) => Timing.Running({ dueAt, timer: runningTimer(incarnation, tracked, arming, dueAt) });

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
  const readsOf = (incarnation: Incarnation, schedule: Schedule, operations: () => Operations) => {
    const read = (key: Option.Option<TimerKey>) => readOf(incarnation, key, operations());

    return {
      keys: () =>
        Option.match(schedule.keys, {
          onNone: () => Result.succeed([]),
          onSome: (keys) => keysOf(keys, read(Option.none())),
        }),
      selection: (key: Option.Option<TimerKey>) =>
        Option.match(schedule.restartOn, {
          onNone: () => Result.succeed(undefined),
          onSome: (restartOn) => callSlot(restartOn, read(key)),
        }),
      reasons: (key: Option.Option<TimerKey>) => reasonsOf(schedule, read(key)),
      first: (key: Option.Option<TimerKey>) =>
        firstStep(
          schedule,
          read(key),
          stepper(incarnation.actor, trackOf(schedule.name, key), tx.env.now),
        ),
    };
  };

  // A decided timer as the incarnation holds it: an unchanged one is the same object; a run due
  // keeps its host timer when its arming and deadline are unchanged, and otherwise gets a new one.
  const trackedOf = (
    incarnation: Incarnation,
    before: Option.Option<Tracked>,
    after: PlannedTrack,
  ) => {
    const kept = Option.filter(before, (b) =>
      Option.match(b.run, {
        onNone: () => Option.isNone(after.run),
        onSome: (run) => Option.exists(after.run, (planned) => unchanged(run, planned)),
      }),
    );

    for (const run of Option.toArray(Option.flatMap(before, (b) => b.run)))
      if (Option.isNone(kept)) disarmRun(run);

    if (Option.exists(kept, (b) => b.baseline === after.baseline && b.key === after.key))
      return Option.getOrThrow(kept);

    const run = Option.match(kept, {
      onSome: (b) => b.run,
      onNone: () =>
        Option.map(after.run, (planned) => {
          const arming = Option.getOrElse(planned.arming, tx.mintArming);

          return {
            arming,
            armedAt: planned.armedAt,
            attempt: planned.attempt,
            series: planned.series,
            output: planned.output,
            timing: Plan.$match(planned.plan, {
              Due: ({ dueAt }) => runningTo(incarnation, after, arming, dueAt),
              Held: ({ left, pausedBy }) => Timing.Held({ left, pausedBy }),
            }),
          } satisfies Run;
        }),
    });

    return { name: after.name, key: after.key, baseline: after.baseline, run } satisfies Tracked;
  };

  // A decision's pause evidence and issue: the first failure raises the schedule's issue; with
  // none, an open check issue whose check ran clean clears.
  const reported = (incarnation: Incarnation, schedule: Schedule, decision: Decision) => {
    const at = { actor: incarnation.actor, schedule: schedule.name };

    for (const seen of decision.seen)
      tx.act(
        Seen.$match(seen, {
          Paused: (p) => Act.Paused({ ...at, ...p }),
          Resumed: (r) => Act.Resumed({ ...at, ...r }),
        }),
      );

    const source = IssueSource.Schedule({ name: schedule.name });

    return Option.match(decision.raised, {
      onSome: ({ code, slot }) =>
        withIssue(
          incarnation,
          tx.refuse(incarnation.actor, { source, code, slot: Option.some(slot) }),
        ),
      onNone: () => {
        const cleared = incarnation.issues.filter(
          (i) =>
            IssueSource.$is("Schedule")(i.source) &&
            i.source.name === schedule.name &&
            Option.exists(i.slot, (s) => decision.clean.has(s)),
        );

        return cleared.length === 0
          ? incarnation
          : { ...incarnation, issues: incarnation.issues.filter((i) => !cleared.includes(i)) };
      },
    });
  };

  // One schedule's decided timers put in `timers`, each stopped timer's host timer disarmed;
  // whether any timer changed.
  const applied = (
    incarnation: Incarnation,
    own: ReadonlyArray<Tracked>,
    decision: Decision,
    timers: Map<string, Tracked>,
  ) => {
    const byTrack = new Map(own.map((t) => [trackOf(t.name, t.key), t] as const));
    let changed = false;

    for (const after of decision.tracks) {
      const track = trackOf(after.name, after.key);
      const prior = Option.fromUndefinedOr(byTrack.get(track));
      const tracked = trackedOf(incarnation, prior, after);

      byTrack.delete(track);
      timers.set(track, tracked);
      changed = changed || !Option.exists(prior, (p) => p === tracked);
    }

    for (const gone of byTrack.values()) Option.map(gone.run, disarmRun);

    return changed || byTrack.size > 0;
  };

  // Decides every schedule of an incarnation for one occasion and applies the decisions: each
  // schedule no longer declared on its chain stops, and each declared one is decided from its
  // timers before. The same incarnation when nothing changes.
  const pass = (
    incarnation: Incarnation,
    before: ReadonlyMap<string, Tracked>,
    occasionOf: (schedule: Schedule) => Occasion,
  ) => {
    const declared = declaredOn(tx.machines, incarnation);
    const names = new Set(declared.map((s) => s.name));
    let rows: Option.Option<Operations> = Option.none();

    const operations = () =>
      Option.getOrElse(rows, () => {
        const gathered = operationsOf(tx.world(), tx.machines, incarnation.actor);

        rows = Option.some(gathered);

        return gathered;
      });

    const timers = new Map<string, Tracked>();
    const undeclared = [...before.values()].filter((t) => !names.has(t.name));
    let issued: Incarnation = incarnation;
    let changed = before !== incarnation.schedules || undeclared.length > 0;

    for (const tracked of undeclared) Option.map(tracked.run, disarmRun);

    for (const schedule of declared) {
      const own = [...before.values()].filter((t) => t.name === schedule.name);

      const decision = decide(
        schedule,
        own,
        occasionOf(schedule),
        readsOf(incarnation, schedule, operations),
        tx.env.now,
      );

      const reports = reported(issued, schedule, decision);

      changed = applied(incarnation, own, decision, timers) || reports !== issued || changed;
      issued = reports;
    }

    return changed ? { ...issued, schedules: timers } : incarnation;
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
   * Decides an incarnation's schedules after a committed turn, its creation included: exits
   * stop, entries start, the turn's armings and disarms apply, then keys, `restartOn` and the
   * pause reasons read the memory and lanes the turn left. `before` holds its timers when the
   * turn began.
   */
  const turned = (
    incarnation: Incarnation,
    before: ReadonlyMap<string, Tracked>,
    work: TurnWork,
  ) => {
    const exited = namesIn(incarnation, work.exits);

    return pass(incarnation, before, (schedule) =>
      Occasion.Turn({
        exited: exited.has(schedule.name),
        disarmed: work.disarms.includes(schedule.name),
        armed: Option.map(
          Option.fromUndefinedOr(work.arms.find((a) => a.name === schedule.name)),
          (a) => a.first,
        ),
      }),
    );
  };

  /**
   * Re-checks an incarnation's schedules: on a context change its keys, `restartOn` with restarts
   * and the pause reasons; on a lane change or a firing's next step its keys and pause reasons.
   */
  const rechecked = (incarnation: Incarnation, occasion: Occasion) =>
    pass(incarnation, incarnation.schedules, () => occasion);

  /**
   * An incarnation's timers from its record, re-evaluated silently: keys and the pause reasons,
   * baselines taken silently, and each schedule in `adds` started from its first step.
   */
  const restored = (
    incarnation: Incarnation,
    timers: ReadonlyMap<string, Tracked>,
    adds: ReadonlySet<string>,
  ) =>
    pass({ ...incarnation, schedules: timers }, timers, (schedule) =>
      Occasion.Restore({ adds: adds.has(schedule.name) }),
    );

  /**
   * Stops every timer: the incarnation ends.
   */
  const stopAll = (incarnation: Incarnation) => {
    for (const tracked of incarnation.schedules.values()) Option.map(tracked.run, disarmRun);
  };

  /**
   * An incarnation after an accepted turn of `source`: its issue clears, except a schedule's
   * issue raised by one of its checks, which clears only when that check runs clean.
   */
  const succeeded = (incarnation: Incarnation, source: IssueSource) => {
    const checks = IssueSource.$is("Schedule")(source)
      ? declaredOn(tx.machines, incarnation)
          .filter((schedule) => schedule.name === source.name)
          .flatMap(checkSlotsOf)
      : [];

    const issues = incarnation.issues.filter(
      (i) =>
        !Equal.equals(i.source, source) || Option.exists(i.slot, (slot) => checks.includes(slot)),
    );

    return issues.length === incarnation.issues.length ? incarnation : { ...incarnation, issues };
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
   * A fired timer's incarnation with its next run, and whether that step was past the limit.
   */
  const fired = (incarnation: Incarnation, tracked: Tracked, run: Run) => {
    const after = next(incarnation, tracked, run);
    const track = trackOf(tracked.name, tracked.key);

    return {
      incarnation: {
        ...incarnation,
        schedules: new Map(incarnation.schedules).set(track, { ...tracked, run: after.run }),
      },
      over: after.over,
    };
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
    turned,
    rechecked,
    restored,
    stopAll,
    succeeded,
    metadataOf,
    fired,
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
