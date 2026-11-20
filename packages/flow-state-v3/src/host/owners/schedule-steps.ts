import { Cause, Duration, Effect, Exit, Option, Pull, Schedule } from "effect";
import type { Series, StepSchedule } from "../../core/compiled.ts";

// FLOW_STATE_ALLOW_UNKNOWN: an Effect Schedule's step, whatever its output; its input is unread.
type Stepper = (
  now: number,
  input: unknown,
) => Pull.Pull<[unknown, Duration.Duration], never, unknown>;

// A series' live step function and how many steps it has taken.
type Live = { readonly step: Stepper; readonly taken: number };

// One step at `now`: its delay and output, or none once the Schedule is done. Any other failure is
// the Schedule's defect, thrown to the core, which makes it its schedule's slot's.
const stepOnce = (step: Stepper, now: number) => {
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the core asks for a step inside its synchronous step; a Schedule's step is pure and runs here, at the host's one runner for it
  const exit = Effect.runSyncExit(
    step(now, undefined).pipe(
      Effect.map(([output, delay]) => Option.some({ ms: Duration.toMillis(delay), output })),
      Pull.catchDone(() => Effect.succeedNone),
    ),
  );

  if (Exit.isSuccess(exit)) return exit.value;

  // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a Schedule's defect goes back to the core's slot call
  throw Cause.squash(exit.cause);
};

// A series started again, its first `taken` steps replayed at the arming time; fewer when it
// completes first.
const replayed = (series: Series, taken: number, armedAt: number) => {
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- Schedule.toStep builds the step function synchronously, as stepOnce runs it
  const step = Effect.runSync(Schedule.toStep(series));
  let done = 0;

  while (done < taken && Option.isSome(stepOnce(step, armedAt))) done += 1;

  return { step, taken: done } satisfies Live;
};

/**
 * The host's stepping of Effect Schedules, for the core's `Env.step`: each series keeps its live
 * step function from `Schedule.toStep`, stepped with the Runtime Clock's now the core passes.
 *
 * **Details**
 *
 * A step asked out of turn (a restore, or a replayed step) starts the Schedule again and replays
 * its earlier steps at the arming time, so a Schedule whose delays count its steps gives the same
 * delays either way; one whose delays read the clock reads the arming time for the replayed steps.
 * One live series is kept per id, until it completes.
 */
export const makeScheduleSteps = () => {
  const kept = new Map<string, Live>();

  const step: StepSchedule = ({ id, series, attempt, armedAt, now }) => {
    const known = kept.get(id);
    const live = known?.taken === attempt - 1 ? known : replayed(series, attempt - 1, armedAt);

    if (live.taken !== attempt - 1) return Option.none();

    const stepped = stepOnce(live.step, now);

    if (Option.isSome(stepped)) kept.set(id, { step: live.step, taken: attempt });
    else kept.delete(id);

    return stepped;
  };

  return step;
};
