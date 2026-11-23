import { Brand, Data, Option, Result } from "effect";
import type { Schedule, Values } from "./compiled.ts";
import type { Step } from "./schedule-plan.ts";
import type { ArmingId } from "./world.ts";
import {
  Arming,
  type Checked,
  Cursor,
  type Failure,
  Outcome,
  type Run,
  type Scheduled,
  Selection,
  type TimerKey,
  Timing,
  type Tracked,
  valueOf,
} from "./timers.ts";

/**
 * What a timer's firing does next, read before its send: nothing more (a Duration, or a series
 * that is complete), another step `ms` from now with its output, or over (a next step past the
 * timer limit, a stepper that threw, or a broken cursor).
 */
export type Next = Data.TaggedEnum<{
  Done: {};
  // FLOW_STATE_ALLOW_UNKNOWN: an Effect Schedule step's output, whatever its type.
  Again: { ms: number; output: unknown };
  Over: {};
}>;

/**
 * Constructors and matchers for {@link Next}.
 */
export const Next = Data.taggedEnum<Next>();

/**
 * A timer's firing, as its schedule's decision hears it: the schedule, the arming that fired
 * (never a key, so a new, restarted or removed timer cannot be taken for it) and its next step.
 */
export type Firing = { readonly name: string; readonly arming: ArmingId; readonly next: Next };

/**
 * What one schedule hears in its scope: a committed turn (what it disarmed, the first step of the
 * arming it gave, and the firing whose send it was), a context change outside a turn, a lane move,
 * this schedule's firing whose send did not commit (with its refusal, if refused), or a wake.
 */
export type Occasion = Data.TaggedEnum<{
  Turn: {
    disarmed: boolean;
    started: Option.Option<Result.Result<Option.Option<Step>, string>>;
    fired: Option.Option<Firing>;
  };
  Context: {};
  Lanes: {};
  Settled: { firing: Firing; refusal: Option.Option<Failure> };
  Wake: {};
}>;

/**
 * Constructors and matchers for {@link Occasion}.
 */
export const Occasion = Data.taggedEnum<Occasion>();

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
 * keys, a timer's `restartOn` selection as its codec's text, its active reasons in declaration
 * order, and the first step of a run started now (none when its series is complete at once).
 */
export type Reads = {
  readonly keys: () => Result.Result<ReadonlyArray<TimerKey>, string>;
  readonly selection: (key: Option.Option<TimerKey>) => Result.Result<string, string>;
  readonly reasons: (key: Option.Option<TimerKey>) => Result.Result<ReadonlyArray<string>, string>;
  readonly first: (key: Option.Option<TimerKey>) => Result.Result<Option.Option<Step>, Failure>;
};

/**
 * A failure a decision met, with the timer's key (none for `keys` and an unkeyed schedule).
 */
export type Raised = Failure & { readonly key: Option.Option<TimerKey> };

/**
 * What a decision needs beside its reads: the time and the mint of arming ids.
 */
export type Env = { readonly now: number; readonly mint: () => ArmingId };

const timerOf = Brand.nominal<Tracked>();

const scheduledOf = Brand.nominal<Scheduled>();

const RAISED_ORDER = ["firing", "keys", "restartOn", "arming", "reasons"] as const;

type Kind = (typeof RAISED_ORDER)[number];

// One decision's working state: the failures it met by kind, and its pause evidence.
type Pass = {
  readonly schedule: Schedule;
  readonly occasion: Occasion;
  readonly reads: Reads;
  readonly env: Env;
  readonly raised: Map<Kind, Array<Raised>>;
  readonly seen: Array<Seen>;
};

const raise = (pass: Pass, kind: Kind, failure: Raised) => {
  const list = pass.raised.get(kind) ?? [];

  list.push(failure);
  pass.raised.set(kind, list);
};

const READ_NOTHING: Checked<ReadonlyArray<string>> = { _tag: "Read", value: [] };

const UNSELECTED: Checked<Selection> = { _tag: "Read", value: Selection.Unselected() };

const IDLE = Arming.Idle();

const CLEAN = Outcome.Clean();

/**
 * A timer new to its scope: no baseline, no reasons, idle, its last firing clean.
 */
export const newTimer = (name: string, key: Option.Option<TimerKey>) =>
  timerOf({ name, key, selection: UNSELECTED, reasons: READ_NOTHING, arming: IDLE, firing: CLEAN });

const turnOf = (occasion: Occasion) =>
  Occasion.$is("Turn")(occasion) ? Option.some(occasion) : Option.none();

