import type { Lie } from "./oracle.ts";

/**
 * Wrong runtimes the three-channels oracle must catch.
 *
 * **Details**
 *
 * - `k.failure-as-success`: a failure ending runs the success event.
 * - `lie.still-unknown-dropped`: a definite failure after an unknown send stays a failure.
 */
export const threeChannelsLies: ReadonlyArray<Lie> = [
  {
    name: "k.failure-as-success",
    oracle: "three-channels",
    says: "a failure ending runs the operation's success event",
    runtime: "prototype",
    cases: ["PAY-02"],
    edits: [
      {
        file: "turn.ts",
        find: "const mapped = mappedFor(m, item);",
        replace:
          'const mapped = item.ending.ch === "failure" && m.ops[item.op]?.outcomes.success ? m.ops[item.op]!.outcomes.success : mappedFor(m, item);',
      },
    ],
  },
  {
    name: "lie.still-unknown-dropped",
    oracle: "three-channels",
    says: "a definite failure after an unknown send is delivered as a failure, not unknown StillUnknown",
    runtime: "prototype",
    cases: ["PAY-05"],
    edits: [
      {
        file: "lane.ts",
        find: 'ending.ch === "failure" && h.mayHaveApplied',
        replace: 'ending.ch === "failure" && h.mayHaveApplied && h.retryCount < 0',
      },
    ],
  },
];
