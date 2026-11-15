import type { Scheduler } from "effect";

/**
 * The page a runtime lives in: its generation, its task queue, its Effect scheduler and whether
 * it is seen.
 *
 * **Details**
 *
 * - `page` counts page loads: a reload is a new page.
 * - `sessionSeed` is the entropy the host gives a boot, distinct per page and per world seed.
 * - The page is always seen: no case hides it.
 * - A kill drops the queued tasks and the scheduler's queue of the old page.
 */
export type Page = {
  readonly page: () => number;
  readonly sessionSeed: () => number;
  readonly later: (task: () => void) => void;
  readonly scheduler: Scheduler.Scheduler;
  readonly onHidden: (listener: () => void) => void;
  readonly hidden: () => boolean;
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

  return {
    page: () => page,
    sessionSeed: () => seed * 1000 + page,
    later: (task) => {
      tasks = [...tasks, task];
    },
    scheduler,
    onHidden: () => undefined,
    hidden: () => false,
    runOne: () => {
      const [fiber] = fibers;

      if (fiber !== undefined) {
        fibers = fibers.slice(1);
        fiber();

        return true;
      }

      const [task] = tasks;

      if (task === undefined) return false;
      tasks = tasks.slice(1);
      task();

      return true;
    },
    kill: () => {
      page += 1;
      fibers = [];
      tasks = [];
    },
  };
};
