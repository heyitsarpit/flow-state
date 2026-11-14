import type { CaseVerdict } from "./verdict.ts";

/**
 * What a gate asks was caught: a check (an oracle's name, or `case` for a case's own
 * expectation) and the Invariant it names.
 */
export type CatchKey = { readonly check: string; readonly invariant: string };

/**
 * Whether a verdict caught `key`: the one rule every gate that counts a catch asks.
 *
 * **Details**
 *
 * - Gathered from falsify's rule as it stands: the oracle named and the Invariant in the text.
 */
export const caught = (key: CatchKey, verdict: CaseVerdict) =>
  verdict._tag === "Fail" &&
  (verdict.oracles.includes(key.check) || key.check === "case") &&
  verdict.why.includes(key.invariant);
