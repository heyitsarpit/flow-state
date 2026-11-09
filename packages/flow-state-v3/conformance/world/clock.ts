type Timer = { readonly at: number; readonly order: number; readonly fire: () => void };

/**
 * The fake world's clock: virtual time and the page's timers.
 *
 * **When to use**
 *
 * A runtime reads `now` and arms timers here; the suite moves time with `advance` on the world.
 *
 * **Details**
 *
 * - Time moves only when the suite advances it, so every run of a case is the same run.
 * - `work` is the clock a slice of work is measured on. It counts calls, so a yield falls in the
 *   same place every run.
 * - A kill drops every armed timer: a timer belongs to its page.
 */
export type Clock = {
  readonly now: () => number;
  readonly work: () => number;
  readonly arm: (at: number, fire: () => void) => () => void;
  readonly nextDue: (until: number) => Timer | undefined;
  readonly fire: (timer: Timer) => void;
  readonly moveTo: (time: number) => void;
  readonly armed: () => ReadonlyArray<number>;
  readonly kill: () => void;
};

/**
 * Builds a clock at time 0 with no timers.
 */
export const makeClock = (): Clock => {
  let time = 0;
  let worked = 0;
  let order = 0;
  let timers: ReadonlyArray<Timer> = [];

  const earliest = (a: Timer, b: Timer) =>
    a.at < b.at || (a.at === b.at && a.order < b.order) ? a : b;

  return {
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
      timers
        .filter((t) => t.at <= until)
        .reduce<Timer | undefined>((a, b) => (a === undefined ? b : earliest(a, b)), undefined),
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
  };
};
