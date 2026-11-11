import { Option } from "effect";
import { sameLane } from "../dsl/lifecycle-model.ts";
import type { LifeStep } from "../dsl/lifecycle-step.ts";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import { Observation } from "../port.ts";

const cleaned = (lives: LifeStep, attempt: string) =>
  lives.before.attempts.some(
    (a) =>
      a.id === attempt &&
      (a.phase._tag === "Gone" ||
        (a.phase._tag === "Interrupted" &&
          lives.before.releasing.some((l) => sameLane(l, a.lane)))),
  );

/**
 * Late results (WriteLanes I23): once an Attempt is cleaned up, a late answer to it delivers and
 * parks nothing, and does not bring it back to its lane.
 *
 * **Details**
 *
 * A late result is a server answer (`Answered`, the suite's fact) to an Attempt the Case's
 * lifecycle holds `Gone` at the step's start (interrupted, superseded or settled in disposal), or
 * `Interrupted` on a lane a release marked. In that step no `Delivered` or `Parked` names it, and
 * it is not brought back to its lane (any phase but `Gone` or `Interrupted` at the step's end).
 *
 * **Gotchas**
 *
 * - Data (entity records) is not on the Port; only endings and lanes are judged.
 * - A cleanup by forget, whose Attempt the lifecycle drops rather than holds `Gone`, is not judged.
 */
export const lateResults = oracle<Record<string, never>>({
  name: "late-results",
  guarantee: ["WriteLanes I23"],
  start: () => ({}),
  step: (state, step, _requests, lives) => {
    const late = step.flatMap((fact) =>
      Fact.$is("Answered")(fact)
        ? Option.toArray(fact.request.key).filter((id) => cleaned(lives, id))
        : [],
    );

    const found = late.flatMap((id) => {
      const heard = step.flatMap((fact) =>
        Fact.$is("Reported")(fact) &&
        (Observation.$is("Delivered")(fact.observation) ||
          Observation.$is("Parked")(fact.observation)) &&
        Option.contains(fact.observation.attempt, id)
          ? [
              `WriteLanes I23: ${fact.observation.operation} ${id} was cleaned up, and its late result was ${fact.observation._tag}`,
            ]
          : [],
      );

      const revived = lives.after.attempts
        .filter((a) => a.id === id && a.phase._tag !== "Gone" && a.phase._tag !== "Interrupted")
        .map(
          (a) =>
            `WriteLanes I23: ${a.lane.operation} ${id} was cleaned up, and its late result made it ${a.phase._tag}`,
        );

      return [...heard, ...revived];
    });

    return [state, [...new Set(found)].map(violation)];
  },
});
