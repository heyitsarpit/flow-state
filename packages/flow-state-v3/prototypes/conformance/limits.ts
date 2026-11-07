import type { Size } from "./verdicts/runner.ts";
import type { Limits } from "./verdicts/spawn.ts";

export type Budget = { readonly limits: Limits; readonly size: Size };
export const SUITE: Budget = { limits: { mb: 2700, seconds: 240 }, size: { slots: 1, peakMb: 1750, aloneS: 19 } };
export const SCRIPT: Budget = { limits: { mb: 1200, seconds: 200 }, size: { slots: 1, peakMb: 400, aloneS: 5 } };
export const PROGRAM: Budget = { limits: { mb: 600, seconds: 150 }, size: { slots: 1, peakMb: 200, aloneS: 2 } };
export const SUITE_PARENT: Budget = { limits: { mb: 3200, seconds: 240 }, size: SUITE.size };
export const SEARCH: Budget = { limits: { mb: 1200, seconds: 120 }, size: { slots: 1, peakMb: 300, aloneS: 40 } };
export const MUTANT: Limits = { mb: 3500, seconds: 240 };
export const MUTANT_SEARCH: Limits = { mb: 3500, seconds: 420 };
export const WORK_PER_CALL = 100_000;
export const CATALOG_CONTEXT: readonly string[] = [
  "../SCENARIOS.md",
  ...Array.from({ length: 8 }, (_, k) => `../convergence-${k + 1}.md`),
  "../../../../workflow/plans/flow/references/explorations/machine-fragments/machine-design.md",
];
