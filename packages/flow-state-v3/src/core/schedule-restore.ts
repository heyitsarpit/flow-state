import { Option, Predicate, Result, Schema } from "effect";
import {
  callSlot,
  Delay,
  Planned,
  type Schedule,
  type ScheduleCodecs,
  type Series,
} from "./compiled.ts";
import { savedSchedule, savedTimer } from "./schedule-decision.ts";
import { schedulesOf, seriesId } from "./schedule-plan.ts";
import type { ScheduleSteps } from "./schedules.ts";
import { chainOf } from "./tree.ts";
import type { Machines, Tx } from "./tx.ts";
import type { SavedSchedules, SavedTimer } from "./vocabulary.ts";
import { type Incarnation, trackOf } from "./world.ts";
import {
  Arming,
  type Checked,
  Cursor,
  type Failure,
  Outcome,
  type Scheduled,
  Selection,
  type TimerKey,
  timersIn,
  Timing,
  type Tracked,
  valueOf,
} from "./timers.ts";

// The saved form of an incarnation's schedules: one saved per timer, the record's encoded side,
// and the decoder table that reads it back against the current definition.

const failureOf = (failure: Failure) => ({ code: failure.code, slot: failure.slot });

const jsonText = Schema.encodeUnknownResult(Schema.fromJsonString(Schema.Json));

// A key's text is the JSON its codec wrote: the record keeps it as JSON.
const keyJson = Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Json));

const savedArmingOf = (tracked: Tracked) =>
  Arming.$match(tracked.arming, {
    Idle: () => ({ _tag: "Idle" }) as const,
    Refused: ({ failure }) => ({ _tag: "Refused", ...failureOf(failure) }) as const,
    Armed: ({ run }) =>
      Timing.$match(run.timing, {
        Due: ({ dueAt }) =>
          ({ _tag: "Due", armedAt: run.armedAt, attempt: run.attempt, dueAt }) as const,
        Held: ({ left }) =>
          ({ _tag: "Held", armedAt: run.armedAt, attempt: run.attempt, left }) as const,
      }),
  });

const savedSelectionOf = (selection: Checked<Selection>) => {
  const value = valueOf(selection);
  const text = Selection.$is("Selected")(value) ? { selection: value.text } : {};

  return selection._tag === "Failed"
    ? { ...text, selectionFailed: failureOf(selection.failure) }
    : text;
};

/**
 * One timer as its record saves it: the clean outcomes are absent.
 */
export const savedTimerOf = (tracked: Tracked) => {
  const reasons = valueOf(tracked.reasons);

  const saved: SavedTimer = {
    ...Option.match(
      Option.flatMap(tracked.key, (k) => Result.getSuccess(keyJson(k.text))),
      {
        onNone: () => ({}),
        onSome: (key) => ({ key }),
      },
    ),
    ...savedSelectionOf(tracked.selection),
    ...Option.match(
      Option.liftPredicate(reasons, (r) => r.length > 0),
      { onNone: () => ({}), onSome: (r) => ({ reasons: r }) },
    ),
    arming: savedArmingOf(tracked),
    ...Outcome.$match(tracked.firing, {
      Clean: () => ({}),
      Failed: ({ failure }) => ({ firing: failureOf(failure) }),
    }),
  };

  return saved;
};

/**
 * An incarnation's schedules as its record saves them: by the state path that declares each, then
 * by name, every timer saved, idle ones included.
 */
export const savedSchedulesOf = (machines: Machines, incarnation: Incarnation) => {
  const saved: Record<string, Record<string, SavedTimer | ReadonlyArray<SavedTimer>>> = {};
  const declared = schedulesOf(machines, incarnation.actor.machine);

  for (const path of chainOf(incarnation.state))
    for (const schedule of declared(path)) {
      const scheduled = incarnation.schedules.get(schedule.name);

      if (scheduled === undefined) continue;

      saved[path] = {
        ...saved[path],
        [schedule.name]:
          scheduled._tag === "Single"
            ? savedTimerOf(scheduled.timer)
            : timersIn(scheduled).map(savedTimerOf),
      };
    }

  return saved;
};

