import { Result } from "effect";
import { type CaseOptions, Crashed, openCase, type Scenario } from "./case.ts";
import { Fact, isRuntimeFact, type RuntimeFact } from "./oracle.ts";

/**
 * Plays a case under the crash generator (Conformance's crash search): the page is killed and
 * reloaded after step `options.crashAt`, then the case ends with its judged disposal. Returns
 * whether the crash point was reached; a case shorter than it plays whole and returns false.
 *
 * **Gotchas**
 *
 * - Throws as `playCase` does; after the crash only the oracles and the end of case judge.
 */
export const playCrash = (options: CaseOptions, run: Scenario["run"]) => {
  const opened = openCase(options);
  // FLOW_STATE_ALLOW_UNKNOWN: a case throws its verdicts; only the crash generator's stop is caught here.
  const played = Result.try({ try: () => run(opened.driven), catch: (e: unknown) => e });
  const crashed = Result.isFailure(played) && played.failure instanceof Crashed;

  if (Result.isFailure(played) && !crashed) throw played.failure;
  opened.stopCrashing();
  opened.end();

  return crashed;
};

/**
 * Plays a case and returns its runtime facts (reports and runtime answers) grouped by step, in
 * order: what the liar gate replays.
 */
export const playRecorded = (options: CaseOptions, run: Scenario["run"]) => {
  const opened = openCase(options);
  run(opened.driven);
  opened.end();

  return opened.facts().reduce<ReadonlyArray<ReadonlyArray<RuntimeFact>>>((steps, fact) => {
    if (Fact.$is("Stepped")(fact)) return [...steps, []];

    if (!isRuntimeFact(fact)) return steps;
    const last = steps.at(-1) ?? [];

    return [...steps.slice(0, -1), [...last, fact]];
  }, []);
};