const firingOf = (occasion: Occasion) =>
  Occasion.$match(occasion, {
    Turn: ({ fired }) => fired,
    Settled: ({ firing }) => Option.some(firing),
    Context: () => Option.none<Firing>(),
    Lanes: () => Option.none<Firing>(),
    Wake: () => Option.none<Firing>(),
  });

const runOf = (timer: Tracked) =>
  Arming.$is("Armed")(timer.arming) ? Option.some(timer.arming.run) : Option.none<Run>();

// Whether the occasion carries this timer's firing: its arming id is the timer's before.
const isMine = (pass: Pass, timer: Tracked) =>
  Option.exists(firingOf(pass.occasion), (firing) =>
    Option.exists(runOf(timer), (run) => run.arming === firing.arming),
  );

const sameList = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((r, n) => r === b[n]);

// Table Selection: compares when `restartOn` is declared and either the timer has no baseline or
// the occasion is a turn or a context change; a changed value restarts unless the turn disarmed.
const selected = (pass: Pass, timer: Tracked) => {
  const p = valueOf(timer.selection);
  const turn = turnOf(pass.occasion);

  const compares =
    Option.isSome(pass.schedule.restartOn) &&
    (Selection.$is("Unselected")(p) ||
      Option.isSome(turn) ||
      Occasion.$is("Context")(pass.occasion));

  if (!compares) return { selection: timer.selection, restart: false };

  const read = pass.reads.selection(timer.key);

  if (Result.isFailure(read)) {
    raise(pass, "restartOn", { key: timer.key, code: "Defect", slot: read.failure });

    return {
      selection: { _tag: "Failed", failure: { code: "Defect", slot: read.failure }, last: p },
      restart: false,
    } as const;
  }

  const unchanged = Selection.$is("Selected")(p) && p.text === read.success;

  if (unchanged && timer.selection._tag === "Read")
    return { selection: timer.selection, restart: false };

  const restarts =
    Occasion.$is("Context")(pass.occasion) || Option.exists(turn, (t) => !t.disarmed);

  return {
    selection: { _tag: "Read", value: unchanged ? p : Selection.Selected({ text: read.success }) },
    restart: restarts && Selection.$is("Selected")(p) && !unchanged,
  } as const;
};

// Table Arming, row A2: a run from step one, idle when its series is complete at once, refused
// with its failure.
const started = (pass: Pass, timer: Tracked) => {
  const given = Option.flatMap(turnOf(pass.occasion), (t) => t.started);

  const first = Option.match(given, {
    onNone: () => pass.reads.first(timer.key),
    onSome: (step) =>
      Result.mapError(step, (slot) => ({ code: "InvalidTurn", slot }) satisfies Failure),
  });

  if (Result.isFailure(first)) {
    raise(pass, "arming", { key: timer.key, ...first.failure });

    return Arming.Refused({ failure: first.failure });
  }

  return Option.match(first.success, {
    onNone: () => IDLE,
    onSome: (step) =>
      Arming.Armed({
        run: {
          arming: pass.env.mint(),
          armedAt: pass.env.now,
          attempt: 0,
          cursor: Option.match(step.series, {
            onNone: () => Cursor.Once(),
            onSome: (series) => Cursor.Stepping({ series, output: step.output }),
          }),
          timing: Timing.Due({ dueAt: pass.env.now + step.ms }),
        },
      }),
  });
};

// Table Arming, row A3: this timer's firing takes its next step, or ends its run.
const stepped = (pass: Pass, timer: Tracked) =>
  Option.match(
    Option.flatMap(firingOf(pass.occasion), (firing) =>
      Option.map(runOf(timer), (run) => ({ firing, run })),
    ),
    {
      onNone: () => timer.arming,
      onSome: ({ firing, run }) =>
        Next.$match(firing.next, {
          Again: ({ ms, output }) =>
            Arming.Armed({
              run: {
                ...run,
                attempt: run.attempt + 1,
                cursor: Cursor.$match(run.cursor, {
                  Stepping: ({ series }) => Cursor.Stepping({ series, output }),
                  Once: () => run.cursor,
                  Broken: () => run.cursor,
                }),
                timing: Timing.Due({ dueAt: pass.env.now + ms }),
              },
            }),
          Done: () => IDLE,
          Over: () => IDLE,
        }),
    },
  );

// Whether the timer is new and its schedule starts it so: a keyed one's new key, or an unkeyed
// one its entry arms.
const startsNew = (pass: Pass, isNew: boolean) =>
  isNew && (Option.isSome(pass.schedule.keys) || pass.schedule.onEntry);

