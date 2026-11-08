import type { Size } from "./verdicts/runner.ts";
import type { Limits } from "./verdicts/spawn.ts";

export type Budget = { readonly limits: Limits; readonly size: Size };
export const SUITE: Budget = { limits: { mb: 3400, seconds: 240 }, size: { slots: 1, peakMb: 1700, aloneS: 19 } };
export const SCRIPT: Budget = { limits: { mb: 1200, seconds: 200 }, size: { slots: 1, peakMb: 400, aloneS: 1 } };
export const PROGRAM: Budget = { limits: { mb: 600, seconds: 150 }, size: { slots: 1, peakMb: 200, aloneS: 2 } };
export const SUITE_PARENT: Budget = { limits: { mb: 3800, seconds: 240 }, size: SUITE.size };
export const SEARCH: Budget = { limits: { mb: 1200, seconds: 120 }, size: { slots: 1, peakMb: 300, aloneS: 40 } };
export const MUTANT: Limits = { mb: 4200, seconds: 240 };
export const MUTANT_SEARCH: Limits = { mb: 4200, seconds: 270 };
export const WORK_PER_CALL = 100_000;
export const MACHINE_MB = 16_000;
export const GATE_ROWS: Readonly<Record<string, { readonly mb: number; readonly s: number }>> = {
  suite: { mb: SUITE.size.peakMb, s: SUITE.size.aloneS },
  "suite canon": { mb: SUITE.size.peakMb, s: 30 },
  "suite copies": { mb: SUITE.size.peakMb, s: 43 },
  "mutate-one": { mb: 3800, s: 55 },
  "graph-gate": { mb: 2100, s: 16 },
  "falsify suite1": { mb: 1700, s: 23 },
  "falsify suite2": { mb: 1900, s: 55 },
  "falsify suite3": { mb: 1300, s: 18 },
  "falsify tamper": { mb: 600, s: 5 },
  "falsify mutants": { mb: 2000, s: 60 },
  "falsify search": { mb: 600, s: 40 },
  "falsify lies": { mb: 1500, s: 32 },
  "lifetime-falsify": { mb: 3800, s: 22 },
  checks: { mb: SCRIPT.size.peakMb, s: SCRIPT.size.aloneS },
  "typed tsc": { mb: SCRIPT.size.peakMb, s: SCRIPT.size.aloneS },
  "cli pins": { mb: SCRIPT.size.peakMb, s: 5 },
  "verdict plants": { mb: 1200, s: 60 },
};
export const CATALOG_CONTEXT: readonly string[] = [
  "../SCENARIOS.md",
  ...Array.from({ length: 8 }, (_, k) => `../convergence-${k + 1}.md`),
  "../../../../workflow/plans/flow/references/explorations/machine-fragments/machine-design.md",
];
