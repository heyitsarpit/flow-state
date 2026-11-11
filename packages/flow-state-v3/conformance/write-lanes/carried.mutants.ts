import type { Mutant } from "../dsl/oracle.ts";

const DECLINE = "  noteEnding(tx, { op: a.op, actor: a.actor }, e);\n  enqueue(tx, {";

/**
 * The old suite's wrong runtimes whose text anchors no longer match round-14, re-anchored and
 * held by `delivered-once` (WriteLanes I15).
 *
 * **Details**
 *
 * Both drop a declined send's ending before it is delivered: the old suite's
 * `pay16.decline-not-delivered` and `lost.decline.mail` edited the decline in `lane.ts`, whose
 * `noteEnding` call now carries the actor.
 */
export const carriedDeliveredOnceMutants: ReadonlyArray<Mutant> = [
  {
    name: "pay16.decline-not-delivered",
    says: "a declined send's ending is noted but never queued for delivery",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["PAY-02", "LANE-02"],
    edits: [
      {
        file: "lane.ts",
        find: DECLINE,
        replace: "  noteEnding(tx, { op: a.op, actor: a.actor }, e);\n  void (tx, {",
      },
    ],
  },
  {
    name: "lost.decline.mail",
    says: "a declined send's ending is lost before delivery (the same fault as pay16's, by its own edit)",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["PAY-02", "LANE-02"],
    edits: [
      {
        file: "lane.ts",
        find: DECLINE,
        replace: "  noteEnding(tx, { op: a.op, actor: a.actor }, e);\n  void ({",
      },
    ],
  },
];
