import { Data, Equal, Option, Result } from "effect";
import { Delay, type Schedule, type Values } from "./compiled.ts";
import type { Step } from "./schedule-plan.ts";
import type { IssueCode } from "./vocabulary.ts";
import type { ArmingId, Issue, Run, TimerKey, Tracked } from "./world.ts";
import { IssueSource, Timing, trackOf } from "./world.ts";

/**
 * A timer's firing, as its schedule's decision hears it: the timer's key, and whether its next
 * step was past the timer limit or its stepper threw, which ends the timer's run with an issue at
 * the schedule's slot.
 */
export type Firing = {
  readonly name: string;
  readonly key: Option.Option<TimerKey>;
  readonly over: boolean;
};

/**
 * A failure a decision hears or finds: its code and the callback slot that failed.
 */
export type Failure = { readonly code: IssueCode; readonly slot: string };

/**
 * One schedule's decision for one occasion: its timers and issues before, what the occasion did
 * to it and what its functions read after, in; its timers and issues after, the failures it
 * records and its pause evidence, out. Every change to a schedule's timers, but a firing's next
 * step, and every change to its issues is decided here.
 */
export type Occasion = Data.TaggedEnum<{
  // A committed turn: its state exited (and entered again on a re-entry), the event listing it in
  // `disarmOn`, the first step of an arming the turn checked (on entry or by `armOn`), and the
  // firing whose send it was.
  Turn: {
    exited: boolean;
    disarmed: boolean;
    armed: Option.Option<Option.Option<Step>>;
    fired: Option.Option<Firing>;
  };
  // A context change: keys, then `restartOn` and `paused`, which may read it, at once.
  Context: {};
  // A lane change: keys and pause reasons only.
  Lanes: {};
  // A firing whose send did not commit, refused or not: keys and pause reasons, as a lane change.
  Fired: { firing: Firing; refused: Option.Option<Failure> };
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
  Held: { left: number };
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
 * A schedule's decision: its timers after, its issues after (one per source), every failure it
 * raised as an issue to record, and its pause evidence in order.
 */
export type Decision = {
  readonly tracks: ReadonlyArray<PlannedTrack>;
  readonly issues: ReadonlyArray<Issue>;
  readonly raised: ReadonlyArray<Issue>;
  readonly seen: ReadonlyArray<Seen>;
};

/**
 * Whether an issue source is a schedule's, any key's.
 */
export const isScheduleSource = (name: string) => (source: IssueSource) =>
  IssueSource.$is("Schedule")(source) && source.name === name;

// The slots of a schedule's checks: `keys`, `restartOn`, each pause reason and its arming's delay.
// A firing's next step past the limit is reported at the schedule's slot, so the timer's next clean
// arming clears it. Any other slot of its issue is its firing's: the send's mapper or the send's
// refused turn.
const checkSlotsOf = (schedule: Schedule) =>
  new Set([
    ...Option.toArray(Option.map(schedule.keys, (k) => k.slot)),
    ...Option.toArray(Option.map(schedule.restartOn, (r) => r.slot)),
    ...schedule.paused.map((p) => p.check.slot),
    ...armingSlotsOf(schedule),
  ]);

// The slots an arming reads: the schedule's own (a delay out of range, a stepper that throws) and
// a computed delay's.
const armingSlotsOf = (schedule: Schedule) => [
  schedule.slot,
  ...Delay.$match(schedule.delay, { Fixed: () => [], Computed: ({ plan }) => [plan.slot] }),
];

// The text a source names its key by: none for an unkeyed schedule and for `keys`.
const keyTextOf = (key: Option.Option<TimerKey>) => Option.map(key, (k) => k.text);

const sourceKeyOf = (key: Option.Option<TimerKey>) => Option.getOrElse(keyTextOf(key), () => "");

// The key text an issue's source names, as `sourceKeyOf` gives it.
const issueKeyOf = (issue: Issue) =>
  IssueSource.$is("Schedule")(issue.source) ? Option.getOrElse(issue.source.key, () => "") : "";

// A run as the decision plans it.
const plannedOf = (run: Run) =>
  ({
    arming: Option.some(run.arming),
    armedAt: run.armedAt,
    attempt: run.attempt,
    series: run.series,
    output: run.output,
    plan: Timing.$match(run.timing, {
      Running: ({ dueAt }) => Plan.Due({ dueAt }),
      Held: ({ left }) => Plan.Held({ left }),
    }),
  }) satisfies PlannedRun;

const plannedTrack = (tracked: Tracked) =>
  ({ ...tracked, run: Option.map(tracked.run, plannedOf) }) satisfies PlannedTrack;

// Whether two lists of pause reasons are the same, in order.
const sameReasons = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((r, n) => r === b[n]);

// One timer while it is decided: whether it is new to this activation (it takes its baseline
// silently) and whether it starts a new run from step one.
type Working = {
  track: PlannedTrack;
  readonly fresh: boolean;
  start: boolean;
};

// The reasons a timer last read true, at the start of the occasion, armed or idle: what a throwing
// reason keeps. A timer of a re-entered state keeps its own.
const lastReasonsOf = (before: ReadonlyMap<string, Tracked>, track: PlannedTrack) =>
  before.get(trackOf(track.name, track.key))?.pausedBy ?? [];

const idleTrack = (name: string, key: Option.Option<TimerKey>) =>
  ({ name, key, baseline: Option.none(), pausedBy: [], run: Option.none() }) satisfies PlannedTrack;

// A failure of one source: the timer's key, none for `keys` and an unkeyed schedule.
type Raised = Failure & { readonly key: Option.Option<TimerKey> };

// One decision's working state: its timers, the failures in order, the check slots that ran per
// source and the pause evidence.
type Pass = {
  readonly schedule: Schedule;
  readonly occasion: Occasion;
  readonly reads: Reads;
  readonly now: number;
  readonly before: ReadonlyMap<string, Tracked>;
  readonly turn: Option.Option<Occasion & { readonly _tag: "Turn" }>;
  readonly failures: Array<Raised>;
  readonly ran: Map<string, Set<string>>;
  readonly seen: Array<Seen>;
};

const disarmedIn = (pass: Pass) => Option.exists(pass.turn, (t) => t.disarmed);

const ran = (pass: Pass, key: Option.Option<TimerKey>, slot: string) => {
  const source = sourceKeyOf(key);
  const slots = pass.ran.get(source) ?? new Set<string>();

  slots.add(slot);
  pass.ran.set(source, slots);
};

// A check's result, its slot counted as run for its source and a failure kept in order.
const checked = <A>(
  pass: Pass,
  key: Option.Option<TimerKey>,
  slot: string,
  result: Result.Result<A, string>,
) => {
  ran(pass, key, slot);

  if (Result.isFailure(result)) pass.failures.push({ key, code: "Defect", slot: result.failure });

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
      const listed = checked(pass, Option.none(), keys.slot, pass.reads.keys());

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
const selected = (pass: Pass, working: ReadonlyArray<Working>) => {
  const every = Option.isSome(pass.turn) || Occasion.$is("Context")(pass.occasion);
  const restarts = !disarmedIn(pass) && every;

  for (const restartOn of Option.toArray(pass.schedule.restartOn))
    for (const w of working.filter((x) => every || x.fresh || Option.isNone(x.track.baseline)))
      Result.match(checked(pass, w.track.key, restartOn.slot, pass.reads.selection(w.track.key)), {
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
// that fails leaves it idle with its slot's failure. A read that succeeds ran the arming's checks.
const started = (pass: Pass, track: PlannedTrack, given: Option.Option<Option.Option<Step>>) => {
  const first = Option.match(given, {
    onNone: () => pass.reads.first(track.key),
    onSome: (step) => Result.succeed(step),
  });

  if (Result.isFailure(first))
    pass.failures.push({ key: track.key, code: "InvalidTurn", slot: first.failure });
  else for (const slot of armingSlotsOf(pass.schedule)) ran(pass, track.key, slot);

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

// A run held by its timer's active reasons or resumed when none holds it; the same run when
// nothing changes. A restore records no evidence.
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

      return { ...run, plan: Plan.Held({ left }) };
    },
    Held: ({ left }) => {
      if (reasons.length > 0) return run;

      if (!silent) pass.seen.push(Seen.Resumed({ key, dueAt: pass.now + left }));

      return { ...run, plan: Plan.Due({ dueAt: pass.now + left }) };
    },
  });
};

// Pause reasons: each timer's, armed or idle, in declaration order up to one that throws, which
// keeps the timer's last reasons; the timer keeps what it read either way.
const paused = (pass: Pass, working: ReadonlyArray<Working>) => {
  const slots = pass.schedule.paused.map((p) => p.check.slot);

  if (slots.length > 0)
    for (const w of working) {
      const result = pass.reads.reasons(w.track.key);

      const reached = Result.match(result, {
        onFailure: (slot) => slots.indexOf(slot) + 1,
        onSuccess: () => slots.length,
      });

      for (const slot of slots.slice(0, reached)) ran(pass, w.track.key, slot);

      if (Result.isFailure(result))
        pass.failures.push({ key: w.track.key, code: "Defect", slot: result.failure });

      const reasons = Result.getOrElse(result, () => lastReasonsOf(pass.before, w.track));
      const key = Option.map(w.track.key, (k) => k.value);

      w.track = {
        ...w.track,
        pausedBy: sameReasons(reasons, w.track.pausedBy) ? w.track.pausedBy : reasons,
        run: Option.map(w.track.run, (run) => heldOrResumed(pass, key, run, reasons)),
      };
    }
};

// The firing the occasion carries, committed or not, and its failures: its next step past the
// limit, then its send's refusal. They come before the occasion's checks.
const firingOf = (occasion: Occasion) =>
  Occasion.$match(occasion, {
    Turn: ({ fired }) => fired,
    Fired: ({ firing }) => Option.some(firing),
    Context: () => Option.none<Firing>(),
    Lanes: () => Option.none<Firing>(),
    Restore: () => Option.none<Firing>(),
  });

const firingFailures = (schedule: Schedule, occasion: Occasion) => {
  const failures: Array<Raised> = [];

  for (const firing of Option.toArray(firingOf(occasion))) {
    if (firing.over) failures.push({ key: firing.key, code: "InvalidTurn", slot: schedule.slot });

    if (Occasion.$is("Fired")(occasion))
      for (const refused of Option.toArray(occasion.refused))
        failures.push({ key: firing.key, ...refused });
  }

  return failures;
};

const issueOf = (schedule: Schedule, failure: Raised) =>
  ({
    source: IssueSource.Schedule({ name: schedule.name, key: keyTextOf(failure.key) }),
    code: failure.code,
    slot: Option.some(failure.slot),
  }) satisfies Issue;

// The issues after, in order: each source's first failure replaces its issue; with none, a check's
// issue clears only when that check ran and never failed for that source, and a committed firing
// clears its own key's firing issues (its mapper's, its send's refusal), never a check's.
const issuesAfter = (pass: Pass, issues: ReadonlyArray<Issue>) => {
  const checks = checkSlotsOf(pass.schedule);
  const failed = new Map<string, Raised>();

  for (const f of pass.failures) {
    const source = sourceKeyOf(f.key);

    if (!failed.has(source)) failed.set(source, f);
  }

  const committed = Option.flatMap(pass.turn, (t) => t.fired);

  const kept = issues.filter((issue) => {
    const source = issueKeyOf(issue);

    const slot = Option.getOrElse(issue.slot, () => "");

    if (failed.has(source)) return false;

    if (checks.has(slot)) return !(pass.ran.get(source)?.has(slot) ?? false);

    return !Option.exists(committed, (fired) => sourceKeyOf(fired.key) === source);
  });

  return [...kept, ...[...failed.values()].map((f) => issueOf(pass.schedule, f))];
};

/**
 * Decides one schedule for one occasion: a firing's failures, keys, then `restartOn`, then the
 * arming, then the pause reasons, then the schedule's issues.
 *
 * **Details**
 *
 * A disarming turn starts nothing: no entry or `armOn` arming, no new key's run and no restart,
 * and a changed selection becomes the baseline silently. A timer new to the activation takes its
 * baseline silently; a changed one restarts from step one only after a turn or a context change.
 * The reasons run for every timer, armed or idle, and the timer keeps what they read. A check that
 * throws keeps its previous value: the key set, the baseline, or the timer's last reasons.
 *
 * Each issue's source is the schedule and the timer's key (none for `keys` and an unkeyed
 * schedule). A source's first failure is its issue, in place of its earlier one; a check's issue
 * clears only when that check ran clean for its key, and a committed firing clears only its own
 * key's firing issues. A key that leaves keeps its issues.
 */
export const decide = (
  schedule: Schedule,
  before: ReadonlyArray<Tracked>,
  issues: ReadonlyArray<Issue>,
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
    failures: firingFailures(schedule, occasion),
    ran: new Map(),
    seen: [],
  };

  const working: ReadonlyArray<Working> = keyed(pass);

  selected(pass, working);
  armed(pass, working);
  paused(pass, working);

  return {
    tracks: working.map((w) => w.track),
    issues: issuesAfter(pass, issues),
    raised: pass.failures.map((f) => issueOf(schedule, f)),
    seen: pass.seen,
  } satisfies Decision;
};
