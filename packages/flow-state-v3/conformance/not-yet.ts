import { invariantsOf, type NotYet } from "./coverage.ts";

const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/**
 * Every core Invariant with no oracle and mutant yet, by the Task that owns it.
 *
 * **Details**
 *
 * The coverage gate fails on an Invariant in no row, and on a row that still lists one an oracle
 * now checks, so each row shrinks as its Task lands. T15's audit reads what is left.
 */
export const notYet: ReadonlyArray<NotYet> = [
  {
    owner: "@task.V3.T7",
    why: "WriteLanes rows not built yet: members, members-only, write-before-ending, old-version-holds, the front-end cases; I9 is claimed by lane-queue with no mutant of its own; I22 needs a releasing-lane fixture",
    invariants: invariantsOf("WriteLanes", [2, 4, 5, 7, 9, 13, 14, 17, 18, 19, 22, 23]),
  },
  {
    owner: "@task.V3.T8",
    why: "the Turn area is not built",
    invariants: invariantsOf("Turn", upTo(31)),
  },
  {
    owner: "@task.V3.T9",
    why: "the Actors area is not built beyond Runtime disposal",
    invariants: invariantsOf(
      "Actors",
      upTo(36).filter((n) => ![29, 30, 31, 32, 35, 36].includes(n)),
    ),
  },
  {
    owner: "@task.V3.T10",
    why: "the WriteAhead area is not built",
    invariants: invariantsOf("WriteAhead", upTo(18)),
  },
  {
    owner: "@task.V3.T11",
    why: "the Restore area is not built",
    invariants: invariantsOf("Restore", upTo(18)),
  },
  {
    owner: "@task.V3.T12",
    why: "the Reads area is not built",
    invariants: invariantsOf("Reads", [1, 2, 3, 4, 5, 7, 8, 9, 11, 12, 15, 16, 17, 18, 19]),
  },
  {
    owner: "@task.V3.T17",
    why: "round-14 cannot make these results: it throws at the first violation (I3), runs creation and restore only in a runtime (I7, I8), and has no IdentityFieldOptional, SharedContract, write-scope, name or app check, or context wiring (I9, I10, I12, I13, I14, I17); T17 builds the compiler that does, and its static cases land before T17 closes",
    invariants: invariantsOf("Compile", [3, 7, 8, 9, 10, 12, 13, 14, 17]),
  },
  {
    owner: "@task.V3.T17",
    why: "round-14 has no Diagnostic carrier, Diagnostic Schema, classification or renderer; T17 builds Diagnostics with the compiler (P4), and the vectors land before T17 closes",
    invariants: invariantsOf("Diagnostics", upTo(10)),
  },
  {
    owner: "@task.V3.T20",
    why: "round-14 has no canonical byte codec (Codec Q2); T20 builds the codec with restore and key versions, and the vectors land before T20 closes",
    invariants: invariantsOf("Codec", upTo(6)),
  },
  {
    owner: "@task.V3.T22",
    why: "round-14's CLI loads every fixture before it reads its arguments (I3), has no flow.config.ts discovery (I10) and no project tree to keep unchanged (I11); T22 builds them, and their static cases land before T22 closes",
    invariants: invariantsOf("StaticCli", [3, 10, 11]),
  },
];
