import { Data, Option } from "effect";
import { makeClock, type WorldClock } from "./clock.ts";
import { makeNetwork, type Network } from "./network.ts";
import { makePage, type Page } from "./page.ts";
import { makeStorage, type Storage } from "./storage.ts";

/**
 * A step did not settle within its bound: the runtime kept making work, or said it had work
 * pending with nothing queued to run it.
 */
export class Unsettled extends Data.TaggedError("Unsettled")<{ readonly steps: number }> {}

const STEPS_PER_SETTLE = 100_000;

/**
 * The fake world one case runs in: its hosts, and the steps across them.
 *
 * **Details**
 *
 * - `settle` runs the page's queued work, one task at a time, until nothing is left and the
 *   runtime has nothing pending.
 * - `advance` moves time forward by `ms`, firing each due timer in time order and settling after
 *   each, including timers armed along the way that fall due by the end.
 * - `kill` kills the page: its timers, tasks, held batches and live calls die; the store's bytes
 *   and the server's log stay.
 *
 * **Gotchas**
 *
 * - `settle` and `advance` throw {@link Unsettled} past 100,000 tasks or firings.
 */
export type World = {
  readonly clock: WorldClock;
  readonly page: Page;
  readonly storage: Storage;
  readonly network: Network;
  readonly settle: (pending: () => boolean) => void;
  readonly advance: (ms: number, pending: () => boolean) => void;
  readonly kill: () => void;
};

/**
 * A fresh world for one case: `seed` fixes the store's load order and the session seeds.
 */
// RETURN_TYPE: the exported World contract the case and the runtime both name.
export const makeWorld = (seed: number): World => {
  const clock = makeClock();
  const page = makePage(seed);
  const storage = makeStorage(seed, page);
  const network = makeNetwork();

  const settle = (pending: () => boolean) => {
    for (let steps = 0; steps <= STEPS_PER_SETTLE; steps += 1) {
      if (!page.runOne()) {
        if (!pending()) return;
        throw new Unsettled({ steps });
      }
    }

    throw new Unsettled({ steps: STEPS_PER_SETTLE });
  };

  return {
    clock,
    page,
    storage,
    network,
    settle,
    advance: (ms, pending) => {
      const end = clock.now() + ms;
      settle(pending);

      for (let fired = 0; fired <= STEPS_PER_SETTLE; fired += 1) {
        const due = clock.nextDue(end);

        if (Option.isSome(due)) clock.fire(due.value);
        else if (clock.now() < end) clock.moveTo(end);
        else return;

        settle(pending);
      }

      throw new Unsettled({ steps: STEPS_PER_SETTLE });
    },
    kill: () => {
      clock.kill();
      page.kill();
      storage.kill();
      network.kill();
    },
  };
};
