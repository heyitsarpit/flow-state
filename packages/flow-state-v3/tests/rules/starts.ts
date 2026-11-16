import type { StoryRun } from "../../src/host/testing/index.ts";

// What a start reports between its Incarnated and its first turn: the published snapshot, each
// row it queues, and each unknown Restored it owes.
const START_REPORTS: ReadonlySet<string> = new Set(["Published", "Unparked", "Ended"]);

/**
 * Actors R10, I40: a start is the one delivery point, so a row leaves Waiting (Unparked) only in
 * an identity's start, right after its Incarnated; a boot, a turn or a send queues no row.
 */
export const oneStart = {
  rule: "Actors R10",
  breaches: (run: StoryRun) => {
    let starting = false;

    return run.evidence.flatMap((e, n) => {
      if (e._tag === "Incarnated") starting = true;
      else if (!START_REPORTS.has(e._tag)) starting = false;

      return e._tag === "Unparked" && !starting
        ? [`Actors R10: record ${n} unparks ${e.operation} outside a start`]
        : [];
    });
  },
};
