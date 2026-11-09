import { Clock, Context, Duration, Effect, Layer, Option } from "effect";

type Timer = { readonly at: number; readonly order: number; readonly fire: () => void };

const earliest = (a: Timer, b: Timer) =>
  a.at < b.at || (a.at === b.at && a.order < b.order) ? a : b;

/**
 * The fake world's clock: virtual time and the page's timers.
 *
 * **When to use**
 *
 * A runtime reads `now` and arms timers here, or reads Effect's own `Clock` built from it with
 * {@link WorldClock.effect}; the suite moves time with the world's `advance`.
 *
 * **Details**
 *
 * - Time moves only when the suite advances it, so every run of a case is the same run.
 * - `work` is the clock a slice of work is measured on. It counts calls, so a yield falls in the
 *   same place every run.
 * - A kill drops every armed timer: a timer belongs to its page.
 * - The operations are the host's synchronous primitives, as a page's `Date.now` and `setTimeout`
 *   are; the world's steps wrap them.
 */
export class WorldClock extends Context.Service<
  WorldClock,
  {
    readonly now: () => number;
    readonly work: () => number;
    readonly arm: (at: number, fire: () => void) => () => void;
    readonly nextDue: (until: number) => Option.Option<Timer>;
    readonly fire: (timer: Timer) => void;
    readonly moveTo: (time: number) => void;
    readonly armed: () => ReadonlyArray<number>;
    readonly kill: () => void;
  }
>()("flow-state-v3/conformance/world/WorldClock") {
  /**
   * A clock at time 0 with no timers, one per world.
   */
  static readonly layer = Layer.sync(WorldClock, () => {
    let time = 0;
    let worked = 0;
    let order = 0;
    let timers: ReadonlyArray<Timer> = [];

    return WorldClock.of({
      now: () => time,
      work: () => {
        worked += 0.01;

        return worked;
      },
      arm: (at, fire) => {
        order += 1;
        const timer = { at, order, fire };
        timers = [...timers, timer];

        return () => {
          timers = timers.filter((t) => t !== timer);
        };
      },
      nextDue: (until) =>
        Option.fromUndefinedOr(
          timers
            .filter((t) => t.at <= until)
            .reduce<Timer | undefined>((a, b) => (a === undefined ? b : earliest(a, b)), undefined),
        ),
      fire: (timer) => {
        timers = timers.filter((t) => t !== timer);
        time = Math.max(time, timer.at);
        timer.fire();
      },
      moveTo: (next) => {
        time = Math.max(time, next);
      },
      armed: () => timers.map((t) => t.at),
      kill: () => {
        timers = [];
      },
    });
  });

  /**
   * Effect's own `Clock`, read from this world's virtual time: a runtime host written with
   * `Clock.currentTimeMillis` and `Effect.sleep` runs on the fake world unchanged.
   *
   * **Details**
   *
   * A sleep arms a world timer and wakes when the suite advances past it; an interrupted sleep
   * disarms it. The nanosecond reads are the millisecond time scaled.
   */
  static readonly effect = Layer.effect(
    Clock.Clock,
    WorldClock.useSync((world) => {
      const nanos = () => BigInt(world.now()) * 1_000_000n;

      return {
        currentTimeMillisUnsafe: world.now,
        currentTimeMillis: Effect.sync(world.now),
        currentTimeNanosUnsafe: nanos,
        currentTimeNanos: Effect.sync(nanos),
        monotonicTimeNanosUnsafe: nanos,
        monotonicTimeNanos: Effect.sync(nanos),
        sleep: (duration: Duration.Duration) =>
          Effect.callback<void>((resume) => {
            const disarm = world.arm(world.now() + Duration.toMillis(duration), () =>
              resume(Effect.void),
            );

            return Effect.sync(disarm);
          }),
      };
    }),
  );
}
