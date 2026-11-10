import type { Scheduler } from "effect";

/**
 * The page a runtime lives in: its generation, its task queue, its Effect scheduler and whether
 * it is seen.
 *
 * **When to use**
 *
 * A runtime queues host tasks with `later` and runs its fibers on `scheduler`; the world runs
 * both, one at a time, when it settles.
 *
 * **Details**
 *
 * - `page` counts page loads: a reload is a new page.
 * - `sessionSeed` is the entropy the host gives a boot, distinct per page and per world seed.
 * - `hide` moves the page to hidden and tells the runtime (`visibilitychange`, `pagehide`);
 *   `show` moves it back. Hiding a hidden page tells nobody.
 * - A kill drops the queued tasks, the scheduler's queue and the hide listeners of the old page;
 *   the new page is seen.
 * - The operations are the host's synchronous primitives.
 */
export type Page = {
  readonly page: () => number;
  readonly sessionSeed: () => number;
  readonly later: (task: () => void) => void;
  readonly scheduler: Scheduler.Scheduler;
  readonly onHidden: (listener: () => void) => void;
  readonly hidden: () => boolean;
  readonly hide: () => void;
  readonly show: () => void;
  readonly runOne: () => boolean;
  readonly kill: () => void;
};

/**
 * The first page of a world with the given seed.
 */
// RETURN_TYPE: the exported Page contract; it types the methods' parameters for the runtime.
export const makePage = (seed: number): Page => {
  let page = 0;
  let fibers: ReadonlyArray<() => void> = [];
  let tasks: ReadonlyArray<() => void> = [];
  let listeners: ReadonlyArray<() => void> = [];
  let visibility: "seen" | "hidden" = "seen";

  const dispatcher = {
    scheduleTask: (task: () => void) => {
      fibers = [...fibers, task];
    },
    flush: () => undefined,
  };

  const scheduler: Scheduler.Scheduler = {
    executionMode: "async",
    shouldYield: () => false,
    makeDispatcher: () => dispatcher,
  };

  const take = (queue: ReadonlyArray<() => void>) => {
    const [first] = queue;

    return first;
  };

  return {
    page: () => page,
    sessionSeed: () => seed * 1000 + page,
    later: (task) => {
      tasks = [...tasks, task];
    },
    scheduler,
    onHidden: (listener) => {
      listeners = [...listeners, listener];
    },
    hidden: () => visibility === "hidden",
    hide: () => {
      if (visibility === "hidden") return;
      visibility = "hidden";

      for (const listener of listeners) listener();
    },
    show: () => {
      visibility = "seen";
    },
    runOne: () => {
      const fiber = take(fibers);

      if (fiber !== undefined) {
        fibers = fibers.slice(1);
        fiber();

        return true;
      }

      const task = take(tasks);

      if (task === undefined) return false;
      tasks = tasks.slice(1);
      task();

      return true;
    },
    kill: () => {
      page += 1;
      fibers = [];
      tasks = [];
      listeners = [];
      visibility = "seen";
    },
  };
};
