import { Option } from "effect";

type Timer = { readonly at: number; readonly order: number; readonly fire: () => void };

const earliest = (a: Timer, b: Timer) =>
  a.at < b.at || (a.at === b.at && a.order < b.order) ? a : b;

/**
 * The fake world's clock: virtual time and the page's timers.
 *
 * **Details**
 *
 * - Time moves only when a case advances it, so every run of a case is the same run.
 * - A kill drops every armed timer: a timer belongs to its page.
 */
export type WorldClock = {
  readonly now: () => number;
  readonly arm: (at: number, fire: () => void) => () => void;
  readonly nextDue: (until: number) => Option.Option<Timer>;
  readonly fire: (timer: Timer) => void;
  readonly moveTo: (time: number) => void;
  readonly kill: () => void;
};

/**
 * A clock at time 0 with no timers, one per world.
 */
// RETURN_TYPE: the exported WorldClock contract; it types the methods' parameters for the runtime.
export const makeClock = (): WorldClock => {
  let time = 0;
  let order = 0;
  let timers: ReadonlyArray<Timer> = [];

  return {
    now: () => time,
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
    kill: () => {
      timers = [];
    },
  };
};
