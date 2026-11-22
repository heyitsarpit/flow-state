import { Option } from "effect";
import { wakeEntries } from "./schedule-restore.ts";
import type { Machines } from "./tx.ts";
import {
  Arming,
  Cursor,
  type Failure,
  Outcome,
  type Scheduled,
  type TimerKey,
  timersIn,
  type Tracked,
} from "./timers.ts";
import type { SavedTimer } from "./record-shape.ts";
import { type ActorRecord, type Issue, IssueSource } from "./world.ts";

// A schedule's issues, read from its timers' check outcomes, live or saved, and stored nowhere.

// A timer's first failed outcome in check order: its last firing, its `restartOn`, its arming (a
// refused start, or a broken cursor), its reasons.
const failureOf = (timer: Tracked) =>
  Option.firstSomeOf([
    Outcome.$is("Failed")(timer.firing) ? Option.some(timer.firing.failure) : Option.none(),
    timer.selection._tag === "Failed" ? Option.some(timer.selection.failure) : Option.none(),
    Arming.$match(timer.arming, {
      Idle: () => Option.none<Failure>(),
      Refused: ({ failure }) => Option.some(failure),
      Armed: ({ run }) =>
        Cursor.$is("Broken")(run.cursor) ? Option.some(run.cursor.failure) : Option.none(),
    }),
    timer.reasons._tag === "Failed" ? Option.some(timer.reasons.failure) : Option.none(),
  ]);

/**
 * A schedule's issue: its source names the schedule and the timer's key (none for `keys` and an
 * unkeyed schedule).
 */
export const issueOf = (name: string, key: Option.Option<TimerKey>, failure: Failure) =>
  ({
    source: IssueSource.Schedule({ name, key: Option.map(key, (k) => k.text) }),
    code: failure.code,
    slot: Option.some(failure.slot),
  }) satisfies Issue;

/**
 * A schedule's issues, read from its state and stored nowhere: its `keys` failure, then per timer
 * in key-text order the first failed outcome in check order.
 */
export const scheduleIssues = (name: string, scheduled: Scheduled) => {
  const keysIssue =
    scheduled._tag === "Keyed" && Outcome.$is("Failed")(scheduled.keys)
      ? [issueOf(name, Option.none(), scheduled.keys.failure)]
      : [];

  return [
    ...keysIssue,
    ...timersIn(scheduled).flatMap((timer) =>
      Option.toArray(Option.map(failureOf(timer), (failure) => issueOf(name, timer.key, failure))),
    ),
  ];
};

// A saved timer's first failed outcome in check order, as a wake would read it: its last firing,
// its `restartOn`, a refused start. A reason's failure is re-read at the wake, so none is saved.
const savedFailureOf = (saved: SavedTimer) =>
  Option.firstSomeOf([
    Option.fromUndefinedOr(saved.firing),
    Option.fromUndefinedOr(saved.selectionFailed),
    saved.arming._tag === "Refused"
      ? Option.some({ code: saved.arming.code, slot: saved.arming.slot })
      : Option.none(),
  ]);

/**
 * A resting record's schedule issues, read from the saved entries a wake keeps, in its declared
 * order and with each key's text by the declared key codec. A reason's failure and a broken
 * cursor are read only at the wake, so a resting record shows neither. Stores nothing.
 */
export const savedScheduleIssues = (machines: Machines, record: ActorRecord) =>
  wakeEntries(machines, record.actor.machine, record.state, record.schedules).flatMap((entry) =>
    (entry._tag === "Single"
      ? [{ key: Option.none<TimerKey>(), saved: entry.saved }]
      : entry.timers.map(({ key, saved }) => ({ key: Option.some<TimerKey>(key), saved }))
    ).flatMap(({ key, saved }) =>
      Option.toArray(
        Option.map(savedFailureOf(saved), (failure) => issueOf(entry.schedule.name, key, failure)),
      ),
    ),
  );
