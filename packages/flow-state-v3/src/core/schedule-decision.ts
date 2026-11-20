import { Data, Equal, Option, Result } from "effect";
import type { Schedule, Values } from "./compiled.ts";
import type { Step } from "./schedule-plan.ts";
import type { IssueCode } from "./vocabulary.ts";
import type { ArmingId, Run, TimerKey, Tracked } from "./world.ts";
import { Timing, trackOf } from "./world.ts";

/**
 * One schedule's decision for one occasion: its timers before, what the occasion did to it and
 * what its functions read after, in; its timers after, the one issue it raises, the checks that
 * ran clean and its pause evidence, out. Every change to a schedule's timers is decided here.
 */
export type Occasion = Data.TaggedEnum<{
  // A committed turn: its state exited or entered (both on a re-entry), the event listing it in
  // `disarmOn`, and the first step of an arming the turn checked (on entry or by `armOn`).
  Turn: {
    exited: boolean;
    entered: boolean;
    disarmed: boolean;
    armed: Option.Option<Option.Option<Step>>;
  };
  // A context change: `restartOn` and `paused`, which may read it, at once.
  Context: {};
  // A lane change, or a firing's next step: keys and pause reasons only.
  Lanes: {};
  // A restore: silent, and a schedule the record lacks that entry arms starts.
  Restore: { adds: boolean };
}>;

/**
 * Constructors and matchers for {@link Occasion}.
 */
export const Occasion = Data.taggedEnum<Occasion>();

/**
 * Where a decided run stands: due at a time, or held with its time left.
 */
export type Plan = Data.TaggedEnum<{
  Due: { dueAt: number };
  Held: { left: number; pausedBy: ReadonlyArray<string> };
}>;

/**
 * Constructors and matchers for {@link Plan}.
 */
export const Plan = Data.taggedEnum<Plan>();

/**
 * A decided run: a kept run carries its arming, a new one none until it is armed.
 */
export type PlannedRun = Omit<Run, "arming" | "timing"> & {
  readonly arming: Option.Option<ArmingId>;
  readonly plan: Plan;
};

/**
 * A decided timer.
 */
export type PlannedTrack = Omit<Tracked, "run"> & { readonly run: Option.Option<PlannedRun> };

/**
 * A pause or resume the decision records.
 */
export type Seen = Data.TaggedEnum<{
  Paused: { key: Option.Option<Values>; reasons: ReadonlyArray<string>; left: number };
  Resumed: { key: Option.Option<Values>; dueAt: number };
}>;

/**
 * Constructors and matchers for {@link Seen}.
 */
export const Seen = Data.taggedEnum<Seen>();

/**
 * What a schedule's functions read after the occasion, each failing with the slot that threw: its
 * keys, a timer's `restartOn` selection, its active reasons in declaration order, and the first
 * step of a run armed now.
 */
export type Reads = {
  readonly keys: () => Result.Result<ReadonlyArray<TimerKey>, string>;
  // FLOW_STATE_ALLOW_UNKNOWN: a restart selection of any type, compared by Equal.equals.
  readonly selection: (key: Option.Option<TimerKey>) => Result.Result<unknown, string>;
  readonly reasons: (key: Option.Option<TimerKey>) => Result.Result<ReadonlyArray<string>, string>;
  readonly first: (key: Option.Option<TimerKey>) => Result.Result<Option.Option<Step>, string>;
};

/**
 * A schedule's decision: its timers after, the first failure as its one issue, the check slots
 * that ran and never failed, and its pause evidence in order.
 */
export type Decision = {
  readonly tracks: ReadonlyArray<PlannedTrack>;
  readonly raised: Option.Option<{ readonly code: IssueCode; readonly slot: string }>;
  readonly clean: ReadonlySet<string>;
  readonly seen: ReadonlyArray<Seen>;
};

/**
 * The slots of a schedule's checks: `keys`, `restartOn` and each pause reason.
 */
export const checkSlotsOf = (schedule: Schedule) => [
  ...Option.toArray(Option.map(schedule.keys, (k) => k.slot)),
  ...Option.toArray(Option.map(schedule.restartOn, (r) => r.slot)),
  ...schedule.paused.map((p) => p.check.slot),
];

/**
 * A run as the decision plans it.
 */
export const plannedOf = (run: Run) =>
  ({
    arming: Option.some(run.arming),
    armedAt: run.armedAt,
    attempt: run.attempt,
    series: run.series,
    output: run.output,
    plan: Timing.$match(run.timing, {
      Running: ({ dueAt }) => Plan.Due({ dueAt }),
      Held: ({ left, pausedBy }) => Plan.Held({ left, pausedBy }),
    }),
  }) satisfies PlannedRun;

const plannedTrack = (tracked: Tracked) =>
  ({ ...tracked, run: Option.map(tracked.run, plannedOf) }) satisfies PlannedTrack;

const sameReasons = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((r, n) => r === b[n]);

