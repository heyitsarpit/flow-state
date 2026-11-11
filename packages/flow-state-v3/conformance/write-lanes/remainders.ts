import type { Remainder } from "../coverage.ts";

/**
 * The clauses of the WriteLanes Invariants the T7 checks claim that no check judges yet, by the
 * Task that owes them.
 */
export const writeLanesRemainders: ReadonlyArray<Remainder> = [
  {
    invariant: "WriteLanes I4",
    owner: "@task.V3.T17",
    owed: "no author tag equals a Flow reason: a construction rule on the fixtures' failure tags",
  },
  {
    invariant: "WriteLanes I13",
    owner: "@task.V3.T7",
    owed: "idle passing over a busy lane (no fixture runs an idle guard over a Held or InFlight lane), idle(k) on a keyed operation, and a lane that holds a kept ending",
  },
  {
    invariant: "WriteLanes I5",
    owner: "@task.V3.T7",
    owed: "the lane leaving Held observed apart from the runtime's own Released report (only LANE-11's row read sees it)",
  },
  {
    invariant: "WriteLanes I27",
    owner: "@task.V3.T7",
    owed: "every admitted commit at every quiescent point waiting, Held or ended once (the lifecycle's phases hold it, but no check names I27 for a commit that is never invoked and never ends)",
  },
  {
    invariant: "WriteLanes I17",
    owner: "@task.V3.T7",
    owed: "no current member names the old-version lane, and a lane of an older identity version declines nothing (LANE-15 judges the decline only)",
  },
  {
    invariant: "WriteLanes I24",
    owner: "@task.V3.T7",
    owed: "a success write over data that landed after the commit started is marked stale, and an invalid one applies nothing and reports InvalidWrite (round-14 has no InvalidWrite)",
  },
];
