import type { Evidence } from "../src/host/inspect.ts";
import type { Story } from "../src/host/testing/index.ts";

/**
 * A Turn record of a run's evidence.
 */
export type TurnRecord = Extract<Evidence, { readonly _tag: "Turn" }>;

// One timed run of a Story: its wall time in milliseconds, the Turn records it did, in order, and
// how many evidence records and server calls it made.
type Timed = {
  readonly ms: number;
  readonly turns: ReadonlyArray<TurnRecord>;
  readonly evidence: number;
  readonly sent: number;
};

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
    const ms = performance.now() - start;

    runs.push({
      ms,
      turns: run.evidence.filter(isTurn),
      evidence: run.evidence.length,
      sent: run.evidence.filter((e) => e._tag === "Sent").length,
    });
  }

  return runs;
};
