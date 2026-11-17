import { Equal, Option } from "effect";
import type { Evidence } from "../../src/host/inspect.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import {
  consumerOf,
  isContextIssue,
  isRefusal,
  nameOf,
  textOf,
  turnRecords,
} from "./deliveries.ts";
import type { Rule } from "./rules.ts";

const sameSnapshot = (a: Evidence, b: Evidence) =>
  a._tag === "Published" &&
  b._tag === "Published" &&
  a.state === b.state &&
  Equal.equals(a.memory, b.memory);

const startsWork = (r: Evidence) =>
  r._tag === "Turn" || r._tag === "Minted" || r._tag === "Sent" || isRefusal(r);

// An event's refused turn: what follows its issue until the next turn starts.
const refusedEventTurn = (run: StoryRun, at: number, issue: Evidence) => {
  const records = turnRecords(run.evidence, at);
  const wrong = records.filter(startsWork);
  const consumer = consumerOf(records);

  const published = records.filter(
    (r) =>
      r._tag === "Published" &&
      (!isContextIssue(issue) || Option.contains(consumer, nameOf(r.actor))),
  ).length;

  const turn = `the refused event turn (evidence ${at})`;

  return [
    wrong.length > 0
      ? Option.some(`Turn I14: ${turn} also gave ${wrong.map((r) => r._tag).join(", ")}`)
      : Option.none(),
    published === 1
      ? Option.none()
      : Option.some(`Turn I14: ${turn} published ${published} snapshots, not one`),
  ].flatMap((found) => Option.toArray(found));
};

/**
 * Turn I14: a refused or pre-commit-defective turn leaves its actor as before and starts no work:
 * no Turn report, no Minted or Sent, one issue, and exactly one snapshot, equal to the one before
 * the turn. Judged for a delivered ending's turn, which its Delivered record starts and whose
 * refusal names the ending, and for an event's turn, which leaves no record before its refusal and
 * is judged on what follows it.
 */
export const refusedTurnIssueOnly: Rule = {
  rule: "Turn I14",
  breaches: (run) =>
    run.evidence.flatMap((e, at) => {
      if (e._tag !== "Issue" || !isRefusal(e)) return [];

      if (Option.isNone(e.ending)) return refusedEventTurn(run, at, e);
      const { operation, attempt, actor } = e.ending.value;
      const who = nameOf(actor);

      const start = run.evidence.findLastIndex(
        (r, i) =>
          i < at &&
          r._tag === "Delivered" &&
          r.operation === operation &&
          textOf(r.attempt) === textOf(attempt),
      );

      if (start < 0) return [];
      const records = [...run.evidence.slice(start + 1, at), ...turnRecords(run.evidence, at)];

      const before = Option.fromUndefinedOr(
        run.evidence.findLast(
          (r, i) => i < start && r._tag === "Published" && nameOf(r.actor) === who,
        ),
      );

      const wrong = records.filter(
        (r) =>
          r._tag === "Turn" ||
          r._tag === "Minted" ||
          r._tag === "Sent" ||
          isRefusal(r) ||
          (r._tag === "Published" && !Option.exists(before, (b) => sameSnapshot(b, r))),
      );

      const published = records.filter((r) => r._tag === "Published").length;
      const turn = `${who}'s refused turn on its ${operation} ending (evidence ${at})`;
      const found: Array<string> = [];

      if (wrong.length > 0)
        found.push(`Turn I14: ${turn} also gave ${wrong.map((r) => r._tag).join(", ")}`);

      if (published !== 1)
        found.push(`Turn I14: ${turn} published ${published} snapshots, not one`);

      return found;
    }),
};
