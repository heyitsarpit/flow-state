import type { Lie } from "./oracle.ts";

/**
 * Wrong runtimes the three-channels oracle must catch.
 *
 * **Details**
 *
 * - `k.failure-as-success`: the prototype suite's lie of that name, unchanged.
 * - `lie.still-unknown-dropped`: new; the Spec's R2 rule a prototype lie never covered alone.
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