// One timer while it is decided: whether it is new to this activation (it takes its baseline
// silently) and whether it starts a new run from step one.
type Working = {
  track: PlannedTrack;
  readonly fresh: boolean;
  start: boolean;
};

// The reasons a timer was last held by, at the start of the occasion: what a throwing reason
// keeps.
const lastReasonsOf = (before: ReadonlyMap<string, Tracked>, track: PlannedTrack) =>
  Option.match(
    Option.flatMap(
      Option.fromUndefinedOr(before.get(trackOf(track.name, track.key))),
      (t) => t.run,
    ),
    {
      onNone: () => [],
      onSome: (run) =>
        Timing.$match(run.timing, { Running: () => [], Held: ({ pausedBy }) => pausedBy }),
    },
  );

const idleTrack = (name: string, key: Option.Option<TimerKey>) =>
  ({ name, key, baseline: Option.none(), run: Option.none() }) satisfies PlannedTrack;

// One decision's working state: its timers, the failures in check order, the check slots that ran
// and the pause evidence.
type Pass = {
  readonly schedule: Schedule;
  readonly occasion: Occasion;
  readonly reads: Reads;
  readonly now: number;
  readonly before: ReadonlyMap<string, Tracked>;
  readonly turn: Option.Option<Occasion & { readonly _tag: "Turn" }>;
  readonly failures: Array<{ readonly code: IssueCode; readonly slot: string }>;
  readonly ran: Set<string>;
  readonly seen: Array<Seen>;
};

const disarmedIn = (pass: Pass) => Option.exists(pass.turn, (t) => t.disarmed);

// A check's result, its slot counted as run and a failure kept in order.
const checked = <A>(pass: Pass, slot: string, result: Result.Result<A, string>) => {
  pass.ran.add(slot);

  if (Result.isFailure(result)) pass.failures.push({ code: "Defect", slot: result.failure });

  return result;
};

// Keys: the timers the occasion starts from (none after an exit), a key that appears a new timer
// and a gone key's timer dropped; keys that throw keep the timers as they were.
const keyed = (pass: Pass) => {
  const kept = Option.exists(pass.turn, (t) => t.exited)
    ? []
    : [...pass.before.values()].map(plannedTrack);

  return Option.match(pass.schedule.keys, {
    onNone: () => {
      const [only] = kept;

      return [
        only === undefined
          ? { track: idleTrack(pass.schedule.name, Option.none()), fresh: true, start: false }
          : { track: only, fresh: false, start: false },
      ];
    },
    onSome: (keys) => {
      const listed = checked(pass, keys.slot, pass.reads.keys());

      if (Result.isFailure(listed))
        return kept.map((track) => ({ track, fresh: false, start: false }));

      const byTrack = new Map(kept.map((t) => [trackOf(t.name, t.key), t] as const));

      return listed.success.map((key) => {
        const track = byTrack.get(trackOf(pass.schedule.name, Option.some(key)));

        return track === undefined
          ? { track: idleTrack(pass.schedule.name, Option.some(key)), fresh: true, start: false }
          : { track, fresh: false, start: false };
      });
    },
  });
};

// restartOn: a timer new to the activation, or one with no baseline, takes the selection
// silently; a changed one restarts after a turn or a context change, unless the turn disarmed it.
// A lane change or a restore runs it only for a timer without a baseline.
const restarted = (pass: Pass, working: ReadonlyArray<Working>) => {
  const every = Option.isSome(pass.turn) || Occasion.$is("Context")(pass.occasion);
  const restarts = !disarmedIn(pass) && every;

  for (const restartOn of Option.toArray(pass.schedule.restartOn))
    for (const w of working.filter((x) => every || x.fresh || Option.isNone(x.track.baseline)))
      Result.match(checked(pass, restartOn.slot, pass.reads.selection(w.track.key)), {
        onFailure: () => undefined,
        onSuccess: (selection) => {
          const next = rebased(w, selection, restarts);

          w.track = next.track;
          w.start = next.start;
        },
      });
};

// A timer's new selection: a timer new to the activation or with no baseline takes it silently;
// a changed one takes it and restarts when `restarts`; an equal one changes nothing.
const rebased = (
  w: Working,
  // FLOW_STATE_ALLOW_UNKNOWN: a restart selection of any type, compared by Equal.equals.
  selection: unknown,
  restarts: boolean,
) => {
  const unset = w.fresh || Option.isNone(w.track.baseline);

  if (!unset && Option.exists(w.track.baseline, (b) => Equal.equals(b, selection))) return w;

  return {
    ...w,
    track: { ...w.track, baseline: Option.some(selection) },
    start: w.start || (!unset && restarts),
  };
};

