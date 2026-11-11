import type { Remainder } from "../coverage.ts";

/**
 * The clauses of the Turn Invariants the T8 checks claim that no check judges yet, by the Task that
 * owes them.
 */
export const turnRemainders: ReadonlyArray<Remainder> = [
  {
    invariant: "Turn I9",
    owner: "@task.V3.T18",
    owed: "at most one publication per turn: a Published names no turn",
  },
  {
    invariant: "Turn I14",
    owner: "@task.V3.T18",
    owed: "the issue-only snapshot, context and store truth (not on the Port); a refused turn of a driven event or a firing",
  },
  {
    invariant: "Turn I15",
    owner: "@task.V3.T18",
    owed: "no revision change (no revision on the Port); an ending admitted in an Unhandled or Denied turn still applying its lane effects",
  },
  {
    invariant: "Turn I20",
    owner: "@task.V3.T18",
    owed: "firings after a reload, before a turn arms again; part and keyed schedules",
  },
  {
    invariant: "Turn I21",
    owner: "@task.V3.T18",
    owed: "a delay a function of memory computes; armings in a step that also advances time are timed from its start",
  },
  {
    invariant: "Turn I22",
    owner: "@task.V3.T18",
    owed: "overdue on restore and on a frozen trait's return; only a returning use is cased",
  },
  {
    invariant: "Turn I23",
    owner: "@task.V3.T18",
    owed: "at most one waiting deadline per schedule (a re-arm while unused)",
  },
  {
    invariant: "Turn I27",
    owner: "@task.V3.T21",
    owed: "exits of compound ancestors and active subroutines; owners per part",
  },
];
