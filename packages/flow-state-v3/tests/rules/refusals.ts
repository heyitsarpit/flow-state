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

const startsWork = (r: Evidence, evidence: ReadonlyArray<Evidence>) =>
  r._tag === "Turn" || r._tag === "Minted" || r._tag === "Sent" || isRefusal(r, evidence);

// The actor whose work a record starts: a Turn's or a Minted's own, a Sent's from the Minted of its
// Attempt; none for a refusal, which names no actor.
const workerOf = (run: StoryRun, r: Evidence) => {
  if (r._tag === "Turn" || r._tag === "Minted") return Option.some(nameOf(r.actor));

  if (r._tag !== "Sent") return Option.none<string>();

  const minted = run.evidence.find((m) => m._tag === "Minted" && m.attempt === r.attempt);

  return minted?._tag === "Minted" ? Option.some(nameOf(minted.actor)) : Option.none<string>();
};

// An event's refused turn: what follows its issue until the next turn starts, judged on the refused
// actor's own records (the actor its one snapshot names), so another actor's queued work that
// starts in the same step is not the refused turn's.
const refusedEventTurn = (run: StoryRun, at: number, issue: Evidence) => {
  const records = turnRecords(run.evidence, at);
  const consumer = consumerOf(records);

  const refused = isContextIssue(issue)
    ? consumer
    : Option.fromUndefinedOr(
        records.flatMap((r) => (r._tag === "Published" ? [nameOf(r.actor)] : [])).at(0),
      );

  const wrong = records.filter(
    (r) =>
      startsWork(r, run.evidence) &&
      (Option.isNone(refused) ||
        Option.match(workerOf(run, r), {
          onNone: () => true,
          onSome: (worker) => Option.contains(refused, worker),
        })),
  );

  // An event's refusal has one snapshot, the refused actor's, which is no turn's (Changes C6); a
  // later change of another actor in the window is its own. A context read's issue is shown by
  // the consumer's start or update that read it.
  const published = records.filter(
    (r) =>
      r._tag === "Published" &&
      (isContextIssue(issue)
        ? Option.contains(consumer, nameOf(r.actor))
        : r.why !== "Turn" &&
          (Option.isNone(refused) || Option.contains(refused, nameOf(r.actor)))),
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
 * is judged on what follows it for its own actor.
 */
export const refusedTurnIssueOnly: Rule = {
  rule: "Turn I14",
  breaches: (run) =>
    run.evidence.flatMap((e, at) => {
      if (e._tag !== "Issue" || !isRefusal(e, run.evidence)) return [];

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
          isRefusal(r, run.evidence) ||
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
