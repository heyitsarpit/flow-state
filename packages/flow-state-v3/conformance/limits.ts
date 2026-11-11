import type { CaseVerdict } from "./runner/verdict.ts";

/**
 * One limit of round-14 (Conformance R22): a case it fails, the check that fails it, the
 * Invariant it breaks there, and why.
 */
export type Limit = {
  readonly case: string;
  readonly check: string;
  readonly invariant: string;
  readonly why: string;
};

/**
 * Round-14's limits, each verified by `limits` (Conformance I64): its case must fail on round-14
 * by its Invariant. A limited case counts neither as a pass nor as a mutant's control on round-14
 * (I66): the generated pool's control leaves out every case red on the unedited runtime.
 */
export const limits: ReadonlyArray<Limit> = [
  {
    case: "GEN-pay-search-55-shrunk",
    check: "disposal",
    invariant: "Actors I14",
    why: "round-14 reports no incarnation when an ensure re-creates an actor disposed while its call was on the wire; production reports it (orchestrator, T45 fix round)",
  },
  {
    case: "GEN-pay-search-25-shrunk",
    check: "delivered-once",
    invariant: "WriteLanes I15",
    why: "round-14 alone restores and parks a disposed actor's Held head at the boot after a Runtime disposal; production passes the same script",
  },
];

/**
 * What one row's verifying run found: its case failed by its Invariant (`held`), passed, or
 * failed by another Invariant or check.
 */
export const verdictOfLimit = (limit: Limit, verdict: CaseVerdict) => {
  if (verdict._tag !== "Fail") return { held: false, why: `${limit.case} ${verdict._tag}` };

  const named = verdict.oracles.includes(limit.check) && verdict.why.includes(limit.invariant);

  return named
    ? { held: true, why: `${limit.case} fails by ${limit.invariant}` }
    : { held: false, why: `${limit.case} fails, but not by ${limit.check} ${limit.invariant}` };
};
