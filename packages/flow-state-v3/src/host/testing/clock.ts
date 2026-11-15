import { Clock, Context, Duration, Effect, Layer, Option, Scheduler, Scope } from "effect";
import { TestClock } from "effect/testing";
import { Host } from "../host.ts";

const TASK_LIMIT = 100_000;

/**
 * One open of a tab's time and event loop: its own task list, drained by `settle`, and its own
 * TestClock, so time moves only when an effect adjusts it.
 *
 * **Details**
 *
 * Effect's MixedScheduler, with its host hook replaced by a push onto the task list, is wrapped by
 * TestClock's layer and given as the platform's Scheduler, which every fiber run on the platform
 * inherits. `perform` forks an effect on the platform, settles, and returns its exit if it ended.
 * A settle past 100,000 tasks calls `tooLong`. A dead tab is never drained or adjusted again.
 */
export const tabClock = (host: Host["Service"], now: number, tooLong: () => never) => {
  const tasks: Array<() => void> = [];

  const loop = new Scheduler.MixedScheduler("async", (task) => {
    tasks.push(task);

    return () => {
      if (tasks.includes(task)) tasks.splice(tasks.indexOf(task), 1);
    };
  });

  const settle = () => {
    for (let ran = 0; tasks.length > 0; ran++) {
      if (ran >= TASK_LIMIT) tooLong();
      tasks.shift()?.();
    }
  };

  // oxlint-disable-next-line lint-bomb/no-unmanaged-effect-scope -- a tab's clock lives as long as the tab; a dead tab is never closed, as a killed one is not
  const scope = Scope.makeUnsafe();

  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a tab is built synchronously at the run's boundary
  const timing = Effect.runSync(
    Layer.buildWithScope(TestClock.layer({ warningDelay: Duration.infinity }), scope).pipe(
      Effect.provideService(Scheduler.Scheduler, loop),
    ),
  );

  const platform = Context.merge(Context.make(Host, host), timing);
  const scheduler = Context.get(platform, Scheduler.Scheduler);
  const clock = Context.get(platform, Clock.Clock);

  const perform = <A, E>(effect: Effect.Effect<A, E>) => {
    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the run drives the tab's Runtime from its boundary
    const fiber = Effect.runForkWith(platform)(effect, { scheduler });
    settle();

    // oxlint-disable-next-line lint-bomb/no-unsafe-fiber-methods -- the tab is idle, so the fiber has ended or waits on a later step
    return Option.fromUndefinedOr(fiber.pollUnsafe());
  };

  perform(TestClock.setTime(now));

  return {
    platform,
    settle,
    perform,
    queued: () => tasks.length > 0,
    now: () => clock.currentTimeMillisUnsafe(),
  };
};