// A saved selection read by the declared codec: its text again, or no baseline when the codec no
// longer reads it or `restartOn` is no longer declared.
const selectionRead = (codecs: Option.Option<ScheduleCodecs>, text: string) =>
  Option.match(
    Option.flatMap(
      Option.flatMap(codecs, (c) => c.selection),
      (codec) =>
        Result.getSuccess(
          Result.flatMap(Schema.decodeUnknownResult(codec)(text), (value) =>
            Schema.encodeUnknownResult(codec)(value),
          ),
        ),
    ),
    {
      onNone: () => Selection.Unselected(),
      onSome: (again) => Selection.Selected({ text: again }),
    },
  );

// RETURN_TYPE: the Checked union, whichever branch builds it.
const savedSelection = (
  schedule: Schedule,
  codecs: Option.Option<ScheduleCodecs>,
  saved: SavedTimer,
): Checked<Selection> => {
  const value =
    saved.selection === undefined || Option.isNone(schedule.restartOn)
      ? Selection.Unselected()
      : selectionRead(codecs, saved.selection);

  return saved.selectionFailed === undefined
    ? { _tag: "Read", value }
    : { _tag: "Failed", failure: saved.selectionFailed, last: value };
};

/**
 * Restoring an incarnation's timers from its record, by the decoder table.
 */
