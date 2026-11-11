import type { Remainder } from "../coverage.ts";

/**
 * The clauses of the Turn Invariants the T8 checks claim that no check judges yet, by the Task that
 * owes them.
 */
export const turnRemainders: ReadonlyArray<Remainder> = [
  {
    invariant: "Turn I5",
    owner: "@task.V3.T8",
    owed: "every Activation at or above the Boundary kept (compound states; a3.r14-reenters-the-parent, 1b.r14-history-reentry-keeps-activation need the old suite's compound fixtures); only a re-entry's new Activation is judged, through its late ending",
  },
  {
    invariant: "Turn I12",
    owner: "@task.V3.T8",
    owed: "guards, payload mappers and updates reading PreTurn, and selects, keys and placement reads reading After; only a schedule function's After read is cased",
  },
  {
    invariant: "Turn I2",
    owner: "@task.V3.T18",
    owed: "an Unhandled or Denied that should have run and that the suite cannot attribute to one actor; part-level alternatives and compound states; the first turn after a disposal",
  },
  {
    invariant: "Turn I26",
    owner: "@task.V3.T18",
    owed: "the converse (a current ending routed late) beyond the leaf's own alternatives; reads' endings, which name no owner on the Port; owners per part",
  },
  {
    invariant: "Turn I29",
    owner: "@task.V3.T18",
    owed: "snapshot parts other than memory (context, issues, operations) and kid-bearing actors' views",
  },
  {
    invariant: "Turn I30",
    owner: "@task.V3.T18",
    owed: "parts other than memory; equal-value patches (round-14 gives a new object); memory that is not an object",
  },
  {
    invariant: "Turn I9",
    owner: "@task.V3.T18",
    owed: "at most one publication per turn (a Published names no turn), and an accepted turn that stays on its leaf (an update or self) publishing",
  },
  {
    invariant: "Turn I14",
    owner: "@task.V3.T18",
    owed: "the issue-only snapshot, context and store truth (not on the Port); a refused turn of a driven event or a firing",
  },
  {
    invariant: "Turn I15",
    owner: "@task.V3.T18",
    owed: "no revision change (no revision on the Port); an ending admitted in an Unhandled or Denied turn still applying its lane effects and counting as delivered",
  },
  {
    invariant: "Turn I20",
    owner: "@task.V3.T8",
    owed: "the arming id a firing carries (not on the Port), disarmOn (no catalog fixture declares one; round-14 has it, turn.ts), firings after a reload before a turn enters a state again, and part and keyed schedules",
  },
  {
    invariant: "Turn I21",
    owner: "@task.V3.T18",
    owed: "a delay a function of memory computes; armings in a step that also advances time are timed from its start",
  },
  {
    invariant: "Turn I22",
    owner: "@task.V3.T8",
    owed: "overdue on restore and on a frozen trait's return; only a returning use is cased",
  },
  {
    invariant: "Turn I23",
    owner: "@task.V3.T18",
    owed: "at most one waiting deadline per schedule (a re-arm while unused)",
  },
  {
    invariant: "Turn I27",
    owner: "@task.V3.T8",
    owed: "exits of compound ancestors and active subroutines; owners per part; calls minted before a reload, which the Activation bump drops from the pending set",
  },
];
