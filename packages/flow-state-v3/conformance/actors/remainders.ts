import type { Remainder } from "../coverage.ts";

/**
 * The clauses of Actors I37 and I38 the `disposal` oracle does not judge, by the Task that owes
 * them.
 */
export const actorsRemainders: ReadonlyArray<Remainder> = [
  {
    invariant: "Actors I38",
    owner: "@task.V3.T9",
    owed: "the next incarnation after a reload hearing each never-sent commit's NotSent { Disposed } once (round-14 never delivers it, ruling CQ6), and a commit queued behind a Held head ending at disposal (a round-14 limit: it is left queued)",
  },
  {
    invariant: "Actors I37",
    owner: "@task.V3.T19",
    owed: "a dirty end whose own record is not written while another actor's is, in the same step: a write names no record, so any write discharges every dirty end (T45 close review S2; reached by F1-two-ends in parts/f1.test.ts under a dropped-write edit)",
  },
];
