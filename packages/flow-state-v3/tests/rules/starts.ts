import type { Evidence } from "../../src/host/inspect.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";

const unsaved = (cut: Cut, at: string) =>
  cut.inspection.owed
    .filter((r) => r.delivery === "Queued" || r.delivery === "Retrying")
    .filter((r) => !(r.channel === "unknown" && r.reason === "Restored"))
    .map(
      (r) =>
        `WriteAhead I20: at ${at}, ${r.actor}'s ${r.operation} ${r.channel} ${r.reason} is ${r.delivery} and in no owed record`,
    );

/**
 * WriteAhead I20, at every cut: the owed record lists every row owed to the identity because, at
 * a step's end, no row is Queued or Retrying (the step drains its mail) except an unknown
 * Restored, which the record holds.
 */
export const ownedRowsSaved = {
  rule: "WriteAhead I20",
  breaches: (run: StoryRun<string>) => [
    ...Object.entries(run.checkpoints).flatMap(([name, cut]) => unsaved(cut, name)),
    ...unsaved(run.end, "the end"),
  ],
};

// What a start reports between its Incarnated and its first turn: the published snapshot, each
// row it queues, and each unknown Restored it owes.
const START_REPORTS: ReadonlySet<Evidence["_tag"]> = new Set<Evidence["_tag"]>([
  "Published",
  "Unparked",
  "Ended",
]);

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
