import type { Mutant } from "../dsl/oracle.ts";

/**
 * Wrong runtimes the `late-results` oracle must catch.
 */
export const lateResultsMutants: ReadonlyArray<Mutant> = [
  {
    name: "lane.late-result-after-release",
    says: "a released lane's late result is admitted as an ordinary ending (the edit of `lane.releasing-delivers`)",
    expects: "WriteLanes I23",
    runtime: "prototype",
    cases: ["LANE-12/release-uninterruptible"],
    edits: [
      {
        file: "turn.ts",
        find: "  const releasing = before?.releasing === true;",
        replace: "  const releasing = false;",
      },
    ],
  },
];
