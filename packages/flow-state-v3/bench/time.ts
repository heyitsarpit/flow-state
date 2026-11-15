import type { Evidence } from "../src/host/inspect.ts";
import type { Story } from "../src/host/testing/index.ts";

/**
 * A Turn record of a run's evidence.
 */
export type TurnRecord = Extract<Evidence, { readonly _tag: "Turn" }>;

/**
 * One timed run of a Story: its wall time in milliseconds and the Turn records it did, in order.
 */
export type Timed = { readonly ms: number; readonly turns: ReadonlyArray<TurnRecord> };

const isTurn = (evidence: Evidence) => evidence._tag === "Turn";

/**
 * Runs a Story through `run()` a fixed number of times, one after another, and times each run.
 *
 * **When to use**
 *
 * In the bench, and in the test that shows the bench does the same turns as a tested run.
 *
 * **Details**
 *
 * A run's time spans the whole `run()`, from its first step to its resolved Promise; the Turn
 * records are the ones that run returned, so the work timed is the work counted.
 */
export const timeStory = async (story: Story<string>, times: number) => {
  const runs: Array<Timed> = [];

  for (let n = 0; n < times; n++) {
    const start = performance.now();
    const run = await story.run();
    runs.push({ ms: performance.now() - start, turns: run.evidence.filter(isTurn) });
  }

  return runs;
};

const rank = (sorted: ReadonlyArray<number>, share: number) =>
  sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)] ?? Number.NaN;

/**
 * The median and p99 of timings, each by nearest rank.
 */
export const spreadOf = (timings: ReadonlyArray<number>) => {
  const sorted = timings.toSorted((a, b) => a - b);

  return { median: rank(sorted, 0.5), p99: rank(sorted, 0.99) };
};
