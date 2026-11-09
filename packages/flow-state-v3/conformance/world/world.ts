import { Data, Option } from "effect";
import { type Clock, makeClock } from "./clock.ts";
import { type Lifecycle, makeLifecycle } from "./lifecycle.ts";
import { makeNetwork, type Network } from "./network.ts";
import { makeStorage, type Storage } from "./storage.ts";

/**
 * The fake world one case runs in, split by host.
 *
 * **Details**
 *
 * - `clock`: virtual time and timers.
 * - `lifecycle`: the page, its task queue and scheduler, and visibility.
 * - `storage`: the durable key-value store.
 * - `network`: the server.
 */
export type World = {
  readonly seed: number;
  readonly clock: Clock;
  readonly lifecycle: Lifecycle;
  readonly storage: Storage;
  readonly network: Network;
};

/**
 * A step did not settle within its bound: the runtime kept making work.
 */
export class Unsettled extends Data.TaggedError("Unsettled")<{ readonly steps: number }> {}

const STEPS_PER_SETTLE = 100_000;

/**
 * Builds a fresh world for one case.
 */
// RETURN_TYPE: The exported World contract the runtime adapters and the suite both name.
export const makeWorld = (seed: number): World => {
  const clock = makeClock();
  const lifecycle = makeLifecycle(seed);

  return {
    seed,
    clock,
    lifecycle,
    storage: makeStorage(seed, lifecycle.later, lifecycle.page),
    network: makeNetwork(clock.now, lifecycle.page),
  };
};

/**
 * Runs the page's queued work, one task at a time, until nothing is left and the runtime has
 * nothing pending.
 *
 * **Gotchas**
 *
 * - Throws `Unsettled` past 100,000 fiber steps and tasks in one settle, or when the runtime says
 *   it has work pending and the page has nothing queued to run it: a spin, or a stall, no case
 *   asked for.
 */
export const settle = (world: World, pending: () => boolean) => {
  for (let steps = 0; steps <= STEPS_PER_SETTLE; steps += 1) {
    if (!world.lifecycle.runOne()) {
      if (!pending()) return;
      throw new Unsettled({ steps });
    }
  }

  throw new Unsettled({ steps: STEPS_PER_SETTLE });
};

/**
 * Moves time forward by `ms`, firing each due timer in time order and settling after each,
 * including timers armed along the way that fall due by the end.
 */
export const advance = (world: World, ms: number, pending: () => boolean) => {
  const end = world.clock.now() + ms;
  settle(world, pending);

  for (;;) {
    const due = world.clock.nextDue(end);

    if (Option.isSome(due)) world.clock.fire(due.value);
    else if (world.clock.now() < end) world.clock.moveTo(end);
    else return;

    settle(world, pending);
  }
};

/**
 * Kills the page: its timers, tasks, held batches and live calls die; the store's bytes and the
 * server's log stay.
 */
export const kill = (world: World) => {
  world.clock.kill();
  world.lifecycle.kill();
  world.storage.kill();
  world.network.kill();
};
