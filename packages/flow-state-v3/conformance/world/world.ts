import { Data, Option } from "effect";
import { makeClock, type WorldClock } from "./clock.ts";
import { makeNetwork, type Network } from "./network.ts";
import { makePage, type Page } from "./page.ts";
import { makeStorage, type Storage } from "./storage.ts";

/**
 * A step did not settle within its bound: the runtime kept making work.
 */
export class Unsettled extends Data.TaggedError("Unsettled")<{ readonly steps: number }> {}

/**
 * The case ran past its time bound (Conformance R8), seen at `at`: the bound is the one
 * wall-clock read, made by the runner.
 */
export class Overdue extends Data.TaggedError("Overdue")<{
  readonly at: "task" | "timer" | "request";
}> {}

const STEPS_PER_SETTLE = 100_000;

/**
 * The world's hosts, which a runtime boots over: the clock, the page, the store and the server.
 */
export type Hosts = {
  readonly clock: WorldClock;
  readonly page: Page;
  readonly storage: Storage;
  readonly network: Network;
};

/**
 * The fake world one case runs in: its hosts, and the steps across them.
 *
 * **When to use**
 *
 * The Case settles the world after each step, advances time and kills the page through this;
 * a runtime boots over its `hosts`.
 *
 * **Details**
 *
 * - The world is plain owned state with synchronous steps: one per case, never shared.
 * - `settle` runs the page's queued work, one task at a time, until nothing is left and the
 *   runtime has nothing pending.
 * - `advance` moves time forward by `ms`, firing each due timer in time order and settling after
 *   each, including timers armed along the way that fall due by the end.
 * - `kill` kills the page: its timers, tasks, held batches and live calls die; the store's bytes
 *   and the server's log stay.
 *
 * **Gotchas**
 *
 * - `settle` throws `Unsettled` past 100,000 fiber steps and tasks in one settle, or when the
 *   runtime says it has work pending and the page has nothing queued to run it: a spin, or a
 *   stall, no case asked for. `advance` throws it past 100,000 firings: a timer that re-arms
 *   itself at no delay.
 * - Every settled task, timer firing and request first asks `overdue`, and throws `Overdue` once
 *   it says yes, again on every later ask, so a runtime that swallows one still stops at the
 *   next. A runtime that spins without touching its hosts is stopped only by the child's bound.
 */
export type World = {
  readonly hosts: Hosts;
  readonly settle: (pending: () => boolean) => void;
  readonly advance: (ms: number, pending: () => boolean) => void;
  readonly kill: () => void;
};

/**
 * A fresh world for one case, with its hosts: `seed` fixes the store's load order and the
 * session seeds; `overdue` says whether the case is past its time bound.
 */
// RETURN_TYPE: the exported World contract the Case and the runtimes both name.
export const makeWorld = (seed: number, overdue: () => boolean): World => {
  const guard = (at: Overdue["at"]) => () => {
    if (overdue()) throw new Overdue({ at });
  };

  const clock = makeClock();
  const page = makePage(seed);
  const storage = makeStorage(seed, page);
  const network = makeNetwork(guard("request"));

  const settle = (pending: () => boolean) => {
    for (let steps = 0; steps <= STEPS_PER_SETTLE; steps += 1) {
      guard("task")();

      if (!page.runOne()) {
        if (!pending()) return;
        throw new Unsettled({ steps });
      }
    }

    throw new Unsettled({ steps: STEPS_PER_SETTLE });
  };

  return {
    hosts: { clock, page, storage, network },
    settle,
    advance: (ms, pending) => {
      const end = clock.now() + ms;
      settle(pending);

      for (let fired = 0; fired <= STEPS_PER_SETTLE; fired += 1) {
        guard("timer")();
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