export const makeScheduleRestore = (tx: Tx, schedules: ScheduleSteps) => {
  // The Effect Schedule a saved run steps, planned again from the restored memory: none for a
  // Duration; its slot's failure when a computed delay throws.
  const plannedOf = (incarnation: Incarnation, key: Option.Option<TimerKey>, schedule: Schedule) =>
    Result.map(
      Delay.$match(schedule.delay, {
        Fixed: ({ planned }) => Result.succeed(planned),
        Computed: ({ plan }) =>
          callSlot(plan, schedules.readOf(incarnation, key, schedules.noOperations)),
      }),
      (planned) =>
        Planned.$match(planned, {
          Ms: () => Option.none<Series>(),
          Stepped: ({ series }) => Option.some(series),
        }),
    );

  // A saved run's cursor: a Duration fires once; a series is replayed to its saved step from its
  // arming, and fires once when it ends before it; a delay that throws is broken.
  const resume = (
    incarnation: Incarnation,
    schedule: Schedule,
    key: Option.Option<TimerKey>,
    run: { readonly armedAt: number; readonly attempt: number },
  ) => {
    const planned = plannedOf(incarnation, key, schedule);

    if (Result.isFailure(planned))
      return Cursor.Broken({ failure: { code: "InvalidTurn", slot: planned.failure } });

    return Option.match(planned.success, {
      onNone: () => Cursor.Once(),
      onSome: (series) => {
        const step = Result.try(() =>
          tx.env.step({
            id: seriesId(incarnation.actor, trackOf(schedule.name, key), run.armedAt),
            series,
            attempt: run.attempt + 1,
            armedAt: run.armedAt,
            now: run.armedAt,
          }),
        );

        if (Result.isFailure(step))
          return Cursor.Broken({ failure: { code: "InvalidTurn", slot: schedule.slot } });

        return Option.match(step.success, {
          onNone: () => Cursor.Once(),
          onSome: ({ output }) => Cursor.Stepping({ series, output }),
        });
      },
    });
  };

  const savedArming = (
    incarnation: Incarnation,
    schedule: Schedule,
    key: Option.Option<TimerKey>,
    arming: SavedTimer["arming"],
  ) => {
    switch (arming._tag) {
      case "Idle":
        return Arming.Idle();
      case "Refused":
        return Arming.Refused({ failure: { code: arming.code, slot: arming.slot } });
      case "Due":
      case "Held":
        return Arming.Armed({
          run: {
            arming: tx.mintArming(),
            armedAt: arming.armedAt,
            attempt: arming.attempt,
            cursor: resume(incarnation, schedule, key, arming),
            timing:
              arming._tag === "Due"
                ? Timing.Due({ dueAt: arming.dueAt })
                : Timing.Held({ left: arming.left }),
          },
        });
    }
  };

  // A saved timer against the current definition: an undeclared reason name dropped, a selection
  // the codec no longer reads no baseline, a run with a new arming id and its cursor resumed.
  const timerOf = (
    incarnation: Incarnation,
    schedule: Schedule,
    key: Option.Option<TimerKey>,
    saved: SavedTimer,
  ) => {
    const codecs = Option.fromUndefinedOr(
      tx.machines.get(incarnation.actor.machine)?.schedules.get(schedule.name),
    );

    const declared = new Set(schedule.paused.map((p) => p.reason));

    return savedTimer({
      name: schedule.name,
      key,
      selection: savedSelection(schedule, codecs, saved),
      reasons: { _tag: "Read", value: (saved.reasons ?? []).filter((r) => declared.has(r)) },
      arming: savedArming(incarnation, schedule, key, saved.arming),
      firing:
        saved.firing === undefined
          ? Outcome.Clean()
          : Outcome.Failed({ failure: { code: saved.firing.code, slot: saved.firing.slot } }),
    });
  };

  // A saved key read by the declared key codec: its text again, or none when the codec no longer
  // reads it.
  const keyOf = (incarnation: Incarnation, schedule: Schedule, json: SavedTimer["key"]) =>
    Option.flatMap(
      Option.flatMap(
        Option.fromUndefinedOr(
          tx.machines.get(incarnation.actor.machine)?.schedules.get(schedule.name),
        ),
        (c) => c.key,
      ),
      (codec) =>
        Option.flatMap(
          Result.getSuccess(
            Result.flatMap(jsonText(json), (text) => Schema.decodeUnknownResult(codec)(text)),
          ),
          (value) => Result.getSuccess(schedules.keyOf(incarnation, schedule.name, value)),
        ),
    );

  // One schedule's saved entry: none when its keying changed; a keyed timer whose key no longer
  // reads is dropped.
  // RETURN_TYPE: an Option of the decided state, whichever branch builds it.
  const scheduledOf = (
    incarnation: Incarnation,
    schedule: Schedule,
    entry: SavedTimer | ReadonlyArray<SavedTimer>,
  ): Option.Option<Scheduled> => {
    if (Option.isNone(schedule.keys))
      return isOneTimer(entry)
        ? Option.some(
            savedSchedule({
              _tag: "Single",
              timer: timerOf(incarnation, schedule, Option.none(), entry),
            }),
          )
        : Option.none();

    if (isOneTimer(entry)) return Option.none();

    const timers = entry.flatMap((saved) =>
      Option.toArray(
        Option.map(keyOf(incarnation, schedule, saved.key), (key) =>
          timerOf(incarnation, schedule, Option.some(key), saved),
        ),
      ),
    );

    return Option.some(
      savedSchedule({
        _tag: "Keyed",
        timers: new Map(
          timers
            .map(
              (t) =>
                [
                  Option.getOrElse(
                    Option.map(t.key, (k) => k.text),
                    () => "",
                  ),
                  t,
                ] as const,
            )
            .toSorted(([a], [b]) => (a < b ? -1 : Number(a > b))),
        ),
      }),
    );
  };

  /**
   * An incarnation's timers from its record: each saved entry of a schedule declared on its
   * chain, by the state path that declares it, decoded, then every schedule woken.
   */
  const restore = (incarnation: Incarnation, saved: SavedSchedules) => {
    const decoded = new Map<string, Scheduled>();
    const declared = schedulesOf(tx.machines, incarnation.actor.machine);

    for (const path of chainOf(incarnation.state))
      for (const schedule of declared(path)) {
        const entry = saved[path]?.[schedule.name];

        if (entry === undefined) continue;

        for (const scheduled of Option.toArray(scheduledOf(incarnation, schedule, entry)))
          decoded.set(schedule.name, scheduled);
      }

    return schedules.woke(incarnation, decoded);
  };

  return { restore };
};

// FLOW_STATE_ALLOW_UNKNOWN: a saved entry, one timer or a keyed list.
// RETURN_TYPE: a type guard states the type it narrows to.
const isOneTimer = (entry: unknown): entry is SavedTimer =>
  Predicate.isObject(entry) && !Array.isArray(entry);
