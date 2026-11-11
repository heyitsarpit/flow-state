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
    why: "WriteLanes rows not built yet: members, members-only, write-before-ending, old-version-holds, the front-end cases; I9 is claimed by lane-queue with no mutant of its own; I24 to I28 were added by T42 (success writes, M5, the owed retry, every commit ends, a seed per boot)",
    invariants: invariantsOf(
      "WriteLanes",
      [2, 4, 5, 7, 9, 13, 14, 17, 18, 19, 23, 24, 25, 26, 27, 28],
    ),
  },
  {
    owner: "@task.V3.T8",
    why: "the Turn area is being built: selection (I2) is checked; publication, activations, purity, refusal, schedules, placements, late routing, context and issues are not; T42 cut I7, I8, I13 and I19 and added I32 to I35 (equal deadlines, step delays, restartOn, keyed schedules)",
    invariants: invariantsOf(
      "Turn",
      upTo(35).filter((n) => ![2, 7, 8, 13, 19].includes(n)),
    ),
  },
  {
    owner: "@task.V3.T9",
    why: "the Actors area is not built beyond Runtime disposal; I24 is delivered-once's; T42 cut I11, I16 and I18 and added I37 (Free actors end), I38 (never-sent commits at disposal, CQ6) and I39 (identity versions)",
    invariants: invariantsOf(
      "Actors",
      upTo(39).filter((n) => ![11, 16, 18, 24, 29, 30, 31, 32, 35, 36, 38].includes(n)),
    ),
  },
  {
    owner: "@task.V3.T10",
    why: "the WriteAhead area is not built; T42 cut I16 and I18 and added I19 (a Runtime refused scope ownership)",
    invariants: invariantsOf(
      "WriteAhead",
      upTo(19).filter((n) => ![16, 18].includes(n)),
    ),
  },
  {
    owner: "@task.V3.T11",
    why: "the Restore area is not built; I6's lower bound is delivered-once's (CQ11); T42 cut I3 and I4 and added I19 (a changed reset runs first after restore)",
    invariants: invariantsOf(
      "Restore",
      upTo(19).filter((n) => ![3, 4, 6].includes(n)),
    ),
  },
  {
    owner: "@task.V3.T12",
    why: "the Reads area is not built; T42 cut I7, I12 and I18 and added I20 (read endings)",
    invariants: invariantsOf("Reads", [1, 2, 3, 4, 5, 8, 9, 11, 15, 16, 17, 19, 20]),
  },
  {
    owner: "@task.V3.T17",
    why: "round-14 cannot make these results: it throws at the first violation (I3), and has no IdentityFieldOptional, SharedContract or write-scope check, or context wiring (I9, I10, I12, I17); T17 builds the compiler that does, and its static cases land before T17 closes",
    invariants: invariantsOf("Compile", [3, 9, 10, 12, 17]),
  },
  {
    owner: "@task.V3.T17",
    why: "round-14 has no Diagnostic carrier, Diagnostic Schema, classification or renderer; T17 builds Diagnostics with the compiler (P4), and the vectors land before T17 closes",
    invariants: invariantsOf(
      "Diagnostics",
      upTo(10).filter((n) => n !== 4),
    ),
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
