import { Option } from "effect";
import type { Evidence } from "../../src/host/inspect.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { nameOf } from "./deliveries.ts";
import { knownAt, placesOf } from "./places.ts";
import type { Rule } from "./rules.ts";

// What an evidence record says about commits of an operation: admitted by a turn's commit member,
// or accounted for as a new Attempt, an ending with no Attempt (a decline, or a queued commit's
// end) or a queued commit superseded.
const admittedBy = (e: Evidence) =>
  e._tag === "Turn" ? e.members.filter((m) => m.kind === "commit").map((m) => m.operation) : [];

const accountedBy = (e: Evidence) => {
  if (e._tag === "Minted") return [e.operation];

  if (e._tag === "Ended" && e.channel === "notSent" && Option.isNone(e.attempt))
    return [e.operation];

  return e._tag === "Lane" && e.kind === "Superseded" && Option.isNone(e.attempt)
    ? [e.operation]
    : [];
};

const tally = (counts: Map<string, number>, operation: string) =>
  counts.set(operation, (counts.get(operation) ?? 0) + 1);

/**
 * WriteLanes I27: every admitted commit ends exactly once, across reloads. Per operation, the
 * commits turns admitted equal the Attempts minted, plus the endings with no Attempt (declines and
 * queued commits' ends, NotSent Restored at a reload included), plus the queued commits superseded,
 * once the run ends with the Runtime disposed (nothing still queued); before that, never more.
 * A crash forgets what was never saved (WriteAhead I21), so only what the run's end still knows is
 * counted.
 */
export const everyCommitEndsOnce: Rule = {
  rule: "WriteLanes I27",
  breaches: (run: StoryRun) => {
    const places = placesOf(run);
    const last = run.evidence.length - 1;
    const admitted = new Map<string, number>();
    const accounted = new Map<string, number>();
    let actor = "";

    for (const [at, e] of run.evidence.entries()) {
      if (e._tag === "Turn" || e._tag === "Minted" || e._tag === "Ended") actor = nameOf(e.actor);

      if (!knownAt(run, places, at, last, actor)) continue;

      for (const operation of admittedBy(e)) tally(admitted, operation);

      for (const operation of accountedBy(e)) tally(accounted, operation);
    }

    const lastOpen = places[last]?.open;

    const disposed = run.evidence.some(
      (e, at) => e._tag === "RuntimeDisposed" && places[at]?.open === lastOpen,
    );

    // A replaced lookup is also Superseded with no Attempt: only operations that commit count.
    const writes = new Set(run.evidence.flatMap(admittedBy));

    return [...writes].flatMap((operation) => {
      const a = admitted.get(operation) ?? 0;
      const b = accounted.get(operation) ?? 0;

      return b > a || (disposed && b !== a)
        ? [
            `WriteLanes I27: ${a} commits of ${operation} were admitted but ${b} were minted, declined, ended while queued or superseded while queued`,
          ]
        : [];
    });
  },
};
