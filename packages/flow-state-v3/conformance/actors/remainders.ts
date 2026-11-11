import type { Remainder } from "../coverage.ts";

/**
 * The clause of Actors I38 the `disposal` oracle does not judge, by the Task that owes it.
 */
export const actorsRemainders: ReadonlyArray<Remainder> = [
  {
    invariant: "Actors I38",
    owner: "@task.V3.T9",
    owed: "the next incarnation after a reload hearing each never-sent commit's NotSent { Disposed } once (round-14 never delivers it, ruling CQ6)",
  },
];
