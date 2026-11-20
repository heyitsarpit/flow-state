import { Equal, Option, Result } from "effect";
import { callSlot, type Schedule, type ScheduleInput } from "./compiled.ts";
import { type Issue, IssueSource } from "./world.ts";

/**
 * A schedule's checks after a committed turn: which schedules have them, the pause reasons that
 * hold a timer, and which of its issues a clean pass clears.
 */
export const checks = (s: Schedule) =>
  Option.isSome(s.keys) || Option.isSome(s.restartOn) || s.paused.length > 0;

export const sameReasons = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((r, n) => r === b[n]);

// The active reason names of a timer, in declaration order, or the slot of the one that threw.
export const reasonsOf = (schedule: Schedule, read: ScheduleInput) => {
  const active: Array<string> = [];

  for (const { reason, check } of schedule.paused) {
    const held = callSlot(check, read);

    if (Result.isFailure(held)) return Result.fail(held.failure);

    if (held.success === true) active.push(reason);
  }

  return Result.succeed<ReadonlyArray<string>>(active);
};

const checkSlotsOf = (schedule: Schedule) => [
  ...Option.toArray(Option.map(schedule.keys, (k) => k.slot)),
  ...Option.toArray(Option.map(schedule.restartOn, (r) => r.slot)),
  ...schedule.paused.map((p) => p.check.slot),
];

// Whether a pass clears an issue, as a later success clears its own source's: a defect of one of
// a schedule's checks, when that schedule's checks all ran in the pass and none of them raised one.
export const recoveredBy = (
  checked: ReadonlyArray<Schedule>,
  raised: ReadonlyArray<Issue>,
  issue: Issue,
) =>
  checked.some((schedule) => {
    const source = IssueSource.Schedule({ name: schedule.name });

    return (
      Equal.equals(issue.source, source) &&
      Option.exists(issue.slot, (slot) => checkSlotsOf(schedule).includes(slot)) &&
      !raised.some((r) => Equal.equals(r.source, source))
    );
  });