// Table Arming: the first row that matches wins. A1 a disarm; A2 a start cause (the turn's own
// arm, a restart, a new timer its schedule starts, a refused start tried again); A3 this timer's
// firing; A4 unchanged.
const armed = (pass: Pass, timer: Tracked, cause: { restart: boolean; isNew: boolean }) => {
  const turn = turnOf(pass.occasion);

  if (Option.exists(turn, (t) => t.disarmed)) return { arming: IDLE, armedNow: false };

  const start =
    Option.exists(turn, (t) => Option.isSome(t.started)) ||
    cause.restart ||
    startsNew(pass, cause.isNew) ||
    Arming.$is("Refused")(timer.arming);

  if (start) {
    const arming = started(pass, timer);

    return { arming, armedNow: Arming.$is("Armed")(arming) };
  }

  return { arming: isMine(pass, timer) ? stepped(pass, timer) : timer.arming, armedNow: false };
};

// Table Firing: the first row that matches wins. F1 a start that armed; F2 this timer's firing
// over; F3 this timer's firing settled with a refusal; F4 this timer's firing committed; F5
// unchanged.
const fired = (pass: Pass, timer: Tracked, mine: boolean, armedNow: boolean) => {
  if (armedNow) return CLEAN;

  if (!mine) return timer.firing;

  const firing = Option.getOrThrow(firingOf(pass.occasion));

  if (Next.$is("Over")(firing.next)) {
    const failure: Failure = { code: "InvalidTurn", slot: pass.schedule.slot };

    raise(pass, "firing", { key: timer.key, ...failure });

    return Outcome.Failed({ failure });
  }

  if (Occasion.$is("Settled")(pass.occasion))
    return Option.match(pass.occasion.refusal, {
      onNone: () => timer.firing,
      onSome: (failure) => {
        raise(pass, "firing", { key: timer.key, ...failure });

        return Outcome.Failed({ failure });
      },
    });

  return CLEAN;
};

// Table Reasons, for every timer, armed or not: a throw keeps the last reasons.
const reasoned = (pass: Pass, timer: Tracked) => {
  if (pass.schedule.paused.length === 0)
    return timer.reasons._tag === "Read" && timer.reasons.value.length === 0
      ? timer.reasons
      : READ_NOTHING;

  const read = pass.reads.reasons(timer.key);
  const last = valueOf(timer.reasons);

  if (Result.isFailure(read)) {
    const failure: Failure = { code: "Defect", slot: read.failure };

    raise(pass, "reasons", { key: timer.key, ...failure });

    return { _tag: "Failed", failure, last } as const;
  }

  const same = sameList(last, read.success);

  if (same && timer.reasons._tag === "Read") return timer.reasons;

  return { _tag: "Read", value: same ? last : read.success } as const;
};

// Table Timing, for every armed timer, last: the only place a run moves between held and due. A
// wake records no evidence.
const timed = (
  pass: Pass,
  key: Option.Option<TimerKey>,
  arming: Arming,
  reasons: ReadonlyArray<string>,
) => {
  if (!Arming.$is("Armed")(arming)) return arming;

  const { run } = arming;
  const silent = Occasion.$is("Wake")(pass.occasion);
  const shown = Option.map(key, (k) => k.value);

  return Timing.$match(run.timing, {
    Due: ({ dueAt }) => {
      if (reasons.length === 0) return arming;

      const left = Math.max(dueAt - pass.env.now, 0);

      if (!silent) pass.seen.push(Seen.Paused({ key: shown, reasons, left }));

      return Arming.Armed({ run: { ...run, timing: Timing.Held({ left }) } });
    },
    Held: ({ left }) => {
      if (reasons.length > 0) return arming;

      const dueAt = pass.env.now + left;

      if (!silent) pass.seen.push(Seen.Resumed({ key: shown, dueAt }));

      return Arming.Armed({ run: { ...run, timing: Timing.Due({ dueAt }) } });
    },
  });
};

// One timer through tables Selection, Arming, Firing, Reasons and Timing; the same timer when no
// field changed.
const decideTimer = (pass: Pass, timer: Tracked, isNew: boolean) => {
  const mine = isMine(pass, timer);
  const { selection, restart } = selected(pass, timer);
  const { arming, armedNow } = armed(pass, timer, { restart, isNew });
  const firing = fired(pass, timer, mine, armedNow);
  const reasons = reasoned(pass, timer);
  const timing = timed(pass, timer.key, arming, valueOf(reasons));

  if (
    selection === timer.selection &&
    reasons === timer.reasons &&
    timing === timer.arming &&
    firing === timer.firing
  )
    return timer;

  return timerOf({ name: timer.name, key: timer.key, selection, reasons, arming: timing, firing });
};

const byText = (a: TimerKey, b: TimerKey) => (a.text < b.text ? -1 : Number(a.text > b.text));