// A timer with a new run from step one: the turn's checked first step, or one read now; a read
// that fails leaves it idle with its slot's failure.
const started = (pass: Pass, track: PlannedTrack, given: Option.Option<Option.Option<Step>>) => {
  const first = Option.match(given, {
    onNone: () => pass.reads.first(track.key),
    onSome: (step) => Result.succeed(step),
  });

  if (Result.isFailure(first)) pass.failures.push({ code: "InvalidTurn", slot: first.failure });

  return {
    ...track,
    run: Option.map(Option.flatten(Result.getSuccess(first)), (step) => ({
      arming: Option.none<ArmingId>(),
      armedAt: pass.now,
      attempt: 0,
      series: step.series,
      output: step.output,
      plan: Plan.Due({ dueAt: pass.now + step.ms }),
    })),
  } satisfies PlannedTrack;
};

// Arming: a disarming turn stops every run and starts none; otherwise the turn's arming, a new
// key, a restart or a restore's added schedule starts a run from step one.
const armed = (pass: Pass, working: ReadonlyArray<Working>) => {
  const given = Option.flatMap(pass.turn, (t) => t.armed);
  const adds = Occasion.$is("Restore")(pass.occasion) && pass.occasion.adds;
  const keyedSchedule = Option.isSome(pass.schedule.keys);

  for (const w of working) {
    if (disarmedIn(pass)) {
      w.track = { ...w.track, run: Option.none() };
      w.start = false;
      continue;
    }

    w.start = w.start || Option.isSome(given) || (keyedSchedule && w.fresh) || (adds && w.fresh);
  }

  for (const w of working.filter((x) => x.start)) w.track = started(pass, w.track, given);
};

// A run held by its active reasons or resumed when none holds it; the same run when nothing
// changes. A restore records no evidence.
const heldOrResumed = (
  pass: Pass,
  key: Option.Option<Values>,
  run: PlannedRun,
  reasons: ReadonlyArray<string>,
) => {
  const silent = Occasion.$is("Restore")(pass.occasion);

  return Plan.$match(run.plan, {
    Due: ({ dueAt }) => {
      if (reasons.length === 0) return run;

      const left = Math.max(dueAt - pass.now, 0);

      if (!silent) pass.seen.push(Seen.Paused({ key, reasons, left }));

      return { ...run, plan: Plan.Held({ left, pausedBy: reasons }) };
    },
    Held: ({ left, pausedBy }) => {
      if (reasons.length > 0)
        return sameReasons(reasons, pausedBy)
          ? run
          : { ...run, plan: Plan.Held({ left, pausedBy: reasons }) };

      if (!silent) pass.seen.push(Seen.Resumed({ key, dueAt: pass.now + left }));

      return { ...run, plan: Plan.Due({ dueAt: pass.now + left }) };
    },
  });
};

// Pause reasons: each timer's, armed or idle, in declaration order up to one that throws, which
// keeps the timer's last reasons.
const paused = (pass: Pass, working: ReadonlyArray<Working>) => {
  const slots = pass.schedule.paused.map((p) => p.check.slot);

  if (slots.length > 0)
    for (const w of working) {
      const result = pass.reads.reasons(w.track.key);

      const reached = Result.match(result, {
        onFailure: (slot) => slots.indexOf(slot) + 1,
        onSuccess: () => slots.length,
      });

      for (const slot of slots.slice(0, reached)) pass.ran.add(slot);

      if (Result.isFailure(result)) pass.failures.push({ code: "Defect", slot: result.failure });

      const reasons = Result.getOrElse(result, () => lastReasonsOf(pass.before, w.track));
      const key = Option.map(w.track.key, (k) => k.value);

      w.track = {
        ...w.track,
        run: Option.map(w.track.run, (run) => heldOrResumed(pass, key, run, reasons)),
      };
    }
};

/**
 * Decides one schedule for one occasion: keys, then `restartOn`, then the arming, then the pause
 * reasons.
 *
 * **Details**
 *
 * A disarming turn starts nothing: no entry or `armOn` arming, no new key's run and no restart,
 * and a changed selection becomes the baseline silently. A timer new to the activation takes its
 * baseline silently; a changed one restarts from step one only after a turn or a context change.
 * The reasons run for every timer, armed or idle. A check that throws keeps its previous value:
 * the key set, the baseline, or the timer's last reasons; the first failure is the issue. Only a
 * check that ran and never failed is reported clean, so only it clears its issue.
 */
export const decide = (
  schedule: Schedule,
  before: ReadonlyArray<Tracked>,
  occasion: Occasion,
  reads: Reads,
  now: number,
) => {
  const pass: Pass = {
    schedule,
    occasion,
    reads,
    now,
    before: new Map(before.map((t) => [trackOf(t.name, t.key), t] as const)),
    turn: Occasion.$is("Turn")(occasion) ? Option.some(occasion) : Option.none(),
    failures: [],
    ran: new Set(),
    seen: [],
  };

  const working: ReadonlyArray<Working> = keyed(pass);

  restarted(pass, working);
  armed(pass, working);
  paused(pass, working);

  const failed = new Set(pass.failures.map((f) => f.slot));

  return {
    tracks: working.map((w) => w.track),
    raised: Option.fromUndefinedOr(pass.failures[0]),
    clean: new Set([...pass.ran].filter((slot) => !failed.has(slot))),
    seen: pass.seen,
  } satisfies Decision;
};
