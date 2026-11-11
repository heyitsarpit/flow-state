import type { Mutant } from "../dsl/oracle.ts";

/**
 * Wrong runtimes the `idle-guard` oracle must catch.
 */
export const idleGuardMutants: ReadonlyArray<Mutant> = [
  {
    name: "lane.idle-never-passes",
    says: "an idle guard fails even over an Idle lane",
    expects: "WriteLanes I13",
    runtime: "prototype",
    cases: ["PAY-15/busy-then-new-write", "PAY-16/schedule-reads-after-memory"],
    edits: [
      {
        file: "lane.ts",
        find: '  return v === "pass" || (v === "budget" && lane!.head!.retryCount < (times ?? Infinity));',
        replace:
          '  if (verb === "idle") return false;\n  return v === "pass" || (v === "budget" && lane!.head!.retryCount < (times ?? Infinity));',
      },
    ],
  },
];