// Table Keys for a keyed schedule: the listed keys' timers, a new key a new timer, the rest gone;
// a `keys` that throws keeps the timers as they were.
const keyed = (pass: Pass, before: Option.Option<Scheduled>) => {
  const was =
    Option.isSome(before) && before.value._tag === "Keyed"
      ? before.value.timers
      : new Map<string, Tracked>();

  const listed = pass.reads.keys();

  if (Result.isFailure(listed)) {
    raise(pass, "keys", { key: Option.none(), code: "Defect", slot: listed.failure });

    return {
      keys: Outcome.Failed({ failure: { code: "Defect", slot: listed.failure } }),
      timers: [...was.values()].map((timer) => ({ timer, isNew: false })),
    };
  }

  return {
    keys: CLEAN,
    timers: listed.success.toSorted(byText).map((key) => {
      const kept = was.get(key.text);

      return kept === undefined
        ? { timer: newTimer(pass.schedule.name, Option.some(key)), isNew: true }
        : { timer: kept, isNew: false };
    }),
  };
};

const textOf = (key: Option.Option<TimerKey>) =>
  Option.getOrElse(
    Option.map(key, (k) => k.text),
    () => "",
  );

const failureText = (outcome: Outcome) =>
  Outcome.$match(outcome, {
    Clean: () => "",
    Failed: ({ failure }) => `${failure.code} ${failure.slot}`,
  });

const sameOutcome = (a: Outcome, b: Outcome) => a === b || failureText(a) === failureText(b);

// Whether a keyed schedule's decision left it as it was: the same `keys` outcome and the same
// timers, each the same object.
const sameKeyed = (
  before: Option.Option<Scheduled>,
  keys: Outcome,
  timers: ReadonlyArray<Tracked>,
) => {
  if (Option.isNone(before) || before.value._tag !== "Keyed") return false;

  const was = before.value;

  return (
    sameOutcome(was.keys, keys) &&
    was.timers.size === timers.length &&
    timers.every((t) => was.timers.get(textOf(t.key)) === t)
  );
};

/**
 * Decides one schedule for one occasion in its scope: the six tables in order (Keys, Selection,
 * Arming, Firing, Reasons, Timing), each writing one field of each timer. The only code that
 * builds a timer or a schedule's state.
 *
 * **Details**
 *
 * `before` is none exactly when the scope's activation has no state for the schedule: its state
 * was just entered, or a restore's record lacks it. A disarm wins over every start; a start wins
 * over the firing's next step. A check that throws keeps its last value and fails its own field.
 * `raised` lists the failures met, in the order firing, keys, `restartOn`, arming, reasons. An
 * unchanged timer or schedule is the same object.
 */
export const decide = (
  schedule: Schedule,
  before: Option.Option<Scheduled>,
  occasion: Occasion,
  reads: Reads,
  env: Env,
) => {
  const pass: Pass = { schedule, occasion, reads, env, raised: new Map(), seen: [] };

  const raised = () => RAISED_ORDER.flatMap((kind) => pass.raised.get(kind) ?? []);

  if (Option.isNone(schedule.keys)) {
    const was = Option.flatMap(before, (b) =>
      b._tag === "Single" ? Option.some(b.timer) : Option.none(),
    );

    const timer = Option.getOrElse(was, () => newTimer(schedule.name, Option.none()));
    const after = decideTimer(pass, timer, Option.isNone(was));

    const scheduled =
      Option.isSome(before) && before.value._tag === "Single" && before.value.timer === after
        ? before.value
        : scheduledOf({ _tag: "Single", timer: after });

    return { after: scheduled, raised: raised(), seen: pass.seen };
  }

  const { keys, timers } = keyed(pass, before);
  const decidedTimers = timers.map(({ timer, isNew }) => decideTimer(pass, timer, isNew));

  const scheduled = sameKeyed(before, keys, decidedTimers)
    ? Option.getOrThrow(before)
    : scheduledOf({
        _tag: "Keyed",
        keys,
        timers: new Map(decidedTimers.map((t) => [textOf(t.key), t])),
      });

  return { after: scheduled, raised: raised(), seen: pass.seen };
};

/**
 * A saved timer as a restore decodes it, before its scope's wake decides it: the decoder table's
 * one place that builds a timer.
 */
export const savedTimer = timerOf;

/**
 * A schedule's state as a restore decodes it, before its scope's wake decides it.
 */
export const savedSchedule = (
  shape:
    | { readonly _tag: "Single"; readonly timer: Tracked }
    | { readonly _tag: "Keyed"; readonly timers: ReadonlyMap<string, Tracked> },
) => scheduledOf(shape._tag === "Single" ? shape : { ...shape, keys: CLEAN });
