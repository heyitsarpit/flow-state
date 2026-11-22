import { readsOf, scopeOf } from "./reads.ts";
import { Array as Arr, Option, Predicate, Result, Schema } from "effect";
import {
  callSlot,
  Delay,
  Planned,
  type Schedule,
  type ScheduleCodecs,
  type Series,
  type Values,
} from "./compiled.ts";
import { savedSchedule, savedTimer } from "./schedule-decision.ts";
import { schedulesOf, seriesId } from "./schedule-plan.ts";
import type { ScheduleSteps } from "./schedules.ts";
import type { Machines, Tx } from "./tx.ts";
import type { SavedSchedules, SavedTimer } from "./record-shape.ts";
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
    ...Option.match(Option.liftPredicate(reasons, Arr.isReadonlyArrayNonEmpty), {
      onNone: () => ({}),
      onSome: (r) => ({ reasons: r }),
    }),
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

  for (const path of machines.get(incarnation.actor.machine)?.states.get(incarnation.state)
    ?.chain ?? [])
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
// FLOW_STATE_ALLOW_UNKNOWN: a restored delay reads no rows; the map is typed as the callbacks see it.
const NO_OPERATIONS: ReadonlyMap<string, ReadonlyMap<string, unknown>> = new Map();

export const makeScheduleRestore = (tx: Tx, schedules: ScheduleSteps) => {
  // The Effect Schedule a saved run steps, planned again from the restored memory: none for a
  // Duration; its slot's failure when a computed delay throws.
  const plannedOf = (incarnation: Incarnation, key: Option.Option<TimerKey>, schedule: Schedule) =>
    Result.map(
      Delay.$match(schedule.delay, {
        Fixed: ({ planned }) => Result.succeed(planned),
        Computed: ({ plan }) =>
          callSlot(
            plan,
            readsOf(scopeOf(incarnation), "Schedule", {
              key,
              operations: NO_OPERATIONS,
              now: tx.env.now,
            }),
          ),
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

  // One schedule's entry, as the wake keeps it: none when its keying changed.
  // RETURN_TYPE: an Option of the decided state, whichever branch builds it.
  const scheduledOf = (incarnation: Incarnation, entry: WakeEntry): Option.Option<Scheduled> => {
    const { schedule } = entry;

    if (entry._tag === "Single")
      return Option.some(
        savedSchedule({
          _tag: "Single",
          timer: timerOf(incarnation, schedule, Option.none(), entry.saved),
        }),
      );

    return Option.some(
      savedSchedule({
        _tag: "Keyed",
        timers: new Map(
          entry.timers.map(
            ({ key, saved }) =>
              [
                key.text,
                timerOf(
                  incarnation,
                  schedule,
                  Option.some({ text: key.text, value: tx.env.admit(key.value) }),
                  saved,
                ),
              ] as const,
          ),
        ),
      }),
    );
  };

  /**
   * An incarnation's timers from its record: each saved entry the wake keeps, decoded, then
   * every schedule woken.
   */
  const restore = (incarnation: Incarnation, saved: SavedSchedules) => {
    const decoded = new Map<string, Scheduled>();

    for (const entry of wakeEntries(
      tx.machines,
      incarnation.actor.machine,
      incarnation.state,
      saved,
    ))
      for (const scheduled of Option.toArray(scheduledOf(incarnation, entry)))
        decoded.set(entry.schedule.name, scheduled);

    return schedules.woke(incarnation, decoded);
  };

  return { restore };
};

// FLOW_STATE_ALLOW_UNKNOWN: a saved entry, one timer or a keyed list.
// RETURN_TYPE: a type guard states the type it narrows to.
const isOneTimer = (entry: unknown): entry is SavedTimer =>
  Predicate.isObject(entry) && !Array.isArray(entry);

/**
 * One saved schedule entry as a wake keeps it: an unkeyed schedule's timer, or a keyed one's
 * timers whose keys the declared key codec still reads, in key-text order.
 */
export type WakeEntry =
  | { readonly _tag: "Single"; readonly schedule: Schedule; readonly saved: SavedTimer }
  | {
      readonly _tag: "Keyed";
      readonly schedule: Schedule;
      readonly timers: ReadonlyArray<{
        readonly key: { readonly text: string; readonly value: Values };
        readonly saved: SavedTimer;
      }>;
    };

// A saved key read by the declared key codec: its text again and its value, or none when the
// codec no longer reads it.
const savedKeyOf = (codec: Option.Option<Schema.Codec<Values, string>>, json: SavedTimer["key"]) =>
  Option.flatMap(codec, (c) =>
    Option.flatMap(
      Result.getSuccess(
        Result.flatMap(jsonText(json), (text) => Schema.decodeUnknownResult(c)(text)),
      ),
      (value) =>
        Option.map(Result.getSuccess(Schema.encodeUnknownResult(c)(value)), (text) => ({
          text,
          value,
        })),
    ),
  );

// One saved entry as the wake keeps it: none when its keying changed.
// RETURN_TYPE: an Option of the WakeEntry union, whichever branch builds it.
const entryOf = (
  machines: Machines,
  machine: string,
  schedule: Schedule,
  entry: SavedTimer | ReadonlyArray<SavedTimer>,
): Option.Option<WakeEntry> => {
  if (Option.isNone(schedule.keys))
    return isOneTimer(entry)
      ? Option.some({ _tag: "Single", schedule, saved: entry })
      : Option.none();

  if (isOneTimer(entry)) return Option.none();

  const codec = Option.flatMap(
    Option.fromUndefinedOr(machines.get(machine)?.schedules.get(schedule.name)),
    (c) => c.key,
  );

  const timers = entry
    .flatMap((one) =>
      Option.toArray(Option.map(savedKeyOf(codec, one.key), (key) => ({ key, saved: one }))),
    )
    .toSorted((a, b) => (a.key.text < b.key.text ? -1 : Number(a.key.text > b.key.text)));

  return Option.some({ _tag: "Keyed", schedule, timers });
};

/**
 * The saved entries a wake decodes, in the declared order of the record's chain: each schedule
 * declared on the chain, from the state path that declares it, whose keying is unchanged; a keyed
 * timer whose key no longer reads is dropped. The restore and a resting snapshot read the same
 * entries.
 */
export const wakeEntries = (
  machines: Machines,
  machine: string,
  state: string,
  saved: SavedSchedules,
) => {
  const declared = schedulesOf(machines, machine);
  const entries: Array<WakeEntry> = [];

  for (const path of machines.get(machine)?.states.get(state)?.chain ?? [])
    for (const schedule of declared(path))
      for (const entry of Option.toArray(Option.fromUndefinedOr(saved[path]?.[schedule.name])))
        for (const kept of Option.toArray(entryOf(machines, machine, schedule, entry)))
          entries.push(kept);

  return entries;
};
