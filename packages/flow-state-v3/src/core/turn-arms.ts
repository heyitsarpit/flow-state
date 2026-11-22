import { Option } from "effect";
import type { Compiled, Schedule } from "./compiled.ts";
import { readsOf, type Scope } from "./reads.ts";
import { firstStep } from "./schedule-plan.ts";
import type { Arming } from "./turn.ts";
import type { TurnInput } from "./walk.ts";

// The schedules a turn arms and disarms on the states active after it.

const NO_SCHEDULES: ReadonlyArray<Schedule> = [];

// FLOW_STATE_ALLOW_UNKNOWN: a turn's delay reads no rows; the map is typed as the callbacks see it.
const NO_OPERATIONS: ReadonlyMap<string, ReadonlyMap<string, unknown>> = new Map();

/**
 * The schedules a turn arms on the states active after it, outermost first: on each entered
 * state those armed on entry, and on every active state each one that lists the event, with its
 * first step read from the scope after the turn at the turn's now; a delay out of range or a
 * throwing callback is its slot's failure. Keyed schedules arm by their keys, after the turn.
 */
export const armingsOf = (
  compiled: Compiled,
  leaf: string,
  entered: ReadonlySet<string>,
  tag: string,
  scope: Scope,
  now: number,
  step: TurnInput["step"],
) => {
  const armed: Array<Arming> = [];

  // A schedule the event disarms is not armed, on entry either, so its delay is never computed and
  // cannot refuse the turn; the decision stops it.
  const arms = (path: string, schedule: Schedule) =>
    Option.isNone(schedule.keys) &&
    !schedule.disarmOn.includes(tag) &&
    ((entered.has(path) && schedule.onEntry) || schedule.armOn.includes(tag));

  const input = readsOf(scope, "Schedule", { key: Option.none(), operations: NO_OPERATIONS, now });

  for (const path of compiled.states.get(leaf)?.chain ?? [])
    for (const schedule of compiled.states.get(path)?.schedules ?? NO_SCHEDULES)
      if (arms(path, schedule)) {
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one step callback per schedule armed: the turn's result
        const first = firstStep(schedule, input, (series, attempt) =>
          step(schedule.name, series, attempt),
        );

        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one arming per schedule armed: the turn's result
        armed.push({ name: schedule.name, first });
      }

  return armed;
};

/**
 * The schedules of the states active after a turn that list its event in `disarmOn`.
 */
export const disarmedBy = (compiled: Compiled, leaf: string, tag: string) => {
  const names: Array<string> = [];

  for (const path of compiled.states.get(leaf)?.chain ?? [])
    for (const schedule of compiled.states.get(path)?.schedules ?? NO_SCHEDULES)
      if (schedule.disarmOn.includes(tag)) names.push(schedule.name);

  return names;
};
