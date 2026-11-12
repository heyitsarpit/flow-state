import type { Fact } from "../dsl/oracle.ts";
import type { Script } from "../dsl/script.ts";
import type { CaseVerdict } from "../runner/verdict.ts";
import type { Code } from "./codes.ts";

/**
 * The runtimes a part's script may be asked to run on.
 */
export type PartRuntime = "production" | "null" | "round-14";

/**
 * One played part script: its verdict, the facts its run recorded, and how many `answer` steps
 * found no open request.
 */
export type Played = {
  readonly verdict: CaseVerdict;
  readonly facts: ReadonlyArray<Fact>;
  readonly skipped: number;
};

/**
 * Plays a part's script on a runtime through the Port, under the suite's oracles and the Spec
 * model's compare (Conformance R15, R19); a part on round-14 is refused (R22).
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const playPart = (script: Script, _runtime: PartRuntime): Played => ({
  verdict: { _tag: "Pass", id: script.id },
  facts: [],
  skipped: 0,
});

/**
 * The feature codes a played run reached, from its suite facts and the model's prediction, by
 * composite (Conformance R17).
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const reachOf = (_played: Played): Readonly<Record<string, ReadonlySet<Code>>> => ({});
