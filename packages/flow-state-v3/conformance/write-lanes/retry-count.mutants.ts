import type { Mutant } from "../dsl/oracle.ts";

/**
 * Wrong runtimes the `retry-count` oracle must catch.
 */
export const retryCountMutants: ReadonlyArray<Mutant> = [
  {
    name: "lane.retry-count-frozen",
    says: "a re-send never counts toward the head's retryCount",
    expects: "WriteLanes I7",
    runtime: "prototype",
    cases: ["PAY-15/retry-budget", "PAY-16/retry-count-persists"],
    edits: [
      {
        file: "lane.ts",
        find: "        retryCount: h.mayHaveApplied ? h.retryCount + 1 : h.retryCount,",
        replace: "        retryCount: h.retryCount,",
      },
    ],
  },
];
